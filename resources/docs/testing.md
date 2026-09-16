---
name: proabono-testing
description: Exercising a ProAbono integration — sandbox versus production, test card numbers for success and failure scenarios, receiving webhooks locally, and replaying notifications.
when_to_use: Setting up a development environment, writing tests against ProAbono, reproducing a payment failure, or getting webhooks to reach localhost.
---

# Testing a ProAbono integration

## Sandbox and production are two separate worlds

Two environments, nothing shared: different `business_id`, different Agent/API keys, different
endpoint, different catalog, different customers. A customer created in sandbox does not exist in
production.

Everything environment-specific belongs in configuration:

```
PROABONO_API_BASE=https://api-42.proabono.com
PROABONO_BUSINESS_ID=42
PROABONO_SEGMENT_REF=demo-eur
PROABONO_AGENT_KEY=...
PROABONO_API_KEY=...
PROABONO_PORTAL_SECRET=...
PROABONO_WEBHOOK_SECRET=...
```

A hardcoded `business_id` is the classic cause of "the portal shows nothing in production": the page
loads, ProAbono resolves the id to the sandbox business, and the customer does not exist there.

## What behaves differently in sandbox

| | Sandbox | Production |
| --- | --- | --- |
| Security `hash` on hosted pages | Optional | **Mandatory** |
| Card payments | Simulated with test cards | Real money |
| Webhook delivery to localhost | Not possible — use a tunnel | Not possible |

The `hash` difference is the one that bites. An integration developed without it works perfectly
until go-live, then fails on every page at once. **Wire the hash in from day one** and keep it in
both environments — see `in-site-installation.md`.

## Test card numbers

Sandbox only. Each card encodes a scenario across *registration* and the later *renewal*, which is
what makes them useful: most interesting failures happen at renewal, weeks after the customer
subscribed.

### Success

| Scenario | Card |
| --- | --- |
| 3DS at registration, success at registration, success at renewal | `4200 4600 3700 3700` |
| 3DS at registration, success at registration, 3DS again at renewal | `4200 4600 3700 4609` |

### Failure

| Scenario | Card |
| --- | --- |
| Success at registration, **insufficient funds at renewal** | `4200 4600 3702 5901` |
| Success at registration, **transaction rejected at renewal** | `4200 4600 3705 4208` |
| **Insufficient funds at registration** | `4202 5602 5602 5603` |
| **Transaction rejected at registration** | `4205 4202 5602 5607` |

> Repeated consecutive attempts with the rejected-at-registration card (`4205 4202 5602 5607`)
> trigger fraud protection and will get the account **banned**. If that happens, contact support. Use
> it once to verify your error path, not in a loop, and never in an automated test that runs on every
> commit.

### What to actually test with them

The renewal-failure cards are the valuable ones, because they exercise the part of the integration
that is hardest to reason about:

1. Subscribe with `4200 4600 3702 5901`.
2. Confirm the customer has rights (`GET /v1/Usages` returns the expected features).
3. Let the renewal fail — or have the renewal simulated from the BackOffice.
4. Confirm your webhook fired, your resync ran, and the rights you serve changed accordingly.
5. Confirm you did **not** revoke access on the payment-failure event alone, but on the subscription
   suspension. See `rights-management.md`.

## Receiving webhooks locally

ProAbono will not deliver to a local address, by design. Use a reverse proxy to expose your machine
on a public HTTPS URL; **ngrok** is the documented recommendation and its free tier is sufficient.

Typical loop:

1. Start your app locally (say on port 3000).
2. Start the tunnel and take the public HTTPS URL it prints.
3. In the BackOffice, point a webhook at `https://<tunnel>/webhooks/proabono`.
4. Run the validation handshake — *Send verification code*, read the code from your logs, enter it.
   Your endpoint must already return 200; see `webhooks-processing.md`.
5. Trigger events by driving the hosted pages with a test card.

Note that most tunnels hand out a **new URL on every restart**, which invalidates the webhook and
forces a re-validation. Either use a reserved/static domain, or accept that step 3–4 is part of
starting work.

## Replaying and inspecting notifications

The BackOffice keeps **60 days** of delivery history under *Integration → Webhooks → Notifications
History*, showing for each notification the event type, the event time, the last delivery time and
the HTTP status your server returned. Open a row to see the error and the full JSON payload, and use
**Retry delivery** once your side is fixed.

This is the fastest way to answer "did ProAbono send it, or did we drop it?" — and it doubles as a
development tool: break your endpoint deliberately, fix it, replay.

## Building a test fixture

Some things are worth scripting once so that a usable sandbox state is one command away:

```js
// scripts/seed-sandbox.js — create a customer and start them on the free plan.
const customerRef = `cust-test-${Date.now()}`;

await proabono("POST", "/v1/Customer", {
  ReferenceSegment: process.env.PROABONO_SEGMENT_REF,
  ReferenceCustomer: customerRef,
  Name: "Test customer",
  Language: "en",
});

await proabono("POST", "/v1/Subscription", {
  ReferenceCustomer: customerRef,
  ReferenceOffer: process.env.PROABONO_FREE_OFFER_REF,
  TryStart: true,
});

console.log("seeded:", customerRef);
```

Use a unique `ReferenceCustomer` per run. Re-running with the same reference **updates** the existing
customer rather than creating a fresh one (see `api-basics.md`), which quietly makes tests depend on
the leftovers of the previous run.

## Automated tests

- **Do not hit the live sandbox from unit tests.** It is a shared, stateful, rate-limited remote
  service. Stub the HTTP layer and assert on your own interpretation logic — the `TypeFeature`
  branching, the unlimited case, the cache-replacement behaviour. That is where your bugs are.
- **Do keep a small set of integration tests** against the sandbox, run deliberately rather than on
  every commit, covering: customer creation, subscription start, reading usages, a usage update, and
  a webhook round-trip.
- **Fixtures worth having** for unit tests, because each has caused a real bug: a feature with no
  `QuantityCurrent` (unlimited), `QuantityCurrent` greater than `QuantityIncluded`, an `OnOff` with
  `IsIncluded: false` but `IsEnabled: true`, an empty `Items` array (not yet subscribed), and a
  multi-page collection.
- **Webhook fixtures worth having**, for the same reason: a `SubscriptionDateTermUpdated` payload
  (carries `Customer` only — no `Subscription` block), a `SubscriptionStarted` payload where
  `CustomerBuyer` differs from `Customer`, the `SubscriptionUpgraded` + `SubscriptionTerminatedForUpgrade`
  pair delivered in the "wrong" order, the same notification `Id` delivered twice, and a validation
  handshake body with no `TypeTrigger`. Shapes are in `webhooks-processing.md`.

## Pre-production checklist

1. `business_id`, endpoint and both key pairs switched to production values, from configuration.
2. Security `hash` computed server-side and passed on every hosted-page open.
3. Webhook endpoint reachable over HTTPS, validated, signature verification **on**.
4. All rights-affecting events subscribed; payment/invoice events kept off the entitlement path.
5. Post-workflow redirect URL configured for every outcome, and refreshing rights.
6. No test card number, sandbox reference or hardcoded secret left in the codebase.
7. Behaviour on a failed `GET /v1/Usages` verified: stale cache served, alert raised — not a
   site-wide loss of access.
