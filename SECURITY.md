# Security policy: Bottleneck Economist

_Last updated: 2 November 2026_

Bottleneck Economist is a Forge app. All code runs on Atlassian's Forge platform and all data stays in Forge storage on the customer's own site; the app has no external egress and no servers of its own. The publisher (Lumos Strategies OÜ) has no access to customer data.

- **Scopes:** `read:jira-work` (read issues and status changelogs), `storage:app` (Forge storage), `read/write/delete:object:jira` (Teamwork Graph connector, used only when an admin connects it).
- **Authentication:** the app never asks for passwords, API tokens or personal access tokens.
- **Logs:** Forge logs contain project keys and error messages only, kept by Atlassian under Forge's retention.
- **Dependencies:** the app's runtime dependencies are Atlassian's Forge packages (`@forge/*`) and React; they are updated with each release.

## Reporting a vulnerability

Please report security issues privately to the security contact e-mail shown in the app's Atlassian Marketplace listing (Privacy & Security tab), not in public GitHub issues.
