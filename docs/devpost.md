# Devpost submission: Bottleneck Economist

**Project name:** Bottleneck Economist

**Elevator pitch (≤200):**
Find where your team's work really waits in Jira, and what fixing it is worth. It splits real value from value on paper, so you don't buy an AI bot for a stage that isn't the bottleneck.

**Category:** Apps for Business Teams
**Bonus prizes:** Best Agents (Rovo), Best app with Atlassian MCP, Best apps with Teamwork Graph integration

**Built with:** forge, jira, rovo, rovo-agent, rovo-actions, atlassian-mcp, teamwork-graph, forge-ui-kit, forge-kvs, forge-async-events, typescript, react, theory-of-constraints, throughput-accounting

---

## Inspiration

Every quarter a team asks the same question with money on the line: *do we hire, automate, or reorganise?* The answer usually comes from the loudest opinion or the latest AI tool demo. Yet Jira already holds the evidence: every status change of every work item, with a timestamp.

Eliyahu Goldratt showed that a system moves only as fast as its constraint, and that an hour saved anywhere else is a mirage. Ichak Adizes showed that teams stall when a management role is missing, most often the one that decides what to start and what to drop. We wanted a manager to get both answers from their own Jira in a minute, with a price tag that separates real money from money that exists only on paper.

## What it does

Open **Bottleneck Economist** in any Jira project (Apps in the project sidebar):

1. **How an item travels.** One year of delivered work becomes a flow: days per item in every status, waiting (blue) or worked on (green), the bottleneck in red.
2. **The constraint, in one sentence.** On one year of public Apache Cassandra history: *"Your bottleneck is a decision, not people. Delivered work spends 46% of its lead time waiting in 'Open', while 'In Progress' still has 34% spare capacity."* That is a **policy** constraint. More people or automation won't help; changing the rule will.
3. **Do this / Don't do this (yet).** Every option is priced per year in throughput-accounting terms:
   - Decide faster at "Open" (owner + SLA + WIP limit): **€926k/year real**.
   - Automate half of code review, the obvious target: **€175k on paper, €40k real**. Review is not where work waits, so the freed hours don't deliver anything faster.
   - Hire another developer: **−€94k/year**.
4. **Why it happens.** The Adizes PAEI lens names the missing role from flow evidence. Here it is *Entrepreneur*: 34% of resolved items were closed without ever being worked on (late "no" decisions), and 2,921 items have been untouched for 180+ days.
5. **What if…** A simulator prices any change at any stage (automate, change a decision rule, hire, move, free a person) and shows delivered items per week and lead time before and after. Money assumptions (cost per hour, value per delivered item, cost of delay, currency) are editable per project.
6. **Ask the Economist.** A **Rovo agent** answers "Where is our bottleneck?", "What if we automate code review?" or "Is hiring another developer worth it?" from the same tools and always quotes the tool's numbers, never its own.
7. **Shared as context.** A **Teamwork Graph connector** publishes each project's report into the graph, **associated with the work items stuck at the bottleneck right now**. Anyone on the team then finds "where our work waits and what it costs" in Rovo Search, linked to the very issues that are waiting.
8. **Any agent, not only Rovo.** The same tools are exposed through the **Atlassian MCP server** (`rovo:mcp`), with an open-source `SKILL.md` so Claude, ChatGPT or Cursor know how to use them well.

## How we built it

