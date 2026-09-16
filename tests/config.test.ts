import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConfigurationError, loadConfiguration } from "../src/config.js";

const COMPLETE = {
  PROABONO_API_BASE: "https://api-42.proabono.com/",
  PROABONO_BUSINESS_ID: "42",
  PROABONO_SEGMENT_REF: "ci-live",
  PROABONO_AGENT_KEY: "agent",
  PROABONO_API_KEY: "secret-api-key",
  PROABONO_PORTAL_SECRET: "secret-portal",
  PROABONO_WEBHOOK_SECRET: "secret-webhook",
};

describe("configuration", () => {
  it("names every missing variable", () => {
    try {
      loadConfiguration({});
      assert.fail("expected a ConfigurationError");
    } catch (error) {
      assert.ok(error instanceof ConfigurationError);
      for (const name of Object.keys(COMPLETE)) {
        assert.ok(error.message.includes(name), `${name} is not named in the error`);
      }
    }
  });

  it("names only the variable that is missing", () => {
    const { PROABONO_API_KEY: _omitted, ...partial } = COMPLETE;

    assert.throws(
      () => loadConfiguration(partial),
      (error: unknown) =>
        error instanceof ConfigurationError &&
        error.message.includes("PROABONO_API_KEY") &&
        !error.message.includes("PROABONO_AGENT_KEY"),
    );
  });

  it("never puts a value in the error message", () => {
    assert.throws(
      () => loadConfiguration({ ...COMPLETE, PROABONO_BUSINESS_ID: "sandbox-42" }),
      (error: unknown) =>
        error instanceof ConfigurationError &&
        !error.message.includes(COMPLETE.PROABONO_API_KEY) &&
        !error.message.includes(COMPLETE.PROABONO_PORTAL_SECRET) &&
        !error.message.includes("sandbox-42"),
    );
  });

  it("treats a blank variable as missing", () => {
    assert.throws(
      () => loadConfiguration({ ...COMPLETE, PROABONO_SEGMENT_REF: "   " }),
      (error: unknown) =>
        error instanceof ConfigurationError && error.message.includes("PROABONO_SEGMENT_REF"),
    );
  });

  it("refuses a non-https endpoint", () => {
    assert.throws(
      () => loadConfiguration({ ...COMPLETE, PROABONO_API_BASE: "http://api-42.proabono.com" }),
      ConfigurationError,
    );
  });

  it("trims the trailing slash off the endpoint", () => {
    assert.equal(loadConfiguration(COMPLETE).apiBase, "https://api-42.proabono.com");
  });
});
