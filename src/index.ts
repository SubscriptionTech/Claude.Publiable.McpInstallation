#!/usr/bin/env node
/**
 * ProAbono MCP Installation — a local MCP server, spoken over stdio.
 *
 * stdout carries the JSON-RPC stream and nothing else: anything this process has to say
 * goes to stderr. A stray console.log() here corrupts every message the client reads.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CONFIGURATION_VARIABLES, ConfigurationError, loadConfiguration } from "./config.js";

const SERVER_NAME = "proabono-mcp-installation";
const SERVER_VERSION = "0.0.0";

async function main(): Promise<void> {
  // Fails before a single tool is served: a half-configured server is worse than one that
  // refuses to start, because the failure surfaces mid-installation instead of at launch.
  loadConfiguration();

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "get_server_info",
    {
      title: "ProAbono server info",
      description:
        "Reports the version of the ProAbono MCP Installation server and confirms that its ProAbono " +
        "configuration is complete. Returns variable names only — never a key, a secret or an " +
        "account identifier. Use it to check the server is reachable and configured before " +
        "running an installation.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              server: SERVER_NAME,
              version: SERVER_VERSION,
              configuration: {
                status: "complete",
                variables: CONFIGURATION_VARIABLES.map(({ name }) => name),
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `ProAbono MCP Installation stopped: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
