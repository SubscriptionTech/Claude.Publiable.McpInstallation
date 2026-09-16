---
name: proabono-glossary
description: ProAbono domain vocabulary — Business, Segment, Customer, Offer, Subscription, Feature types, Usage, hosted pages, queries and keys.
when_to_use: A ProAbono term appears in a task or an API response and its meaning is not obvious, or you need to know which object owns a given piece of data.
---

# ProAbono glossary

Ordered from the outside in: container objects first, then what they hold.

## Structure

**Business**
One ProAbono environment. You have at least two — a **sandbox** business and a **production**
business — each with its own `business_id`, its own API keys and its own data. Features and webhook
configuration are defined at the Business level.

**Segment**
A partition of a Business, identified by `ReferenceSegment` (e.g. `demo-eur`). Use segments when the
same product is sold through several channels, in several currencies, or to distinct customer
populations with distinct catalogs. Customers, Offers and Discounts belong to a Segment. A simple
integration uses exactly one and passes its reference everywhere.

## People and what they bought

**Customer**
The account being billed — normally one per user or per organization in your app, identified by
`ReferenceCustomer` and unique within a Segment. A Customer can exist with no subscription at all.

**Offer** (also called *plan*)
An entry in your catalog, identified by `ReferenceOffer`: a price, a billing period, and the set of
Features it includes. Offers may be public (shown in the pricing table) or private (reachable only
through a link you generate).

**Subscription**
A Customer's live link to an Offer. It has a lifecycle — started, renewed, suspended, restarted,
terminated, ended — and that lifecycle is what makes rights change over time. A Customer may hold
**several simultaneous subscriptions**; code that assumes exactly one will eventually be wrong.

**Custom subscription**
A subscription created and tailored through the API or by a salesperson in the BackOffice rather
than picked from the public catalog. This is precisely why you must not derive rights from the
Offer: a custom subscription's contents may match no catalog entry at all.

**Pricing table**
A configured presentation of a set of Offers, identified by `ReferencePricingTable`, rendered by
ProAbono as a hosted page.

**Discount**
A reduction applied to a subscription or an invoice, identified by `ReferenceDiscount`.

## What the customer is allowed to do

**Feature**
The unit of entitlement, identified by `ReferenceFeature` and unique per Business. A Feature is a
variable element that influences both the **price** of a subscription and the **rights** it grants.
Features are the *only* object you should consult to decide what a user may do. A Feature can be
**hidden**: it grants rights but is not displayed to the customer.

There are exactly three Feature types:

| `TypeFeature` | Value shape | Semantics | Example |
| --- | --- | --- | --- |
| `OnOff` | boolean | The capability is on or off. | 24/7 support |
| `Limitation` | positive integer | A **persistent** ceiling — a stock that exists at a point in time and is not reset each period. | Number of team members |
| `Consumption` | positive integer | A **flow** consumed over the billing period and reset at each new period. | SMS sent per month |

The distinction matters for enforcement: a `Limitation` is compared against the current state of
your data ("how many seats exist right now"), a `Consumption` against a counter that resets at
`DatePeriodEnd`.

**Usage**
The Feature's value *for one customer, right now*: what the subscription includes
(`QuantityIncluded` / `IsIncluded`) and where the customer currently stands (`QuantityCurrent` /
`IsEnabled`), bounded by `DatePeriodStart` and `DatePeriodEnd`. The name comes from usage-based
billing, because the same object drives both entitlement and variable pricing. Reading and writing
Usages is the whole of `rights-management.md`.

## The pages ProAbono renders for you

**Hosted pages**
The complete set of billing screens ProAbono generates, rendered inside your application. Split into
the Customer Portal and the Customer Workflows.

**Customer Portal**
The steady-state "Subscription" or "Billing" section: current plan, invoices to download, payment
method, billing address, current consumption. Roughly sixty pages you do not have to build.

**Customer Workflow**
A multi-step form that *changes* something: subscribe, change plan, change options, restart, pay an
invoice, register a payment method. Every workflow ends with a payment step, whose outcome may be
"paid", "pending", "due later", "payment method registered" or "nothing to pay".

**Query**
An **encrypted** bundle of opening parameters returned by the API in a `Links` entry, telling the
hosted pages which page or workflow to open and for whom. Safe to place in HTML or a URL; opaque and
tamper-proof; **expires**, so never store one.

**`pa_query`**
The URL parameter that carries a query to your configured installation page — the way to send a
customer straight into a workflow from an email or a redirect.

**`crylk`**
A legacy URL parameter carrying an encrypted portal link, used by the older iframe-based
integration. If you meet it in existing code, that code predates the In-Site installation and is a
candidate for migration.

## Objects that appear in webhook payloads

**`CustomerBuyer`**
The customer who **pays**, when that is not the customer who **holds** the subscription — a parent
account, a reseller, a partner billed on someone else's behalf. Entitlements always belong to
`Customer`; billing belongs to `CustomerBuyer`. Resolving your application's user from the buyer is a
security bug, not a detail.

**`GatewayPermission`**
A registered payment method as ProAbono sees it: its state, its type (`Card`, …), the gateway
handling it, a masked display name and an expiry date. "Permission" because it is the authorization to
debit, not the card data itself — ProAbono never hands you card numbers.

**`InvoiceDebit` / `InvoiceCredit`**
An invoice and a credit note. Same shape — number, status, issue and payment dates, pre-tax and
post-tax amounts — with the credit note adding `TypeCredit` (e.g. `Refund`) and a free-text `Reason`.
A refund or cancellation produces both: the invoice event *and* a credit note event.

**`TypeTrigger`**
The event code on a webhook notification (`SubscriptionStarted`, `InvoiceDebitPaid`, …). Its absence
means the request is the endpoint-validation handshake, not an event. See
`webhooks-processing.md`.

**`StateSubscription`**
A finer-grained lifecycle state than `Status` (e.g. `ActiveRunning` alongside `Status: "Active"`).
Neither is an entitlement: what a customer may actually do comes from the Usage API, never from a
subscription state.

## Keys

**Agent key / API key**
The Basic auth username / password pair for server-to-server API calls. Full access to the business
— server-side only, one pair per environment.

**`business_id`**
The public numeric identifier of the environment, safe to expose in the browser. Different in
sandbox and production.

**Security hash (portal secret)**
A per-customer HMAC-SHA256 — key = the portal secret key, message = the `customer_ref`, hex output —
proving that your server authorized this browser to open the hosted pages as that customer. Optional
in sandbox, **mandatory in production**: without it any visitor could edit `customer_ref` and read
another customer's billing data. See `in-site-installation.md`.

**Secret key (webhooks)**
A **different** business-level secret, used to verify that an incoming webhook really came from
ProAbono — and through a different construction: a plain SHA-256 of `x-proabono-key` + secret,
base64-encoded. Not interchangeable with the portal secret. See `webhooks-processing.md`.
