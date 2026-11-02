# Bottleneck Economist

**Where your team's work really waits, and what fixing it is worth.**

Bottleneck Economist is a Forge app for Jira. It reads a project's status history and answers the questions managers argue about every quarter:

- *Where is our bottleneck?* The stage where delivered work spends most of its lead time (Theory of Constraints).
- *Is it a people problem or a decision problem?* A **capacity** constraint (the stage is full) versus a **policy** constraint (work waits for a decision while the people downstream have spare capacity).
- *Should we automate, hire or move people?* Each option is priced per year, and its **real value** (more items delivered, less cost of delay) is kept apart from value that exists **only on paper** (hours freed at a stage that isn't the constraint).
- *Why does it happen?* A root-cause lens from Ichak Adizes' PAEI roles names the missing management function, for example "Entrepreneur: nobody decides what to start and what to drop".

On one year of real, public Apache Cassandra Jira history, the app finds that delivered work spends **46% of its lead time waiting in "Open"** while "In Progress" has 34% spare capacity. The fix is a decision rule (an owner, a triage SLA and a WIP limit), worth about **€926k/year**. The obvious fix, an AI code-review bot, is worth €175k on paper but only €40k in reality, because review is not where work waits.

Built for **Codegeist 2026**, category *Apps for Business Teams*.

## What's in the app

| Forge module | What it does |
| --- | --- |
| `jira:projectPage` (UI Kit) | The report: how an item travels, the constraint, "Do this / Don't do this (yet)", a what-if simulator and editable money assumptions. |
| `rovo:agent` **Bottleneck Economist** | Ask in Rovo Chat: "Where is our bottleneck?", "What if we automate code review?", "Is hiring another developer worth it?" |
| `action` ×5 | `analyze-flow`, `get-analysis-status`, `simulate-what-if`, `recommend-actions`, `set-assumptions`: reusable by any Rovo agent. |
| `rovo:mcp` | The same tools through the **Atlassian MCP server**, for Claude, ChatGPT, Cursor or any MCP client. An open-source [`skills/bottleneck-economist/SKILL.md`](skills/bottleneck-economist/SKILL.md) tells third-party agents how to use them well. |
| `graph:connector` (**Teamwork Graph**) | Publishes each project's report into the Teamwork Graph as a document, **associated with the work items that are stuck at the bottleneck right now**, and refreshes it daily. Rovo Search and Rovo Chat then find "where our work waits and what it costs" next to the stuck issues themselves. |
| `consumer` (async queue) | Reads large projects (thousands of issues and their changelogs) in the background, within Forge limits. |

Everything runs on Atlassian (Forge functions, Forge KVS storage). No data leaves Atlassian; there is no external egress.

## Install and try it (judges)

1. Open the **installation link** from the Devpost submission and install the app on a Jira Cloud site.
2. Open any Jira project → **Apps** in the project sidebar → **Bottleneck Economist**.
   - If the project has a year of finished work, the report is built from it (large projects take about a minute; the page shows progress).
   - Otherwise press **Open the demo** to see the Apache Cassandra report. No setup needed.
3. Try the what-if simulator: pick a stage and a lever (automate, change the decision rule, hire, move, free a person) and compare real value with value on paper. Change the money assumptions (cost per hour, value per delivered item, currency) in **Assumptions**.
4. **Rovo agent:** open Rovo Chat → Agents → **Bottleneck Economist** and pick a conversation starter, for example "Show me the Apache Cassandra demo".
5. **Teamwork Graph connector** (needs an org admin):
   1. Atlassian Administration → **Apps** → *your site* → **Connected apps** → Bottleneck Economist → **View app details** → **Connections**.
   2. Under *Teamwork Graph connectors*, press **Connect** next to *Bottleneck Economist reports*.
   3. Name: anything. Project keys: one or more Jira keys, comma-separated (for example `ENG, OPS`). Demo report: `true`.
   4. Press **Install**. Within a minute, search for "Bottleneck report" in Atlassian search or ask Rovo Chat "where does our work wait?". The project page shows the publication status under **Shared as context**; **Publish now** pushes the current report immediately.
6. **MCP:** connect an MCP client to the Atlassian MCP server for your site; the tools above appear as `analyze-flow`, `simulate-what-if` and so on. Add [`SKILL.md`](skills/bottleneck-economist/SKILL.md) to your agent for best answers.

## How it works

1. **Read the history.** Issues resolved or updated in the lookback window (default 365 days) and their status changelogs, through the Jira REST API (`read:jira-work`), as the app. Big projects are paged by an async queue consumer.
2. **Segment the flow.** Every delivered item becomes a list of time segments per status. Each status is classified as *waiting* (a queue: Open, Ready for review, Patch Available…) or *working* (In Progress, Review In Progress…) from its name; the **Workflow setup** screen lets a team correct any status. The main path is separated from side loops.
3. **Find the constraint.** For each stage: share of lead time, items per week and utilisation. The constraint is the stage that holds the most waiting time; it is a **policy** constraint if the next working stage still has spare capacity, otherwise a **capacity** constraint.
4. **Price the options** with throughput accounting: more items delivered per week × value per item, plus less cost of delay, minus cost. Freed hours at a non-constraint count as *paper value* only.
5. **Explain the cause** through Adizes PAEI from flow evidence (items closed without ever being worked on, an aged backlog, rework loops, review queues).
6. **Share as context.** The report text, the constraint and the keys of the items stuck there go to the Teamwork Graph (`@forge/teamwork-graph`, `graph.setObjects`, `atlassian:document`, associations by `issueIdOrKeys`), on connection and then daily via the connector's orchestration task.

People are never named or ranked. The analysis is about the system; the demo pseudonymises everyone.

## Demo data

The demo is computed from the public Apache Cassandra Jira (https://issues.apache.org/jira/projects/CASSANDRA), 1 Nov 2024 to 1 Nov 2025: 731 delivered items. Only aggregate flow figures are bundled in the app.

## Develop

```sh
npm install
forge register        # first time only: writes your own app id into manifest.yml
forge deploy
forge install         # choose Jira and your site
```

`npm run lint` type-checks the code.

## Honest limits

- Money figures depend on the assumptions (default €60/hour, €2,000 per delivered item, €150 cost of delay per item per week), and every screen and answer shows them. Teams should set their own.
- The constraint is found from status history. Teams that don't move issues through statuses, or bulk-close them, get a data-quality warning instead of a confident answer.
- The Teamwork Graph report is visible to everyone in the workspace (aggregate figures only). It does not replicate Jira project permissions.

## License

MIT
