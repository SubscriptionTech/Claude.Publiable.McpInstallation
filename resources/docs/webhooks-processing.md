---
name: proabono-webhooks-processing
description: Receive ProAbono webhook notifications safely — payload shape, endpoint validation, signature verification, fast acknowledgement, deduplication, and the resynchronize-don't-parse pattern.
when_to_use: Building or reviewing the HTTP endpoint that receives ProAbono notifications, or debugging a webhook that is retried, rejected or never processed.
---

# Processing webhooks safely

This file is about **receiving** notifications. Creating, disabling and deleting webhooks is done in
the ProAbono BackOffice under *Integration → Webhooks*, not in code.

## How delivery works

Once a webhook is active, each matching event makes ProAbono send an **HTTP POST** to your URL, with
a JSON body describing the event and two headers used to authenticate the sender:

| Header | Meaning |
| --- | --- |
| `x-proabono-key` | Identifier of **the webhook** — constant across every delivery of that webhook, not per-message. |
| `x-proabono-signature` | Value you recompute from `x-proabono-key` plus your secret, to prove the sender is ProAbono. |

Your endpoint must answer **HTTP 200**. Any other status — including a 3xx redirect — is read as "not
delivered", and ProAbono retries with exponential backoff.

## Payload shape

Every notification has the same envelope, plus one or more resource blocks that depend on the event.

```json
{
  "Id": "trg_42",
  "IdBusiness": 42,
  "IdSegment": 42,
  "ReferenceSegment": "sample",
  "DateTrigger": "2026-09-14T15:11:43.75Z",
  "TypeTrigger": "CustomerAdded",
  "Customer": {
    "Id": 42,
    "ReferenceCustomer": "customer_sample",
    "Name": "John Doe",
    "Email": "john.doe@sample.com",
    "Language": "en",
    "Status": "Enabled"
  }
}
```

| Envelope field | Meaning |
| --- | --- |
| `Id` | Identifier of **this notification** (`trg_…`). This is your deduplication key — not the header. |
| `IdBusiness` / `IdSegment` / `ReferenceSegment` | Where the event happened. Check these if one endpoint serves several environments or segments. |
| `DateTrigger` | When the event occurred, UTC. |
| `TypeTrigger` | The event code. The full list is below. |

`Customer` is present on **every** event, which means `body.Customer.ReferenceCustomer` is always the
join back to your own user. That single fact is what makes the resynchronize pattern below trivial to
implement.

### Resource blocks

```json
"CustomerBuyer": {
  "Id": 1901, "ReferenceCustomer": "customer_buyer_sample",
  "Name": "Gustave Eiffel", "Email": "gustave.eiffel@tower.paris",
  "Language": "fr", "Status": "Enabled"
}
```

```json
"Offer": {
  "Id": 42, "IdSegment": 0, "ReferenceOffer": "offer_sample",
  "StateLife": "Ok", "IsVisible": true, "IsPriced": false,
  "Name": "Sample offer",
  "AmountRecurrence": 8900, "DurationRecurrence": 1, "UnitRecurrence": "Month"
}
```

```json
"Subscription": {
  "Id": 42, "Status": "Active", "StateSubscription": "ActiveRunning",
  "DateStart": "2022-08-12T12:12:07.62Z",
  "AmountRecurrence": 8900, "DurationRecurrence": 1, "UnitRecurrence": "Month"
}
```

```json
"GatewayPermission": {
  "Id": 42, "StatePermission": "Enabled",
  "TypePayment": "Card", "TypeGateway": "CardDummy",
  "NameDisplay": "****-****-****-4242",
  "Country": "US", "DateExpiration": "2028-11-01T00:00:00.00Z"
}
```

```json
"InvoiceDebit": {
  "Id": 42, "FullNumber": "F42.00000042",
  "Status": "Paid", "StateInvoice": "Paid",
  "DateIssue": "2026-09-17T05:16:21.13Z", "DatePayment": "2026-09-14T02:16:21.13Z",
  "TypePayment": "Card",
  "AmountSubtotal": 5805, "AmountTotal": 6966
}
```

```json
"InvoiceCredit": {
  "Id": 42, "FullNumber": "F42.00000042",
  "Status": "Paid", "StateInvoice": "Paid",
  "DateIssue": "2026-09-17T05:18:30.71Z", "DatePayment": "2026-09-14T02:18:30.71Z",
  "TypePayment": "Card",
  "AmountSubtotal": 7867, "AmountTotal": 9440,
  "TypeCredit": "Refund", "Reason": "Customer request in the legal delay"
}
```

