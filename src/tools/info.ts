/**
 * The server's own status.
 *
 * It reports that the configuration is complete and names the variables it read. It never reports
 * a value, and never says which account or which environment those values open: the credentials
 * are the only boundary, and this server does not classify them.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CONFIGURATION_VARIABLES } from "../config.js";
import { json } from "./context.js";

export function registerInfoTool(server: McpServer, version: string): void {
  server.registerTool(
    "get_server_info",
    {
      title: "ProAbono server info",
      description:
        "Reports the version of the ProAbono MCP Installation server and confirms that its ProAbono " +
        "configuration is complete. Returns variable names only -- never a key, a secret or an " +
        "account identifier. Use it to check the server is reachable and configured before running " +
        "an installation.",
      inputSchema: {},
    },
    async () =>
      json({
        server: "proabono-mcp-installation",
        version,
        configuration: {
          status: "complete",
          variables: CONFIGURATION_VARIABLES.map(({ name }) => name),
        },
      }),
  );
}
