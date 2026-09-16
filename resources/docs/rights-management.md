---
name: proabono-rights-management
description: Read and enforce customer entitlements with GET /v1/Usages, interpret the three feature types, cache and resynchronize them, and report consumption back with POST /v1/Usage.
when_to_use: Gating a feature, checking a quota or seat count, displaying usage, reacting to a subscription change, or incrementing a metered counter.
---

# Rights management with the Usage API

## The problem this solves

When a customer subscribes, they acquire rights in your service. The naive implementation —
"plan Premium means 5 seats and 24/7 support" — fails for reasons that all arrive eventually:

- Every new or edited plan forces you to revisit the mapping.
- **Editing a plan does not retroactively change existing subscriptions.** You end up maintaining
  rights per *version* of each plan.
- Rights depend on more than the plan: an unpaid customer should lose access, a suspended
  subscription grants nothing, a salesperson's custom subscription matches no catalog entry at all.

Each of these silently produces the same bug class: a customer who can do something they did not
pay for, or cannot do something they did.

## The rule

> **Never derive rights from `ReferenceOffer`.** Ask ProAbono what the customer is entitled to, and
> enforce that.

ProAbono owns the subscription lifecycle, the payment status, and the contents of every
subscription, including custom ones. It exposes the result as **Usages**. The Usage endpoint is
optimized for speed and built for high call volumes — it is designed to be on your hot path.

> Until the customer has subscribed **and the subscription has started**, the API returns **no
> Usages**. A brand-new user is therefore indistinguishable from a user with no rights. Provision
> the subscription before you gate — see the freemium flow in `subscription-workflows.md`.

## Reading rights

### All rights for one customer

The workhorse: call it when the user signs in, and cache the result for the session.

```http
GET /v1/Usages?ReferenceCustomer=cust-42
```

```json
{
  "Page": 1,
  "SizePage": 10,
  "Count": 3,
  "TotalItems": 3,
  "Items": [
    {
      "IdSubscription": 44088,
      "ReferenceSegment": "demo-eur",
      "ReferenceFeature": "feat-team-members",
      "ReferenceCustomer": "cust-42",
      "TypeFeature": "Limitation",
      "QuantityIncluded": 3,
      "QuantityCurrent": 4,
      "DatePeriodStart": "2026-07-15T09:12:00.00Z",
      "DatePeriodEnd": "2026-08-15T09:12:00.00Z"
    },
    {
      "IdSubscription": 44088,
      "ReferenceFeature": "feat-text-messages",
      "ReferenceCustomer": "cust-42",
      "TypeFeature": "Consumption",
      "QuantityIncluded": 100,
      "QuantityCurrent": 57,
      "DatePeriodStart": "2026-07-15T09:12:00.00Z",
      "DatePeriodEnd": "2026-08-15T09:12:00.00Z"
    },
    {
      "IdSubscription": 44088,
      "ReferenceFeature": "feat-support-24",
      "ReferenceCustomer": "cust-42",
      "TypeFeature": "OnOff",
      "IsIncluded": true,
      "IsEnabled": true,
      "DatePeriodStart": "2026-07-15T09:12:00.00Z",
      "DatePeriodEnd": "2026-08-15T09:12:00.00Z"
    }
  ]
}
```

This is a paginated collection — see `api-basics.md`. A customer with several subscriptions can
exceed one page; page through to `TotalItems` rather than reading `Items` once.

### One customer, one feature

The real-time check, and the call that precedes an in-app purchase. Note the **singular** path — it
returns the bare object, not an envelope.

```http
GET /v1/Usage?ReferenceCustomer=cust-42&ReferenceFeature=feat-team-members
```

```json
{
  "IdSubscription": 44088,
  "ReferenceFeature": "feat-team-members",
  "ReferenceCustomer": "cust-42",
  "TypeFeature": "Limitation",
  "QuantityIncluded": 3,
  "QuantityCurrent": 4,
  "DatePeriodStart": "2026-07-15T09:12:00.00Z",
  "DatePeriodEnd": "2026-08-15T09:12:00.00Z"
}
```

### All customers for one feature

For batch work — migrations, reporting, mass notification. Not for a request path.

```http
GET /v1/Usages?ReferenceFeature=feat-team-members
```

## Interpreting the response

The fields that carry meaning depend on `TypeFeature`. Always branch on it.

