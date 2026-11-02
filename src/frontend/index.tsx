import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Badge, Box, Button, ButtonGroup, DynamicTable, Heading, HorizontalBarChart, Inline, Lozenge, ProgressTracker,
  RadioGroup, Range, SectionMessage, Select, Spinner, Stack, Strong, Tab, TabList, TabPanel, Tabs, Text, Textfield,
  Link, Tooltip, xcss,
} from '@forge/react';
import { invoke, rovo } from '@forge/bridge';

type Any = any;
const AGENT = { type: 'forge' as const, agentKey: 'bottleneck-economist', agentName: 'Bottleneck Economist' };

// ---------- styles (design tokens only)
const card = xcss({ padding: 'space.250', borderRadius: 'radius.large', backgroundColor: 'elevation.surface.raised', boxShadow: 'elevation.shadow.raised' });
const hero = xcss({ padding: 'space.300', borderRadius: 'radius.large', backgroundColor: 'color.background.accent.blue.subtlest', borderColor: 'color.border.accent.blue', borderWidth: 'border.width', borderStyle: 'solid' });
const kpiBox = xcss({ padding: 'space.150', borderRadius: 'radius.large', backgroundColor: 'color.background.neutral.subtle', minWidth: '160px' });
const stageWait = xcss({ padding: 'space.150', borderRadius: 'radius.medium', backgroundColor: 'color.background.accent.blue.subtlest', minWidth: '130px' });
const stageWork = xcss({ padding: 'space.150', borderRadius: 'radius.medium', backgroundColor: 'color.background.accent.green.subtlest', minWidth: '130px' });
const stageNeck = xcss({ padding: 'space.150', borderRadius: 'radius.medium', backgroundColor: 'color.background.accent.red.subtlest', borderColor: 'color.border.danger', borderWidth: 'border.width.selected', borderStyle: 'solid', minWidth: '130px' });
const doCard = xcss({ padding: 'space.200', borderRadius: 'radius.large', backgroundColor: 'color.background.accent.green.subtlest', minWidth: '280px', flexGrow: 1 } as Any);
const dontCard = xcss({ padding: 'space.200', borderRadius: 'radius.large', backgroundColor: 'color.background.accent.orange.subtlest', minWidth: '280px', flexGrow: 1 } as Any);

