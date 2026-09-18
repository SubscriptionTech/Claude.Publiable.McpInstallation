/**
 * Runs the compiled test suite, on every Node version `engines` claims.
 *
 * `node --test` takes its argument differently across those versions: Node 20 expands a directory
 * and rejects a glob, Node 22 and later expand a glob and reject a directory. A shell glob is not
 * an option either -- npm runs scripts through cmd.exe on Windows, which does not expand one. So
 * the file list is built here and passed explicitly, which every version accepts.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..", "build-test/tests");
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => join(directory, name));

if (files.length === 0) {
  process.stderr.write(`No compiled test file in ${directory}. Did the TypeScript build run?\n`);
  process.exit(1);
}

const { status } = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(status ?? 1);
