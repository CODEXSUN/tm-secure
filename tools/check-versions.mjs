#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8"));
const changelog = readFileSync(resolve(ROOT, "assist", "documentation", "CHANGELOG.md"), "utf8");
const version = String(pkg.version);
const required = [`Current version: ${version}`, `Release tag: v-${version}`, `Changelog label: v ${version}`, `## v-${version}`];
const failures = [lock.version !== version && "package-lock version", lock.packages?.[""]?.version !== version && "package-lock root version", ...required.filter((entry) => !changelog.includes(entry)).map((entry) => `changelog: ${entry}`)].filter(Boolean);
if (failures.length) { console.error(`Version check failed for ${version}:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`Version check passed for ${version}.`);
