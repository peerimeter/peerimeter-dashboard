# Repository guidance

This is the independent `peerimeter-dashboard` React repository. The sibling
`../.github` repository contains the shared project plan and progress tracker;
`../peerimeter-service` defines the current API contract. Keep this repository
independently buildable and do not combine its history with sibling repositories.

## Development

- Use Node.js 22 and the exact dependency versions recorded in `package-lock.json`.
- Keep the dashboard compatible with the API actually implemented by
  `peerimeter-service`; document missing capabilities rather than inventing API
  behavior.
- Keep API keys and join bundle tokens in tab-scoped session state only. Never
  commit usable keys, tokens, generated configurations or `.env` files.
- Before feature work, update local `main` from `origin/main` and branch from it.
- Follow `../.github/docs/repository-conventions.md` for branches, commits, PRs,
  required checks, action locks and completion claims.
- Pin GitHub Actions to release tags, generate and verify
  `.github/workflows/actions.lock` using `gh actions-lock`, and run the lock
  verifier in CI.
- Run `npm test`, `npm run lint`, `npm run build`, and `npm audit --audit-level=moderate`
  for UI changes. Report checks that cannot run.
- Keep UI and documentation claims accurate about the shared API key, same-origin
  deployment requirement, direct WireGuard behavior and unsupported peer
  revocation.
