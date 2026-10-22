// Fails the build if the Worker's copy of NEXT_PUBLIC_* values (wrangler.jsonc "define"/"vars") drifts from
// .env.production, which is what the static site is built with.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.production", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const w = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));
const want = (k) => (env[k] ? JSON.stringify(env[k]) : "undefined");
const bad = [];
for (const k of ["NEXT_PUBLIC_SHERWOOD_ROUTER", "NEXT_PUBLIC_WOOD_TOKEN", "NEXT_PUBLIC_RPC_URL"]) {
  if (w.define[`process.env.${k}`] !== want(k)) bad.push(`${k}: .env.production=${want(k)} wrangler define=${w.define[`process.env.${k}`]}`);
}
if ((env.NEXT_PUBLIC_SHERWOOD_ROUTER || "") !== w.vars.SHERWOOD_ROUTER) bad.push(`SHERWOOD_ROUTER var ${w.vars.SHERWOOD_ROUTER} != ${env.NEXT_PUBLIC_SHERWOOD_ROUTER}`);
if (bad.length) {
  console.error("wrangler.jsonc is out of sync with .env.production:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log("env sync OK (site and agent API use the same addresses)");
