#!/usr/bin/env node
/**
 * Deterministic export launcher for the GEN-01 and GEN-02 Lucy masters.
 *
 * Run from repository root:
 *   node scripts/assets/lucy-gen01-02-export.mjs
 *
 * The pixel implementation is kept in the adjacent Pillow helper because this
 * workspace deliberately has no installed Sharp dependency. No image model is
 * invoked by either script.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('./lucy-gen01-02-export.py', import.meta.url));
const result = spawnSync('python3', [helper], { cwd: process.cwd(), stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
