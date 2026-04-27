#!/usr/bin/env node
/**
 * Standalone env validation. Loads the project-root .env (same path main.ts
 * uses) and prints a console-friendly report. Exits non-zero on missing
 * required vars or on production safety violations, so console-integration
 * tooling can use this as a pre-deploy gate without booting Nest.
 *
 * Usage:
 *   npm run check:env                # backend dir
 *   NODE_ENV=production node dist/scripts/check-env.js
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { checkRequiredEnv, REQUIRED_ENV_VARS } from '../src/common/env';

function main(): number {
  const result = checkRequiredEnv(process.env);

  // Always print the matrix so a CI run / console operator sees what was
  // checked, not just the first failure.
  console.log('TGP Finance — env check');
  console.log(`NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  console.log('Required:');
  for (const k of REQUIRED_ENV_VARS) {
    console.log(`  ${process.env[k] ? 'ok' : 'MISSING'}  ${k}`);
  }

  if (result.warnings.length) {
    console.log('Warnings:');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }

  if (result.missing.length) {
    console.error(`\nFAIL: missing ${result.missing.length} required var(s)`);
    return 1;
  }

  const fatalWarning = result.warnings.find((w) => w.includes('not permitted'));
  if (fatalWarning) {
    console.error(`\nFAIL: ${fatalWarning}`);
    return 1;
  }

  console.log('\nOK');
  return 0;
}

process.exit(main());
