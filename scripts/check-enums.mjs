// Fails when packages/shared/src/enums.ts and the SQL enums in supabase/migrations disagree.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sql = readdirSync(join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8'))
  .join('\n');
const ts = readFileSync(join(root, 'packages/shared/src/enums.ts'), 'utf8');

const pairs = {
  appearance: 'APPEARANCES',
  content_type: 'CONTENT_TYPES',
  mode_preset: 'MODE_PRESETS',
  material_kind: 'MATERIAL_KINDS',
  material_status: 'MATERIAL_STATUSES',
  job_status: 'JOB_STATUSES',
  mastery_status: 'MASTERY_STATUSES',
};

const values = (body) => [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
let failed = false;
for (const [sqlName, tsName] of Object.entries(pairs)) {
  const s = sql.match(new RegExp(`create type public\\.${sqlName} as enum \\(([^;]+?)\\);`, 's'));
  const t = ts.match(new RegExp(`export const ${tsName} = \\[([^\\]]+)\\]`, 's'));
  if (!s || !t) {
    console.error(`missing definition for ${sqlName} / ${tsName}`);
    failed = true;
    continue;
  }
  const a = values(s[1]).join(',');
  const b = values(t[1]).join(',');
  if (a !== b) {
    console.error(`${sqlName} differs:\n  sql: ${a}\n  ts:  ${b}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`enums in sync (${Object.keys(pairs).length} checked)`);
