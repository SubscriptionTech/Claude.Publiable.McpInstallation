/**
 * Vendors the two sources of truth into the build output.
 *
 * The published package ships `dist/` and nothing else (publication plan, Phase A), so the
 * OpenAPI contract and the installation documentation cannot be read from `specs/` at run time.
 * They are copied into `dist/resources/` at build time instead: the YAML contract as JSON, so the
 * runtime needs no YAML parser, and the docs verbatim.
 *
 * Both sources live in this repository. The contract is a copy of the one maintained in
 * `SubscriptionTech/Claude.SharedApi.ProAbonoLive`, refreshed by hand -- see
 * `specs/open-api/index.md`. Nothing in the build reaches outside this repository, so a clone
 * builds anywhere, with no credential.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const openApiSource = join(root, "specs/open-api/pa-live-openapi-3.0.3.yaml");
const docsSource = join(root, "specs/mcp-installation-docs");
const target = resolve(root, process.argv[2] ?? "dist/resources");

mkdirSync(join(target, "docs"), { recursive: true });

const contract = parse(readFileSync(openApiSource, "utf8"));
writeFileSync(join(target, "openapi.json"), JSON.stringify(contract), "utf8");

const docs = readdirSync(docsSource).filter((name) => name.endsWith(".md"));
for (const name of docs) {
  writeFileSync(join(target, "docs", name), readFileSync(join(docsSource, name), "utf8"), "utf8");
}

process.stderr.write(
  `vendored: openapi.json (${Object.keys(contract.paths).length} paths), ${docs.length} documentation files\n`,
);
