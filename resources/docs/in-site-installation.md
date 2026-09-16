---
name: proabono-in-site-installation
description: Embed ProAbono hosted pages (Customer Portal, pricing table, workflows) in a web app with portal.js and ProAbonoPortal.open(), including the production security hash.
when_to_use: Building the Subscription/Billing page, showing a pricing table, or opening any ProAbono hosted page inside the application.
---

# In-Site installation

The In-Site installation renders ProAbono's hosted pages **inside your own page**, in a container
you place. Same domain, same layout, same navigation — the customer never leaves your application.

The installation is one script tag, one `<div>`, and one call. Everything else on this page is
detail about that call.

## The three-line install

### 1. Load the library

In the `<head>` of every page that will show a ProAbono page:

```html
<script src="https://portal.proabono.com/Get/portal.js"></script>
```

### 2. Place the container

Where you want ProAbono to render:

```html
<div id="proabono_portal">loading...</div>
```

The id is fixed. The content is a placeholder and is overwritten once the portal loads.

### 3. Open it

```html
<script>
  ProAbonoPortal.open({
    business_id: 42,
    segment_ref: "demo-eur",
    customer_ref: "cust-42",
    customer_name: "John Doe", // optional
    customer_lang: "en", // optional
  });
</script>
```

That is a working Customer Portal: current plan, invoices, payment method, billing address, usage.

`customer_ref` **must be derived from the logged-in user's identifier** — it is the join between
your user table and ProAbono. `cust-42` above is a placeholder; render it server-side from the
session, never from a URL parameter or anything the visitor controls.

## Full parameter reference

All parameters accepted by `ProAbonoPortal.open()`:

| Parameter | Required | Notes |
| --- | --- | --- |
| `business_id` | **Yes** | Numeric identifier of the environment. **Different in sandbox and production** — read it from configuration, never hardcode. |
| `segment_ref` | **Yes** | The Segment holding this customer. One segment is the normal case. |
| `customer_ref` | No, but **strongly recommended** | Shared identifier between your app and ProAbono. If a Customer with this reference exists, the pages open authenticated as them; if not, a Customer is created on the fly. |
| `customer_lang` | No, recommended | ISO 639 code. **Saved onto the Customer, overwriting any existing value.** Pass your UI language so the hosted pages match the surrounding page. |
| `customer_name` | No | Internal name, visible only in the BackOffice — not the billing name. **Overwrites the stored value.** |
| `customer_meta` | No | Free key/value metadata stored on the Customer. Limited to **4 keys and 450 characters**. **Overwrites the stored value.** |
| `offer_ref` | No | Opens the subscription workflow for that specific offer instead of the catalog. Useful for private plans. **Ignored if the customer already has an active subscription.** |
| `query` | No | An encrypted opening query obtained from the API's `Links` array — the way to open a *specific* page or workflow. See `subscription-workflows.md`. |
| `hash` | **Yes in production**, optional in sandbox | Per-customer security hash. Without it, identity theft is trivial. See below. |

Note the overwrite semantics: `customer_lang`, `customer_name` and `customer_meta` are **written to
the Customer object on every open**. If your app is not the authority for one of those values, do
not pass it — you will silently overwrite what the customer set in the portal. The customer's
**email is never updated** by the hosted pages, deliberately: customers often choose a different
address for invoices than the one they log in with.

## Omitting `customer_ref`

Opening without `customer_ref` produces an **anonymous** session. It works, but it is not
recommended, and the consequences are worth stating plainly:

- the resulting customer is not linked to any user in your application;
- if they subscribe, you need an extra reconciliation step to attach that customer to a user;
- if they abandon mid-workflow, you have no way to trace what happened.

The one legitimate use is a **public pricing table** shown to visitors who have not signed up yet —
see `subscription-workflows.md`.

## The security hash (mandatory in production)

`customer_ref` travels through the browser. Without a proof that your server authorized it, any
visitor can change `cust-42` to `cust-43` and read another customer's invoices, addresses and
payment details. That is identity theft, and it is the single most serious mistake possible in this
integration.

The hash is an **HMAC-SHA256 computed server-side**, and it must be computed fresh for the logged-in
user on each page render.

### Construction

| | |
| --- | --- |
| Algorithm | HMAC-SHA256 |
| **Key** | the portal secret key, from the BackOffice |
| **Message** | the customer's reference, exactly as passed in `customer_ref` |
| **Output** | **hexadecimal** digest, **lowercase** — the comparison is case-sensitive |

Note the argument order: the secret is the **key**, the customer reference is the **message**. Most
HMAC APIs take them in that order, but `hash_hmac` in PHP takes the message first — swapping them
produces a valid-looking hash that is always rejected.

```js
import crypto from "node:crypto";

function computeProAbonoHash(customerRef) {
  return crypto
    .createHmac("sha256", process.env.PROABONO_PORTAL_SECRET) // key: the secret
    .update(customerRef) // message: the customer reference
    .digest("hex");
}
```

```html
<script>
  ProAbonoPortal.open({
    business_id: 42,
    segment_ref: "demo-eur",
    customer_ref: "cust-42",
    hash: "{SecurityHash}", // rendered server-side, per user
  });
</script>
```

Equivalents in other stacks, for reference when the host project is not Node:

```php
hash_hmac('sha256', $customerRef, $secretKey);           // message, then key
```

```ruby
OpenSSL::HMAC.hexdigest('sha256', secret_key, customer_ref)
```

```python
hmac.new(secret_key.encode(), customer_ref.encode(), hashlib.sha256).hexdigest()
```

