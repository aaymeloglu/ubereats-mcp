# ubereats-mcp

An MCP server that exposes Uber Eats browse and reorder functionality to AI assistants like [Claude Code](https://claude.ai/code). Built with the [Model Context Protocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [impit](https://github.com/apify/impit) for TLS-fingerprint-spoofing HTTP, and Playwright for interactive login.

> **Status: Work in progress.** The client core is done and tested. The tool surface and interactive login are not yet implemented. See [Status & pickup](#status--pickup) below.

## What this is

Uber Eats has no public ordering API. This server automates the authenticated web API (`www.ubereats.com/_p/api/<opName>`) using a saved browser session, so an AI assistant can browse restaurants, look up menus, inspect past orders, and populate the cart from a prior order for one-click reorder.

## Planned tools

| Tool | Description | Status |
|------|-------------|--------|
| `login` | Interactive Playwright login that saves `session.json` | not built |
| `session_status` | Report whether a saved session is present and fresh | not built |
| `search_restaurants` | Search Uber Eats for restaurants | not built |
| `get_restaurant_menu` | Full menu for a given store | not built |
| `list_recent_orders` | List past orders for the logged-in user | not built |
| `reorder_past_order` | Populate the cart from a past order (user finishes checkout in their own browser) | not built |

**Not planned:** full place-order submission. Uber's final checkout call requires a PayPal attestation token produced by a fingerprinting iframe that cannot be reproduced outside a real browser. See [`recon/findings.md`](recon/findings.md) for the full write-up. If Uber ever removes that dependency, a `place_order` tool becomes viable.

## Architecture

```
src/
├── server.ts         # MCP stdio server entrypoint
├── errors.ts         # 4-code error taxonomy (AUTH_REQUIRED, RATE_LIMITED, GRAPHQL_ERROR, UPSTREAM_ERROR)
├── session.ts        # session.json read/write (mode 0600, atomic writes)
└── uber/
    ├── operations.ts # Typed catalog of 4 Uber Eats web API operations
    └── client.ts     # UberClient (impit + header injection + error mapping + 5xx retry)
```

The client is transport-agnostic for tests (injectable `fetch`) and uses impit under the hood for real requests. Each operation in the catalog is a plain JSON POST; despite the `/_p/api/` path, these are **not** persisted GraphQL queries (this was a recon finding).

## Status & pickup

Built and tested through Phase 3 (Uber Client Layer). Live execution has not been attempted yet.

### Done

- [x] **Task 1** — Initial scaffolding (package.json pinned exact versions, tsconfig, vitest, LICENSE)
- [x] **Task 2** — Empty MCP server boots on stdio (`src/server.ts`)
- [x] **Task 3** — Recon findings and scrubbed replay scripts committed (`recon/findings.md`, `recon/replay.mjs`, `recon/write_dryrun.mjs`)
- [x] **Task 4** — Error taxonomy (`src/errors.ts` + tests)
- [x] **Task 5** — Session storage with mode 0600 atomic writes (`src/session.ts` + tests)
- [x] **Task 6** — Operation catalog: `getPastOrdersV1`, `getStoreV1`, `getSearchFeedV1`, `createDraftOrderV2` (`src/uber/operations.ts`)
- [x] **Task 7** — UberClient skeleton with header injection (`src/uber/client.ts` + tests)
- [x] **Task 8** — Error mapping in client: HTTP status codes, WAF HTML challenge, failure envelope, 5xx retry (`src/uber/client.ts` + tests)

**Test status:** 17/17 tests passing across 3 files. `npm run typecheck` clean.

### Not done — pick up here

- [ ] **Task 11** — Interactive Playwright login (`src/browser/login.ts`). Launches real Chrome (channel: 'chrome', not bundled Chromium — Uber's WAF blocks the bundled build), walks the user through login, captures cookies + user agent + `x-uber-client-gitref` by observing the first successful `/_p/api/` request, writes `session.json` via `writeSession()`. This is the first task that needs a human in the loop during smoke test.
- [ ] **Task 12** — `login` MCP tool (calls into the Task 11 login flow)
- [ ] **Task 13** — `session_status` MCP tool
- [ ] **Task 14** — `search_restaurants` tool
- [ ] **Task 15** — `get_restaurant_menu` tool
- [ ] **Task 16** — `list_recent_orders` tool
- [ ] **Task 17** — `reorder_past_order` tool (cart-populate only; NOT a place-order tool)
- [ ] **Task 18** — Register all tools in `server.ts`
- [ ] **Task 20** — End-to-end live smoke test (manual)
- [ ] **Task 21** — Expand this README with a full setup + troubleshooting guide
- [ ] **Task 22** — Push to GitHub (this README is part of a partial push)

Full implementation plan: `~/.claude-assistant/docs/superpowers/plans/2026-04-11-ubereats-mcp.md`

### Known gotchas (for the next session)

- **impit API quirks:** impit 0.13.0 exports `Browser` as a string-union type (not a runtime enum), and `RequestInit.method` is typed as a narrow `HttpMethod` union. Task 7 already worked around this in `src/uber/client.ts` — use a `'chrome'` string literal and narrow method casts if you add more verbs. See commit `6bce7d9` for the precedent.
- **Playwright must use real Chrome, not bundled Chromium.** Recon confirmed the bundled build is instantly flagged by Uber's WAF. Use `channel: 'chrome'` and the stealth tweaks already practiced in `~/scratch/ubereats-recon/capture.mjs`.
- **The cookies `sid`, `jwt-session`, `dId`, and `__cf_bm` are load-bearing.** See `recon/findings.md` § "Session shape". `__cf_bm` has a short Cloudflare TTL — if a session stops working after a few hours, re-login before touching anything else.
- **The operation parsers in `src/uber/operations.ts` are best-effort.** Shapes came from reading `captured.har` by hand; if a parser throws at Task 20 smoke test, inspect the raw response body, widen the parser in `operations.ts`, recommit. That file is deliberately the single point of shape drift.

### Running the existing tests

```bash
npm install
npm run build
npm test          # 17 tests, ~200ms
npm run typecheck # should be clean
```

## License

MIT. See [LICENSE](LICENSE).
