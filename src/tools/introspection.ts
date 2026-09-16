/**
 * Read-only introspection of the account the credentials open.
 *
 * These tools read; they never write. They also never reason about which account or which
 * environment the credentials open — they report what comes back.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { json, type ToolContext, type ToolResult } from "./context.js";
import { guard } from "./guard.js";

export function registerIntrospectionTools(server: McpServer, context: ToolContext): void {
  const { client } = context;

  server.registerTool(
    "list_offers",
    {
      title: "List the offers of the account",
      description:
        "Lists the ProAbono offers the configured Segment exposes, with the Features each one " +
        "carries and its pricing. Read-only. Use it to show a catalogue, to pick the offer a " +
        "subscription or a pricing table targets, or to check the prerequisite that at least one " +
        "offer exists and carries at least one Feature. Reads every page, not just the first.",
      inputSchema: {
        customer_ref: z
          .string()
          .optional()
          .describe("Restrict to the offers available to this customer reference."),
        visible_only: z.boolean().optional().describe("Only offers marked visible."),
      },
    },
    async ({ customer_ref, visible_only }): Promise<ToolResult> =>
      guard(async () => {
        const offers = await client.listAll<Record<string, unknown>>("/v1/Offers", {
          ReferenceCustomer: customer_ref,
          IsVisible: visible_only,
        });

        const withoutFeatures = offers.filter((offer) => {
          const features = offer["Features"];
          return !Array.isArray(features) || features.length === 0;
        });

        return json({
          count: offers.length,
          offers,
          prerequisite_warning:
            offers.length === 0
              ? "This Segment exposes no offer. Offers are authored in the ProAbono BackOffice and " +
                "cannot be created through the API: an installation cannot proceed without one."
              : withoutFeatures.length > 0
                ? `${withoutFeatures.length} offer(s) carry no Feature. A subscription to such an ` +
                  `offer returns no Usage, which is indistinguishable from a broken integration. ` +
                  `Attach at least one Feature in the BackOffice.`
                : undefined,
        });
      }),
  );

  server.registerTool(
    "get_offer",
    {
      title: "Retrieve one offer",
      description:
        "Retrieves a single ProAbono offer by its reference, with its Features, pricing and the " +
        "Links it exposes. Read-only. Use it when the offer reference is already known.",
      inputSchema: {
        offer_ref: z.string().min(1).describe("The offer's shared reference (ReferenceOffer)."),
        customer_ref: z
          .string()
          .optional()
          .describe("When given, the Links include a direct subscribe link for that customer."),
      },
    },
    async ({ offer_ref, customer_ref }): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.get("/v1/Offer", {
            ReferenceOffer: offer_ref,
            ReferenceCustomer: customer_ref,
          }),
        ),
      ),
  );

  server.registerTool(
    "list_features",
    {
      title: "List the Features defined on the business",
      description:
        "Lists the ProAbono Features of the account: the definitions the business owns, each with " +
        "its type (OnOff, Limitation or Consumption). Read-only. These are what an application can " +
        "gate access on. A Feature is the definition; a customer's value for it is a Usage, read " +
        "with get_usages. Reads every page.",
      inputSchema: {
        visible_only: z.boolean().optional().describe("Only Features marked visible."),
      },
    },
    async ({ visible_only }): Promise<ToolResult> =>
      guard(async () => {
        const features = await client.listAll<Record<string, unknown>>("/v1/Features", {
          IsVisible: visible_only,
        });
        return json({ count: features.length, features });
      }),
  );

  server.registerTool(
    "get_customer",
    {
      title: "Retrieve one customer",
      description:
        "Retrieves a ProAbono customer by the reference shared with the merchant's application " +
        "(ReferenceCustomer), with the Links its hosted pages are opened from. Read-only. Use it to " +
        "check whether a logged-in user already exists as a ProAbono customer.",
      inputSchema: {
        customer_ref: z.string().min(1).describe("The customer's shared reference."),
        offer_ref: z
          .string()
          .optional()
          .describe("When given, the Links include a hosted subscription page for that offer."),
      },
    },
    async ({ customer_ref, offer_ref }): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.get("/v1/Customer", {
            ReferenceCustomer: customer_ref,
            ReferenceOffer: offer_ref,
          }),
        ),
      ),
  );

  server.registerTool(
    "list_subscriptions",
    {
      title: "List subscriptions",
      description:
        "Lists ProAbono subscriptions, optionally those of one customer, with their state and the " +
        "Features they carry. Read-only. Use it to see what a customer is actually subscribed to, " +
        "or to explain why a customer has no rights. Reads every page.",
      inputSchema: {
        customer_ref: z.string().optional().describe("Restrict to this customer's subscriptions."),
      },
    },
    async ({ customer_ref }): Promise<ToolResult> =>
      guard(async () => {
        const subscriptions = await client.listAll<Record<string, unknown>>("/v1/Subscriptions", {
          ReferenceCustomer: customer_ref,
        });
        return json({ count: subscriptions.length, subscriptions });
      }),
  );

  server.registerTool(
    "get_usages",
    {
      title: "Read a customer's rights",
      description:
        "Reads a customer's Usages: what that customer may do right now, as ProAbono sees it, one " +
        "entry per Feature carried by their running subscriptions. Read-only. This is the source an " +
        "application gates access on -- never the offer reference. An empty result is ambiguous: " +
        "check the customer's subscriptions with list_subscriptions before concluding they have no " +
        "rights.",
      inputSchema: {
        customer_ref: z.string().min(1).describe("The customer's shared reference."),
        feature_ref: z.string().optional().describe("Restrict to one Feature reference."),
      },
    },
    async ({ customer_ref, feature_ref }): Promise<ToolResult> =>
      guard(async () => {
        const usages = await client.listAll<Record<string, unknown>>("/v1/Usages", {
          ReferenceCustomer: customer_ref,
          ReferenceFeature: feature_ref,
        });

        return json({
          count: usages.length,
          usages,
          note:
            usages.length === 0
              ? "No Usage came back. That is not proof of an integration bug: the customer may never " +
                "have subscribed, may have no running subscription, or may be on an offer carrying no " +
                "Feature. Read list_subscriptions before concluding."
              : "An absent QuantityCurrent means unlimited, not zero. For an OnOff Feature, enforce " +
                "IsEnabled, not IsIncluded.",
        });
      }),
  );
}
