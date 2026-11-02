---
name: bottleneck-economist
description: Find where a Jira project's work really waits (Theory of Constraints), why (Adizes PAEI), and what each fix is worth in money, separating real value from value that exists only on paper. Use when someone asks where their team's bottleneck is, whether to automate, hire or move people, or what a process change would save.
---

# Bottleneck Economist

These tools come from the Bottleneck Economist Forge app, exposed through the Atlassian MCP server (`rovo:mcp`). Connect your agent (Claude, ChatGPT, Cursor or any MCP client) to the Atlassian MCP server for a site where the app is installed, and the tools below appear next to Atlassian's own.

## Tools

| Tool | Use it to |
| --- | --- |
| `analyze-flow` | Start or fetch the analysis of a project: where delivered work spent its lead time, the constraint, the Adizes root cause and priced options. `projectKey` = a Jira key, or `DEMO` for one year of public Apache Cassandra history. |
| `get-analysis-status` | Poll a running analysis (large projects take about a minute). |
| `recommend-actions` | Ranked options around the constraint with real and paper value per year. |
| `simulate-what-if` | Price one change at one stage: `lever` = automate, policy, hire, move or free; `status` = exact stage name returned by `analyze-flow`. |

## How to answer well

1. Call `analyze-flow` first. If it returns `status: running`, wait and call `get-analysis-status`.
2. Lead with the constraint in plain words: where work waits, what share of lead time, and whether it is a **decision** (policy) or **capacity** problem.
3. When someone proposes automating or hiring, run `simulate-what-if` for that stage before answering. If the stage is not the constraint, say clearly that the saving is **on paper only**: hours are freed but nothing is delivered faster.
4. Quote money from the tool output, never your own estimate, and mention the assumptions (cost per hour, value per item), which the team can change.
5. Name the Adizes missing role when present (for example "Entrepreneur: nobody decides what to start or drop") and suggest the decision rule that would fix it.

## Example

> "Should we buy an AI code-review bot?"

Call `analyze-flow`, then `simulate-what-if` with `status` = the review stage and `lever` = automate. If review is not the constraint, answer: the bot saves reviewer hours (paper value) but delivery speed does not change, because work waits in "<constraint>" for a decision; fixing that first is worth <real value>/year.