Notes that matter when consuming these:

- **`CustomerBuyer` is not `Customer`.** The payer can differ from the subscriber — a parent account,
  a reseller, a partner paying on someone's behalf. Entitlements belong to `Customer`; billing
  belongs to `CustomerBuyer`. Resolving your user from the wrong one grants rights to the wrong
  account.
- **Amounts are integers in the currency's minor unit** (`6966` = €69.66), consistent with the rest of
  the API. `AmountSubtotal` is pre-tax, `AmountTotal` post-tax.
- **`Offer.IsPriced: false` with `AmountRecurrence: 8900`** is not a contradiction to resolve from
  here; do not build pricing logic on the notification.
- **Enumerated values are not exhaustive.** The samples only ever show one value per field
  (`Status: "Enabled"`, `StateSubscription: "ActiveRunning"`, `TypeGateway: "CardDummy"`). Treat any
  unrecognized value as unknown rather than as an error, and never write an exhaustive `switch` over
  one of these.

> **Do not read state semantics out of the sample values above.** These are generated examples, and
> their values are internally inconsistent on purpose-built data — an "overdue" invoice sample carries
> `Status: "Paid"`, a "terminated" subscription sample carries `Status: "Active"`, and issue dates fall
> after the trigger date. The field **shapes** are reliable; the field **values** in a sample are not
> evidence of what a real event of that type contains. This is one more reason to re-read state from
> the API rather than infer it from a payload.

### Which blocks come with which event

| Event family | Blocks present |
| --- | --- |
| Customer events | `Customer` |
| Customer charging events (`…ChargingSucceeded`, `…ChargingPending`, `…ChargingFailed`, `…ChargingAutoFailedNoRetry`) | `Customer` + `GatewayPermission` |
| `CustomerChargingAutoFailedNoPermission` | `Customer` only — by definition there is no usable payment method |
| Subscription events | `Customer` + `CustomerBuyer` + `Offer` + `Subscription` |
| `SubscriptionDateTermUpdated` | **`Customer` only** — no `Subscription` block |
| Invoice events | `Customer` + `InvoiceDebit` |
| `InvoiceCreditIssued` | `Customer` + `InvoiceCredit` |
| Payment-method events | `Customer` + `GatewayPermission` |

`SubscriptionDateTermUpdated` is worth pausing on: it tells you a subscription's term date changed
but not **which** subscription. Any handler that tries to patch state from the payload has nothing to
work with here. A handler that re-reads the customer's state works unchanged.

## Lifecycle: create → validate → receive

A newly created webhook is inactive until **validated**, which proves you control the destination URL.
From the BackOffice you trigger *Send verification code*; ProAbono POSTs a verification code in JSON
to your URL; you read it from the request body and type it into the BackOffice.

Two consequences for how you build the endpoint:

1. **It must return 200 and be reachable before validation can succeed.** If it does not, the code
   cannot be entered at all.
2. **The verification POST is not an event** — it carries no `TypeTrigger`. Detect it by that absence,
   log the body so you can read the code, return 200, and keep it out of your event path.

Ship the endpoint returning a bare 200 first, validate, then add signature verification and
processing.

## Verifying the signature

Anyone who learns your webhook URL can POST to it. Without verification, a stranger can tell your
application that a subscription started. **Verify every request.**

The algorithm:

1. Concatenate `x-proabono-key` with your **secret key** (in that order).
2. SHA-256 the resulting string, as raw bytes.
3. Base64-encode the digest.
4. Compare with `x-proabono-signature`.

The secret comes from the BackOffice: *Integration → Webhooks → secure my webhooks*, which also offers
ready snippets per language. It is a credential — environment variable, never source.

