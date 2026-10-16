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
- Before committing: `npm test`, then `npm run discover && npx eventcatalog generate &&
  npx eventcatalog build` with no broken links.