```csharp
var encoder = Encoding.UTF8;
using var hmac = new HMACSHA256(encoder.GetBytes(secretKey));
var hash = Convert.ToHexString(hmac.ComputeHash(encoder.GetBytes(customerRef)))
                  .ToLowerInvariant();
```

> Two traps in the .NET version specifically. `Convert.FromHexString` (which appears in some copies of
> this snippet) does not compile here — it parses a hex *string* into bytes, the opposite direction;
> the right call is `Convert.ToHexString`. And that returns **uppercase** hex, which ProAbono rejects:
> the comparison is case-sensitive and every other language above emits lowercase. `.ToLowerInvariant()`
> is required, not cosmetic.

The secret key, and a generator and verifier for the hash, are in the BackOffice under
*Integration → Installation → In-Site → Portal*. When a hash is rejected, paste yours into that
verifier before debugging anything else — it settles in seconds whether the problem is the hash or
something else.

Rules that follow from this:

1. **Never compute the hash in the browser.** That would ship the secret key to every visitor and
   defeat the entire mechanism.
2. **Never cache a hash across users** — a per-user value in a shared template cache is the classic
   way this breaks.
3. The secret key lives in configuration (`process.env.PROABONO_PORTAL_SECRET` or equivalent),
   never in source.
4. Sandbox tolerates the absence of the hash. **Do not ship that to production.** Wire the hash in
   from the start; discovering it at go-live is a predictable and avoidable crisis.

> The portal hash and the webhook signature are **two different mechanisms with two different
> secrets**: the portal hash is HMAC-SHA256 (key = portal secret, message = customer reference, hex
> output); the webhook signature is a plain SHA-256 of a concatenation, base64-encoded, using the
> webhook secret. Using one secret for the other fails closed and looks identical from the outside.
> See `webhooks-processing.md`.

## Rendering a pricing table instead of the portal

Same three lines, fewer parameters. Omitting `customer_ref` gives the anonymous public table:

```html
<script>
  ProAbonoPortal.open({
    business_id: 42,
    segment_ref: "demo-eur",
  });
</script>
```

Passing `customer_ref` gives the table for a known, signed-in customer, who can then subscribe in
place:

```html
<script>
  ProAbonoPortal.open({
    business_id: 42,
    segment_ref: "demo-eur",
    customer_ref: "cust-42",
    hash: "{SecurityHash}",
  });
</script>
```

What the table *does* when a plan is chosen — subscribe immediately, or bounce to your sign-up page
first — is configured in the BackOffice under *Settings → Pricing Pages*, not in this call. See
`subscription-workflows.md`.

## Opening a specific page or workflow

By default the portal opens on its home page. To open a **specific** workflow (subscribe to this
plan, restart this subscription, pay this invoice), your server fetches the relevant object from the
API, reads the encrypted `query` out of its `Links` array, and passes it through:

```html
<script>
  ProAbonoPortal.open({
    business_id: 42,
    segment_ref: "demo-eur",
    customer_ref: "cust-42",
    query: "{SubscribeQuery}",
    hash: "{SecurityHash}",
  });
</script>
```

The full catalogue of available queries, and the alternative `pa_query` URL method, are in
`subscription-workflows.md`.

## Typical server-side render

Putting it together — the values that must come from the server are `customer_ref` and `hash`, and
neither may be influenced by the request's query string:

```js
// Express-style handler for the app's /billing page.
app.get("/billing", requireAuth, async (req, res) => {
  const customerRef = `cust-${req.user.id}`; // derived from the session, never from input

  res.render("billing", {
    businessId: process.env.PROABONO_BUSINESS_ID,
    segmentRef: process.env.PROABONO_SEGMENT_REF,
    customerRef,
    hash: computeProAbonoHash(customerRef), // server-side HMAC-256, secret from env
  });
});
```

```html
<!-- billing template -->
<script src="https://portal.proabono.com/Get/portal.js"></script>
<div id="proabono_portal">loading...</div>
<script>
  ProAbonoPortal.open({
    business_id: {{businessId}},
    segment_ref: "{{segmentRef}}",
    customer_ref: "{{customerRef}}",
    customer_lang: "{{user.language}}",
    hash: "{{hash}}"
  });
</script>
```

## Single-page applications

`portal.js` must be loaded before `ProAbonoPortal.open()` runs, and the `#proabono_portal` container
must exist in the DOM at the moment of the call. In a SPA this means calling `open()` *after* the
component holding the container has mounted, not at module import time. If you route away and back,
re-run `open()` — the container's contents were replaced, and re-mounting an empty div does not
re-open anything.

## What to do when the workflow ends

The customer finishing a subscription inside the portal is an event your application must react to —
their rights just changed. ProAbono can redirect them back to a URL of yours with parameters
describing what happened; that redirect is the fastest available signal and is covered in
`subscription-workflows.md`. Do not wait for a webhook to refresh the UI the customer is looking at:
webhooks are asynchronous and may lag by minutes.

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| `customer_ref` taken from a URL or form field | Any visitor can read another customer's billing data. |
| Shipping to production without `hash` | Same. |
| Computing the hash client-side | Secret key exposed to every visitor. |
| Hardcoding `business_id` | Sandbox data in production, or a portal that silently shows nothing. |
| Storing a `query` for later reuse | Queries expire; the page will fail to open. |
| Passing `customer_name`/`customer_lang` from stale data | Silently overwrites values the customer set themselves. |
| Calling `open()` before the container exists | Nothing renders, no error that points at the cause. |