```js
import crypto from "node:crypto";

function isValidProAbonoWebhook(req) {
  const key = req.get("x-proabono-key");
  const signature = req.get("x-proabono-signature");
  const secret = process.env.PROABONO_WEBHOOK_SECRET;

  if (!key || !signature || !secret) return false;

  const expected = crypto
    .createHash("sha256")
    .update(key + secret, "utf8")
    .digest("base64");

  // Constant-time comparison: a plain === leaks the expected value one byte at a time.
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### What this proves — and what it does not

Be precise about the limits, because they dictate how you must treat the body:

- It proves the sender **knows the shared secret**, i.e. that the request came from ProAbono.
- `x-proabono-key` identifies the **webhook**, not the delivery. The computed signature is therefore
  **the same value on every delivery of that webhook** — closer to a bearer token than to a
  per-message signature.
- It is computed over the header and the secret only. **It does not cover the request body.** A valid
  signature says nothing about the body's integrity, and a captured request can be replayed verbatim.

Three practical consequences: HTTPS is mandatory (a leaked header pair is a permanent forgery
capability, so rotate the secret if you ever suspect exposure); never treat the payload as
authenticated data; and deduplicate on the body's `Id`, since the header cannot distinguish two
deliveries.

## The rule: resynchronize, do not parse

> Treat the notification as a **signal that something changed for a customer**, not as a
> **description of the new state**.

When a rights-affecting event arrives, re-read that customer's entitlements from the API and replace
what you had cached — the single global resynchronization described in `rights-management.md`.

Why, concretely:

- The signature does not cover the body, and requests are replayable.
- Delivery is **not ordered**. "Suspended" and "restarted" can arrive in either order; a state machine
  driven by arrival order will eventually land in the wrong state and stay there.
- Delivery is **at-least-once**, and the BackOffice can replay manually.
- Some events carry no usable state at all (`SubscriptionDateTermUpdated`), and sample-shaped fields
  like `Subscription.Status` are not a reliable basis for a decision.
- Re-reading is correct regardless of how many events you missed, duplicated or reordered. Parsing is
  correct only if everything went perfectly.

A handler that re-fetches is also far shorter than one that does not.

## Acknowledge fast, process after

ProAbono waits for your 200. Doing the work inline makes your processing time the delivery latency,
and a slow dependency turns into retries and duplicate work.

**Validate, enqueue, return 200. Process out of band.**

```js
app.post(
  "/webhooks/proabono",
  express.json({ limit: "256kb" }),
  async (req, res) => {
    // 1. Authenticate before anything else.
    if (!isValidProAbonoWebhook(req)) {
      logger.warn({ ip: req.ip }, "rejected unsigned ProAbono webhook");
      return res.sendStatus(403); // not 200: this was not a real delivery
    }

    const body = req.body;

    // 2. The validation handshake carries no TypeTrigger. Log it, acknowledge it, stop.
    if (!body?.TypeTrigger) {
      logger.info({ body }, "ProAbono webhook verification code");
      return res.sendStatus(200);
    }

    // 3. At-least-once delivery + manual replays: dedupe on the NOTIFICATION id,
    //    not on x-proabono-key (which is identical for every delivery of this webhook).
    if (await seen(body.Id)) return res.sendStatus(200);
    await remember(body.Id, { ttl: "7d" });

    // 4. Hand off. Anything slow or fallible belongs here, not above.
    await queue.publish("proabono.event", body);

    // 5. Acknowledge.
    res.sendStatus(200);
  },
);
```

And the worker — the whole of it:

```js
const RIGHTS_AFFECTING = new Set([
  "CustomerSuspended",
  "CustomerEnabled",
  "SubscriptionStarted",
  "SubscriptionUpgraded",
  "SubscriptionSuspendedAgent",
  "SubscriptionRestarted",
  "SubscriptionSuspendedPaymentInfoMissing",
  "SubscriptionSuspendedPaymentDue",
  "SubscriptionTerminated",
  "SubscriptionTerminatedForUpgrade",
  "SubscriptionTerminatedAtRenewal",
  "SubscriptionHistory",
  "SubscriptionDeleted",
  "SubscriptionUpdated",
  "SubscriptionFeaturesUpdated",
  "SubscriptionDateTermUpdated",
]);

