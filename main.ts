// Package this entry for make.fun's judge.
//
// The frontend lives in app/ as plain static files (ES modules and CSS, no build
// step) talking to make.fun's public API. This script checks that app/ and the
// screenshots/ captured from it fit the scorer's limits, copies both beside the
// output directory's own dossier.json, and writes that dossier with the vendored
// builder, so the judge can see the screenshots, the first load's file and byte
// counts, and the source. Leave vendor/makefun-frontend.ts untouched: the scorer
// compares dossier.json against the bytes its own copy of that file produces.
//
// Serve the frontend locally with `node serve.ts` (http://localhost:8080).
// Without the scorer's container, MAKEFUN_OUTPUT_DIR points the output elsewhere:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The scorer's caps. The screenshot caps and app_max_bytes refuse an entry the
// scorer would refuse; text_max_bytes is the amount of source the dossier keeps.
const LIMITS = {
  textMaxBytes: 163840,
  screenshotMax: 3,
  screenshotMaxBytes: 262144,
  appMaxFiles: 993,
  appMaxBytes: 16777216,
} as const;

/**
 * Walk a directory and count every entry in it (files and directories alike,
 * matching how the platform counts app/), summing the bytes of its files.
 */
function countEntries(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const stats = lstatSync(path);
      files++;
      if (stats.isDirectory()) pending.push(path);
      else if (stats.isFile()) bytes += stats.size;
    }
  }
  return { files, bytes };
}

/** The first file under dir that is larger than maxBytes, if any. */
function oversizedFile(dir: string, maxBytes: number): { path: string; bytes: number } | undefined {
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const stats = lstatSync(path);
      if (stats.isDirectory()) pending.push(path);
      else if (stats.isFile() && stats.size > maxBytes) return { path, bytes: stats.size };
    }
  }
  return undefined;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(here, 'app');
const shotsDir = join(here, 'screenshots');

// Refuse locally what the scorer would refuse, before copying anything.
const appTotals = countEntries(appDir);
if (appTotals.files > LIMITS.appMaxFiles) {
  throw new Error(`app/: ${appTotals.files} files and directories, over the ${LIMITS.appMaxFiles} allowed (app_max_files)`);
}
if (appTotals.bytes > LIMITS.appMaxBytes) {
  throw new Error(`app/: files come to ${appTotals.bytes} bytes, over the ${LIMITS.appMaxBytes} allowed (app_max_bytes)`);
}
if (existsSync(shotsDir)) {
  const shotTotals = countEntries(shotsDir);
  if (shotTotals.files > LIMITS.screenshotMax) {
    throw new Error(`screenshots/: ${shotTotals.files} entries, over the ${LIMITS.screenshotMax} allowed (screenshots.max)`);
  }
  const oversized = oversizedFile(shotsDir, LIMITS.screenshotMaxBytes);
  if (oversized) {
    throw new Error(`screenshots/${oversized.path.slice(shotsDir.length + 1)}: ${oversized.bytes} bytes, over the ${LIMITS.screenshotMaxBytes} allowed (screenshots.max_bytes)`);
  }
}

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(appDir, join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: LIMITS.textMaxBytes,
  screenshots: { max: LIMITS.screenshotMax, max_bytes: LIMITS.screenshotMaxBytes },
  app_max_files: LIMITS.appMaxFiles,
  app_max_bytes: LIMITS.appMaxBytes,
});
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(`wrote ${out}/dossier.json: app ${appTotals.files} entries / ${appTotals.bytes} bytes, dossier ${dossier.length} bytes`);
