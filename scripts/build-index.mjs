#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { INDEX_FILE, buildIndex, loadValidEntries } from './lib.mjs';

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

const { entries, errors } = await loadValidEntries();
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`\n${errors.length} 个错误`);
  process.exit(1);
}

const expected = `${JSON.stringify(buildIndex(entries), null, 2)}\n`;

if (write) {
  await writeFile(INDEX_FILE, expected, 'utf-8');
  console.log(`wrote index.json（${entries.length} 条）`);
  process.exit(0);
}

const actual = await readFile(INDEX_FILE, 'utf-8').catch(() => '');
if (check && actual !== expected) {
  console.error('index.json 与 plugins/*.json 不一致，请运行 pnpm index');
  process.exit(1);
}

process.stdout.write(expected);
