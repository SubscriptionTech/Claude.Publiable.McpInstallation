/**
 * Writes against the account the credentials open.
 *
 * These create and change real records. Nothing they do is simulated, which is why the tools are
 * named `create_…` and `update_…` rather than `create_test_…`. They are marked as writes in their
 * descriptions and run without asking the developer to confirm (spec section 8) -- that is about
 * the MCP not prompting the developer, and says nothing about the confirmation the generated code
 * must ask of the end customer before a billable change.
 *
 * No destructive operation is exposed here: no anonymization, no deletion, no link revocation.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { json, type ToolContext, type ToolResult } from "./context.js";
import { guard } from "./guard.js";

const metadata = z
  .record(z.string(), z.string())
  .optional()
  .describe("Free key/value pairs stored on the record. At most 5 keys, 450 characters per value.");

export function registerWriteTools(server: McpServer, context: ToolContext): void {
  const { client, configuration } = context;

  server.registerTool(
    "create_customer",
    {
      title: "Create a ProAbono customer (write)",
      description:
        "WRITE. Creates a ProAbono customer in the configured Segment, keyed by the reference the " +
        "merchant's application uses for the logged-in user. The endpoint is an upsert on that " +
        "reference: if a customer with it already exists, this updates them instead of failing. " +
        "Provisioning the customer early -- at sign-up or first login -- is the recommended path, " +
        "because the hosted pages and the rights read both need the customer to exist.",
      inputSchema: {
        customer_ref: z
          .string()
          .min(1)
          .describe("Shared reference, derived from the application's user identifier."),
        email: z.string().optional().describe("The customer's email address."),
        name: z.string().optional().describe("Internal name, shown in the BackOffice."),
        language: z.string().optional().describe("ISO 639 language code, e.g. \"en\"."),
        metadata,
      },
    },
    async ({ customer_ref, email, name, language, metadata: meta }): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.post("/v1/Customer", {
            body: {
              ReferenceCustomer: customer_ref,
              ReferenceSegment: configuration.segmentRef,
              Email: email,
              Name: name,
              Language: language,
              Metadata: meta,
            },
          }),
        ),
      ),
  );

  server.registerTool(
    "update_customer",
    {
      title: "Update a ProAbono customer (write)",
      description:
        "WRITE. Updates a ProAbono customer identified by its shared reference. The endpoint is an " +
        "upsert: if no customer carries that reference, one is created rather than an error raised. " +
        "Only the fields passed are changed. Do not pass a field the merchant's application is not " +
        "the authority for -- the hosted pages let the customer edit their own name and language, " +
        "and this overwrites what they set.",
      inputSchema: {
        customer_ref: z.string().min(1).describe("Shared reference of the customer to update."),
        email: z.string().optional().describe("The customer's email address."),
        name: z.string().optional().describe("Internal name, shown in the BackOffice."),
        language: z.string().optional().describe("ISO 639 language code."),
        metadata,
      },
    },
    async ({ customer_ref, email, name, language, metadata: meta }): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.post("/v1/Customer", {
            body: {
              ReferenceCustomer: customer_ref,
              ReferenceSegment: configuration.segmentRef,
              Email: email,
              Name: name,
              Language: language,
              Metadata: meta,
            },
          }),
        ),
      ),
  );

  server.registerTool(
    "update_billing_address",
    {
      title: "Update a customer's billing address (write)",
      description:
        "WRITE. Updates the billing address of a ProAbono customer. Only the fields passed are " +
        "changed. The address is what invoices are issued against, and the tax identifier is what " +
        "VAT treatment is derived from, so it must be the customer's own data -- never a placeholder.",
      inputSchema: {
        customer_ref: z.string().min(1).describe("Shared reference of the customer."),
        company: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        address_line1: z.string().optional(),
        address_line2: z.string().optional(),
        zip_code: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional().describe("ISO 3166-1 alpha-2 country code, e.g. \"FR\"."),
        region: z.string().optional().describe("Region, state or province."),
        phone: z.string().optional(),
        tax_information: z.string().optional().describe("VAT or other tax identifier."),
      },
    },
    async (input): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.post("/v1/CustomerAddressBilling", {
            query: { ReferenceCustomer: input.customer_ref },
            body: {
              Company: input.company,
              FirstName: input.first_name,
              LastName: input.last_name,
              AddressLine1: input.address_line1,
              AddressLine2: input.address_line2,
              ZipCode: input.zip_code,
              City: input.city,
              Country: input.country,
              Region: input.region,
              Phone: input.phone,
              TaxInformation: input.tax_information,
            },
          }),
        ),
      ),
  );

  server.registerTool(
    "create_subscription",
    {
      title: "Subscribe a customer to an offer (write)",
      description:
        "WRITE. Creates a ProAbono subscription linking an existing customer to an offer. This is " +
        "the API path; a customer choosing a plan themselves goes through a hosted subscription " +
        "workflow instead. The subscription is created as a copy of the offer -- pass an override " +
        "only where the merchant genuinely departs from their own catalogue. Set start_now to " +
        "activate it immediately; a subscription left in Draft grants no rights.",
      inputSchema: {
        customer_ref: z.string().min(1).describe("Shared reference of the customer who receives it."),
        offer_ref: z.string().min(1).describe("Shared reference of the offer to subscribe to."),
        buyer_customer_ref: z
          .string()
          .optional()
          .describe("Shared reference of the customer who pays, when it is not the recipient."),
        start_now: z
          .boolean()
          .optional()
          .describe("Attempt to start the subscription immediately after creation."),
        bill_now: z.boolean().optional().describe("Trigger billing immediately after starting."),
        ensure_billable: z
          .boolean()
          .optional()
          .describe("Check the customer can be billed before creating the subscription."),
        metadata,
      },
    },
    async (input): Promise<ToolResult> =>
      guard(async () =>
        json(
          await client.post("/v1/Subscription", {
            query: {
              TryStart: input.start_now,
              BillNow: input.bill_now,
              EnsureBillable: input.ensure_billable,
            },
            body: {
              ReferenceCustomer: input.customer_ref,
              ReferenceOffer: input.offer_ref,
              ReferenceCustomerBuyer: input.buyer_customer_ref,
              Metadata: input.metadata,
            },
          }),
        ),
      ),
  );

  server.registerTool(
    "change_subscription",
    {
      title: "Change the state of a subscription (write)",
      description:
        "WRITE. Moves an existing ProAbono subscription: upgrade or downgrade it to another offer, " +
        "start a draft one, suspend it, or terminate it. Identify the subscription by its internal " +
        "identifier, which list_subscriptions returns. Terminating is not an immediate loss of " +
        "access unless immediate is set -- by default it takes effect at the end of the current term. " +
        "An upgrade terminates the current subscription and creates a new one on the target offer, so " +
        "the customer's rights change: re-read them afterwards with get_usages.",
      inputSchema: {
        subscription_id: z
          .number()
          .int()
          .describe("Internal identifier of the subscription (Id, from list_subscriptions)."),
        action: z
          .enum(["upgrade", "start", "suspend", "terminate"])
          .describe("What to do with the subscription."),
        offer_ref: z
          .string()
          .optional()
          .describe("Target offer reference. Required for an upgrade, ignored otherwise."),
        immediate: z
          .boolean()
          .optional()
          .describe("For upgrade and terminate: act now instead of at the end of the term."),
        bill_now: z.boolean().optional().describe("Trigger billing immediately, where applicable."),
      },
    },
    async ({ subscription_id, action, offer_ref, immediate, bill_now }): Promise<ToolResult> =>
      guard(async () => {
        if (action === "upgrade" && (offer_ref === undefined || offer_ref.length === 0)) {
          throw new Error("An upgrade needs offer_ref: the reference of the offer to move to.");
        }

        const path = {
          upgrade: "/v1/Subscription/{IdSubscription}/Upgrade",
          start: "/v1/Subscription/{IdSubscription}/Start",
          suspend: "/v1/Subscription/{IdSubscription}/Suspension",
          terminate: "/v1/Subscription/{IdSubscription}/Termination",
        }[action];

        const query: Record<string, string | number | boolean | undefined> = {
          IdSubscription: subscription_id,
        };
        if (action === "upgrade") {
          query["ReferenceOffer"] = offer_ref;
          query["Immediate"] = immediate;
          query["BillNow"] = bill_now;
        }
        if (action === "terminate") query["Immediate"] = immediate;
        if (action === "start") query["BillNow"] = bill_now;

        return json(await client.post(path, { query }));
      }),
  );
}
