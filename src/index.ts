// Backend: Rovo actions (also exposed as MCP tools), UI resolver and the async analysis worker.
import Resolver from '@forge/resolver';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { fetchProjectHistory, fetchProjectStatuses } from './jira-fetch';
import { statusKind } from './engine/status';
import { buildReport, compact, fromFlow, whatIf, type Report } from './engine/report';
import type { Scenario } from './engine/economist';
import { DEFAULT_MONEY, type MoneyAssumptions, type StatusConfig, type StatusKind } from './engine/types';
import { DEMO_FLOW, DEMO_SOURCE } from './demo/cassandra';
import { DENIED, DENIED_ADMIN, userCan } from './permissions';
import { connections, handleConnectionChange, handleTask, lastPublished, publishReport, validateConnection, type Sync } from './graph';
import type { IssueHistory } from './engine/types';

const DEMO_KEY = 'DEMO';
const queue = new Queue({ key: 'flow-analysis' });
const FRESH_MS = 12 * 3600_000;

type Job = { status: 'running' | 'done' | 'failed'; projectKey: string; days: number; startedAt: string; error?: string };

const reportKey = (p: string, d: number) => `report:${p}:${d}`;
const jobKey = (p: string, d: number) => `job:${p}:${d}`;
const moneyKey = (p: string) => `money:${p}`;
const setupKey = (p: string) => `setup:${p}`;
const stuckKey = (p: string) => `stuck:${p}`;

/** Open work items sitting in the constraint status right now, oldest first (keys only). */
function stuckAt(issues: IssueHistory[], status?: string): string[] {
  if (!status) return [];
  const now = Date.now();
  return issues
    .filter((i) => !i.resolved)
    .map((i) => { const last = i.statusChanges[i.statusChanges.length - 1]; return { key: i.key, status: last ? last.to : i.initialStatus, since: last ? last.at : i.created }; })
    .filter((x) => x.status === status)
    .sort((a, b) => a.since - b.since)
    .map((x) => x.key)
    .slice(0, 100);
}

type Setup = { done: boolean; kinds: Record<string, StatusKind>; preset?: string; updatedAt: string };

async function setupFor(projectKey: string): Promise<Setup | undefined> {
  return kvs.get<Setup>(setupKey(projectKey));
}
async function configFor(projectKey: string): Promise<StatusConfig | undefined> {
  const s = await setupFor(projectKey);
  return s?.kinds ? { kinds: s.kinds } : undefined;
}

async function moneyFor(projectKey: string): Promise<MoneyAssumptions> {
  return { ...DEFAULT_MONEY, ...((await kvs.get<Partial<MoneyAssumptions>>(moneyKey(projectKey))) ?? {}) };
}

function demoReport(money: MoneyAssumptions): Report {
  const r = fromFlow(DEMO_SOURCE, 'demo', DEMO_FLOW, money);
  return r;
}

const isDemo = (projectKey?: string, demoMode?: boolean) => demoMode === true || !projectKey || projectKey.toUpperCase() === DEMO_KEY;

async function getReport(projectKey: string, days: number, demoMode?: boolean): Promise<{ report?: Report; job?: Job }> {
  if (isDemo(projectKey, demoMode)) return { report: demoReport(await moneyFor(DEMO_KEY)) };
  const cached = await kvs.get<Report>(reportKey(projectKey, days));
  const job = await kvs.get<Job>(jobKey(projectKey, days));
  if (cached && Date.now() - Date.parse(cached.generatedAt) < FRESH_MS) {
    // money assumptions may have changed since: re-price without re-reading Jira
    return { report: fromFlow(projectKey, 'jira', cached.flow, await moneyFor(projectKey)), job };
  }
  return { report: cached, job };
}

async function startJob(projectKey: string, days: number): Promise<Job> {
  const existing = await kvs.get<Job>(jobKey(projectKey, days));
  if (existing?.status === 'running' && Date.now() - Date.parse(existing.startedAt) < 15 * 60_000) return existing;
  const job: Job = { status: 'running', projectKey, days, startedAt: new Date().toISOString() };
  await kvs.set(jobKey(projectKey, days), job);
  await queue.push({ body: { projectKey, days } });
  return job;
}

