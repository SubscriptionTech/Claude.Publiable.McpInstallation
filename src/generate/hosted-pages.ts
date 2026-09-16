/**
 * Code generation for In-Site Step 1 -- the hosted pages.
 *
 * Every snippet here follows `in-site-installation.md`, which is the source of truth for the
 * hosted pages; the API contract says nothing about them. Four rules are carried into every
 * flavour, because each is a way the integration silently breaks:
 *
 *  - the security hash is HMAC-SHA256, portal secret as key, customer reference as message,
 *    lowercase hex, computed server-side on every render and never cached across users;
 *  - the customer reference comes from the session, never from the request;
 *  - `business_id`, `segment_ref` and both secrets are read from configuration, never inlined;
 *  - `customer_lang`, `customer_name` and `customer_meta` overwrite what is stored on the
 *    Customer, so they are passed only where the application is the authority for them.
 */

export type Stack =
  | "node-express"
  | "next"
  | "php"
  | "python"
  | "ruby"
  | "csharp"
  | "generic";

export const STACKS: readonly Stack[] = [
  "node-express",
  "next",
  "php",
  "python",
  "ruby",
  "csharp",
  "generic",
];

/** The server-side hash computation, in the idiom of the host language. */
export function hashSnippet(stack: Stack): string {
  switch (stack) {
    case "node-express":
    case "next":
    case "generic":
      return [
        'import crypto from "node:crypto";',
        "",
        "// key: the portal secret. message: the customer reference. Lowercase hex output.",
        "export function computeProAbonoHash(customerRef) {",
        '  return crypto',
        '    .createHmac("sha256", process.env.PROABONO_PORTAL_SECRET)',
        "    .update(customerRef)",
        '    .digest("hex");',
        "}",
      ].join("\n");

    case "php":
      return [
        "<?php",
        "// hash_hmac takes the MESSAGE first and the KEY second -- the opposite order of most",
        "// other languages. Swapping them yields a valid-looking hash that is always rejected.",
        "function compute_proabono_hash(string $customerRef): string",
        "{",
        "    return hash_hmac('sha256', $customerRef, getenv('PROABONO_PORTAL_SECRET'));",
        "}",
      ].join("\n");

    case "python":
      return [
        "import hashlib",
        "import hmac",
        "import os",
        "",
        "",
        "def compute_proabono_hash(customer_ref: str) -> str:",
        '    secret = os.environ["PROABONO_PORTAL_SECRET"]',
        "    return hmac.new(secret.encode(), customer_ref.encode(), hashlib.sha256).hexdigest()",
        "",
      ].join("\n");

    case "ruby":
      return [
        "require 'openssl'",
        "",
        "def compute_proabono_hash(customer_ref)",
        "  OpenSSL::HMAC.hexdigest('sha256', ENV.fetch('PROABONO_PORTAL_SECRET'), customer_ref)",
        "end",
      ].join("\n");

    case "csharp":
      return [
        "using System.Security.Cryptography;",
        "using System.Text;",
        "",
        "public static string ComputeProAbonoHash(string customerRef)",
        "{",
        "    var encoder = Encoding.UTF8;",
        '    var secret = Environment.GetEnvironmentVariable("PROABONO_PORTAL_SECRET")!;',
        "    using var hmac = new HMACSHA256(encoder.GetBytes(secret));",
        "",
        "    // Convert.ToHexString returns UPPERCASE hex; ProAbono compares case-sensitively.",
        "    return Convert.ToHexString(hmac.ComputeHash(encoder.GetBytes(customerRef)))",
        "                  .ToLowerInvariant();",
        "}",
      ].join("\n");
  }
}

