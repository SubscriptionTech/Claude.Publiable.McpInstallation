/**
 * The two sources of truth, as the server reads them at run time.
 *
 * These tests fail if the build stops vendoring the contract and the documentation into the
 * package -- a failure that would otherwise only appear once installed, as a server that answers
 * every documentation question with nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadContract, loadDocumentation } from "../src/corpus/index.js";
import { documentationSections, searchDocumentation } from "../src/docs/search.js";
import { findEndpoints, findSchema, listEndpoints } from "../src/openapi/reference.js";

describe("the documentation corpus", () => {
  it("ships with the build", () => {
    const files = loadDocumentation();
    assert.ok(files.length >= 8);
    assert.ok(files.some((file) => file.name === "in-site-installation.md"));
  });

  it("splits into sections", () => {
    assert.ok(documentationSections().length > 40);
  });

  it("answers a question about the security hash from the hosted-pages document", () => {
    const [best] = searchDocumentation("how do I compute the portal security hash");
    assert.ok(best !== undefined);
    assert.equal(best.document, "in-site-installation.md");
    assert.match(best.heading.toLowerCase(), /security hash/);
  });

  it("answers a question about rights from the rights document", () => {
    const hits = searchDocumentation("caching a customer rights usage api");
    assert.ok(hits.some((hit) => hit.document === "rights-management.md"));
  });

  it("returns nothing rather than noise for an unrelated question", () => {
    assert.equal(searchDocumentation("kubernetes ingress controller").length, 0);
  });
});

describe("the API contract", () => {
  it("ships with the build", () => {
    const contract = loadContract();
    assert.equal(contract.info.title, "ProAbono API Live");
    assert.ok(Object.keys(contract.paths).length > 20);
  });

  it("describes the customer endpoint in both directions", () => {
    const endpoints = findEndpoints("/v1/Customer");
    const methods = endpoints.map((endpoint) => endpoint.method).sort();
    assert.deepEqual(methods, ["GET", "POST"]);

    const post = endpoints.find((endpoint) => endpoint.method === "POST")!;
    assert.equal(post.requestBodySchema, "CustomerRequest");
  });

  it("marks ReferenceCustomer as required where it is", () => {
    const get = findEndpoints("/v1/Customer").find((endpoint) => endpoint.method === "GET")!;
    const parameter = get.parameters.find((item) => item.name === "ReferenceCustomer")!;
    assert.equal(parameter.required, true);
  });

  it("resolves shared parameters through their $ref", () => {
    const list = findEndpoints("/v1/Customers")[0]!;
    assert.ok(list.parameters.some((parameter) => parameter.name === "Page"));
  });

  it("finds a schema whatever the case", () => {
    assert.equal(findSchema("customerrequest")?.name, "CustomerRequest");
  });

  it("exposes every operation of the contract", () => {
    assert.ok(listEndpoints().length > 30);
  });
});
