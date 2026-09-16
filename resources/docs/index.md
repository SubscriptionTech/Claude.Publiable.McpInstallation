---
name: proabono-index
description: Routing map for the ProAbono integration documentation set — which file to open for which task.
when_to_use: Read this first whenever a task mentions ProAbono, subscriptions, plans, billing, entitlements, quotas or usage-based features.
---

# ProAbono integration — index

## What ProAbono is

ProAbono is a subscription-management and billing service. It owns the **commercial** side of a
SaaS product: the catalog of plans, the subscription lifecycle, invoicing, payment collection and
dunning. Your application owns the **product**.

The integration is therefore always the same three-way split:

1. **Hosted pages** — ProAbono renders the billing UI (portal, subscription workflows) inside your
   app. You do not build subscription forms. See `in-site-installation.md`.
2. **API Live** — your server creates customers and subscriptions, and asks ProAbono what a
   customer is entitled to. See `api-basics.md` and `rights-management.md`.
3. **Webhooks + redirections** — ProAbono tells your server when something changed, so you can
   refresh what the customer may do. See `webhooks-processing.md`.

## The one rule that governs every integration

> Never derive access rights from the plan the customer subscribed to.

Do not branch on `ReferenceOffer`, do not map plan names to feature flags, do not copy the plan
into your own `users.plan` column. Ask ProAbono for the customer's **Usages** and enforce those.
Every other design breaks the first time a salesperson creates a custom subscription, or a plan is
edited, or a subscription is suspended for non-payment. This is explained in
`rights-management.md`, and it is the single most common integration mistake.

## Which file to open

| Open this | When the task is |
| --- | --- |
| `api-basics.md` | Any server-side call: endpoint, Basic auth, technical references, `Links`/`query`, pagination, error shape, sandbox vs production. Read before any other API file. |
| `glossary.md` | A ProAbono term appears and its meaning is not obvious: Segment, Offer, Feature, Usage, Query, hosted pages. |
| `in-site-installation.md` | Embedding the Customer Portal or a pricing table in the app; `portal.js`, `ProAbonoPortal.open()`, the security hash. |
| `subscription-workflows.md` | Sign-up and subscription flows, opening a specific workflow, plan changes, and the redirection back into the app afterwards. |
| `rights-management.md` | Gating a feature, checking a quota, showing "3 of 5 seats used", reacting to a subscription change, reporting consumption back to ProAbono. |
| `integrated-purchasing.md` | Letting the user buy more (a seat, an option) in place, without leaving their current screen: quote then confirm. |
| `webhooks-processing.md` | Receiving and processing ProAbono notifications safely: validation, signature, acknowledgement, retries, idempotency. |
| `testing.md` | Sandbox setup, test card numbers, receiving webhooks on localhost, replaying a failed notification. |
| `troubleshooting.md` | Something does not work: 401/403, portal not rendering, signature mismatch, stale rights, webhook never arrives. |

## Not covered here

The standalone **ProAbono widget** — the floating thumbnail initialized through
`window.proAbonoSettings` and driven by `window.ProAbono.open()` — is a different installation and is
out of scope for this set. If you meet it in an existing codebase, it is not what these files
describe: the In-Site installation uses `ProAbonoPortal.open()` and renders into a container you
place.

## Ten-second mental model

```
your app                         ProAbono
--------                         --------
sign-up  ──── POST /v1/Customer ────▶  Customer created
                                       returns Links[] with encrypted "query" values
open portal ◀── ProAbonoPortal.open({ query }) ── hosted subscription workflow
                                       customer subscribes, pays
login    ──── GET /v1/Usages ───────▶  what this customer is entitled to, right now
                     ◀────────────────  POST webhook when that changes
```

## Conventions used in every file of this set

- Every API call is shown as a raw HTTP request/response. Translate it into the host project's
  HTTP client; do not assume an SDK exists.
- `42`, `demo-eur`, `cust-42`, `offer-premium`, `feat-team-members` are placeholders. Real values
  come from the project's configuration and the ProAbono BackOffice.
- Secrets are always read from environment variables in examples, never inlined.