async function handleProAbonoEvent(body) {
  if (!RIGHTS_AFFECTING.has(body.TypeTrigger)) return; // acknowledged, deliberately ignored

  // Customer is present on every event. Use Customer, never CustomerBuyer:
  // the buyer pays, the customer holds the rights.
  const customerRef = body.Customer?.ReferenceCustomer;
  if (!customerRef) return;

  // One function for every rights-affecting event. No per-event branching beyond this set.
  await refreshEntitlements(customerRef);
}
```

### Returning a non-200 deliberately

Return non-200 only when you genuinely want the delivery **retried** — a failed enqueue, a dependency
that is down. Never return non-200 for an event you do not care about or cannot interpret: ProAbono
will keep redelivering it. Acknowledge it and drop it, as above.

Rejected-as-unsigned is the one case where a non-200 is right and retrying is harmless.

## Idempotency

At-least-once delivery plus manual replays means duplicates are normal, not exceptional. Two habits
make it a non-issue:

1. **Deduplicate on the body's `Id`** with a short-lived store — a few days is plenty.
2. **Make the handler naturally idempotent.** "Re-read all rights and replace the cache" already is:
   running it five times has the same effect as running it once.

## Which events to subscribe to

### Subscribe: events that change rights

`CustomerSuspended`, `CustomerEnabled`, `SubscriptionStarted`, `SubscriptionUpgraded`,
`SubscriptionSuspendedAgent`, `SubscriptionRestarted`, `SubscriptionSuspendedPaymentInfoMissing`,
`SubscriptionSuspendedPaymentDue`, `SubscriptionTerminated`, `SubscriptionTerminatedForUpgrade`,
`SubscriptionTerminatedAtRenewal`, `SubscriptionHistory`, `SubscriptionDeleted`,
`SubscriptionUpdated`, `SubscriptionFeaturesUpdated`, `SubscriptionDateTermUpdated`.

Point **all of them at the same endpoint** and run **one global resynchronization function** for the
customer. Do not write per-event logic: handling each case individually takes far longer, misses the
rare ones, and breaks the first time the business model changes.

### Do not subscribe for rights: payment and invoice events

ProAbono retries failed payments automatically. A failed attempt does **not** mean the customer lost
access — suspension, when it comes, arrives as its own subscription event. Reacting to payment
failures means cutting off customers who are about to pay successfully.

Subscribe to invoice, charging and payment-method events for other purposes if you need them
(accounting exports, dunning emails, alerting an account manager), but keep them on a path that never
touches entitlements.

## Event catalogue

### Customer — block: `Customer`

| Event | `TypeTrigger` | Notes |
| --- | --- | --- |
| Customer added | `CustomerAdded` | |
| Billing address updated | `CustomerBillingAddressUpdated` | |
| Payment method updated | `CustomerPaymentMethodUpdated` | See naming note below. |
| Billing succeeded | `CustomerBillingSucceeded` | |
| Billing failed | `CustomerBillingFailed` | Not a loss of rights. |
| Charging succeeded | `CustomerChargingSucceeded` | + `GatewayPermission` |
| Charging pending | `CustomerChargingPending` | + `GatewayPermission` |
| Charging failed | `CustomerChargingFailed` | + `GatewayPermission`. Not a loss of rights. |
| Auto-charge failed: no valid payment method | `CustomerChargingAutoFailedNoPermission` | `Customer` only. |
| Auto-charge failed, no retry possible | `CustomerChargingAutoFailedNoRetry` | + `GatewayPermission` |
| Customer suspended | `CustomerSuspended` | **Rights change.** API/BackOffice only. |
| Customer enabled | `CustomerEnabled` | **Rights change.** API/BackOffice only. |
| Added to grey list | `CustomerIsGreyListed` | Suspicious behaviour on hosted payment forms. Worth alerting on. |

### Subscription — blocks: `Customer` + `CustomerBuyer` + `Offer` + `Subscription`

All of these change rights.

| Event | `TypeTrigger` | Notes |
| --- | --- | --- |
| Started | `SubscriptionStarted` | |
| Renewed | `SubscriptionRenewed` | Nothing changes; safe to ignore. |
| Suspended by an agent | `SubscriptionSuspendedAgent` | See naming note below. |
| Restarted | `SubscriptionRestarted` | |
| Interrupted — no payment method | `SubscriptionSuspendedPaymentInfoMissing` | At renewal. Governed by the "block renewals if no payment method" setting. |
| Interrupted — payment due | `SubscriptionSuspendedPaymentDue` | At renewal, past the unpaid-invoice thresholds (amount and duration). |
| Termination requested | `SubscriptionTerminatedAtRenewal` | **Takes effect at period end and can still be cancelled. Do not revoke access here.** |
| Terminated | `SubscriptionTerminated` | Final state; cannot be restarted. |
| Over | `SubscriptionHistory` | Reached its renewal limit (e.g. "6 months") and stopped. Not a history record. |
| Deleted | `SubscriptionDeleted` | API/BackOffice only. |
| Updated | `SubscriptionUpdated` | Everything except features and term date, which have their own events. |
| Features updated | `SubscriptionFeaturesUpdated` | The most direct "rights just changed" signal. |
| Started as upgrade | `SubscriptionUpgraded` | Emitted **with** the next one. |
| Terminated for upgrade | `SubscriptionTerminatedForUpgrade` | An upgrade produces both: a new subscription starts, the old one terminates. Reacting to the termination alone revokes access wrongly. Ordering is not guaranteed — a full resync is immune. |
| Term date updated | `SubscriptionDateTermUpdated` | **`Customer` only, no `Subscription` block.** API/BackOffice only. |

### Invoice — blocks: `Customer` + `InvoiceDebit`

| Event | `TypeTrigger` |
| --- | --- |
| Issued, automatic payment scheduled | `InvoiceDebitIssuedPaymentAuto` |
| Issued, offline payment due | `InvoiceDebitIssuedPaymentOffline` |
| Paid | `InvoiceDebitPaid` |
| Refunded (a credit note is issued too) | `InvoiceDebitRefunded` |
| Cancelled (a credit note is issued too) | `InvoiceDebitCancelled` |
| Automatic payment failed — all retries exhausted | `InvoiceDebitPaymentAutoFailed` |
| Automatic payment rejected, authentication required | `InvoiceDebitPaymentAutoRequestedAuth` |
| Overdue | `InvoiceDebitOverdue` |
| Disputed | `InvoiceDebitDisputed` |
| Uncollectible | `InvoiceDebitUncollectible` |
| Credit note issued (block: `InvoiceCredit`) | `InvoiceCreditIssued` |

None of these change rights on their own.

### Payment method — blocks: `Customer` + `GatewayPermission`

| Event | `TypeTrigger` | Notes |
| --- | --- | --- |
| Expires soon | `GatewayPermissionSoonExpired` | ProAbono can email the customer 30/7/1 days before. |
| Expired | `GatewayPermissionExpired` | |
| Defective | `GatewayPermissionDefective` | Stolen, lost or blocked card, invalid SEPA mandate. |
| Insufficient funds | `GatewayPermissionInsufficientFunds` | ProAbono will retry the debit. |
| Repeated payment issues | `GatewayPermissionPaymentIssues` | The payment method will be disabled on the next failure. |

None of these change rights on their own. They are the right trigger for proactive customer outreach.

### Outdated event codes

Two events circulated for a while under codes ProAbono never sends. If you meet either in an existing
integration or in an old copy of the documentation, it is dead code — nothing will ever match it:

| Event | Correct code | Obsolete code |
| --- | --- | --- |
| Customer — payment method updated | `CustomerPaymentMethodUpdated` | `CustomerSettingsPaymentUpdated` |
| Subscription — suspended by an agent | `SubscriptionSuspendedAgent` | `SubscriptionSuspendedCustomer` |

Note also that the overdue threshold is described both as a fixed 60 days and as a delay configurable
in *Settings*. Do not hardcode 60 days in your own logic.

## Latency expectations

Webhooks are **asynchronous** and can lag by minutes. Acceptable for the ~95% of events nobody is
waiting on. Not acceptable for the user who just paid and is staring at your page — for that, use the
post-workflow redirect, which is immediate. See `subscription-workflows.md`. Build both; they cover
different halves of the problem.

## Observability

The BackOffice keeps **60 days** of notification history under *Integration → Webhooks → Notifications
History*: event type, event time, last delivery time, and the HTTP status your server returned.
Clicking a row shows the error and the JSON payload, and offers **Retry delivery** once you have fixed
your side.

This is the first place to look when something did not happen: it answers, without guessing, whether
ProAbono sent the notification and what your server said.

On your side, log for every delivery: `body.Id`, `body.TypeTrigger`,
`body.Customer.ReferenceCustomer`, the verification result, whether it was a duplicate, and the
processing outcome. When a customer's rights are wrong, that log plus the history tells you
immediately which of the two systems to fix.

## Local development

ProAbono will not deliver to a local address. Expose your machine through a reverse proxy such as
**ngrok** and register the tunnel URL as the webhook destination. See `testing.md`.

## Checklist

1. HTTPS only.
2. Signature verified on every request, with a constant-time comparison.
3. Secret key from configuration, never source.
4. The validation handshake (no `TypeTrigger`) handled separately and answered 200.
5. Duplicates rejected on **`body.Id`**, not on `x-proabono-key`.
6. 200 returned fast; real work done out of band.
7. Non-200 returned only when a retry is genuinely wanted.
8. Handler re-reads entitlements rather than parsing the payload.
9. `Customer` used to resolve your user, never `CustomerBuyer`.
10. No ordering assumptions anywhere.
11. Payment, charging and invoice events kept off the entitlement path.
12. No exhaustive `switch` over an enumerated value from the payload.
