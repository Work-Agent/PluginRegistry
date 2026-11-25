#!/usr/bin/env node
/**
 * PR 检查：下载 PR 中变更条目的 zip，校验 sha256。
 * 只使用 base 分支里的本脚本；不执行 PR 代码。
 */
import { createHash } from 'node:crypto';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const number = process.env.PR_NUMBER;

if (!token || !repo || !number) {
  console.error('缺少 GITHUB_TOKEN / GITHUB_REPOSITORY / PR_NUMBER');
  process.exit(1);
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'workstudio-plugin-registry',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function listFiles() {
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(
      `/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
    );
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

function pluginPath(path) {
  return /^plugins\/[a-z0-9][a-z0-9._-]*\.json$/.test(path);
}

function contentOf(file) {
  return Buffer.from(file.content, 'base64').toString('utf-8');
}

const pr = await api(`/repos/${repo}/pulls/${number}`);
const files = (await listFiles()).filter(
  (file) => pluginPath(file.filename) && file.status !== 'removed',
);

if (files.length === 0) {
  console.log('没有变更插件条目，跳过 artifact 校验');
  process.exit(0);
}

for (const file of files) {
  const content = await api(
    `/repos/${repo}/contents/${encodeURI(file.filename)}?ref=${pr.head.sha}`,
  );
  const entry = JSON.parse(contentOf(content));
  const source = new URL(entry.source);
  if (source.protocol !== 'https:' || source.hostname !== 'github.com') {
    throw new Error(
      `${file.filename}: 自动校验只支持 https://github.com 的 Release 资产`,
    );
  }
  const response = await fetch(entry.source, {
    headers: { 'User-Agent': 'workstudio-plugin-registry' },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`${file.filename}: 下载失败 ${response.status}`);
  }
  const digest = createHash('sha256')
    .update(Buffer.from(await response.arrayBuffer()))
    .digest('hex');
  if (digest !== entry.sha256) {
    throw new Error(
      `${file.filename}: sha256 不匹配（entry=${entry.sha256} actual=${digest}）`,
    );
  }
  console.log(`verified ${file.filename}: ${digest}`);
}
