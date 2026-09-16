#!/usr/bin/env node
/**
 * ProAbono MCP Installation -- a local MCP server, spoken over stdio.
 *
 * stdout carries the JSON-RPC stream and nothing else: anything this process has to say goes to
 * stderr. A stray console.log() here corrupts every message the client reads.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ConfigurationError, loadConfiguration } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  // Fails before a single tool is served: a half-configured server is worse than one that
  // refuses to start, because the failure surfaces mid-installation instead of at launch.
  const configuration = loadConfiguration();

  await createServer(configuration).connect(new StdioServerTransport());
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
