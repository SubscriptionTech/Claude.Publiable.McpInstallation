---
name: proabono-troubleshooting
description: Symptom to cause to fix for ProAbono integrations — auth errors, hosted pages not rendering, signature mismatches, stale or missing rights, webhooks not arriving, unexpected billing.
when_to_use: Something in a ProAbono integration does not work and you need to narrow down where the fault is before changing code.
---

# Troubleshooting

## First, decide which half is broken

Nearly every problem is on one side of a clean line:

| Symptom is about | Look at | File |
| --- | --- | --- |
| Something visible in the browser (portal, pricing table, workflow) | `business_id`, `segment_ref`, `customer_ref`, `hash`, `query` | `in-site-installation.md` |
| A server call returning an error | endpoint, keys, references, environment | `api-basics.md` |
| A customer who can or cannot do something | Usages, cache, resync triggers | `rights-management.md` |
| Something that should have happened after an event | webhook delivery, then the redirect path | `webhooks-processing.md` |

And one question resolves a surprising share of incidents: **are you pointing at the right
environment?** Sandbox and production share nothing. Check the endpoint, the `business_id` and the
key pair all belong to the same one.

## Authentication and API calls

**401 on every call**
Wrong keys, keys from the other environment, or a malformed Basic header. Rebuild it:
`base64(agentKey + ":" + apiKey)`, with the Agent key as username. A trailing newline from a shell
`base64` without `--wrap 0` is a classic cause — the header is then silently invalid.

**401 intermittently, or only in one deployment**
Environment variables missing in that deployment, or a cached/stale secret. Log which
`PROABONO_API_BASE` the process resolved at startup.

**404 on an object that exists**
Right object, wrong environment or wrong segment. `ReferenceCustomer` is unique *per segment*, so the
same reference can exist in one segment and not another. Confirm `ReferenceSegment`.

**403 with an error code**
Not an auth problem — the operation is refused for a reason, named in the body's `Code` field:

```json
{ "Code": "Error.Api.Customer.Unaccessible", "Message": "You cannot access that Customer" }
```

- `Error.Api.Customer.Unaccessible` — the keys are valid but that customer is not theirs to read.
  Almost always the wrong segment or the wrong environment, not a permissions problem to escalate.
- `Error.Api.Usage.NoneMatching`, `Error.Customer.PaymentSettings.Missing`,
  `Error.Customer.Billing.CappingReached` — business refusals on usage changes, each covered in
  `integrated-purchasing.md`.

Log `Message`; branch on `Code`. Never show `Message` to a customer — it describes your integration's
mistake, not theirs.

**Calls work from your machine, fail from the app**
Credentials are almost certainly reaching a client-side bundle, or being stripped by a proxy. ProAbono
calls must be server-to-server; if any of this runs in a browser, that is the bug, not the symptom.

## Hosted pages do not render

Work through this in order — the causes are ranked by how often they are the real one.

1. **`portal.js` did not load.** Check the network tab. It must be in `<head>` and it must load
   before your `open()` call runs.
2. **The container is missing.** `<div id="proabono_portal">` must exist in the DOM *at the moment*
   `ProAbonoPortal.open()` is called. In a SPA, call it after mount, not at import time.
3. **Wrong `business_id`.** Almost always a hardcoded sandbox id in production. The page loads and
   resolves to an environment where your customer does not exist.
4. **Wrong `segment_ref`.** Same effect.
5. **Invalid or missing `hash` in production.** The hash is mandatory there; without a valid one the
   pages refuse to open.

**Blank after navigating away and back (SPA)**
The container's contents were replaced. Re-run `ProAbonoPortal.open()` on re-mount — a freshly
mounted empty div does not re-open anything by itself.

## Security hash rejected

- The hash was computed **client-side**, or with a stale/incorrect secret.
- It was computed for a different `customer_ref` than the one passed — a per-user value cached in a
  shared template is the usual culprit.
