# Marketplace listing: Bottleneck Economist

**App name:** Bottleneck Economist
**Vendor:** Lumos Strategies OÜ
**Pricing:** Free
**Hosting:** Cloud (Forge), Jira

**Tagline (summary):**
Find where your team's work really waits in Jira, and what fixing it is worth in money: real value vs value only on paper.

**Highlights**

1. **See where work really waits.** One year of your project's status history becomes a flow: days per delivered item in every status, waiting or worked on, with the bottleneck in red. Images: `h1_bottleneck.png`. Caption: "The bottleneck is a decision, not people: delivered work waits 81 days in Open."
2. **Real value vs value on paper.** Every option (change a decision rule, automate, hire, move a person) is priced per year with throughput accounting. Automating a stage that isn't the constraint shows up as paper value. Images: `h2_real_vs_paper.png`. Caption: "€926k a year from a decision rule; an AI review bot is worth €175k on paper and €40k in reality."
3. **Ask it in Rovo, or from any agent.** A Rovo agent and five reusable actions answer "where is our bottleneck?" and "what if we automate review?" from the same numbers. The tools are also available through the Atlassian MCP server, and the report is shared into the Teamwork Graph next to the stuck work items. Images: `h3_rovo_agent.png`. Caption: "The Bottleneck Economist agent answers from the app's analysis, never its own estimates."

**More details (description):**
Every quarter teams argue about hiring, automating or reorganising. Jira already holds the evidence: every status change of every work item. Bottleneck Economist reads it as a flow (Theory of Constraints), separates waiting from working, finds the constraint and tells you whether it is a capacity problem or a decision problem. It prices every option per year and keeps real money (more items delivered, less cost of delay) apart from hours that are freed but deliver nothing faster. A root-cause lens from Ichak Adizes' PAEI roles names the missing management function.

- Jira project page with the flow, the constraint, options, a what-if simulator and editable money assumptions
- Rovo agent "Bottleneck Economist" with five reusable actions
- The same tools on the Atlassian MCP server, plus an open-source SKILL.md for third-party agents
- Teamwork Graph connector: one report per project, linked to the work items waiting at the bottleneck, refreshed daily
- Demo built from one year of public Apache Cassandra Jira history, no setup needed
- Runs entirely on Atlassian (Forge). No external egress. People are never named or ranked.

**Screenshots:** `s4_context_options.png` ("All options with real and paper value"), `s5_whatif.png` ("What-if simulator").

**Links**
- Documentation: https://github.com/khrisdidukh/bottleneck-economist#readme
- Support: https://github.com/khrisdidukh/bottleneck-economist/issues
- Privacy policy: https://github.com/khrisdidukh/bottleneck-economist/blob/main/PRIVACY.md
- Terms: https://github.com/khrisdidukh/bottleneck-economist/blob/main/TERMS.md

**Category:** Project management / Reports
**Keywords:** bottleneck, theory of constraints, flow metrics, lead time, cycle time, throughput accounting, Rovo, MCP, Teamwork Graph
