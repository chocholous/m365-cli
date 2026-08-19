#!/usr/bin/env bun
// Standalone contract check: `npm run contract`
import { checkContract, reportAndExit, installedVersion } from './lib/contract.mjs';
const v = installedVersion();
const bad = await checkContract();
if (bad.length) reportAndExit(bad, v);
console.log(`contract OK against @pnp/cli-microsoft365 ${v}`);
