---
name: proabono-integrated-purchasing
description: In-app purchases with ProAbono — quote the pricing impact of a usage change with POST /v1/Quoting/Usage, get the user's confirmation, then apply it with POST /v1/Usage.
when_to_use: A user action inside the product may cost money — adding a seat, enabling a paid option, consuming a billable item — and you want to charge for it without sending them to a billing page.
---

# Integrated (in-app) purchasing

## Concept

In-app purchasing lets a customer increase their usage or enable a paid option **at the moment they
need it**, without leaving the screen they are on. Instead of "go to My subscription, change your
plan, come back", the user clicks *Add a team member*, sees what it will cost, confirms, and
continues.

Typical triggers: adding a team member, requesting an electronic signature, enabling 24/7 support —
whatever in your product has a Feature behind it.

The flow is always the same two calls:

```
user clicks "add a seat"
        │
        ▼
  POST /v1/Quoting/Usage   ── quote: what will this cost, now and next term?
        │
        ▼
  show the price, ask for explicit confirmation      ← mandatory
        │
        ▼
  POST /v1/Usage           ── apply it; ProAbono handles billing and invoicing
```

> The confirmation step is **not optional**. Charging a customer for a click they did not understand
> as a purchase is how billing disputes and chargebacks start. The quote exists so that the amount
> shown is ProAbono's, not your own arithmetic.

## Step 1 — Quote the change

> An older path, `POST /v1/Pricing/Usage`, still answers but is **being deprecated**. Write new code
> against `/v1/Quoting/Usage`, which is the one the OpenAPI describes, alongside the rest of the
> `Quoting` family (`/v1/Quoting/Subscription`, `…/Start`, `…/Upgrade`, `/v1/Quoting/BalanceLine`).

```http
POST /v1/Quoting/Usage
Content-Type: application/json

{
  "ReferenceCustomer": "cust-42",
  "ReferenceFeature": "feat-team-members",
  "Increment": 2,
  "DateStamp": "2026-08-01T15:31:00.00Z",
  "NextTerm": true
}
```

- `Increment` — the change you intend to apply. Quote exactly what you will later apply, or the
  customer will be charged something other than what they approved.
- `DateStamp` — the exact instant of the modification, in UTC.
- `NextTerm: true` — also return the subscription price *after* the change, for the next billing
  period. Almost always worth asking for: the customer wants to know both "what now" and "what from
  now on".

This call **validates as well as prices**. It is the safe way to find out whether the change is even
allowed, before doing anything irreversible.

### Response

```json
{
  "IdBusiness": 42,
  "IdSegment": 69,
  "IdCustomer": 133700,
  "IdSubscription": 44088,
  "IdFeature": 1000,
  "ReferenceSegment": "demo-eur",
  "ReferenceCustomer": "cust-42",
  "ReferenceFeature": "feat-team-members",
  "LabelLocalized": "Amount due",
  "PricingLocalized": "€16.26",
  "Currency": "EUR",
  "AmountSubtotal": 1355,
  "AmountTotal": 1626,
  "DatePeriodStart": "2026-07-15T09:12:00.00Z",
  "DatePeriodTerm": "2026-08-15T09:12:00.00Z",
  "Details": ["…"],
  "NextTerm": {
    "LabelLocalized": "Subscription price after update",
    "PricingLocalized": "€490.80",
    "AmountSubtotal": 40900,
    "AmountTotal": 49080
  }
}
```

| Field | Meaning |
| --- | --- |
| `AmountTotal` | Charged immediately, tax included, in the currency's **minor unit** (1626 = €16.26). |
| `AmountSubtotal` | Same, before tax. |
| `PricingLocalized` / `LabelLocalized` | Ready-to-display strings, already in the customer's language and currency. |
| `DatePeriodStart` / `DatePeriodTerm` | The billing period the immediate charge is prorated across. |
| `NextTerm` | The subscription price from the next period onward, same conventions. |

**Display `PricingLocalized` and `LabelLocalized`.** They are localized and formatted for this
customer. Re-deriving a price string from `AmountTotal` means re-implementing currency, tax and
locale rules that ProAbono already applied — and it is the formatted string that the customer will
later compare against their invoice.

### When the price is zero

If the customer has unlimited access, or the change costs nothing, the quote comes back at **0**. In
that case a confirmation dialog is usually just friction — apply the change directly. Detecting this
is one of the reasons to quote even when you expect the change to be free.

## Step 2 — Confirm with the user

Show, at minimum:

- what is changing (*+2 team members*),
- the amount due now (`PricingLocalized`),
- the new recurring price (`NextTerm.PricingLocalized`),
- an explicit **Confirm** action and a way to cancel.

Take nothing from this step on trust afterwards: recompute the intended change server-side from your
own state when applying it. A "confirm" request arriving from the browser must not be able to name an
arbitrary feature and increment.

## Step 3 — Apply the change

```http
POST /v1/Usage
Content-Type: application/json

{
  "ReferenceCustomer": "cust-42",
  "ReferenceFeature": "feat-team-members",
  "Increment": 2,
  "DateStamp": "2026-08-01T15:31:00.00Z"
}
```

On success the updated usage values come back. ProAbono handles charging and invoicing from there —
there is no third call.