// ---------- async worker (up to 900 s)
async function runAnalysis(projectKey: string, days: number): Promise<{ report: Report; stuck: string[] }> {
  const to = Date.now();
  const from = to - days * 86_400_000;
  const issues = await fetchProjectHistory(projectKey, days);
  const report = buildReport(projectKey, 'jira', issues, { from, to }, await configFor(projectKey), await moneyFor(projectKey));
  await kvs.set(reportKey(projectKey, days), report);
  const stuck = stuckAt(issues, report.constraints[0]?.status);
  await kvs.set(stuckKey(projectKey), stuck);
  await kvs.set(jobKey(projectKey, days), { status: 'done', projectKey, days, startedAt: new Date().toISOString() } satisfies Job);
  return { report, stuck };
}

export async function analysisWorker(event: { body: { projectKey: string; days: number } }) {
  const { projectKey, days } = event.body;
  try {
    const { report, stuck } = await runAnalysis(projectKey, days);
    if (days === 365) await publishReport(report, stuck).catch((e) => console.error('[graph] publish failed', e));
  } catch (e: any) {
    await kvs.set(jobKey(projectKey, days), { status: 'failed', projectKey, days, startedAt: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 500) } satisfies Job);
  }
}

// ---------- Teamwork Graph connector
// quick: publish what is ready (demo + stored reports) and queue analyses for the rest.
// full (daily task): re-read Jira for every followed project, then publish.
const syncGraph: Sync = async (conn, mode) => {
  if (conn.includeDemo) await publishReport(demoReport(await moneyFor(DEMO_KEY)), []);
  for (const p of conn.projects) {
    if (mode === 'full') {
      const { report, stuck } = await runAnalysis(p, 365);
      await publishReport(fromFlow(p, 'jira', report.flow, await moneyFor(p)), stuck);
      continue;
    }
    const stored = await kvs.get<Report>(reportKey(p, 365));
    if (stored) await publishReport(fromFlow(p, 'jira', stored.flow, await moneyFor(p)), (await kvs.get<string[]>(stuckKey(p))) ?? []);
    else await startJob(p, 365);
  }
};
export const onConnectionChange = (request: any) => handleConnectionChange(request, syncGraph);
export const validateGraphConnection = (request: any) => validateConnection(request);
export const graphTaskRunner = (request: any) => handleTask(request, syncGraph);
/** Daily safety net next to the connector's own orchestration task. */
export async function dailyGraphRefresh() {
  for (const conn of await connections()) {
    try { await syncGraph(conn, 'quick'); } catch (e) { console.error('[graph] daily refresh failed', e); }
    for (const p of conn.projects) { await kvs.delete(jobKey(p, 365)); await startJob(p, 365); }
  }
}

// ---------- Rovo actions / MCP tools
// Input validation: a Jira project key is letters, digits and underscores (max 20); anything else is treated as absent.
const projectFrom = (payload: any): string | undefined => {
  const k = (payload?.projectKey || payload?.context?.jira?.projectKey)?.toString().trim().toUpperCase();
  return k && /^[A-Z][A-Z0-9_]{0,19}$/.test(k) ? k : undefined;
};
// Look-back window: whole days between 7 and 730, default 365.
const daysFrom = (payload: any): number => {
  const d = Math.round(Number(payload?.lookbackDays));
  return Number.isFinite(d) && d > 0 ? Math.min(730, Math.max(7, d)) : 365;
};

export async function analyzeFlow(payload: any) {
  const projectKey = projectFrom(payload);
  const days = daysFrom(payload);
  if (isDemo(projectKey, payload?.demoMode)) return compact(demoReport(await moneyFor(DEMO_KEY)));
  if (!(await userCan(projectKey, 'BROWSE_PROJECTS'))) return DENIED;
  const { report, job } = await getReport(projectKey!, days);
  if (report && Date.now() - Date.parse(report.generatedAt) < FRESH_MS) return compact(report);
  const j = job?.status === 'running' ? job : await startJob(projectKey!, days);
  return { status: j.status, projectKey, lookbackDays: days, message: `Reading ${days} days of Jira history for ${projectKey}. Call get-analysis-status in about a minute.`, previous: report ? compact(report) : undefined };
}

export async function getAnalysisStatus(payload: any) {
  const projectKey = projectFrom(payload);
  const days = daysFrom(payload);
  if (isDemo(projectKey, payload?.demoMode)) return compact(demoReport(await moneyFor(DEMO_KEY)));
  if (!(await userCan(projectKey, 'BROWSE_PROJECTS'))) return DENIED;
  const { report, job } = await getReport(projectKey!, days);
  if (job?.status === 'running') return { status: 'running', projectKey, message: 'Still reading Jira history. Try again in a minute.' };
  if (job?.status === 'failed') return { status: 'failed', projectKey, error: job.error };
  return report ? compact(report) : { status: 'not-started', projectKey, message: 'Run analyze-flow first.' };
}

