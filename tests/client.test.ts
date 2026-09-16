import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProAbonoClient } from "../src/api/client.js";
import { ProAbonoApiError } from "../src/api/errors.js";
import { API_KEY_SENTINEL, TEST_CONFIGURATION, recordFetch } from "./support.js";

function clientWith(responses: readonly { status?: number; body: unknown }[]) {
  const recorder = recordFetch(responses);
  return {
    recorder,
    client: new ProAbonoClient(TEST_CONFIGURATION, { fetchImplementation: recorder.fetch }),
  };
}

describe("ProAbono API client", () => {
  it("authenticates with the agent key as username and the API key as password", async () => {
    const { client, recorder } = clientWith([{ body: {} }]);
    await client.get("/v1/Customer", { ReferenceCustomer: "cust-1" });

    const header = recorder.requests[0]!.headers["Authorization"]!;
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    assert.equal(decoded, `${TEST_CONFIGURATION.agentKey}:${TEST_CONFIGURATION.apiKey}`);
  });

  // The default-Segment trap: ReferenceSegment is optional everywhere, and omitting it makes
  // ProAbono act on the Business's default Segment with no error at all.
  it("adds the configured Segment to every operation whose contract declares it", async () => {
    const { client, recorder } = clientWith([{ body: { TotalItems: 0, Items: [] } }]);
    await client.listAll("/v1/Offers", {});

    assert.equal(recorder.requests[0]!.url.searchParams.get("ReferenceSegment"), "ci-live");
  });

  it("does not invent a Segment parameter the contract does not declare", async () => {
    const { client, recorder } = clientWith([{ body: {} }]);
    await client.get("/v1/Customer", { ReferenceCustomer: "cust-1" });

    assert.equal(recorder.requests[0]!.url.searchParams.get("ReferenceSegment"), null);
  });

  it("keeps an explicitly passed Segment", async () => {
    const { client, recorder } = clientWith([{ body: { TotalItems: 0, Items: [] } }]);
    await client.listAll("/v1/Features", { ReferenceSegment: "no-metered" });

    assert.equal(recorder.requests[0]!.url.searchParams.get("ReferenceSegment"), "no-metered");
  });

  it("reads a paginated collection to TotalItems, not one page", async () => {
    const { client, recorder } = clientWith([
      { body: { Page: 1, TotalItems: 3, Items: [{ Id: 1 }, { Id: 2 }] } },
      { body: { Page: 2, TotalItems: 3, Items: [{ Id: 3 }] } },
    ]);

    const items = await client.listAll<{ Id: number }>("/v1/Subscriptions", {});

    assert.deepEqual(
      items.map((item) => item.Id),
      [1, 2, 3],
    );
    assert.equal(recorder.requests.length, 2);
    assert.equal(recorder.requests[1]!.url.searchParams.get("Page"), "2");
  });

  it("substitutes path parameters", async () => {
    const { client, recorder } = clientWith([{ body: {} }]);
    await client.post("/v1/Subscription/{IdSubscription}/Termination", {
      query: { IdSubscription: 140960, Immediate: true },
    });

    assert.equal(recorder.requests[0]!.url.pathname, "/v1/Subscription/140960/Termination");
    assert.equal(recorder.requests[0]!.url.searchParams.get("Immediate"), "true");
  });

  it("carries the API's own error code, without the credentials", async () => {
    const { client } = clientWith([
      {
        status: 400,
        body: { Code: "Error.Api.Usage.NoneMatching", Message: "No matching usage", Target: "ReferenceFeature" },
      },
    ]);

    await assert.rejects(
      () => client.get("/v1/Usages", { ReferenceCustomer: "cust-1" }),
      (error: unknown) => {
        assert.ok(error instanceof ProAbonoApiError);
        assert.equal(error.code, "Error.Api.Usage.NoneMatching");
        assert.equal(error.target, "ReferenceFeature");
        assert.ok(!error.describe().includes(API_KEY_SENTINEL));
        return true;
      },
    );
  });
});
