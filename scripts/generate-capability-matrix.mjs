#!/usr/bin/env node
/**
 * Regenerates docs/capability-matrix.md from the capability registry.
 *
 * The document is generated rather than hand-written so it can never drift from
 * what the code actually does — which would defeat its entire purpose.
 *
 * Usage: npm run docs:capabilities  (runs through tsx so the TypeScript registry can be imported)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { CAPABILITY_LIST, CAPABILITY_GROUPS, allUsefulScopes, MINIMUM_READ_SCOPES } = await import(
  resolve(root, 'src/lib/commerce/capability-registry.ts')
);
const { CAPABILITY_STATUS_LABELS } = await import(resolve(root, 'src/lib/enums.ts'));

const STATUS_MEANING = {
  AVAILABLE: 'Implemented and usable, subject to the required scope being granted.',
  READ_ONLY: 'Can be read but not modified by this platform.',
  PERMISSION_MISSING: 'The API account lacks the required OAuth scope.',
  PLAN_DEPENDENT: 'Depends on a BigCommerce plan entitlement the store may not have.',
  MANUAL_ACTION: 'Deliberately not automated. Recorded as a checklist item with the reason.',
  NOT_SUPPORTED: 'BigCommerce exposes no public API for this. It will never become available.',
  NOT_IMPLEMENTED: 'BigCommerce supports it; this release does not. See Known limitations.',
};

const counts = new Map();
for (const capability of CAPABILITY_LIST) {
  counts.set(capability.defaultStatus, (counts.get(capability.defaultStatus) ?? 0) + 1);
}

const lines = [];

lines.push('# Capability matrix');
lines.push('');
lines.push(
  '> **Generated from `src/lib/commerce/capability-registry.ts`.** Do not edit by hand — run',
  '> `npm run docs:capabilities` instead. It is generated so it can never drift from what the code does,',
  '> which would defeat the point of having it.',
);
lines.push('');
lines.push(
  'Every manageable operation, what this platform can actually do with it today, and why when the answer is',
  '"not much". A capability is only ever shown as **Available** when it is implemented, the required OAuth',
  'scope is granted, and the store supports it.',
);
lines.push('');

lines.push('## Status meanings');
lines.push('');
lines.push('| Status | Count | Meaning |');
lines.push('| --- | --- | --- |');
for (const [status, meaning] of Object.entries(STATUS_MEANING)) {
  lines.push(`| **${CAPABILITY_STATUS_LABELS[status]}** | ${counts.get(status) ?? 0} | ${meaning} |`);
}
lines.push('');
lines.push(`Total capabilities tracked: **${CAPABILITY_LIST.length}**.`);
lines.push('');

lines.push('## Minimum read scopes');
lines.push('');
lines.push('Grant at least these for the verified read-only feature set:');
lines.push('');
for (const scope of MINIMUM_READ_SCOPES) {
  lines.push(`- \`${scope}\``);
}
lines.push('');

for (const group of CAPABILITY_GROUPS) {
  const capabilities = CAPABILITY_LIST.filter((capability) => capability.group === group);
  if (capabilities.length === 0) continue;

  lines.push(`## ${group}`);
  lines.push('');
  lines.push('| Capability | Status | Required scope | API surface | Per-channel | Reversible |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const capability of capabilities) {
    lines.push(
      `| ${capability.label} | ${CAPABILITY_STATUS_LABELS[capability.defaultStatus]} | ${
        capability.requiredScope ? `\`${capability.requiredScope}\`` : '—'
      } | ${capability.apiSurface} | ${capability.channelApplicable ? 'Yes' : 'No'} | ${
        capability.isWrite ? (capability.isReversible ? 'Yes' : 'No') : 'n/a'
      } |`,
    );
  }
  lines.push('');

  for (const capability of capabilities) {
    lines.push(`### ${capability.label}`);
    lines.push('');
    lines.push(capability.description);
    lines.push('');
    if (capability.unavailableReason) {
      lines.push(`**Why it is ${CAPABILITY_STATUS_LABELS[capability.defaultStatus].toLowerCase()}:** ${capability.unavailableReason}`);
      lines.push('');
    }
    lines.push(`**Note:** ${capability.note}`);
    lines.push('');
    if (capability.planDependency) {
      lines.push(`**Plan dependency:** ${capability.planDependency}`);
      lines.push('');
    }
  }
}

lines.push('## Every scope this platform can use');
lines.push('');
lines.push('| Scope | Used by |');
lines.push('| --- | --- |');
for (const entry of allUsefulScopes()) {
  lines.push(`| \`${entry.scope}\` | ${entry.usedBy.join(', ')} |`);
}
lines.push('');
lines.push(
  'Scope names come from the BigCommerce',
  '[API accounts documentation](https://docs.bigcommerce.com/docs/start/authentication/api-accounts).',
  'A capability with no scope listed has no public API at all.',
);
lines.push('');

writeFileSync(resolve(root, 'docs/capability-matrix.md'), `${lines.join('\n')}\n`);
console.log(`Wrote docs/capability-matrix.md (${CAPABILITY_LIST.length} capabilities)`);
