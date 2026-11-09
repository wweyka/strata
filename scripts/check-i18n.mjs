// Every locale must have exactly the English keys (plus the extra plural forms its language needs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const dir = new URL('../apps/app/src/i18n/locales/', import.meta.url).pathname;

function load(lang) {
  const source = readFileSync(join(dir, `${lang}.ts`), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export default \w+;$/m, '')
    .replace(/^export type .*$/gm, '')
    .replace(/const (\w+)(: \w+)? = /, 'result = ');
  const context = { result: null };
  vm.runInNewContext(source, context);
  return context.result;
}

function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, '');
const en = new Set(keys(load('en')).map(base));
let failed = false;
for (const lang of ['es', 'ru']) {
  const other = new Set(keys(load(lang)).map(base));
  const missing = [...en].filter((k) => !other.has(k));
  const extra = [...other].filter((k) => !en.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${lang}: missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}`);
  }
}
if (failed) process.exit(1);
console.log(`translations in sync (${en.size} keys, en/es/ru)`);
