#!/usr/bin/env node
/**
 * Creates a local `.env` from `.env.example` and fills in freshly generated
 * secrets. Safe to run repeatedly: an existing `.env` is never overwritten,
 * but blank required secrets inside it are filled in.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

const GENERATORS = {
  ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
  SESSION_SECRET: () => randomBytes(48).toString('base64'),
};

function fillSecrets(contents) {
  let next = contents;
  const filled = [];
  for (const [key, generate] of Object.entries(GENERATORS)) {
    const pattern = new RegExp(`^${key}\\s*=\\s*"?\\s*"?\\s*$`, 'm');
    if (pattern.test(next)) {
      next = next.replace(pattern, `${key}="${generate()}"`);
      filled.push(key);
    } else if (!new RegExp(`^${key}=`, 'm').test(next)) {
      next += `\n${key}="${generate()}"\n`;
      filled.push(key);
    }
  }
  return { next, filled };
}

if (!existsSync(examplePath)) {
  console.error('[setup-env] .env.example is missing — cannot bootstrap the environment.');
  process.exit(1);
}

if (!existsSync(envPath)) {
  const { next, filled } = fillSecrets(readFileSync(examplePath, 'utf8'));
  writeFileSync(envPath, next, { mode: 0o600 });
  console.log(`[setup-env] Created .env with generated secrets: ${filled.join(', ')}`);
} else {
  const { next, filled } = fillSecrets(readFileSync(envPath, 'utf8'));
  if (filled.length > 0) {
    writeFileSync(envPath, next, { mode: 0o600 });
    console.log(`[setup-env] Filled blank secrets in existing .env: ${filled.join(', ')}`);
  } else {
    console.log('[setup-env] .env already present and complete — leaving it untouched.');
  }
}
