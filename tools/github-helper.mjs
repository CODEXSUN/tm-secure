#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const changelog = readFileSync(resolve(ROOT, "assist", "documentation", "CHANGELOG.md"), "utf8");
const match = /^### \[v (\d+\.\d+\.(\d+))\].+ - (.+)$/mu.exec(changelog);
if (!match) throw new Error("Could not read the latest versioned changelog entry.");
const subject = `#${match[2]} - ${match[3]}`;
const files = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split(/\r?\n/u).filter(Boolean);
console.log(`Changelog version: ${match[1]}\nCommit subject: ${subject}\nUncommitted: ${files.length}`);
if (process.argv.includes("--dry-run")) process.exit(0);
console.log("Use the reviewed subject with git commit after the release checks pass.");
