#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import {
  INDEX_FILE,
  README_FILE,
  buildIndex,
  loadValidEntries,
  renderReadme,
} from './lib.mjs';

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');

const { entries, errors } = await loadValidEntries();
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`\n${errors.length} 个错误`);
  process.exit(1);
}

const expected = `${JSON.stringify(buildIndex(entries), null, 2)}\n`;

const readme = await readFile(README_FILE, 'utf-8').catch(() => {
  console.error('README.md 读取失败');
  process.exit(1);
});
let expectedReadme;
try {
  expectedReadme = renderReadme(readme, entries);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (write) {
  await writeFile(INDEX_FILE, expected, 'utf-8');
  await writeFile(README_FILE, expectedReadme, 'utf-8');
  console.log(`wrote index.json 与 README.md 插件列表（${entries.length} 条）`);
  process.exit(0);
}

const actual = await readFile(INDEX_FILE, 'utf-8').catch(() => '');
if (check) {
  let stale = false;
  if (actual !== expected) {
    console.error('index.json 与 plugins/*.json 不一致');
    stale = true;
  }
  if (readme !== expectedReadme) {
    console.error('README.md 插件列表与 plugins/*.json 不一致');
    stale = true;
  }
  if (stale) {
    console.error('请运行 npm run index 重新生成');
    process.exit(1);
  }
  process.exit(0);
}

process.stdout.write(expected);