function scenarioFrom(payload: any): Scenario {
  const LEVERS = ['automate', 'hire', 'move', 'free', 'policy'];
  const raw = String(payload?.lever ?? 'automate');
  const lever = (LEVERS.includes(raw) ? raw : 'automate') as Scenario['lever'];
  const pct = (v: any) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Math.min(0.95, Number(v) > 1 ? Number(v) / 100 : Number(v))));
  const people = (v: any) => (v === undefined || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Math.min(50, Math.round(Number(v)))));
  const status = String(payload?.status ?? '').slice(0, 100);
  return {
    label: String(payload?.label ?? `${lever} at ${status}`).slice(0, 120),
    lever,
    status,
    automationPct: pct(payload?.automationPct),
    queueCutPct: pct(payload?.queueCutPct),
    addPeople: people(payload?.addPeople),
    removePeople: people(payload?.removePeople),
    hire: lever === 'hire' ? people(payload?.addPeople ?? 1) : undefined,
  };
}

export async function simulateWhatIf(payload: any) {
  const projectKey = projectFrom(payload);
  const days = daysFrom(payload);
  if (!isDemo(projectKey, payload?.demoMode) && !(await userCan(projectKey, 'BROWSE_PROJECTS'))) return DENIED;
  const { report } = await getReport(projectKey ?? DEMO_KEY, days, payload?.demoMode);
  if (!report) return { status: 'not-ready', message: 'Run analyze-flow first.' };
  const s = scenarioFrom(payload);
  if (!report.flow.statuses.some((x) => x.status.toLowerCase() === s.status.toLowerCase()))
    return { status: 'unknown-status', message: `Status "${s.status}" not found. Known: ${report.flow.statuses.map((x) => x.status).join(', ')}` };
  s.status = report.flow.statuses.find((x) => x.status.toLowerCase() === s.status.toLowerCase())!.status;
  const money: Partial<MoneyAssumptions> = {};
  if (payload?.hourlyCost) money.hourlyCost = Number(payload.hourlyCost);
  if (payload?.valuePerItem) money.valuePerItem = Number(payload.valuePerItem);
  if (payload?.costOfDelayPerItemWeek) money.costOfDelayPerItemWeek = Number(payload.costOfDelayPerItemWeek);
  const r = whatIf(report, s, money);
  return {
    scenario: r.scenario.label, touchesConstraint: r.touchesConstraint,
    deliveredPerWeek: `${r.throughputPerWeek.before.toFixed(1)} → ${r.throughputPerWeek.after.toFixed(1)}`,
    meanLeadTimeDays: `${Math.round(r.leadTimeDays.before)} → ${Math.round(r.leadTimeDays.after)}`,
    realValuePerYear: Math.round(r.money.realPerYear), paperValuePerYear: Math.round(r.money.paperPerYear),
    breakdown: r.money.breakdown, verdict: r.verdict, currency: report.money.currency,
  };
}

export async function recommendActions(payload: any) {
  const projectKey = projectFrom(payload);
  const days = daysFrom(payload);
  if (!isDemo(projectKey, payload?.demoMode) && !(await userCan(projectKey, 'BROWSE_PROJECTS'))) return DENIED;
  const { report } = await getReport(projectKey ?? DEMO_KEY, days, payload?.demoMode);
  if (!report) return { status: 'not-ready', message: 'Run analyze-flow first.' };
  const c = compact(report);
  return { headline: c.headline, constraint: c.constraints[0], adizes: c.adizes, options: c.options, assumptions: c.assumptions };
}

export async function setAssumptions(payload: any) {
  const projectKey = projectFrom(payload) ?? DEMO_KEY;
  if (projectKey !== DEMO_KEY && !(await userCan(projectKey, 'ADMINISTER_PROJECTS'))) return DENIED_ADMIN;
  const cur = await moneyFor(projectKey);
  const next: MoneyAssumptions = {
    ...cur,
    ...(payload?.hourlyCost ? { hourlyCost: Number(payload.hourlyCost) } : {}),
    ...(payload?.valuePerItem ? { valuePerItem: Number(payload.valuePerItem) } : {}),
    ...(payload?.costOfDelayPerItemWeek ? { costOfDelayPerItemWeek: Number(payload.costOfDelayPerItemWeek) } : {}),
    ...(payload?.hoursPerWeek ? { hoursPerWeek: Number(payload.hoursPerWeek) } : {}),
    ...(payload?.currency ? { currency: String(payload.currency).toUpperCase().slice(0, 3) } : {}),
  };
  await kvs.set(moneyKey(projectKey), next);
  return { projectKey, assumptions: next };
}

