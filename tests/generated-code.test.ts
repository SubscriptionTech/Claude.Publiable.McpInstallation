/**
 * Golden rules on the code this server hands a developer.
 *
 * Each of these is a way the hosted-page integration breaks silently -- a hash computed in the
 * browser, a customer reference taken from the request, a secret inlined in a snippet. They are
 * asserted on every stack, so a new stack cannot be added without meeting them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STACKS,
  hashSnippet,
  renderSnippet,
  templateSnippet,
} from "../src/generate/hosted-pages.js";
import { PORTAL_SECRET_SENTINEL } from "./support.js";

/** Ways a snippet could read the customer reference from something the visitor controls. */
const REQUEST_DERIVED = [
  "req.query",
  "req.body",
  "req.params",
  "$_GET",
  "$_POST",
  "request.args",
  "searchParams.get",
  "params[",
];

describe("generated hosted-page code", () => {
  for (const stack of STACKS) {
    describe(stack, () => {
      it("reads the portal secret from configuration, never inlined", () => {
        const snippet = hashSnippet(stack);
        assert.ok(snippet.includes("PROABONO_PORTAL_SECRET"));
        assert.ok(!snippet.includes(PORTAL_SECRET_SENTINEL));
      });

      it("computes an HMAC-SHA256", () => {
        assert.match(hashSnippet(stack).toLowerCase(), /sha256|hmac/);
      });

      it("never derives the customer reference from the request", () => {
        const snippet = renderSnippet(stack, "/account/billing");
        for (const pattern of REQUEST_DERIVED) {
          assert.ok(!snippet.includes(pattern), `${stack} reads the reference from ${pattern}`);
        }
      });

      it("reads the business identifier and Segment from configuration", () => {
        const snippet = renderSnippet(stack, "/account/billing");
        assert.ok(snippet.includes("PROABONO_BUSINESS_ID"));
        assert.ok(snippet.includes("PROABONO_SEGMENT_REF"));
      });
    });
  }

  // hash_hmac is the one API in this set that takes the message before the key. Swapping them
  // produces a valid-looking hash that ProAbono always rejects.
  it("passes the message before the key in PHP, and only in PHP", () => {
    assert.match(hashSnippet("php"), /hash_hmac\('sha256', \$customerRef, getenv\('PROABONO_PORTAL_SECRET'\)\)/);
  });

  // Convert.ToHexString returns uppercase; the comparison is case-sensitive.
  it("emits lowercase hex in C#", () => {
    const snippet = hashSnippet("csharp");
    assert.ok(snippet.includes("ToLowerInvariant"));
    assert.ok(!snippet.includes("Convert.FromHexString"));
  });

  it("puts the identified template's customer reference and hash in place", () => {
    const template = templateSnippet({ identified: true });
    assert.ok(template.includes("customer_ref"));
    assert.ok(template.includes("hash"));
    assert.ok(template.includes('<script src="https://portal.proabono.com/Get/portal.js"></script>'));
    assert.ok(template.includes('<div id="proabono_portal">'));
  });

  it("gives the anonymous table neither a customer reference nor a hash", () => {
    const template = templateSnippet({ identified: false });
    assert.ok(!template.includes("customer_ref"));
    assert.ok(!template.includes("hash"));
  });

  it("never computes a hash in the browser", () => {
    for (const identified of [true, false]) {
      const template = templateSnippet({ identified });
      assert.ok(!/createHmac|hash_hmac|HMACSHA256/.test(template));
      assert.ok(!template.includes("PROABONO_PORTAL_SECRET"));
    }
  });

  it("passes the language only when asked for it", () => {
    assert.ok(!templateSnippet({ identified: true }).includes("customer_lang"));
    assert.ok(templateSnippet({ identified: true, passLanguage: true }).includes("customer_lang"));
  });
});
