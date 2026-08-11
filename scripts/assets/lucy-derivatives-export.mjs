#!/usr/bin/env node
/** Deterministic P2/P3 Lucy cross-kit export. No model invocation. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('./lucy-derivatives-export.py', import.meta.url));
const result = spawnSync('python3', [helper], { cwd: process.cwd(), stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