Two things to do immediately after:

1. **Apply the change in your own product** (create the seat, unlock the option). ProAbono tracks
   entitlement; it does not know what a seat is in your data model.
2. **Refresh the cached rights** for that customer — see `rights-management.md`. The value you have
   cached is now stale by definition.

> The quote is not a reservation. Between quoting and applying, a payment method can expire or an
> invoice can go unpaid, so the apply call can still fail with the codes below. Quote → confirm →
> apply should happen in one user interaction, not across a background job an hour later.

## Edge cases you must handle

Every one of these is a case where the customer is actively trying to spend money and cannot. Left
unhandled, each becomes a support ticket. The refusal arrives as `{ "Code": "…", "Message": "…" }` —
match on `Code`, and write your own user-facing text rather than showing `Message`, which is
integration-facing prose.

| Situation | Status | Error code | What to show |
| --- | --- | --- | --- |
| The subscription does not include this feature | 404 | `Error.Api.Usage.NoneMatching` | "Your plan does not include this." Offer a plan upgrade — open the change-plan workflow. |
| The change is billable, no payment method on file | 403 | `Error.Customer.PaymentSettings.Missing` | "Add a payment method to continue." Link to the register-payment-method workflow. |
| Too many unpaid invoices | 403 | `Error.Customer.Billing.CappingReached` | "Settle your outstanding invoices to continue." Link to the invoices tab of the portal. |

Each message should come with a way out, not just a refusal. The relevant workflows are in
`subscription-workflows.md`.

> The same `Error.Api.Usage.NoneMatching` code is documented as **404** on the pricing endpoint and
> as **403** on the usage-update endpoint. Match on the **error code**, and accept either status.

## Reference implementation

```js
/**
 * Quote a usage change. Returns the quote, or a typed refusal the UI can act on.
 * Never throws for a business refusal — those are expected outcomes, not errors.
 */
async function quoteUsageChange({ customerRef, feature, increment }) {
  const body = {
    ReferenceCustomer: customerRef,
    ReferenceFeature: feature,
    Increment: increment,
    DateStamp: new Date().toISOString(),
    NextTerm: true,
  };

  try {
    const quote = await proabono("POST", "/v1/Quoting/Usage", body);
    return {
      ok: true,
      free: quote.AmountTotal === 0,
      now: quote.PricingLocalized,
      nowLabel: quote.LabelLocalized,
      nextTerm: quote.NextTerm?.PricingLocalized ?? null,
      nextTermLabel: quote.NextTerm?.LabelLocalized ?? null,
    };
  } catch (err) {
    switch (err.payload?.Code) {
      case "Error.Api.Usage.NoneMatching":
        return { ok: false, reason: "not_in_plan" };
      case "Error.Customer.PaymentSettings.Missing":
        return { ok: false, reason: "no_payment_method" };
      case "Error.Customer.Billing.CappingReached":
        return { ok: false, reason: "unpaid_invoices" };
      default:
        throw err; // genuinely unexpected: 5xx, network, auth
    }
  }
}

/**
 * Apply a change the user has confirmed.
 * `increment` is recomputed server-side — it is NOT taken from the confirm request.
 */
async function applyUsageChange({ customerRef, feature, increment }) {
  const updated = await proabono("POST", "/v1/Usage", {
    ReferenceCustomer: customerRef,
    ReferenceFeature: feature,
    Increment: increment,
    DateStamp: new Date().toISOString(),
  });

  await refreshEntitlements(customerRef); // cached rights are now stale
  return updated;
}
```

Sketch of the two endpoints behind the UI:

```js
// POST /api/seats/quote  → { free, now, nextTerm } or { reason }
app.post("/api/seats/quote", requireAuth, async (req, res) => {
  const result = await quoteUsageChange({
    customerRef: `cust-${req.user.id}`,
    feature: "feat-team-members",
    increment: 1, // fixed by the action, not supplied by the client
  });
  res.json(result);
});

// POST /api/seats  → creates the seat once ProAbono accepted the change
app.post("/api/seats", requireAuth, async (req, res) => {
  const customerRef = `cust-${req.user.id}`;
  await applyUsageChange({ customerRef, feature: "feat-team-members", increment: 1 });
  const seat = await createSeatInYourProduct(req.user.accountId, req.body.email);
  res.status(201).json(seat);
});
```

## Ordering: charge first or provision first?

Apply the usage change **before** creating the thing in your product, as above. If ProAbono refuses,
nothing was provisioned and the user sees a clean message. The reverse order leaves you with a seat
that exists and was never billed — invisible revenue loss that nobody notices for months.

If provisioning on your side can itself fail after ProAbono accepted, reverse the usage change with a
compensating call (`Increment: -1`, or a corrected `QuantityCurrent`) and log it loudly. Do not leave
the two systems disagreeing.

## Checklist

1. Quote before every potentially billable change.
2. Show ProAbono's localized strings, not your own formatting.
3. Require explicit confirmation whenever the amount is non-zero; skip it when it is zero.
4. Recompute the change server-side; never trust the confirm request's parameters.
5. Handle all three refusal codes with an actionable link.
6. Apply to ProAbono first, provision second, compensate on failure.
7. Refresh cached rights immediately after applying.