- **Forge, Jira project page in UI Kit** (`jira:projectPage`): flow chart, option tables, simulator, workflow setup, assumptions.
- **Rovo agent** (`rovo:agent`) with 5 **actions**: `analyze-flow`, `get-analysis-status`, `simulate-what-if`, `recommend-actions`, `set-assumptions`.
- **Atlassian MCP** (`rovo:mcp`) exposing four of them as tools, plus `skills/bottleneck-economist/SKILL.md`.
- **Teamwork Graph connector** (`graph:connector`, `@forge/teamwork-graph`): `atlassian:document` objects with `issueIdOrKeys` associations; publishes on connection, then on a daily orchestration task (`scheduleOrUpdateTask` + `taskRunner`).
- **Async events** (`consumer`): large projects (thousands of issues with full changelogs) are read in the background within Forge limits; the page shows progress.
- **Forge KVS** for reports, assumptions and workflow setup. Everything runs on Atlassian; no data leaves it.
- **Engine** in TypeScript: status segmentation, main path vs side loops, utilisation per stage, constraint classification (policy vs capacity), throughput accounting (real vs paper value), PAEI evidence rules.
- **Demo data:** one year (Nov 2024 to Nov 2025) of the public Apache Cassandra Jira, 731 delivered items, bundled as aggregates only.

## Challenges we ran into

- **"Waiting" isn't a Jira category.** A status name doesn't say whether anyone works on the item: "Patch Available" means "waiting for a reviewer". We classify statuses by meaning and let teams correct the classification on a Workflow setup screen.
- **Bulk edits lie.** Teams that bulk-close old issues create fake flow. We detect status changes made in bulk (within two minutes of each other) and show a data-quality warning next to the result.
- **Paper value is seductive.** Freed hours look like savings in any spreadsheet. Throughput accounting made us show them separately: they become money only if people move to the constraint or the cost actually disappears.
- **Teamwork Graph connections** are created by an admin in Atlassian Administration, and a connection stops accepting writes after a manifest change. We publish on connection and on a daily orchestration task, forget connections the platform reports as gone, and show the publication status (with a Publish now button) on the page.

## Accomplishments that we're proud of

On real public data, the app reaches a conclusion a team would argue about for weeks: the expensive fix everyone wants (automate review, hire) is worth almost nothing, and the cheap one (a decision rule at intake) is worth €926k a year. It shows its evidence, and it never blames a person.

## What we learned

Most delivery problems that look like capacity problems are decision problems. The data to prove it is already in Jira; it only needs to be read as a flow and priced honestly.

## Who built it

The idea and product decisions are Khrystyna Didukh's; she built it for Codegeist 2026 together with Claude (Anthropic) as her coding partner.

## What's next

- Jira Service Management queues and Confluence approval flows with the same engine.
- Cost of delay from Jira fields (due dates, priority, linked revenue).
- A weekly digest from the Rovo agent when the constraint moves.

## How it meets the technology requirement

A Forge app (Rovo agent, 5 actions, MCP server, Teamwork Graph connector, Jira project page, async queue consumer and scheduled trigger) integrated with **Jira** (project page, REST API with `read:jira-work`), **Rovo** (agent and actions), the **Atlassian MCP server** (`rovo:mcp`) and the **Teamwork Graph** (`graph:connector` writing objects through `@forge/teamwork-graph`).

## Bonus prize write-ups

**Best Agents.** The `rovo:agent` Bottleneck Economist uses five reusable `action` modules that any other Rovo agent can call as tools. It follows a strict answer structure (finding, where lead time goes, root cause, options with real vs paper value, a first step for this week) and never invents numbers.

**Best app with Atlassian MCP.** `rovo:mcp` exposes `analyze-flow`, `get-analysis-status`, `recommend-actions` and `simulate-what-if` through the Atlassian MCP server. The open-source `SKILL.md` teaches third-party agents the workflow: analyse first, run a what-if before answering "should we automate/hire?", quote money from the tool, and say when a saving is on paper only.

**Best apps with Teamwork Graph integration.** The connector writes one `atlassian:document` per project into the graph, associated with the Jira work items currently waiting at the bottleneck. A Rovo Search for "bottleneck" or the project now brings back the reason those items wait and what fixing it is worth: context, not another dashboard. The connector publishes on connection and refreshes daily through the platform's orchestration task.

## Testing instructions

See the README: install from the link, open Apps → Bottleneck Economist in any project (or **Open the demo**), try the Rovo agent, and optionally connect the Teamwork Graph connector in Atlassian Administration → Apps → *site* → Connected apps → Bottleneck Economist → Connections.
