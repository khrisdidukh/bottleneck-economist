# Lumos Strategies OÜ — Incident Response Plan

Owner: Khrystyna Didukh, khrystyna.didukh@gmail.com (security contact for all Lumos Strategies OÜ apps).
Adopted: 3 November 2026. Tested: at least once a year with a tabletop exercise; the result is recorded at the end of this file.

## What counts as an incident
A security incident is any event that may expose, change or destroy customer data, or let someone act with the app's permissions without authorisation. A critical vulnerability is a flaw that could lead to such an event, whether or not it was exploited. Examples: a leaked API token, a dependency with a critical advisory that is reachable in the app, a report from a customer, a researcher or Atlassian.

## Steps
1. **Detect and record (same day).** Record what was seen, when, and by whom, in a private incident note.
2. **Assess (within 24 hours).** Decide the severity with the Atlassian Marketplace severity levels. Identify which customers and data could be affected.
3. **Contain (as soon as possible).** Revoke and rotate exposed keys and tokens; deploy a fix or roll back to the last safe version; if needed, disable the affected feature.
4. **Notify.**
   - Atlassian: through the Marketplace security ticket (AMS) or ecosystem.atlassian.net, using Atlassian's app security incident communication template, within 72 hours of confirming the incident.
   - Customers: through the Marketplace listing contact and the app's support channel, using Atlassian's app vulnerability notification template, within 72 hours of confirming the incident or as Atlassian directs.
5. **Fix and verify.** Deploy the fix, confirm it with tests and a new security scan, and close the issue within the Security Bug Fix Policy timelines.
6. **Review (within 2 weeks).** Write down the cause, what worked, what didn't, and what changes to the Security Policy follow.

## Contacts
- Security contact: Khrystyna Didukh, khrystyna.didukh@gmail.com
- Atlassian: Developer and Marketplace Support portal, ecosystem.atlassian.net

## Test log
| Date | Type | Scenario | Result |
| --- | --- | --- | --- |
