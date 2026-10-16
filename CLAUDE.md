@AGENTS.md

# CLAUDE.md

The catalog of the integration platform. Ground rules live in the
[ai-intelligence-domain](https://github.com/azure-intelligence-domain/ai-intelligence-domain)
repository; this repository follows ADR 0009.

- Never write service, API or message pages by hand: they are generated from released
  contracts. Fix the contract in its own repository instead.
- Hand-written content is limited to domains, teams, `docs/platform/` and the platform's
  infrastructure channels (`domains/platform/channels/`).
- Domain folder names equal the domain id used in contracts (`urn:...:<domain>:...`).
- Every owner referenced anywhere must exist in `teams/`.
- Internal links in hand-written pages use `<Link href="/docs/...">`, never a plain Markdown
  link: the catalog is served under `/` (Azure Storage) and `/eventcatalog` (GitHub Pages).
- Before committing: `npm test`, then `npm run discover && npx eventcatalog generate &&
  npx eventcatalog build` with no broken links.
- BPMN flows are not written here: they come from `docs/bpmn/` of each repository's latest
  release (copied by discovery) and are shown with `components/bpmn-viewer.astro` (bpmn-js; the
  bpmn.io watermark must stay visible).
- A 0.x release is cataloged as draft. Operations are queries (GET) or commands (other methods).
