# Lumos Strategies OÜ — Information Security Policy

Applies to: Lumos Strategies OÜ (registry code 17138613) and the apps it publishes, including Bottleneck Economist on the Atlassian Marketplace.
Owner and security contact: Khrystyna Didukh, khrystyna.didukh@gmail.com.
Adopted: 3 November 2026. Reviewed: at least once a year and after any security incident.

Lumos Strategies OÜ has one person who builds and runs its apps. This policy states the rules that person follows.

## 1. Accounts and access
- Multi-factor authentication is on for every company account: Google, GitHub, Atlassian and hosting providers.
- Passwords are unique per service, at least 14 characters, and kept in a password manager.
- API keys and tokens are rotated at least every 90 days and immediately if exposure is suspected. They are stored only in local files outside the repositories or in the platform's encrypted variables, never in code, URLs or logs.
- Access review every quarter: list the people, OAuth apps, API tokens and SSH/deploy keys that can reach company systems; remove anything not needed.

## 2. Workstations
- Operating system and software updates install automatically; an operating system version that no longer receives security patches is not used for company work.
- Full-disk encryption is on for every workstation used for development.
- Built-in malware protection stays enabled.

## 3. Building and changing apps
- Apps request only the scopes their features need (least privilege).
- Every change is type-checked and tested before it is deployed to production.
- Before each production release: `npm audit` on the dependency tree, review of the Atlassian Marketplace security scan, and a refreshed software bill of materials (CycloneDX, generated from `package-lock.json` and kept in `docs/security/`).
- All user input is validated on the server side; the user interface uses Forge UI Kit components only.
- The OWASP Top 10 is the checklist for design and code review.

## 4. Data and logs
- Bottleneck Economist runs entirely on Atlassian Forge (no remote backend, no egress). Customer data stays in Forge storage, which Atlassian encrypts at rest.
- Logs never contain credentials, tokens or personal data. Only the developer account can read Forge logs.
- Source code is kept in GitHub, which encrypts data at rest; no customer data is stored in repositories.

## 5. AI
- The company does not send Atlassian customer data to third-party AI or machine-learning models. Bottleneck Economist's Rovo agent runs on Atlassian Rovo; the app's own analysis is deterministic code.

## 6. Vulnerabilities and incidents
- Security issues are fixed within the timelines of the Atlassian Marketplace Security Bug Fix Policy.
- Incidents are handled with the [Incident Response Plan](incident-response-plan.md).
