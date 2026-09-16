/**
 * Assembles the server: one place where every tool the developer can reach is registered.
 *
 * The exposed surface is deliberately short (spec section 8, least privilege). Nothing
 * destructive is here: the contract's anonymization, invalidation, suspension of a customer and
 * link revocation endpoints exist, and are not exposed, in any account.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ProAbonoClient } from "./api/client.js";
import type { ProAbonoConfiguration } from "./config.js";
import type { ToolContext } from "./tools/context.js";
import { registerDocumentationTools } from "./tools/documentation.js";
import { registerHostedPageTools } from "./tools/hosted-pages.js";
import { registerInfoTool } from "./tools/info.js";
import { registerIntrospectionTools } from "./tools/introspection.js";
import { registerWriteTools } from "./tools/writes.js";

export const SERVER_NAME = "proabono-mcp-installation";
export const SERVER_VERSION = "0.1.0";

export function createServer(
  configuration: ProAbonoConfiguration,
  options: { client?: ProAbonoClient } = {},
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const context: ToolContext = {
    configuration,
    client: options.client ?? new ProAbonoClient(configuration),
  };

  registerInfoTool(server, SERVER_VERSION);
  registerDocumentationTools(server);
  registerIntrospectionTools(server, context);
  registerWriteTools(server, context);
  registerHostedPageTools(server, context);

  return server;
}
