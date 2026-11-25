#!/usr/bin/env node
/**
 * 判断 bot PR 是否满足自动合并条件。
 * 只更新已有条目、version 递增、只改 version/source/sha256。
 * 不在这里执行 merge；merge 由 workflow 用 App token 完成。
 */
import { appendFileSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const number = process.env.PR_NUMBER;
const bot = process.env.BOT_LOGIN ?? 'workstudio-registry-bot[bot]';

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
  if (response.status === 404) return null;
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
    files.push(...batch ?? []);
    if ((batch?.length ?? 0) < 100) break;
  }
  return files;
}

function output(eligible, reason) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `eligible=${eligible}\nreason=${reason.replaceAll('\n', ' ')}\n`,
  );
  console.log(eligible ? 'eligible for auto-merge' : `manual review: ${reason}`);
}

function parts(version) {
  return version.split('-')[0].split('.').map((value) => Number(value));
}

function newer(a, b) {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return (left[index] ?? 0) > (right[index] ?? 0);
    }
  }
  return false;
}

const pr = await api(`/repos/${repo}/pulls/${number}`);
if (!pr) {
  output('false', 'PR 不存在');
  process.exit(0);
}
if (pr.state !== 'open' || pr.draft) {
  output('false', 'PR 不是 open/ready 状态');
  process.exit(0);
}
if (pr.user?.login !== bot) {
  output('false', `PR 作者不是 ${bot}`);
  process.exit(0);
}
if (pr.head?.repo?.full_name !== repo) {
  output('false', 'PR 来自 fork，需要人工审核');
  process.exit(0);
}
if ((pr.labels ?? []).some((label) => label.name === 'manual-review')) {
  output('false', '带有 manual-review 标签');
  process.exit(0);
}

const files = await listFiles();
if (files.length !== 1) {
  output('false', `必须只修改一个文件，实际 ${files.length} 个`);
  process.exit(0);
}
const file = files[0];
const match = /^plugins\/([a-z0-9][a-z0-9._-]*)\.json$/.exec(file.filename);
if (!match || file.status !== 'modified') {
  output('false', '只允许修改已有 plugins/<id>.json');
  process.exit(0);
}

const id = match[1];
const baseFile = await api(
  `/repos/${repo}/contents/${encodeURI(file.filename)}?ref=${pr.base.sha}`,
);
const headFile = await api(
  `/repos/${repo}/contents/${encodeURI(file.filename)}?ref=${pr.head.sha}`,
);
if (!baseFile) {
  output('false', '新插件首次进入 Registry，需要人工审核');
  process.exit(0);
}
if (!headFile) {
  output('false', 'PR 删除了条目文件，需要人工审核');
  process.exit(0);
}

const base = JSON.parse(Buffer.from(baseFile.content, 'base64').toString('utf8'));
const head = JSON.parse(Buffer.from(headFile.content, 'base64').toString('utf8'));

if (base.id !== id || head.id !== id) {
  output('false', 'id 与文件名不一致');
  process.exit(0);
}
if (base.deprecated === true) {
  output('false', '条目已 deprecated，需要人工审核');
  process.exit(0);
}
if (base.repo !== head.repo) {
  output('false', 'repo 发生变化，需要人工审核');
  process.exit(0);
}

let baseSource;
let headSource;
try {
  baseSource = new URL(base.source);
  headSource = new URL(head.source);
} catch {
  output('false', 'source 不是合法 URL');
  process.exit(0);
}
if (
  baseSource.protocol !== 'https:' ||
  headSource.protocol !== 'https:' ||
  baseSource.hostname !== 'github.com' ||
  headSource.hostname !== 'github.com'
) {
  output('false', '自动合并只支持 github.com 的 Release 资产');
  process.exit(0);
}

let repoUrl;
try {
  repoUrl = new URL(base.repo);
} catch {
  output('false', 'repo 不是合法 URL');
  process.exit(0);
}
const repoPath = repoUrl.pathname.replace(/^\/|\/$/g, '');
if (!headSource.pathname.startsWith(`/${repoPath}/releases/download/`)) {
  output('false', 'source 不是该仓库的 Release 资产');
  process.exit(0);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(head.version)) {
  output('false', 'version 不是 semver');
  process.exit(0);
}
if (!newer(head.version, base.version)) {
  output('false', `新版本 ${head.version} 不高于 ${base.version}`);
  process.exit(0);
}
if (!/^[a-f0-9]{64}$/.test(head.sha256)) {
  output('false', 'sha256 格式非法');
  process.exit(0);
}

const ignored = new Set(['version', 'sha256', 'source']);
for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
  if (ignored.has(key)) continue;
  if (JSON.stringify(base[key]) !== JSON.stringify(head[key])) {
    output('false', `字段 ${key} 变化，需要人工审核`);
    process.exit(0);
  }
}

output('true', '');
