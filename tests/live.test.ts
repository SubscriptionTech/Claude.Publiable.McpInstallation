/**
 * The live lane: the journey of steps 4 and 5 against a real ProAbono account.
 *
 * It runs only when the seven variables are present in the environment, and it expects the
 * fixture account described in Spec-test-account.md, in the internal specs repository: a Business
 * used for nothing else,
 * a Segment pool, three Features (one per type), and at least one Offer carrying a Feature.
 *
 * It ends on the default-Segment tripwire. `ReferenceSegment` is optional on every operation, so
 * a dropped reference does not raise an error -- it silently acts on the Business's default
 * Segment. Asserting that nothing appeared there is the only way to observe that bug.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProAbonoClient } from "../src/api/client.js";
import { loadConfiguration, type ProAbonoConfiguration } from "../src/config.js";

const CONFIGURED = [
  "PROABONO_API_BASE",
  "PROABONO_BUSINESS_ID",
  "PROABONO_SEGMENT_REF",
  "PROABONO_AGENT_KEY",
  "PROABONO_API_KEY",
  "PROABONO_PORTAL_SECRET",
  "PROABONO_WEBHOOK_SECRET",
].every((name) => (process.env[name] ?? "").trim().length > 0);

/** A unique prefix per run: `ReferenceCustomer` is unique per Segment and nothing can be deleted. */
const RUN = `mcp-${Date.now().toString(36)}`;

const live = CONFIGURED ? describe : describe.skip;

live("live journey against the fixture account", () => {
  let configuration: ProAbonoConfiguration;
  let client: ProAbonoClient;
  let offerRef: string;
  let defaultSegmentBaseline: number;

  before(async () => {
    configuration = loadConfiguration();
    client = new ProAbonoClient(configuration);

    // Preflight: the fixture cannot be rebuilt by the suite, so a mismatch fails here, named,
    // rather than as a confusing failure three tests later.
    const offers = await client.listAll<{ ReferenceOffer?: string; Features?: unknown[] }>(
      "/v1/Offers",
      {},
    );
    const usable = offers.find((offer) => (offer.Features ?? []).length > 0);
    assert.ok(
      usable?.ReferenceOffer !== undefined,
      "The fixture account must expose at least one Offer carrying at least one Feature. " +
        "Offers and Features are authored in the BackOffice; see Spec-test-account.md in the internal specs.",
    );
    offerRef = usable.ReferenceOffer;

    defaultSegmentBaseline = await countInDefaultSegment(configuration);
  });

  it("creates, updates and bills a customer, then subscribes them", async () => {
    const customerRef = `${RUN}-cust`;

    const created = await client.post<{ ReferenceCustomer?: string }>("/v1/Customer", {
      body: {
        ReferenceCustomer: customerRef,
        ReferenceSegment: configuration.segmentRef,
        Email: `${RUN}@example.test`,
        Name: "MCP suite",
      },
    });
    assert.equal(created.ReferenceCustomer, customerRef);

    await client.post("/v1/Customer", {
      body: {
        ReferenceCustomer: customerRef,
        ReferenceSegment: configuration.segmentRef,
        Name: "MCP suite (updated)",
      },
    });

    await client.post("/v1/CustomerAddressBilling", {
      query: { ReferenceCustomer: customerRef },
      body: { FirstName: "MCP", LastName: "Suite", City: "Paris", Country: "FR" },
    });

    const subscription = await client.post<{ Id?: number }>("/v1/Subscription", {
      query: { TryStart: true },
      body: { ReferenceCustomer: customerRef, ReferenceOffer: offerRef },
    });
    assert.ok(typeof subscription.Id === "number");

    const usages = await client.listAll<{ ReferenceFeature?: string }>("/v1/Usages", {
      ReferenceCustomer: customerRef,
    });
    assert.ok(
      usages.length > 0,
      "A started subscription on an offer carrying a Feature must return at least one Usage.",
    );

    await client.post(`/v1/Subscription/{IdSubscription}/Termination`, {
      query: { IdSubscription: subscription.Id, Immediate: true },
    });
  });

  after(async () => {
    const found = await countInDefaultSegment(configuration);
    assert.equal(
      found,
      defaultSegmentBaseline,
      `${found - defaultSegmentBaseline} customer(s) appeared in the Business's default Segment. ` +
        `A ReferenceSegment was dropped somewhere: the call succeeded against the wrong Segment.`,
    );
  });
});

/** Counts customers in the default Segment, by deliberately omitting `ReferenceSegment`. */
async function countInDefaultSegment(configuration: ProAbonoConfiguration): Promise<number> {
  const response = await fetch(`${configuration.apiBase}/v1/Customers?SizePage=0`, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${configuration.agentKey}:${configuration.apiKey}`,
        "utf8",
      ).toString("base64")}`,
      Accept: "application/json",
    },
  });

  const payload = (await response.json()) as { TotalItems?: number };
  return payload.TotalItems ?? 0;
}
