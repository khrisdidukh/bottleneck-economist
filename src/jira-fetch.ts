import api, { route } from '@forge/api';
import { fromJiraIssue } from './engine/jira';
import type { IssueHistory } from './engine/types';

const FIELDS = ['status', 'created', 'resolutiondate', 'resolution', 'issuetype', 'priority'];

async function jira(path: ReturnType<typeof route>, body?: unknown) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await api.asApp().requestJira(path, body === undefined ? { headers: { Accept: 'application/json' } } : {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('Retry-After') ?? 2 ** attempt);
      await new Promise((r) => setTimeout(r, Math.min(10, wait) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error('Jira rate limit: try again in a minute');
}

/** Issues of a project touched in the last `days` days, with status + assignee history. */
export async function fetchProjectHistory(projectKey: string, days: number, maxIssues = 5000): Promise<IssueHistory[]> {
  if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(projectKey)) throw new Error(`Invalid project key: ${projectKey}`);
  const jql = `project = "${projectKey}" AND (updated >= -${days}d OR statusCategory != Done) ORDER BY created ASC`;
  const issues: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const page = await jira(route`/rest/api/3/search/jql`, { jql, fields: FIELDS, maxResults: 100, nextPageToken });
    issues.push(...page.issues);
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && issues.length < maxIssues);

  const histories = new Map<string, any[]>();
  for (let i = 0; i < issues.length; i += 1000) {
    const ids = issues.slice(i, i + 1000).map((x) => x.id);
    let token: string | undefined;
    do {
      const page = await jira(route`/rest/api/3/changelog/bulkfetch`, { issueIdsOrKeys: ids, fieldIds: ['status', 'assignee'], maxResults: 10000, nextPageToken: token });
      for (const log of page.issueChangeLogs ?? []) {
        const arr = histories.get(log.issueId) ?? [];
        arr.push(...(log.changeHistories ?? []));
        histories.set(log.issueId, arr);
      }
      token = page.nextPageToken;
    } while (token);
  }
  return issues.map((x) => fromJiraIssue(x, histories.get(x.id) ?? [], { anonymize: true }));
}

/** Unique workflow statuses used by a project, in category order (to do → in progress → done). */
export async function fetchProjectStatuses(projectKey: string): Promise<{ name: string; category: string }[]> {
  if (!/^[A-Z][A-Z0-9_]{0,19}$/.test(projectKey)) throw new Error(`Invalid project key: ${projectKey}`);
  const types: any[] = await jira(route`/rest/api/3/project/${projectKey}/statuses`);
  const seen = new Map<string, string>();
  for (const t of types ?? []) for (const st of t.statuses ?? []) if (!seen.has(st.name)) seen.set(st.name, st.statusCategory?.key ?? 'indeterminate');
  const order: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };
  return [...seen.entries()].map(([name, category]) => ({ name, category })).sort((a, b) => (order[a.category] ?? 1) - (order[b.category] ?? 1));
}