| Type | Entitlement field | Current state field | Read as |
| --- | --- | --- | --- |
| `OnOff` | `IsIncluded` | `IsEnabled` | Is the capability on? |
| `Limitation` | `QuantityIncluded` | `QuantityCurrent` | Persistent ceiling vs. what exists now. |
| `Consumption` | `QuantityIncluded` | `QuantityCurrent` | Allowance vs. what has been consumed this period. |

Three rules that are easy to get wrong:

1. **A missing `QuantityCurrent` means unlimited — not zero.** Guard explicitly; `??  0` here is a
   bug that silently locks out your best customers.
2. **`IsEnabled` is the one to enforce for `OnOff`**, not `IsIncluded`. `IsIncluded` says the plan
   includes it; `IsEnabled` says it is actually active right now. They differ when an option is
   included but switched off, or enabled as an extra beyond the plan.
3. **`QuantityCurrent` may legitimately exceed `QuantityIncluded`** — `3` included, `4` in use is a
   valid, ordinary state. It happens after a downgrade, or when extra units were bought. Your job is
   to refuse the *next* addition, not to break on the existing one.

Where several subscriptions coexist and you asked for a combined value: `OnOff` is enabled if **any**
subscription enables it; quantities are **summed**, and the total is unlimited if any one
subscription is unlimited.

```js
/** Normalize one Usage item into a decision your app can act on. */
function interpret(usage) {
  switch (usage.TypeFeature) {
    case "OnOff":
      return { kind: "onoff", allowed: usage.IsEnabled === true };

    case "Limitation":
    case "Consumption": {
      // Absent QuantityCurrent means unlimited.
      const unlimited = usage.QuantityCurrent === undefined || usage.QuantityCurrent === null;
      const included = usage.QuantityIncluded ?? 0;
      const current = usage.QuantityCurrent ?? 0;
      return {
        kind: usage.TypeFeature.toLowerCase(),
        unlimited,
        included,
        current,
        remaining: unlimited ? Infinity : Math.max(0, included - current),
        allowed: unlimited || current < included,
        periodEnd: usage.DatePeriodEnd,
      };
    }

    default:
      // An unknown type is not permission. Fail closed on the feature, loudly.
      throw new Error(`Unknown TypeFeature: ${usage.TypeFeature}`);
  }
}
```

## Synchronization strategy

Pick one deliberately; each has a real cost.

| Strategy | How | Recommended for | Cost |
| --- | --- | --- | --- |
| **Real-time** | Call the API on every feature access. | Proofs of concept, and genuinely critical checks. | An extra network hop on the hot path. |
| **Cache** | Fetch all rights at sign-in, keep for the session. | Short-lived sessions. | Requires webhooks + redirects to invalidate, with nothing to catch a missed one. |
| **Sliding cache** | As above, with a TTL bounded by `DatePeriodEnd`. | **Most connected applications** — see below. | Bounded staleness if a signal is ever missed. |
| **Copy into your own rights system** | Mirror ProAbono rights into an existing ACL/LDAP. | **Not recommended.** | Two sources of truth, arbitration, drift. |

The recommended default is **cache at sign-in, expire on `DatePeriodEnd`, invalidate on signal**. The
signals are below.

### How long an entry may live

Every Usage carries a `DatePeriodEnd`. A Usage is **static until that date unless a signal arrives** —
nothing changes inside the period except events that reach you as a webhook or a redirect. That makes
`DatePeriodEnd` a real TTL rather than a hint, and it makes the webhook wiring load-bearing: it is the
only thing standing between your cache and a full billing period of wrong rights.

Four rules follow:

1. **Expire at min(`DatePeriodEnd`, a maximum TTL of your own.)** The period end is the primary expiry;
   the ceiling caps the damage when a webhook never arrives — endpoint down, validation lapsed, event not
   subscribed — and covers development, before the endpoint is validated at all.
2. **One expiry per customer, taken as the earliest `DatePeriodEnd` across their Usages.** A customer with
   several subscriptions has several period ends. The soonest governs, so no Usage is served past its own
   period — in particular no `Consumption` counter past its reset.
3. **No `DatePeriodEnd` → fall back to the maximum TTL.** It can be absent, and an empty response carries
   no date at all; both take the same path.
4. **Signals invalidate regardless of expiry** — the webhook resync and the post-redirect re-read below.

A consequence worth stating: a customer suspended for non-payment on day 3 of a monthly period keeps full
access for the remaining 27 days if you expire on `DatePeriodEnd` alone and the webhook never lands. Rules
1 and 4 exist for exactly that.