// ---------- UI resolver
const resolver = new Resolver();
resolver.define('getReport', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key ?? DEMO_KEY).toString().toUpperCase();
  const days = Number(payload?.days) || 365;
  const demo = payload?.demo === true || projectKey === DEMO_KEY;
  if (!demo && !(await userCan(projectKey, 'BROWSE_PROJECTS'))) return { projectKey, days, demo, forbidden: true, report: null, job: null, setupDone: true, graph: null, graphConnected: false, stuck: [] };
  const { report, job } = await getReport(projectKey, days, demo);
  const setup = demo ? null : await setupFor(projectKey);
  const graphStatus = await lastPublished(demo ? DEMO_KEY : projectKey).catch(() => null);
  const stuck = demo ? [] : ((await kvs.get<string[]>(stuckKey(projectKey))) ?? []);
  const conns = await connections().catch(() => []);
  const graphConnected = conns.some((x) => (demo ? x.includeDemo : x.projects.includes(projectKey)));
  return { projectKey, days, demo, report: report ?? null, job: job ?? null, setupDone: demo || !!setup?.done, graph: graphStatus ?? null, graphConnected, stuck };
});
resolver.define('shareNow', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key ?? DEMO_KEY).toString().toUpperCase();
  const demo = payload?.demo === true || projectKey === DEMO_KEY;
  if (!demo && !(await userCan(projectKey, 'BROWSE_PROJECTS'))) return { error: DENIED.message };
  const { report } = await getReport(projectKey, 365, demo);
  if (!report) return { error: 'No report yet' };
  return publishReport(report, demo ? [] : ((await kvs.get<string[]>(stuckKey(projectKey))) ?? []));
});
resolver.define('startAnalysis', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key)?.toString().toUpperCase();
  if (!projectKey) return { error: 'No project' };
  if (!(await userCan(projectKey, 'BROWSE_PROJECTS'))) return { error: DENIED.message };
  return { job: await startJob(projectKey, Number(payload?.days) || 365) };
});
resolver.define('simulate', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key ?? DEMO_KEY).toString().toUpperCase();
  return simulateWhatIf({ ...payload, projectKey });
});
resolver.define('setAssumptions', async ({ payload, context }) =>
  setAssumptions({ ...payload, projectKey: (payload?.projectKey ?? (context as any)?.extension?.project?.key ?? DEMO_KEY).toString().toUpperCase() }));
resolver.define('getSetup', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key ?? DEMO_KEY).toString().toUpperCase();
  if (projectKey !== DEMO_KEY && !(await userCan(projectKey, 'BROWSE_PROJECTS'))) return { error: DENIED.message };
  const setup = await setupFor(projectKey);
  let statuses: { name: string; category: string }[] = [];
  if (projectKey === DEMO_KEY) statuses = DEMO_FLOW.statuses.map((x) => ({ name: x.status, category: x.kind === 'done' ? 'done' : 'indeterminate' }));
  else statuses = await fetchProjectStatuses(projectKey);
  const rows = statuses.map((st) => {
    const suggested: StatusKind = st.category === 'done' ? 'done' : statusKind(st.name);
    return { name: st.name, category: st.category, suggested, kind: setup?.kinds?.[st.name] ?? suggested };
  });
  return { projectKey, setup: setup ?? null, statuses: rows, money: await moneyFor(projectKey) };
});
resolver.define('saveSetup', async ({ payload, context }) => {
  const projectKey = (payload?.projectKey ?? (context as any)?.extension?.project?.key)?.toString().toUpperCase();
  if (!projectKey || projectKey === DEMO_KEY) return { error: 'No project' };
  if (!(await userCan(projectKey, 'ADMINISTER_PROJECTS'))) return { error: DENIED_ADMIN.message };
  const kinds: Record<string, StatusKind> = {};
  for (const [k, v] of Object.entries(payload?.kinds ?? {})) if (v === 'queue' || v === 'active' || v === 'done') kinds[k] = v;
  await kvs.set(setupKey(projectKey), { done: true, kinds, preset: payload?.preset, updatedAt: new Date().toISOString() } satisfies Setup);
  if (payload?.money) await setAssumptions({ projectKey, ...payload.money });
  const days = Number(payload?.days) || 365;
  await kvs.delete(reportKey(projectKey, days));
  await kvs.delete(jobKey(projectKey, days));
  return { job: await startJob(projectKey, days) };
});
export const uiResolver = resolver.getDefinitions();
