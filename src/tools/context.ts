/**
 * What every tool is handed: the configuration and the API client built from it.
 *
 * Tools never read `process.env` themselves — the configuration is loaded once, at startup, so a
 * missing variable stops the server rather than surfacing halfway through an installation.
 */
import type { ProAbonoClient } from "../api/client.js";
import type { ProAbonoConfiguration } from "../config.js";

export interface ToolContext {
  readonly configuration: ProAbonoConfiguration;
  readonly client: ProAbonoClient;
}

/** The shape the MCP SDK expects back from a tool: text blocks, plus an open set of extras. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** A tool answer carrying structured data. */
export function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** A tool answer carrying prose or generated code. */
export function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

/** A tool answer the model must treat as a failure, with the reason the developer needs. */
export function failure(value: string): ToolResult {
  return { content: [{ type: "text", text: value }], isError: true };
}