```js
async function refreshEntitlements(customerRef) {
  const items = await fetchAllPages(`/v1/Usages?ReferenceCustomer=${encodeURIComponent(customerRef)}`);

  // Replace wholesale. Never merge or patch feature-by-feature: a feature that
  // DISAPPEARED from the response must disappear from the cache too.
  const map = Object.fromEntries(
    items.map((u) => [u.ReferenceFeature, interpret(u)]),
  );

  // Expire at the earliest period end, capped by a maximum TTL of your own.
  // No date (absent, or an empty response) falls back to that ceiling.
  const MAX_TTL_MS = 60 * 60 * 1000;
  const ends = items
    .map((u) => u.DatePeriodEnd && Date.parse(u.DatePeriodEnd))
    .filter((t) => Number.isFinite(t));
  const ttlMs = ends.length
    ? Math.min(MAX_TTL_MS, Math.max(0, Math.min(...ends) - Date.now()))
    : MAX_TTL_MS;

  await cache.set(`rights:${customerRef}`, map, { ttl: ttlMs });
  return map;
}

async function can(customerRef, feature) {
  let rights = await cache.get(`rights:${customerRef}`);
  if (!rights) rights = await refreshEntitlements(customerRef);
  return rights[feature]?.allowed === true; // unknown feature => not allowed
}
```

> **Replace, never merge.** When a subscription ends, its features vanish from the response rather
> than arriving as `false`. A merge-based cache keeps granting them forever. This single detail
> causes more entitlement bugs than anything else in the integration.

### When the API call fails

A failed call means *you have no information*, not *the customer has no rights*. Serve the last known
good cached value, log the failure, and alert. Treating a 500 or a timeout as "no entitlements" turns
a ProAbono blip into a total outage of your product for every user at once. Decide this explicitly;
the default behaviour of naive code is the wrong one.

**Do not clear or overwrite the session either.** Leave the user signed in with the rights you already
hold, and retry the read at their next login. Calling `/v1/Usages` on every login is safe and expected —
the endpoint is built for it.

## What must trigger a resynchronization

### Redirections — immediate, for the user in front of you

After a workflow completes, ProAbono redirects the customer back with parameters. Refresh their
rights there. This is the fastest signal available, and the only one fast enough for the user who
just paid. More generally, **re-validate rights behind any redirect before rendering a protected
feature** — not only on the ProAbono return route. Configure it for **all** of these cases:

- Validation without payment: free subscription, additional subscription, plan change, changed
  options.
- Payment: success, and in progress.

See `subscription-workflows.md` for the parameters.

### Webhooks — for everything the user is not present for

Rights change while the customer is logged out: a subscription is suspended for non-payment, sales
terminates one, a renewal fails. Webhooks notify your server. Subscribe to all of these:

| Event | `TypeTrigger` |
| --- | --- |
| Customer suspended / enabled | `CustomerSuspended`, `CustomerEnabled` |
| Subscription started, or started as an upgrade | `SubscriptionStarted`, `SubscriptionUpgraded` |
| Subscription suspended by an agent, or restarted | `SubscriptionSuspendedAgent`, `SubscriptionRestarted` |
| Subscription interrupted — no payment method, or payment due | `SubscriptionSuspendedPaymentInfoMissing`, `SubscriptionSuspendedPaymentDue` |
| Subscription terminated, terminated for upgrade, or termination requested | `SubscriptionTerminated`, `SubscriptionTerminatedForUpgrade`, `SubscriptionTerminatedAtRenewal` |
| Subscription over (renewal limit reached), or deleted | `SubscriptionHistory`, `SubscriptionDeleted` |
| Subscription updated, features updated, term date updated | `SubscriptionUpdated`, `SubscriptionFeaturesUpdated`, `SubscriptionDateTermUpdated` |

Every notification carries a `Customer` block, so `body.Customer.ReferenceCustomer` is always the key
to resynchronize on. Use `Customer`, never `CustomerBuyer` — the buyer pays, the customer holds the
rights, and on reseller or parent-account setups they are different people.

Point **every one of them at the same endpoint** and run **one global resynchronization function**
for the affected customer: re-fetch all Usages, replace the cache. Do not write per-event logic.
Handling each event individually takes far longer, misses the rare cases, and breaks the first time
the business model changes. It also fails outright on `SubscriptionDateTermUpdated`, which carries no
`Subscription` block at all — there is nothing in the payload to patch from.

