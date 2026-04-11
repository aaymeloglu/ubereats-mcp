# Uber Eats API Recon — 2026-04-11

## Transport

- Client: [impit](https://github.com/apify/impit) (TLS fingerprint spoofing, Chrome profile) against `https://www.ubereats.com/_p/api/<operationName>`.
- Despite the "_p/api" path prefix resembling a GraphQL gateway, **these are NOT GraphQL persisted queries.** Each operation is a plain POST whose last path segment is the operation name; the request body is a vanilla JSON object (no `operationName`, `variables`, or `extensions.persistedQuery` envelope). No `sha256Hash` is ever sent.
- All requests are `POST` with `content-type: application/json`. Responses are JSON of the form `{ status: "success" | "failure", data: {...} }`.
- Playwright is only used for the interactive login that seeds session cookies; all runtime traffic is driven by impit.

## Required headers

Header NAMES only (values captured but not committed):

- `cookie` — full session cookie jar (see "Session shape" below)
- `content-type: application/json`
- `accept: */*`
- `accept-language`
- `user-agent` — should match the browser that minted the cookies
- `origin: https://www.ubereats.com`
- `referer` — page-appropriate (`/orders`, `/checkout/...`, `/`)
- `x-csrf-token` — captured value is literally the string `"x"`; the real CSRF enforcement is cookie-based, this header just needs to be present
- `x-uber-client-gitref` — captured from a live session (build hash)

Additional headers observed on place-order calls but NOT required for the read + cart-populate path we verified:

- `x-uber-ciid`
- `x-uber-request-id`
- `x-uber-session-id`
- `x-uber-device-location-latitude` / `x-uber-device-location-longitude`
- `x-uber-target-location-latitude` / `x-uber-target-location-longitude`
- `sec-ch-ua*` client hints

For the read path and `createDraftOrderV2` dry-run, impit's default Chrome fingerprint plus the cookie jar was sufficient — the `x-uber-*` request/session IDs were deliberately omitted and the call still succeeded.

## Session shape

Keys present in `session_snapshot.json` (raw file is gitignored):

- `url`, `method`, `body` — the seed request used to mint the snapshot (`getPastOrdersV1`)
- `cookie` — full `Cookie:` header string from a logged-in session
- `userAgent`
- `csrfToken` — literal `"x"`
- `clientGitref` — build hash
- `sessionId` — value of `x-uber-session-id` from the seed request
- `ciid` — value of `x-uber-ciid`
- `requestId` — value of `x-uber-request-id`
- `origin`, `referer`, `acceptLanguage`

Notable cookie names inside the `cookie` string (names only, values redacted):

- `sid` — the authoritative login session cookie
- `jwt-session` — short-lived JWT (~8h) used alongside `sid`
- `dId` — stable device id
- `uev2.id.session_v2`, `uev2.ts.session_v2`, `uev2.id.session`, `uev2.ts.session` — Uber Eats client session markers
- `uev2.loc` — URL-encoded JSON blob of the currently selected delivery address
- `uev2.id.xp` — experiment bucket id
- `_userUuid` — eater uuid (same as the account's user uuid)
- `udi-id`, `udi-fingerprint` — Uber device intelligence fingerprints
- `state`, `smeta` — misc Uber auth state
- `__cf_bm` — Cloudflare bot-management cookie (short TTL; may need refresh)
- Analytics / third-party: `_ua`, `_ga`, `_ga_P1RM71MPFP`, `_gcl_au`, `utag_main_*`, `_fbp`, `_twpid`, `_scid`, `_scid_r`, `_sctr`, `_uetsid`, `_uetvid`, `_tt_enable_cookie`, `_ttp`, `ttcsid*`, `_clck`, `_cc`, `_yjsu_yjad`, `g_state`, `mp_*_mixpanel`, `marketing_vistor_id`, `u-cookie-prefs`

The `sid`, `jwt-session`, `dId`, and `__cf_bm` cookies are the load-bearing ones for auth. The analytics cookies are cosmetic but are sent by the real browser so they may matter for bot-detection heuristics — we pass the whole jar unchanged.

## Operations

All operations below were observed in `captured.har` during a real browse + reorder session. The set was enumerated from `capture_place.mjs`'s `KNOWN_OPS` list (hand-curated from the HAR):

| Operation | Verb | Purpose | Relevant to MCP? |
|---|---|---|---|
| `getHomeV2` | POST | Home feed (nearby stores, carousels) | yes (search-adjacent) |
| `getFeedV1` | POST | Vertical feed | maybe |
| `getSearchHomeV2` | POST | Search landing | yes |
| `getSearchFeedV1` | POST | Search results | yes |
| `getSearchSuggestionsV1` | POST | Search autocomplete | yes |
| `getStoreV1` | POST | Full store page + menu | yes |
| `getMenuItemV1` | POST | Single menu item detail | yes |
| `getPastOrdersV1` | POST | Paginated list of past orders | **yes — list_recent_orders** |
| `getOrderEntitiesV1` | POST | Detailed order entities | yes |
| `getEaterOrderCountsV1` | POST | Order counts per store | no |
| `getActiveOrdersV1` | POST | Currently in-flight orders | yes |
| `getLatestPendingRatingV1` | POST | Ratings prompt | no |
| `getCartsViewForEaterUuidV1` | POST | Current carts for user | yes |
| `getDraftOrderByUuidV1` | POST | Read a specific draft order | yes |
| `getDraftOrdersByEaterUuidV1` | POST | List draft orders | yes |
| `createDraftOrderV2` | POST | **Create/populate cart from items** | **yes — reorder primitive** |
| `getCheckoutPresentationV1` | POST | Checkout page server-side render | yes |
| `checkAndUpdateGratisV1` | POST | Free item / promo check | no |
| `getInstructionForLocationV1` | POST | Delivery instructions for address | maybe |
| `getInvoiceStatusV1` | POST | Invoice state | no |
| `getSessionElapseV1` | POST | Session freshness ping | maybe |
| `getBusinessProfilesV1` | POST | Business/expense profile list | no |
| `getProfilesForUserV1` | POST | Eater profile list | no |
| `getTaxProfilesConfig` | POST | Tax profile config | no |
| `getUberBalancesV1` | POST | Uber Cash / credit balance | no |
| `checkoutOrdersByDraftOrdersV1` | POST | **Final place-order submission** | **BLOCKED (see below)** |

### Read path — confirmed working

`getPastOrdersV1` was replayed end-to-end via impit with nothing but `cookie`, `user-agent`, `x-csrf-token: x`, `x-uber-client-gitref`, and the standard browser headers. Request body: `{"lastWorkflowUUID": ""}`. Response was a JSON success envelope with an `ordersMap` object keyed by order uuid. See `replay.mjs`.

By the same transport, all other `get*V1/V2` operations in the table above are expected to work identically — same auth model, same request envelope, same response envelope. The ones actually needed by the MCP server (browse, store, past orders, active orders) are trivially adaptable from `replay.mjs`.

### Write path — cart-populate confirmed reachable

`createDraftOrderV2` was dry-run with deliberately bogus item uuids (`shoppingCartItems: [{ uuid: "bogus-item-uuid-0000", storeUuid: "bogus-store-uuid-0000", ... }]`) via impit. The endpoint was reachable and responded with a structured validation failure (not a Cloudflare HTML challenge, not an auth redirect). That is the GO signal for the Shape B cart-populate primitive: the same call, with real item + store uuids lifted from a `getPastOrdersV1` response, is how the MCP server will reorder.

See `write_dryrun.mjs`.

### Write path — place-order is BLOCKED

`checkoutOrdersByDraftOrdersV1` is the final submit. Its request body is captured in `place_order_capture.json` (raw file gitignored). The relevant field that kills automation is `checkoutActionResultParams.value`, a stringified JSON that contains:

```
{
  "checkoutSessionUUID": "{REDACTED}",
  "useCaseKey": "{REDACTED}",
  "actionResults": [{
    "actionUUID": "{REDACTED}",
    "status": "COMPLETE",
    "data": {
      "payPalFingerprintingResult": {
        "payPalCorrelationId": "{REDACTED}"
      }
    },
    "paymentProfileUUID": "{REDACTED}",
    "orderKey": 0
  }],
  "estimatedPaymentPlan": { ... }
}
```

The `payPalCorrelationId` is produced by PayPal's fingerprinting SDK running inside a sandboxed PayPal iframe that the Uber Eats checkout page embeds. It is only emitted after the SDK has completed its device-attestation handshake with PayPal's servers, and it is tied to the parent-frame origin plus a one-shot `useCaseKey` / `actionUUID` issued by `getCheckoutPresentationV1`.

Reproducing it outside a real browser would require either:

1. driving a full instrumented browser through the checkout UI (defeats the purpose of using impit), or
2. reverse-engineering the PayPal SDK's attestation protocol (out of scope, fragile, probably ToS-hostile).

Without a valid `payPalCorrelationId`, `checkoutOrdersByDraftOrdersV1` is expected to fail with a payment-fingerprint validation error. We did NOT attempt a live submit — the capture harness (`capture_place.mjs`) intercepts the call with a synthetic 503 before it leaves the browser, to avoid accidentally placing a real order on Andy's account.

## Decision: Shape B (cart-populate only)

The MCP server will expose:

- **Browse** — `search_restaurants`, `get_restaurant_menu`, `get_restaurant` (via `getSearchFeedV1`, `getStoreV1`, `getMenuItemV1`)
- **Orders read** — `list_recent_orders`, `get_order_details` (via `getPastOrdersV1`, `getOrderEntitiesV1`)
- **Reorder (cart-populate only)** — `reorder_past_order`: look up a prior order via `getPastOrdersV1`, extract its `shoppingCartItems`, POST to `createDraftOrderV2`. Leaves a draft order in the eater's cart. User finishes checkout in their own browser.

The MCP server will NOT implement full place-order submission. The PayPal attestation blocker is documented above; if Uber ever switches to a different payment profile (credit card direct, Apple Pay, Uber Cash) this blocker may go away and can be re-investigated.

## Reproduction

To capture a fresh session:

1. Run `capture.mjs` — launches Playwright Chrome, walks you through login, dumps HAR plus `session_snapshot.json`.
2. Confirm the snapshot is live by running `replay.mjs` — should print `PASS — got N orders back`.
3. (Optional) Run `write_dryrun.mjs` — should print `PASS — write endpoint reachable, validation rejected bogus input`.

See `../README.md` section "Troubleshooting" for cookie-refresh triage and common failure modes (Cloudflare 403 HTML, expired `jwt-session`, stale `__cf_bm`).

The scripts `replay.mjs` and `write_dryrun.mjs` in this directory are the scrubbed versions — they read from a `session_snapshot.json` that you must supply yourself from a live login. **Do not commit real cookies.**
