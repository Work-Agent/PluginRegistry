#!/usr/bin/env node
import { loadValidEntries, verifyArtifact } from './lib.mjs';

const verifyArtifacts = process.argv.includes('--verify-artifacts');
const { entries, errors } = await loadValidEntries();

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`\n${errors.length} 个错误`);
  process.exit(1);
}

if (verifyArtifacts) {
  for (const entry of entries) {
    if (!entry.source || entry.deprecated) continue;
    process.stdout.write(`verify ${entry.id}@${entry.version} … `);
    try {
      await verifyArtifact(entry);
      console.log('ok');
    } catch (error) {
      console.error(`失败：${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`${entries.length} 个条目通过校验`);
