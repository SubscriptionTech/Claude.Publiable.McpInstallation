/**
 * The tools as a client sees them: registered on a real server, called over an in-memory
 * transport, with a recorded fetch standing in for ProAbono.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ProAbonoClient } from "../src/api/client.js";
import { createServer } from "../src/server.js";
import { TEST_CONFIGURATION, assertNoSecret, recordFetch } from "./support.js";

async function connect(responses: readonly { status?: number; body: unknown }[]) {
  const recorder = recordFetch(responses);
  const server = createServer(TEST_CONFIGURATION, {
    client: new ProAbonoClient(TEST_CONFIGURATION, { fetchImplementation: recorder.fetch }),
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client, recorder };
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.map((block) => block.text ?? "").join("\n");
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

describe("the exposed tool surface", () => {
  it("registers the tools of this release, and nothing destructive", async () => {
    const { client } = await connect([{ body: {} }]);
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();

    assert.deepEqual(names, [
      "change_subscription",
      "create_customer",
      "create_subscription",
      "generate_pricing_table",
      "get_api_reference",
      "get_customer",
      "get_offer",
      "get_server_info",
      "get_usages",
      "install_customer_portal",
      "list_features",
      "list_offers",
      "list_subscriptions",
      "search_documentation",
      "update_billing_address",
      "update_customer",
    ]);

    for (const forbidden of ["anonymize", "delete", "revoke", "invalidate", "suspend_customer"]) {
      assert.ok(!names.some((name) => name.includes(forbidden)), `${forbidden} must not be exposed`);
    }
  });

  it("marks every write tool as a write in its description", async () => {
    const { client } = await connect([{ body: {} }]);
    const tools = (await client.listTools()).tools;
    const writes = [
      "create_customer",
      "update_customer",
      "update_billing_address",
      "create_subscription",
      "change_subscription",
    ];

    for (const name of writes) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      assert.match(tool.description ?? "", /^WRITE\./);
    }
  });

  it("reports its configuration by name and never by value", async () => {
    const { client } = await connect([{ body: {} }]);
    const result = await client.callTool({ name: "get_server_info", arguments: {} });
    const answer = textOf(result);

    assertNoSecret(answer);
    assert.ok(answer.includes("PROABONO_PORTAL_SECRET"));
  });
});

describe("write tools", () => {
  it("creates a customer in the configured Segment", async () => {
    const { client, recorder } = await connect([{ body: { Id: 1, ReferenceCustomer: "cust-1" } }]);

    await client.callTool({
      name: "create_customer",
      arguments: { customer_ref: "cust-1", email: "john@doe.com" },
    });

    const request = recorder.requests[0]!;
    assert.equal(request.url.pathname, "/v1/Customer");
    assert.equal(request.method, "POST");
    assert.deepEqual((request.body as { ReferenceSegment: string }).ReferenceSegment, "ci-live");
  });

  it("updates a billing address on the customer it names", async () => {
    const { client, recorder } = await connect([{ body: {} }]);

    await client.callTool({
      name: "update_billing_address",
      arguments: { customer_ref: "cust-1", city: "Paris", country: "FR" },
    });

    const request = recorder.requests[0]!;
    assert.equal(request.url.pathname, "/v1/CustomerAddressBilling");
    assert.equal(request.url.searchParams.get("ReferenceCustomer"), "cust-1");
    assert.deepEqual(request.body, { City: "Paris", Country: "FR" });
  });

  it("routes each subscription change to its own endpoint", async () => {
    const { client, recorder } = await connect([{ body: {} }]);

    await client.callTool({
      name: "change_subscription",
      arguments: { subscription_id: 140960, action: "terminate" },
    });
    await client.callTool({
      name: "change_subscription",
      arguments: { subscription_id: 140960, action: "upgrade", offer_ref: "offer-pro" },
    });

    assert.equal(recorder.requests[0]!.url.pathname, "/v1/Subscription/140960/Termination");
    assert.equal(recorder.requests[1]!.url.pathname, "/v1/Subscription/140960/Upgrade");
    assert.equal(recorder.requests[1]!.url.searchParams.get("ReferenceOffer"), "offer-pro");
  });

  it("refuses an upgrade with no target offer", async () => {
    const { client, recorder } = await connect([{ body: {} }]);

    const result = await client.callTool({
      name: "change_subscription",
      arguments: { subscription_id: 140960, action: "upgrade" },
    });

    assert.ok(isError(result));
    assert.equal(recorder.requests.length, 0);
  });

  it("explains the three Usage rejections instead of repeating their code", async () => {
    const { client } = await connect([
      { status: 400, body: { Code: "Error.Customer.PaymentSettings.Missing", Message: "missing" } },
    ]);

    const result = await client.callTool({
      name: "create_subscription",
      arguments: { customer_ref: "cust-1", offer_ref: "offer-pro", bill_now: true },
    });

    assert.ok(isError(result));
    assert.match(textOf(result), /payment method/i);
  });
});

describe("hosted-page tools", () => {
  it("generates the portal install without leaking a secret", async () => {
    const { client } = await connect([
      { body: { TotalItems: 1, Items: [{ ReferenceOffer: "offer-pro", Features: [{ Id: 1 }] }] } },
    ]);

    const result = await client.callTool({
      name: "install_customer_portal",
      arguments: { stack: "node-express", target_page: "/account/billing" },
    });
    const answer = textOf(result);

    assertNoSecret(answer);
    assert.ok(answer.includes("PROABONO_PORTAL_SECRET"));
    assert.ok(answer.includes("portal.proabono.com/Get/portal.js"));
    assert.ok(answer.includes("ci-live"));
  });

  it("warns when the catalogue cannot support an installation", async () => {
    const { client } = await connect([{ body: { TotalItems: 0, Items: [] } }]);

    const result = await client.callTool({
      name: "generate_pricing_table",
      arguments: { stack: "php", target_page: "/pricing", identified: false },
    });

    assert.match(textOf(result), /no visible offer/i);
  });

  it("omits the hash from an anonymous pricing table", async () => {
    const { client } = await connect([
      { body: { TotalItems: 1, Items: [{ ReferenceOffer: "offer-pro", TitleLocalized: "Pro" }] } },
    ]);

    const result = await client.callTool({
      name: "generate_pricing_table",
      arguments: { stack: "node-express", target_page: "/pricing", identified: false },
    });

    assert.ok(!textOf(result).includes("hash:"));
  });
});

describe("read tools", () => {
  it("reads a customer's rights and diagnoses an empty answer", async () => {
    const { client } = await connect([{ body: { TotalItems: 0, Items: [] } }]);

    const result = await client.callTool({
      name: "get_usages",
      arguments: { customer_ref: "cust-1" },
    });

    assert.match(textOf(result), /No Usage came back/);
  });

  it("flags an offer that carries no Feature", async () => {
    const { client } = await connect([
      { body: { TotalItems: 1, Items: [{ ReferenceOffer: "offer-empty", Features: [] }] } },
    ]);

    const result = await client.callTool({ name: "list_offers", arguments: {} });

    assert.match(textOf(result), /carry no Feature/);
  });

  it("answers a documentation question from the corpus", async () => {
    const { client } = await connect([{ body: {} }]);

    const result = await client.callTool({
      name: "search_documentation",
      arguments: { question: "where does the security hash come from" },
    });

    assert.match(textOf(result), /in-site-installation\.md/);
  });
});