> **Do not resynchronize on payment or invoice events.** ProAbono retries failed payments
> automatically; a failed attempt does not change the customer's rights. Reacting to those means
> revoking access from customers who are about to be charged successfully.

Webhook delivery is asynchronous and can lag by minutes. That is fine for these events — nobody is
watching — which is exactly why the redirect path above exists for the cases where someone is.

## Writing usages back

The same resource records consumption and option changes. This is how usage-based billing is fed:
changes may increase the subscription price or produce an extra charge on the next invoice.

### One change

```http
POST /v1/Usage
Content-Type: application/json

{
  "ReferenceFeature": "feat-team-members",
  "ReferenceCustomer": "cust-42",
  "Increment": 5,
  "DateStamp": "2026-08-01T15:31:00.00Z"
}
```

For an `OnOff` feature, set the state instead:

```http
POST /v1/Usage
Content-Type: application/json

{
  "ReferenceFeature": "feat-support-24",
  "ReferenceCustomer": "cust-42",
  "IsEnabled": true,
  "DateStamp": "2026-08-01T15:31:00.00Z"
}
```

### Several changes at once

```http
POST /v1/Usages
Content-Type: application/json

[
  {
    "ReferenceFeature": "feat-team-members",
    "ReferenceCustomer": "cust-42",
    "QuantityCurrent": 12,
    "DateStamp": "2026-08-01T15:31:00.00Z"
  },
  {
    "ReferenceFeature": "feat-text-messages",
    "ReferenceCustomer": "cust-42",
    "Increment": 3,
    "DateStamp": "2026-08-01T15:31:00.00Z"
  }
]
```

### `Increment` versus `QuantityCurrent`

- **`Increment`** is a relative delta (positive or negative). Correct for metered events — "one more
  SMS sent" — because concurrent increments compose.
- **`QuantityCurrent`** sets an absolute value. Correct when your side is authoritative for the count
  — "there are now exactly 12 seats" — and it is the safer choice for anything you can recompute,
  because a retried request is then idempotent.

Prefer `QuantityCurrent` wherever you can compute the true total. A retried `Increment` double-counts
and produces an incorrect invoice.

### `DateStamp`

Mandatory on every modification, in UTC. It is the instant the change counts for in ProAbono's
calculations, and it exists to make concurrent modifications resolvable. **Future dates are not
supported** — you cannot schedule a change this way. Send the real time of the business event, not
the time your batch job happened to run.

### Rejections to handle

| Reason | Status | Error code |
| --- | --- | --- |
| The customer has no active subscription, or none containing this feature | 403 | `Error.Api.Usage.NoneMatching` |
| The change is billable and the customer has no valid payment method | 403 | `Error.Customer.PaymentSettings.Missing` |
| The customer has too many outstanding payments | 403 | `Error.Customer.Billing.CappingReached` |

Handle all three. Each maps to a clear, actionable message: *upgrade your plan*, *add a payment
method*, *settle your unpaid invoices* — ideally with a link into the relevant portal workflow. An
unhandled rejection here surfaces as a support ticket, and usually as an angry one, because the
customer was trying to give you money.

> Usages **cannot modify a subscription that has not started**. To tailor a subscription at creation
> time, use the subscription override mechanism at creation instead.

### Confirm before charging

If the change is triggered by something the customer just did in your UI and it may cost them money,
**quote the price and ask for confirmation first**. That is what `integrated-purchasing.md` is for,
and skipping it is how billing disputes start.

## Checklist for a correct implementation

1. No branch anywhere on `ReferenceOffer`.
2. Rights fetched from `/v1/Usages` and cached per customer, replaced wholesale on refresh, expiring at
   min(earliest `DatePeriodEnd`, your maximum TTL).
3. `TypeFeature` branched on; missing `QuantityCurrent` treated as unlimited.
4. `IsEnabled`, not `IsIncluded`, enforced for `OnOff`.
5. Pagination handled.
6. All rights-affecting webhooks pointed at one endpoint running one resync function.
7. Payment and invoice events deliberately *not* triggering resync.
8. All post-workflow redirects triggering an immediate resync.
9. API failure serving stale cache, not zero rights — and not clearing the session.
10. Writes using `QuantityCurrent` where the total is computable, with an honest `DateStamp`.
11. All three rejection codes handled with an actionable message.
