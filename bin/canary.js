#!/usr/bin/env node
import { existsSync } from "node:fs";

try {
  const development = process.env.CANARY_DEV === "1";
  const runtime = new URL(development ? "../src/cli/entry.ts" : "../dist/cli/entry.js", import.meta.url);
  if (!development && !existsSync(runtime)) throw new Error("Built CLI is missing.");
  await import(runtime.href);
} catch {
  process.stderr.write("Canary could not start. Use Node.js 22.22 or later.\n");
  process.exitCode = 1;
}