/** The route or controller that renders the page, with the values the template needs. */
export function renderSnippet(stack: Stack, targetPage: string): string {
  switch (stack) {
    case "node-express":
      return [
        `// Express handler for ${targetPage}.`,
        `app.get("${targetPage}", requireAuth, (req, res) => {`,
        "  const customerRef = `cust-${req.user.id}`; // from the session, never from the request",
        "",
        '  res.render("proabono-portal", {',
        "    businessId: process.env.PROABONO_BUSINESS_ID,",
        "    segmentRef: process.env.PROABONO_SEGMENT_REF,",
        "    customerRef,",
        "    hash: computeProAbonoHash(customerRef),",
        "  });",
        "});",
      ].join("\n");

    case "next":
      return [
        `// app${targetPage}/page.tsx -- a Server Component: the hash never reaches the client bundle.`,
        'import { getSession } from "@/lib/session";',
        'import { computeProAbonoHash } from "@/lib/proabono";',
        'import ProAbonoPortal from "./proabono-portal";',
        "",
        "export default async function BillingPage() {",
        "  const session = await getSession();",
        "  const customerRef = `cust-${session.userId}`; // from the session, never from the request",
        "",
        "  return (",
        "    <ProAbonoPortal",
        "      businessId={process.env.PROABONO_BUSINESS_ID!}",
        "      segmentRef={process.env.PROABONO_SEGMENT_REF!}",
        "      customerRef={customerRef}",
        "      hash={computeProAbonoHash(customerRef)}",
        "    />",
        "  );",
        "}",
      ].join("\n");

    case "php":
      return [
        "<?php",
        `// Controller for ${targetPage}.`,
        "require_login();",
        "",
        "$customerRef = 'cust-' . current_user_id(); // from the session, never from the request",
        "",
        "render('proabono-portal', [",
        "    'businessId'  => getenv('PROABONO_BUSINESS_ID'),",
        "    'segmentRef'  => getenv('PROABONO_SEGMENT_REF'),",
        "    'customerRef' => $customerRef,",
        "    'hash'        => compute_proabono_hash($customerRef),",
        "]);",
      ].join("\n");

    case "python":
      return [
        `# View for ${targetPage}.`,
        "import os",
        "",
        "",
        `@app.route("${targetPage}")`,
        "@login_required",
        "def proabono_portal():",
        '    customer_ref = f"cust-{current_user.id}"  # from the session, never from the request',
        "",
        "    return render_template(",
        '        "proabono_portal.html",',
        '        business_id=os.environ["PROABONO_BUSINESS_ID"],',
        '        segment_ref=os.environ["PROABONO_SEGMENT_REF"],',
        "        customer_ref=customer_ref,",
        "        hash=compute_proabono_hash(customer_ref),",
        "    )",
      ].join("\n");

    case "ruby":
      return [
        `# Controller action for ${targetPage}.`,
        "class ProAbonoPortalController < ApplicationController",
        "  before_action :authenticate_user!",
        "",
        "  def show",
        '    @customer_ref = "cust-#{current_user.id}" # from the session, never from the request',
        "    @business_id  = ENV.fetch('PROABONO_BUSINESS_ID')",
        "    @segment_ref  = ENV.fetch('PROABONO_SEGMENT_REF')",
        "    @hash         = compute_proabono_hash(@customer_ref)",
        "  end",
        "end",
      ].join("\n");

    case "csharp":
      return [
        `// Razor Page model for ${targetPage}.`,
        "[Authorize]",
        "public class ProAbonoPortalModel : PageModel",
        "{",
        "    public string BusinessId { get; private set; } = string.Empty;",
        "    public string SegmentRef { get; private set; } = string.Empty;",
        "    public string CustomerRef { get; private set; } = string.Empty;",
        "    public string Hash { get; private set; } = string.Empty;",
        "",
        "    public void OnGet()",
        "    {",
        "        // from the signed-in principal, never from the request",
        '        CustomerRef = $"cust-{User.FindFirstValue(ClaimTypes.NameIdentifier)}";',
        '        BusinessId = Environment.GetEnvironmentVariable("PROABONO_BUSINESS_ID")!;',
        '        SegmentRef = Environment.GetEnvironmentVariable("PROABONO_SEGMENT_REF")!;',
        "        Hash = ComputeProAbonoHash(CustomerRef);",
        "    }",
        "}",
      ].join("\n");

    case "generic":
      return [
        `# Server-side render of ${targetPage}, in whatever language the project uses.`,
        "#",
        "# 1. Refuse the request unless a user is signed in.",
        "# 2. Derive customerRef from the session -- never from the query string, a form field or a cookie",
        "#    the visitor controls.",
        "# 3. Read PROABONO_BUSINESS_ID and PROABONO_SEGMENT_REF from configuration.",
        "# 4. Compute the hash server-side for this request, with the portal secret from configuration.",
        "# 5. Pass the four values to the template below. Do not cache the rendered page across users.",
      ].join("\n");
  }
}

export interface PortalTemplateOptions {
  /** `false` renders the anonymous pricing table: no customer reference, and so no hash. */
  readonly identified: boolean;
  /** Passes `customer_lang`. Only where the application is the authority for the language. */
  readonly passLanguage?: boolean;
  /** Opens a specific workflow from an encrypted query read out of an object's Links. */
  readonly withQuery?: boolean;
}

/** The three-line install: the script, the container and the call. */
export function templateSnippet(options: PortalTemplateOptions): string {
  const lines = [
    '<script src="https://portal.proabono.com/Get/portal.js"></script>',
    "",
    '<div id="proabono_portal">loading...</div>',
    "",
    "<script>",
    "  ProAbonoPortal.open({",
    "    business_id: {{businessId}},",
    '    segment_ref: "{{segmentRef}}",',
  ];

  if (options.identified) {
    lines.push('    customer_ref: "{{customerRef}}",');
    if (options.passLanguage === true) lines.push('    customer_lang: "{{userLanguage}}",');
    if (options.withQuery === true) lines.push('    query: "{{query}}",');
    lines.push('    hash: "{{hash}}",');
  }

  lines.push("  });", "</script>");
  return lines.join("\n");
}

/** The checks a local server cannot run for want of a browser, handed to the developer instead. */
export const MANUAL_CHECKS: readonly string[] = [
  "Open the page signed in as one customer, then as another: the portal must show each one their own data.",
  "View the page source and confirm the hash differs between the two, and that the portal secret appears nowhere.",
  "Tamper with the customer reference in the rendered page: ProAbono must refuse to open.",
  "Confirm the page is not served from a shared cache -- a cached hash belongs to whoever rendered it first.",
  "In the browser console, confirm portal.js loaded before ProAbonoPortal.open() ran and that #proabono_portal exists.",
];