- The construction does not match. It is HMAC-SHA256 with the **portal secret as the key** and the
  **customer reference as the message**, hex-encoded lowercase. The usual errors: arguments swapped
  (PHP's `hash_hmac` takes the message first, most other APIs take the key first); base64 output
  instead of hex; uppercase hex from .NET's `Convert.ToHexString` without `ToLowerInvariant()`; or a
  plain SHA-256 of a concatenation instead of an HMAC.
- **Wrong secret.** The portal hash and the webhook signature use two different secrets *and* two
  different algorithms. Confirm you are using the portal secret, from
  *Integration → Installation → In-Site → Portal* — which also has a verifier. Paste your hash into it
  before debugging anything else.
- It works in sandbox and fails in production because sandbox does not require it. That is not a
  production-only bug; the hash was simply never exercised.

## A workflow will not open

**The `query` is missing from `Links`**
You did not pass the parameters that workflow needs on the fetch, or the object is not in a state
where it applies. `insite-subscribe` on a Customer requires a `ReferenceOffer` on the request;
`insite-upgrade` requires an active subscription. Look the link up by `rel` and handle its absence
instead of indexing.

**The query worked earlier and now fails**
Queries **expire** and are not permalinks. Re-fetch the object and take a fresh one every time you
open a page. If a query is stored in your database or in a long-lived session, that is the bug.

**The workflow you want has no query at all**
Changing options, terminating a subscription and changing the payment method are **portal-only** —
they have no API entry point. Open the Customer Portal instead of searching for a missing `rel`. See
the workflow table in `subscription-workflows.md`.

## Rights are wrong

**A new user has no rights at all**
ProAbono returns **no Usages** until a subscription has actually started. A user who signed up but
was never subscribed is indistinguishable from one with no entitlements. Check that your sign-up path
created the Customer *and* started the subscription — see the freemium flow in
`subscription-workflows.md`.

**Rights are stale after the customer subscribed**
The post-workflow redirect is not configured, or is configured but not refreshing the cache. Webhooks
alone are too slow for the user standing in front of you — they lag by minutes. Add the redirect
handler.

**A feature stays granted after a subscription ended**
Your cache **merges** instead of **replacing**. Ended subscriptions make their features *disappear*
from the response rather than arrive as `false`. Rebuild the cached map from the response wholesale.
This is the single most common entitlement bug.

**Unlimited customers are locked out**
`QuantityCurrent` absent means **unlimited**, not zero. A `?? 0` on that field produces exactly this.

**An `OnOff` feature behaves inconsistently**
You are enforcing `IsIncluded` (the plan includes it) instead of `IsEnabled` (it is active now).

**Only some of a customer's rights appear**
The response is paginated and you read the first page. Page through to `TotalItems`, or filter the
query.

**Rights differ between two servers**
Per-process caches with no shared invalidation. Move to a shared cache, or shorten the TTL and accept
bounded staleness.

**Everyone lost access at once**
Check whether a `GET /v1/Usages` failure is being treated as "no rights". A ProAbono blip or an
expired key then becomes a total product outage. Serve the last known good value and alert instead.

## Webhooks

**Nothing ever arrives**
Look at *Integration → Webhooks → Notifications History* first — it tells you, without guessing,
whether ProAbono sent anything and what your server answered. Then check: the webhook is **validated**
(it does nothing until it is), the URL is public HTTPS, and — in development — the tunnel URL has not
changed since you registered it.

**The validation code never arrives / cannot be entered**
Your endpoint must return **200** to the verification POST. The verification body is not a business
event; if it falls into your event-processing code and errors, validation cannot complete. Handle it
separately and log it so you can read the code.

**The same event is delivered over and over**
Your endpoint is not returning 200 — including the case where it returns a 3xx redirect, which counts
as a failure. Also check that you are not returning non-200 for events you simply chose to ignore;
acknowledge and drop those.

**Duplicate side effects**
Delivery is at-least-once, and the BackOffice can replay manually. Deduplicate on the **body's `Id`**
(`trg_…`). Deduplicating on `x-proabono-key` does nothing: that header identifies the *webhook* and is
identical on every delivery — using it as a dedup key drops every notification after the first. Prefer
a handler that is naturally idempotent anyway — "re-read all rights and replace" is.

**A handler for a specific event never fires**
Check the code against the catalogue in `webhooks-processing.md`. Two codes circulated in older
documentation and are never sent: `CustomerSettingsPaymentUpdated` (the real one is
`CustomerPaymentMethodUpdated`) and `SubscriptionSuspendedCustomer` (the real one is
`SubscriptionSuspendedAgent`). A handler keyed on either is dead code that fails silently.

**A handler crashes on some events but not others**
Resource blocks vary by event. `SubscriptionDateTermUpdated` carries **only** `Customer` — no
`Subscription`, no `Offer`. `CustomerChargingAutoFailedNoPermission` carries no `GatewayPermission`.
Only `Customer` is present on every event. See the block table in `webhooks-processing.md`.

**The wrong user's rights were refreshed**
You resolved your user from `CustomerBuyer` instead of `Customer`. The buyer pays; the customer holds
the rights. They differ on reseller and parent-account setups.

**Signature never matches**
Order matters: `x-proabono-key` **then** the secret key, SHA-256 over the concatenation as raw bytes,
then base64 of the digest. A hex digest instead of base64, or base64 of the hex string, are the two
usual mistakes. Confirm the secret is the **webhook** secret, not the API key or the portal secret —
they are three different values.

**Processing times out under load**
You are working inline before acknowledging. Validate, enqueue, return 200, process out of band.

**State ends up wrong after an upgrade**
An upgrade emits both `SubscriptionUpgraded` and `SubscriptionTerminatedForUpgrade`, and delivery is
not ordered. Anything that reacts to the termination alone will revoke access. A full resync is
immune to this — which is the reason to resync rather than parse.

**Access was cut off from a customer who is paying fine**
You resynced on a payment or invoice failure event. ProAbono retries payments automatically; a failed
attempt is not a loss of rights. Only subscription and customer suspension events are.

## Billing looks wrong

**A customer was charged something they did not expect**
A usage change was applied without quoting and confirming first. `POST /v1/Quoting/Usage`, show the
localized amount, get an explicit confirmation — see `integrated-purchasing.md`.

**Consumption counts are too high**
A retried `Increment` double-counted. Where you can compute the true total, send `QuantityCurrent`
instead — it is idempotent under retry.

**Changes land in the wrong billing period**
`DateStamp` is not the real time of the business event — a batch job is stamping its own run time.
Send the event's actual UTC instant. Future dates are not supported.

**A change was silently not applied**
A 403 rejection was swallowed. Handle all three rejection codes explicitly; each one means a customer
tried to spend money and could not.

## When nothing above fits

Gather these before asking for help — they answer most questions immediately:

1. Environment (sandbox or production) and `business_id`.
2. The exact request: method, path, and body with secrets removed.
3. The exact response: HTTP status and error code.
4. `ReferenceCustomer` and `ReferenceFeature` involved.
5. For webhooks: the row from the notification history — event, time, HTTP status.
6. For hosted pages: the browser console and the parameters passed to `ProAbonoPortal.open()`, with
   the hash redacted.
