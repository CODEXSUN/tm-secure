#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CHANGELOG = resolve(ROOT, "assist", "documentation", "CHANGELOG.md");

function readPackage() { return JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")); }
function nextPatch(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
	if (!match) throw new Error(`Unsupported version format: ${version}`);
	return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

if (process.argv.includes("--show")) {
	console.log(readPackage().version);
	process.exit(0);
}

const titleIndex = process.argv.findIndex((argument) => argument === "--title");
const title = titleIndex >= 0 ? process.argv[titleIndex + 1] ?? "version update" : "version update";
const current = String(readPackage().version);
const next = nextPatch(current);
const packageFile = resolve(ROOT, "package.json");
const lockFile = resolve(ROOT, "package-lock.json");
const packageJson = readPackage();
const lock = JSON.parse(readFileSync(lockFile, "utf8"));
packageJson.version = next;
lock.version = next;
lock.packages[""] = { ...lock.packages[""], version: next };
writeJson(packageFile, packageJson);
writeJson(lockFile, lock);

const now = new Date();
const hours = now.getHours();
const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")} ${hours >= 12 ? "pm" : "am"}`;
let changelog = readFileSync(CHANGELOG, "utf8")
	.replace(/Current version: .*/u, `Current version: ${next}`)
	.replace(/Release tag: .*/u, `Release tag: v-${next}`)
	.replace(/Changelog label: .*/u, `Changelog label: v ${next}`);
const entry = `## v-${next}\n\n### [v ${next}] ${timestamp} - ${title}\n\n#### Database Changes\n\n- Database update: No (manual).\n\n#### App Codebase Changes\n\n- Bumped workspace version to ${next}.\n\n`;
changelog = changelog.replace(/(?=## v-)/u, entry);
writeFileSync(CHANGELOG, changelog, "utf8");
console.log(`Bumped ${current} -> ${next}`);