// ---------- helpers
const money = (x: number, cur = 'EUR') => {
  const s = x < 0 ? '−' : '';
  const a = Math.abs(x);
  const v = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${s}${cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur + ' '}${v}`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const days = (d: number) => (d >= 10 ? `${Math.round(d)} d` : `${d.toFixed(1)} d`);

const TIPS = {
  policy: 'Policy constraint: work waits for a decision (what to start, what to drop) while the people downstream still have spare capacity. Adding people or automation will not help here — changing the rule will.',
  capacity: 'Capacity constraint: the stage that serves this queue is saturated. Here more capacity — people, automation, or moving someone in — really speeds up delivery.',
  paper: 'Paper savings: hours freed at a stage that is not the bottleneck. They only turn into money if people are actually redeployed or the cost is removed (Goldratt).',
  real: 'Real value: money that reaches the bottom line — more items delivered, less cost of delay, or cost actually removed.',
  paei: 'Adizes PAEI: P = producing capacity, A = administering standards, E = entrepreneuring decisions & priorities, I = integrating people. We read which one is missing from your flow data, not from people.',
  flowEff: 'Share of lead time in which someone actually worked on the item. The rest is waiting.',
};

const PRESETS: Record<string, { label: string; hourlyCost: number; valuePerItem: number; costOfDelayPerItemWeek: number }> = {
  software: { label: 'Software / product team', hourlyCost: 70, valuePerItem: 1500, costOfDelayPerItemWeek: 200 },
  agency: { label: 'Agency / client delivery', hourlyCost: 60, valuePerItem: 1200, costOfDelayPerItemWeek: 150 },
  ops: { label: 'Support / operations', hourlyCost: 45, valuePerItem: 300, costOfDelayPerItemWeek: 80 },
};

function Kpi({ label, value, hint, tip }: { label: string; value: string; hint?: string; tip?: string }) {
  const body = (
    <Box xcss={kpiBox}>
      <Text size="small">{label}</Text>
      <Heading size="medium">{value}</Heading>
      {hint ? <Text size="small" color="color.text.subtlest">{hint}</Text> : null}
    </Box>
  );
  return tip ? <Tooltip content={tip}>{body}</Tooltip> : body;
}

/** The typical path an item takes (from the busiest intake queue), plus side loops off that path. */
function flowOrder(statuses: Any[]): { main: Any[]; side: Any[] } {
  const shown = statuses.filter((s) => s.kind !== 'done' && s.leadShare >= 0.01);
  const by = new Map(statuses.map((s) => [s.status, s]));
  const start = [...shown].filter((s) => s.role === 'intake').sort((a, b) => b.entriesPerWeek - a.entriesPerWeek)[0] ?? shown[0];
  const main: Any[] = [];
  let cur = start;
  while (cur && !main.includes(cur) && main.length < 12) {
    main.push(cur);
    cur = cur.next.map((n: Any) => by.get(n.status)).find((m: Any) => m && m.kind !== 'done' && !main.includes(m) && m.leadShare >= 0.01);
  }
  // other intake queues that feed the path go in front of it
  const feeders = shown.filter((s) => s.role === 'intake' && !main.includes(s) && s.next.some((n: Any) => n.status === main[0]?.status));
  return { main: [...feeders, ...main], side: shown.filter((s) => !main.includes(s) && !feeders.includes(s)) };
}

function StageBox({ s, neck }: { s: Any; neck: boolean }) {
  return (
    <Box xcss={neck ? stageNeck : s.kind === 'active' ? stageWork : stageWait}>
      <Stack space="space.050">
        <Text size="small"><Strong>{s.status}</Strong></Text>
        <Heading size="small">{days(s.meanDaysPerDelivered)}</Heading>
        <Text size="small" color="color.text.subtle">{s.kind === 'active' ? 'working' : 'waiting'} · {pct(s.leadShare)}</Text>
        {neck ? <Lozenge appearance="removed" isBold>bottleneck</Lozenge> : null}
      </Stack>
    </Box>
  );
}

// ---------- Onboarding
function Onboarding({ projectKey, onDone, onDemo, onCancel }: { projectKey: string; onDone: () => void; onDemo: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Any>(null);
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState('software');
  const [custom, setCustom] = useState<Any>(PRESETS.software);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    invoke('getSetup', { projectKey }).then((r: Any) => {
      setData(r);
      setKinds(Object.fromEntries(r.statuses.map((s: Any) => [s.name, s.kind])));
    });
  }, []);

  const steps = ['Goal', 'Your workflow', 'What work is worth'];
  const items = steps.map((label, i) => ({
    id: `s${i}`, label, percentageComplete: i < step ? 100 : 0,
    status: (i < step ? 'visited' : i === step ? 'current' : 'unvisited') as Any,
  }));
  const kindOptions = [
    { label: 'Waiting (queue)', value: 'queue' }, { label: 'Working', value: 'active' }, { label: 'Done', value: 'done' },
  ];
  const finish = async () => {
    setSaving(true);
    const r: Any = await invoke('saveSetup', { projectKey, kinds, preset, money: { hourlyCost: custom.hourlyCost, valuePerItem: custom.valuePerItem, costOfDelayPerItemWeek: custom.costOfDelayPerItemWeek } });
    setSaving(false);
    if (r?.error) { setSaveError(r.error); return; }
    onDone();
  };

  return (
    <Stack space="space.300">
      <ProgressTracker items={items} />
      {saveError ? <SectionMessage appearance="warning" title="Not saved"><Text>{saveError}</Text></SectionMessage> : null}
      {step === 0 ? (
        <Box xcss={hero}>
          <Stack space="space.200">
            <Heading size="large">Find where your work really waits — and what fixing it is worth</Heading>
            <Text>Bottleneck Economist reads the status history of {projectKey}, finds the one place that limits delivery (Goldratt's Theory of Constraints), names the root cause (Adizes PAEI) and prices every option — hiring, automating, moving people or changing a rule.</Text>
            <Text>It separates <Strong>real</Strong> money from savings that exist <Strong>only on paper</Strong>.</Text>
            <ButtonGroup>
              <Button appearance="primary" onClick={() => setStep(1)}>Set up for {projectKey} (1 minute)</Button>
              <Button onClick={onDemo}>Show me the demo first</Button>
              {onCancel ? <Button appearance="subtle" onClick={onCancel}>Back to my report</Button> : null}
            </ButtonGroup>
          </Stack>
        </Box>
      ) : null}
      {step === 1 ? (
        <Box xcss={card}>
          <Stack space="space.200">
            <Heading size="medium">Where does work wait, and where is it worked on?</Heading>
            <Text>We read your workflow and made a first guess. Only you know your team — correct anything that is wrong. “Waiting” means nobody is working on the item yet (backlog, ready for review, awaiting approval).</Text>
            {!data ? <Spinner label="Reading workflow" /> : data.statuses.map((s: Any) => (
              <Inline key={s.name} space="space.200" alignBlock="center">
                <Box xcss={xcss({ width: '220px' })}><Text><Strong>{s.name}</Strong></Text></Box>
                <Box xcss={xcss({ width: '220px' })}>
                  <Select inputId={`k-${s.name}`} options={kindOptions} value={kindOptions.find((o) => o.value === kinds[s.name])}
                    onChange={(o: Any) => setKinds({ ...kinds, [s.name]: o.value })} />
                </Box>
                {kinds[s.name] !== s.suggested ? <Lozenge appearance="moved">changed</Lozenge> : null}
              </Inline>
            ))}
            <ButtonGroup>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button appearance="primary" onClick={() => setStep(2)} isDisabled={!data}>Next</Button>
            </ButtonGroup>
          </Stack>
        </Box>
      ) : null}
      {step === 2 ? (
        <Box xcss={card}>
          <Stack space="space.200">
            <Heading size="medium">What is your work worth?</Heading>
            <Text>Pick the closest team type. You can fine-tune the numbers now or later — every result shows which assumptions it used.</Text>
            <RadioGroup name="preset" value={preset}
              options={Object.entries(PRESETS).map(([k, v]) => ({ name: 'preset', value: k, label: `${v.label} — €${v.hourlyCost}/h, €${v.valuePerItem} per delivered item` }))}
              onChange={(e: Any) => { const k = e?.target?.value ?? e; setPreset(k); setCustom(PRESETS[k]); }} />
            <Inline space="space.200" shouldWrap>
              <Stack space="space.050"><Text size="small">Cost per person-hour (€)</Text><Textfield name="hc" type="number" value={String(custom.hourlyCost)} onChange={(e: Any) => setCustom({ ...custom, hourlyCost: Number(e.target.value) })} /></Stack>
              <Stack space="space.050"><Text size="small">Value of one delivered item (€)</Text><Textfield name="vi" type="number" value={String(custom.valuePerItem)} onChange={(e: Any) => setCustom({ ...custom, valuePerItem: Number(e.target.value) })} /></Stack>
              <Stack space="space.050"><Text size="small">Cost of one week of delay per item (€)</Text><Textfield name="cod" type="number" value={String(custom.costOfDelayPerItemWeek)} onChange={(e: Any) => setCustom({ ...custom, costOfDelayPerItemWeek: Number(e.target.value) })} /></Stack>
            </Inline>
            <ButtonGroup>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button appearance="primary" onClick={finish} isDisabled={saving}>{saving ? 'Starting…' : 'Analyze my project'}</Button>
            </ButtonGroup>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

// ---------- Report
function ReportView({ state, reload }: { state: Any; reload: (demo?: boolean) => Promise<void> }) {
  const r = state.report;
  const f = r.flow;
  const c = r.constraints?.[0];
  const cur = r.money?.currency ?? 'EUR';
  const [sim, setSim] = useState<Any>(null);
  const [simStatus, setSimStatus] = useState<Any>(null);
  const [simLever, setSimLever] = useState<Any>({ label: 'Automate work', value: 'automate' });
  const [simPct, setSimPct] = useState(50);
  const [assume, setAssume] = useState<Any>(r.money);

  const ordered = useMemo(() => flowOrder(f.statuses), [f]);
  const recs = r.recommendations as Any[];
  const best = recs[0];
  const dos = recs.filter((x) => x.money.realPerYear > 0 && x.scenario.lever !== 'free').slice(0, 2);
  const free = recs.find((x) => x.scenario.lever === 'free' && x.money.realPerYear > 0);
  const donts = recs.filter((x) => x.money.realPerYear <= 0 || (x.money.paperPerYear > x.money.realPerYear * 2)).slice(0, 2);
  const lead = f.statuses.filter((s: Any) => s.leadShare >= 0.01).sort((a: Any, b: Any) => b.leadShare - a.leadShare)
    .map((s: Any) => ({ status: s.status, share: Math.round(s.leadShare * 1000) / 10, kind: s.kind === 'active' ? 'Working' : 'Waiting' }));
  const statusOptions = f.statuses.filter((s: Any) => s.leadShare >= 0.01 || s.kind === 'active').map((s: Any) => ({ label: `${s.status} (${s.kind === 'active' ? 'working' : 'waiting'})`, value: s.status }));

  const runSim = async () => {
    if (!simStatus) return;
    const v = simLever.value;
    const p: Any = { status: simStatus.value, lever: v, demoMode: state.demo, projectKey: state.demo ? 'DEMO' : state.projectKey };
    if (v === 'automate') p.automationPct = simPct / 100;
    if (v === 'policy') p.queueCutPct = simPct / 100;
    if (v === 'hire' || v === 'move') p.addPeople = 1;
    if (v === 'free') p.removePeople = 1;
    setSim(await invoke('simulate', p));
  };
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const shareNow = async () => {
    setSharing(true); setShareMsg('');
    const r: Any = await invoke('shareNow', state.demo ? { demo: true } : { projectKey: state.projectKey });
    setSharing(false);
    setShareMsg(r?.published ? 'Published to the Teamwork Graph.' : `Not published: ${r?.errors?.[0] ?? r?.error ?? r?.reason ?? 'no connection follows this project'}`);
    if (r?.published) await reload(state.demo);
  };
  const [assumeMsg, setAssumeMsg] = useState('');
  const saveAssumptions = async () => {
    const r: Any = await invoke('setAssumptions', { projectKey: state.demo ? 'DEMO' : state.projectKey, ...assume });
    if (r?.status === 'forbidden') { setAssumeMsg(r.message); return; }
    setAssumeMsg('');
    await reload(state.demo);
  };

  const optionsTable = {
    head: { cells: [
      { key: 'a', content: 'Option' }, { key: 't', content: 'Delivered / week' }, { key: 'l', content: 'Avg lead time (days)' },
      { key: 'r', content: 'Real value / year' }, { key: 'p', content: 'On paper only' }, { key: 'v', content: 'Why' },
    ] },
    rows: recs.map((x: Any, i: number) => ({
      key: `r${i}`,
      cells: [
        { key: 'a', content: <Strong>{x.scenario.label}</Strong> },
        { key: 't', content: `${x.throughputPerWeek.before.toFixed(1)} → ${x.throughputPerWeek.after.toFixed(1)}` },
        { key: 'l', content: `${Math.round(x.leadTimeDays.before)} → ${Math.round(x.leadTimeDays.after)}` },
        { key: 'r', content: <Lozenge appearance={x.money.realPerYear > 0 ? 'success' : x.money.realPerYear < 0 ? 'removed' : 'default'}>{money(x.money.realPerYear, cur)}</Lozenge> },
        { key: 'p', content: x.money.paperPerYear ? <Lozenge appearance="moved">{money(x.money.paperPerYear, cur)}</Lozenge> : '—' },
        { key: 'v', content: <Text size="small">{x.verdict}</Text> },
      ],
    })),
  };

  if (!r.enoughData) {
    return (
      <SectionMessage appearance="information" title="Not enough delivery history yet">
        <Text>{f.resolvedInWindow} items were finished in the last {f.window.weeks} weeks — too few to find a reliable bottleneck. We read {f.issues} issues, {f.staleInventory} of them untouched for more than {f.staleDays} days.</Text>
        <Text>Try a project with more finished work, or open the demo built from a year of real, public Apache Cassandra history.</Text>
        <Button onClick={() => reload(true)}>Open the demo</Button>
      </SectionMessage>
    );
  }

  return (
    <Stack space="space.300">
      {/* 1. Verdict */}
      <Box xcss={hero}>
        <Stack space="space.150">
          <Inline space="space.100" alignBlock="center">
            {state.demo ? <Badge appearance="primary">DEMO</Badge> : <Badge>{state.projectKey}</Badge>}
            <Text size="small">{r.source === 'demo' ? r.project : `Jira history, ${f.window.from} – ${f.window.to}`} · {f.resolvedInWindow} items delivered</Text>
          </Inline>
          {c ? (
            <>
              <Heading size="large">{c.type === 'policy' ? 'Your bottleneck is a decision, not people.' : `Your bottleneck is capacity at “${c.servedBy}”.`}</Heading>
              <Text>Delivered work spends <Strong>{pct(c.leadShare)}</Strong> of its lead time waiting in “{c.status}”{c.type === 'policy' ? `, while “${c.servedBy}” still has ${pct(1 - c.utilization)} spare capacity` : ''}.</Text>
              <Inline space="space.100" alignBlock="center">
                <Tooltip content={c.type === 'policy' ? TIPS.policy : TIPS.capacity}>
                  <Lozenge appearance={c.type === 'policy' ? 'moved' : 'removed'} isBold>{c.type === 'policy' ? 'Policy constraint' : 'Capacity constraint'}</Lozenge>
                </Tooltip>
                {best && best.money.realPerYear > 0 ? (
                  <Tooltip content={TIPS.real}><Lozenge appearance="success" isBold>{`Fixing it: ${money(best.money.realPerYear, cur)} / year`}</Lozenge></Tooltip>
                ) : null}
              </Inline>
            </>
          ) : <Heading size="large">No single bottleneck — work flows evenly.</Heading>}
        </Stack>
      </Box>

      {/* 2. KPIs */}
      <Inline space="space.150" shouldWrap>
        <Kpi label="Delivered per week" value={f.throughputPerWeek.toFixed(1)} hint={`could do ≈ ${f.systemCapacityPerWeek.toFixed(1)} · demand ${f.arrivalsPerWeek.toFixed(1)}`} />
        <Kpi label="Average lead time" value={`${Math.round(f.leadTimeMeanDays)} d`} hint={`median ${Math.round(f.leadTimeMedianDays)} · 85% within ${Math.round(f.leadTimeP85Days)}`} />
        <Kpi label="Time actually worked" value={pct(f.flowEfficiency)} hint="the rest is waiting" tip={TIPS.flowEff} />
        <Kpi label="Aged backlog" value={`${f.staleInventory}`} hint={`untouched > ${f.staleDays} days`} />
      </Inline>

      {/* 3. Flow strip */}
      <Box xcss={card}>
        <Stack space="space.150">
          <Heading size="small">How an item travels — days per delivered item</Heading>
          <Text size="small" color="color.text.subtle">Blue = waiting (nobody works on it) · green = someone is working · red = the bottleneck</Text>
          <Inline space="space.100" shouldWrap alignBlock="center">
            {ordered.main.map((s: Any, i: number) => (
              <Inline key={s.status} space="space.100" alignBlock="center">
                <StageBox s={s} neck={!!c && s.status === c.status} />
                {i < ordered.main.length - 1 ? <Text color="color.text.subtlest">→</Text> : null}
              </Inline>
            ))}
          </Inline>
          {ordered.side.length ? (
            <Stack space="space.100">
              <Text size="small" color="color.text.subtle">Side loops — items that leave the usual path and come back:</Text>
              <Inline space="space.100" shouldWrap>
                {ordered.side.map((s: Any) => <StageBox key={s.status} s={s} neck={!!c && s.status === c.status} />)}
              </Inline>
            </Stack>
          ) : null}
        </Stack>
      </Box>

      {/* 4. Do / Don't */}
      <Inline space="space.200" shouldWrap alignBlock="stretch">
        <Box xcss={doCard}>
          <Stack space="space.150">
            <Heading size="small">Do this</Heading>
            {dos.map((x: Any, i: number) => (
              <Stack key={`do${i}`} space="space.050">
                <Text><Strong>{x.scenario.label}</Strong></Text>
                <Text size="small">{money(x.money.realPerYear, cur)} / year · lead time {Math.round(x.leadTimeDays.before)} → {Math.round(x.leadTimeDays.after)} d · delivered {x.throughputPerWeek.before.toFixed(1)} → {x.throughputPerWeek.after.toFixed(1)} / week</Text>
              </Stack>
            ))}
            {free ? <Text size="small">Also: {free.scenario.label} — {money(free.money.realPerYear, cur)} / year without slowing delivery.</Text> : null}
          </Stack>
        </Box>
        <Box xcss={dontCard}>
          <Stack space="space.150">
            <Heading size="small">Don't do this (yet)</Heading>
            {donts.map((x: Any, i: number) => (
              <Stack key={`dont${i}`} space="space.050">
                <Text><Strong>{x.scenario.label}</Strong></Text>
                <Text size="small">{x.money.paperPerYear ? `${money(x.money.paperPerYear, cur)} on paper, ` : ''}{money(x.money.realPerYear, cur)} real per year. {x.verdict}</Text>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Inline>

      {/* 5. Root cause */}
      {r.adizes ? (
        <Box xcss={card}>
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center">
              <Heading size="small">Why it happens</Heading>
              <Tooltip content={TIPS.paei}><Lozenge appearance="inprogress" isBold>{`Missing role: ${r.adizes.dominant} (Adizes)`}</Lozenge></Tooltip>
            </Inline>
            <Text>{r.adizes.meaning}</Text>
            {r.adizes.evidence.map((e: string, i: number) => <Text key={`a${i}`} size="small">• {e}</Text>)}
          </Stack>
        </Box>
      ) : null}

      {/* 5b. Context for Rovo: Teamwork Graph */}
      <Box xcss={card}>
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Heading size="small">Shared as context</Heading>
            <Lozenge appearance={state.graph?.accepted ? 'success' : state.graphConnected ? 'inprogress' : 'default'}>{state.graph?.accepted ? 'in Teamwork Graph' : state.graphConnected ? 'connected' : 'not connected'}</Lozenge>
          </Inline>
          {state.graph?.accepted ? (
            <Text>{`This report is in the Teamwork Graph since ${new Date(state.graph.at).toLocaleString()}${state.stuck?.length ? `, linked to the ${state.stuck.length} work items waiting in “${c?.status}” now` : ''}. Anyone on the team finds it in Rovo Search; it refreshes every day.`}</Text>
          ) : state.graphConnected ? (
            <Text>{state.graph?.lastError ? `The connector is set up, but the last publish failed: ${state.graph.lastError}` : 'The connector is set up. This report is published with the next daily sync, or now with Publish now.'}</Text>
          ) : (
            <Text>Publish this report to the Teamwork Graph so Rovo and other agents find it next to the stuck work items: Atlassian Administration → Apps → Connected apps → Bottleneck Economist → Connections → Connect.</Text>
          )}
          {state.graphConnected ? (
            <Inline space="space.100" alignBlock="center">
              <Button isDisabled={sharing} onClick={shareNow}>{sharing ? 'Publishing…' : 'Publish now'}</Button>
              {shareMsg ? <Text size="small">{shareMsg}</Text> : null}
            </Inline>
          ) : null}
          {state.stuck?.length ? (
            <Inline space="space.100" shouldWrap>
              <Text size="small">Waiting now:</Text>
              {state.stuck.slice(0, 12).map((k: string) => <Link key={k} href={`/browse/${k}`} openNewTab>{k}</Link>)}
              {state.stuck.length > 12 ? <Text size="small">{`+${state.stuck.length - 12} more`}</Text> : null}
            </Inline>
          ) : null}
        </Stack>
      </Box>

      {/* 6. Details */}
      <Tabs id="be-tabs">
        <TabList>
          <Tab>All options</Tab>
          <Tab>What if…</Tab>
          <Tab>Evidence</Tab>
          <Tab>Assumptions</Tab>
        </TabList>
        <TabPanel>
          <Stack space="space.150">
            <Inline space="space.100"><Tooltip content={TIPS.real}><Lozenge appearance="success">real value</Lozenge></Tooltip><Tooltip content={TIPS.paper}><Lozenge appearance="moved">on paper only</Lozenge></Tooltip></Inline>
            <DynamicTable head={optionsTable.head} rows={optionsTable.rows} />
          </Stack>
        </TabPanel>
        <TabPanel>
          <Box xcss={card}>
            <Stack space="space.200">
              <Text>Pick a stage and a lever. The simulation uses this team's own history: demonstrated capacity per stage, queue behaviour and lead-time mix.</Text>
              <Inline space="space.200" shouldWrap>
                <Box xcss={xcss({ minWidth: '260px' })}><Select inputId="be-status" placeholder="Stage" options={statusOptions} value={simStatus} onChange={(v: Any) => setSimStatus(v)} /></Box>
                <Box xcss={xcss({ minWidth: '260px' })}><Select inputId="be-lever" options={[
                  { label: 'Automate work', value: 'automate' }, { label: 'Decide faster (rule / WIP limit)', value: 'policy' },
                  { label: 'Hire one person', value: 'hire' }, { label: 'Move one person here', value: 'move' }, { label: 'Free one person from here', value: 'free' },
                ]} value={simLever} onChange={(v: Any) => setSimLever(v)} /></Box>
              </Inline>
              {simLever.value === 'automate' || simLever.value === 'policy' ? (
                <Stack space="space.050">
                  <Text size="small">{simLever.value === 'automate' ? 'Share of the work automated' : 'Share of waiting removed'}: {simPct}%</Text>
                  <Range min={10} max={90} step={10} value={simPct} onChange={(v: number) => setSimPct(v)} />
                </Stack>
              ) : null}
              <Button appearance="primary" onClick={runSim} isDisabled={!simStatus}>Simulate</Button>
              {sim?.verdict ? (
                <SectionMessage appearance={sim.realValuePerYear > 0 ? 'success' : 'warning'} title={`${money(sim.realValuePerYear, sim.currency)} real value per year`}>
                  <Text>Delivered per week: {sim.deliveredPerWeek} · average lead time: {sim.meanLeadTimeDays} days{sim.paperValuePerYear ? ` · on paper: ${money(sim.paperValuePerYear, sim.currency)}` : ''}</Text>
                  <Text>{sim.verdict}</Text>
                </SectionMessage>
              ) : sim?.message ? <SectionMessage appearance="warning"><Text>{sim.message}</Text></SectionMessage> : null}
            </Stack>
          </Box>
        </TabPanel>
        <TabPanel>
          <Stack space="space.200">
            <Box xcss={card}>
              <HorizontalBarChart data={lead} xAccessor="status" yAccessor="share" colorAccessor="kind" title="Share of delivered items' lead time (%)" />
            </Box>
            {c ? (
              <Box xcss={card}>
                <Stack space="space.100">
                  <Heading size="small">Constraint: waiting in “{c.status}” for “{c.servedBy}”</Heading>
                  {c.evidence.map((e: string, i: number) => <Text key={`e${i}`}>• {e}</Text>)}
                </Stack>
              </Box>
            ) : null}
            {r.dataQuality?.length ? (
              <SectionMessage appearance="information" title="Data quality">
                {r.dataQuality.map((d: string, i: number) => <Text key={`d${i}`} size="small">{d}</Text>)}
              </SectionMessage>
            ) : null}
          </Stack>
        </TabPanel>
        <TabPanel>
          <Box xcss={card}>
            <Stack space="space.200">
              <Text>Money depends on your numbers. Change them and every option is re-priced instantly.</Text>
              <Inline space="space.200" shouldWrap>
                <Stack space="space.050"><Text size="small">Cost per person-hour ({cur})</Text><Textfield name="hourlyCost" type="number" value={String(assume?.hourlyCost ?? '')} onChange={(e: Any) => setAssume({ ...assume, hourlyCost: Number(e.target.value) })} /></Stack>
                <Stack space="space.050"><Text size="small">Value of one delivered item ({cur})</Text><Textfield name="valuePerItem" type="number" value={String(assume?.valuePerItem ?? '')} onChange={(e: Any) => setAssume({ ...assume, valuePerItem: Number(e.target.value) })} /></Stack>
                <Stack space="space.050"><Text size="small">Cost of one week of delay per item ({cur})</Text><Textfield name="cod" type="number" value={String(assume?.costOfDelayPerItemWeek ?? '')} onChange={(e: Any) => setAssume({ ...assume, costOfDelayPerItemWeek: Number(e.target.value) })} /></Stack>
              </Inline>
              <Button appearance="primary" onClick={saveAssumptions}>Save and re-price</Button>
              {assumeMsg ? <Text size="small">{assumeMsg}</Text> : null}
            </Stack>
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

// ---------- App shell
function App() {
  const [state, setState] = useState<Any>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  const load = async (demo = false) => {
    setLoading(true);
    const r: Any = await invoke('getReport', demo ? { demo: true } : {});
    setState(r);
    setOnboarding(!demo && !r.setupDone && !r.report);
    setLoading(false);
  };
  useEffect(() => { load(false); }, []);
  useEffect(() => {
    if (state?.job?.status !== 'running') return;
    const t = setTimeout(() => load(false), 6000);
    return () => clearTimeout(t);
  }, [state]);

  const ask = () => rovo.open({ ...AGENT, prompt: `Where is the bottleneck in ${state?.demo ? 'the demo project (DEMO)' : state?.projectKey}, and what should we do about it?` });
  const refresh = async () => { await invoke('startAnalysis', { projectKey: state?.projectKey }); await load(false); };

  if (loading && !state) return <Spinner label="Loading" />;

  const header = (
    <Inline spread="space-between" alignBlock="center" shouldWrap>
      <Text>Where your work really waits — and what fixing it is worth.</Text>
      <ButtonGroup>
        {state?.demo
          ? <Button onClick={() => load(false)}>Back to {state?.projectKey}</Button>
          : <Button onClick={() => load(true)}>Demo: Apache Cassandra</Button>}
        {!state?.demo && !onboarding ? <Button onClick={() => setOnboarding(true)}>Workflow setup</Button> : null}
        {!state?.demo && !onboarding ? <Button onClick={refresh} isDisabled={state?.job?.status === 'running'}>Refresh</Button> : null}
        <Button appearance="primary" onClick={ask}>Ask the Economist</Button>
      </ButtonGroup>
    </Inline>
  );

  if (onboarding && !state?.demo) {
    return (
      <Stack space="space.300">
        {header}
        <Onboarding projectKey={state?.projectKey} onDemo={() => load(true)} onCancel={state?.report || state?.job ? () => setOnboarding(false) : undefined} onDone={() => { setOnboarding(false); load(false); }} />
      </Stack>
    );
  }

  const job = state?.job;
  return (
    <Stack space="space.300">
      {header}
      {job?.status === 'running' ? (
        <SectionMessage appearance="information" title="Reading your Jira history">
          <Inline space="space.100" alignBlock="center"><Spinner size="small" /><Text>About a minute for a few thousand issues. This page updates by itself.</Text></Inline>
        </SectionMessage>
      ) : null}
      {job?.status === 'failed' ? <SectionMessage appearance="error" title="Analysis failed"><Text>{job.error}</Text></SectionMessage> : null}
      {state?.forbidden ? (
        <SectionMessage appearance="warning" title="No access to this project"><Text>You need permission to browse this project to see its analysis. You can still open the demo.</Text><Button onClick={() => load(true)}>Open the demo</Button></SectionMessage>
      ) : state?.report ? <ReportView state={state} reload={load} /> : !job ? (
        <SectionMessage appearance="discovery" title="No analysis yet"><Button appearance="primary" onClick={() => setOnboarding(true)}>Set up this project</Button></SectionMessage>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
