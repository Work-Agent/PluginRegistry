import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = process.env.REGISTRY_ROOT
  ? resolve(process.env.REGISTRY_ROOT)
  : SCRIPT_ROOT;
export const PLUGINS_DIR = join(ROOT, 'plugins');
export const INDEX_FILE = join(ROOT, 'index.json');
export const README_FILE = join(ROOT, 'README.md');
export const README_START = '<!-- plugins:start -->';
export const README_END = '<!-- plugins:end -->';

/** 只有随 WorkStudio 安装包内置的插件才允许声明 builtin；新增内置插件时同步 schema.json。 */
export const BUILTIN_PLUGIN_IDS = new Set([
  'html-editor',
  'markdown-editor',
  'text-editor',
]);

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA_RE = /^[a-f0-9]{64}$/;
const ENTRY_FIELDS = new Set([
  'id',
  'name',
  'description',
  'version',
  'source',
  'sha256',
  'repo',
  'icon',
  'category',
  'tags',
  'deprecated',
  'builtin',
]);

/** 读取 plugins/*.json；返回文件与解析结果，不校验。 */
export async function readEntries() {
  const names = (await readdir(PLUGINS_DIR))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const entries = [];
  for (const file of names) {
    const path = join(PLUGINS_DIR, file);
    const text = await readFile(path, 'utf-8');
    try {
      entries.push({
        file,
        id: file.replace(/\.json$/, ''),
        entry: JSON.parse(text),
      });
    } catch (error) {
      throw new Error(`${file}: JSON 解析失败：${error.message}`);
    }
  }
  return entries;
}

/** 校验单条清单；返回人类可读错误列表。 */
export function validateEntry(entry, file) {
  const errors = [];
  const fail = (message) => errors.push(`${file}: ${message}`);

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fail('必须是对象');
    return errors;
  }
  for (const key of Object.keys(entry)) {
    if (!ENTRY_FIELDS.has(key)) fail(`未知字段：${key}`);
  }
  for (const key of [
    'id',
    'name',
    'description',
    'version',
    'source',
    'sha256',
  ]) {
    if (typeof entry[key] !== 'string') fail(`缺少字符串字段：${key}`);
  }
  if (typeof entry.id === 'string') {
    if (!ID_RE.test(entry.id)) fail(`id 非法：${entry.id}`);
    if (`${entry.id}.json` !== file) fail(`id 必须与文件名一致：${entry.id}`);
  }
  if (typeof entry.name === 'string' && !entry.name.trim()) {
    fail('name 不能为空');
  }
  if (typeof entry.description === 'string' && entry.description.length > 240) {
    fail('description 超过 240 字');
  }
  if (typeof entry.version === 'string' && !VERSION_RE.test(entry.version)) {
    fail(`version 非 semver：${entry.version}`);
  }
  if (typeof entry.source === 'string') {
    try {
      const url = new URL(entry.source);
      if (url.protocol !== 'https:') fail('source 必须是 https');
      if (!url.pathname.toLowerCase().endsWith('.zip')) {
        fail('source 必须指向 .zip');
      }
    } catch {
      fail(`source 不是合法 URL：${entry.source}`);
    }
  }
  if (typeof entry.sha256 === 'string' && !SHA_RE.test(entry.sha256)) {
    fail('sha256 必须是 64 位小写十六进制');
  }
  if (entry.repo !== undefined) {
    if (typeof entry.repo !== 'string' || !/^https:\/\//.test(entry.repo)) {
      fail('repo 必须是 https URL');
    }
  }
  if (entry.icon !== undefined && typeof entry.icon !== 'string') {
    fail('icon 必须是字符串');
  }
  if (entry.category !== undefined && typeof entry.category !== 'string') {
    fail('category 必须是字符串');
  }
  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags) || entry.tags.length > 12) {
      fail('tags 必须是最多 12 项的数组');
    } else if (
      entry.tags.some((tag) => typeof tag !== 'string' || !tag.trim())
    ) {
      fail('tags 必须是非空字符串');
    } else if (new Set(entry.tags).size !== entry.tags.length) {
      fail('tags 不能重复');
    }
  }
  if (entry.deprecated !== undefined && typeof entry.deprecated !== 'boolean') {
    fail('deprecated 必须是布尔值');
  }
  if (entry.builtin !== undefined) {
    if (!BUILTIN_PLUGIN_IDS.has(entry.id)) {
      fail(
        `builtin 仅允许内置插件使用：${[...BUILTIN_PLUGIN_IDS].join(' / ')}`,
      );
    } else if (entry.builtin !== true) {
      fail('builtin 仅用于标记内置插件，值必须为 true');
    }
  } else if (BUILTIN_PLUGIN_IDS.has(entry.id)) {
    fail('内置插件必须声明 "builtin": true');
  }
  return errors;
}

/** 校验全部清单，返回 { entries, errors }；entries 已按 id 排序。 */
export async function loadValidEntries() {
  const rows = await readEntries();
  const errors = [];
  const seen = new Map();
  for (const { file, entry } of rows) {
    errors.push(...validateEntry(entry, file));
    if (!entry || typeof entry !== 'object') continue;
    if (seen.has(entry.id)) {
      errors.push(`${file}: id 重复：${entry.id}`);
    } else {
      seen.set(entry.id, file);
    }
  }
  const entries = rows
    .map((row) => row.entry)
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { entries, errors };
}

/** 生成确定性 index（不含时间戳，便于 CI 做 --check）。 */
export function buildIndex(entries) {
  return {
    schemaVersion: 1,
    entries,
  };
}

/** 转义 Markdown 表格单元格内容。 */
function escapeCell(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ');
}

/** 转义链接文字中的方括号。 */
function escapeLinkText(value) {
  return escapeCell(value).replace(/([\[\]])/g, '\\$1');
}

/** 转义 HTML 文本。 */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 用 HTML code 包裹标签，避免标签里的反引号破坏 Markdown。 */
function code(value) {
  const text = String(value).replace(/\r?\n/g, ' ');
  return `<code>${escapeHtml(text).replaceAll('|', '&#124;')}</code>`;
}

/** 使用尖括号包住链接地址，避免 URL 里的括号被误解析。 */
function link(label, href) {
  return `[${label}](<${href}>)`;
}

/** 把 repo 压缩成便于阅读的短名称。 */
function repoLabel(repo) {
  try {
    const url = new URL(repo);
    const path = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, '');
    if (url.hostname === 'github.com') return path || url.hostname;
    return path ? `${url.hostname}/${path}` : url.hostname;
  } catch {
    return repo;
  }
}

/** 生成 README 中两个标记之间的插件列表。 */
export function buildReadmeSection(entries) {
  const lines = [
    `> 共 ${entries.length} 个插件，按 id 排序；版本号链接到 zip，仓库链接到源码。安装入口是 [\`index.json\`](index.json)。`,
    '',
  ];
  if (entries.length === 0) {
    lines.push('暂无插件。');
    return lines.join('\n');
  }

  lines.push(
    '| 插件 | 说明 | 版本 | 分类 | 标签 | 仓库 |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const entry of entries) {
    const builtin = entry.builtin ? ' <code>内置</code>' : '';
    const name = `**${escapeCell(entry.name)}**${builtin}<br>\`${entry.id}\``;
    const version = link(escapeLinkText(entry.version), entry.source);
    const versionCell = entry.deprecated ? `${version}（已下架）` : version;
    const tags = entry.tags?.length ? entry.tags.map(code).join(' ') : '—';
    const repository = entry.repo
      ? link(escapeLinkText(repoLabel(entry.repo)), entry.repo)
      : '—';
    const category = entry.category ? escapeCell(entry.category) : '—';
    lines.push(
      `| ${name} | ${escapeCell(entry.description)} | ${versionCell} | ${category} | ${tags} | ${repository} |`,
    );
  }
  return lines.join('\n');
}

/** 用最新插件列表替换 README 中标记区间的内容。 */
export function renderReadme(readme, entries) {
  const start = readme.indexOf(README_START);
  if (start === -1) {
    throw new Error(`README.md 缺少标记：${README_START}`);
  }
  const end = readme.indexOf(README_END, start + README_START.length);
  if (end === -1) {
    throw new Error(`README.md 缺少标记：${README_END}`);
  }
  return [
    readme.slice(0, start + README_START.length),
    buildReadmeSection(entries),
    readme.slice(end),
  ].join('\n');
}

/** 下载 source 并校验 sha256；用于手动 / 定时校验，不放进每次 PR。 */
export async function verifyArtifact(entry) {
  const response = await fetch(entry.source, {
    headers: { 'User-Agent': 'workstudio-plugin-registry' },
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > 64 * 1024 * 1024) {
    throw new Error(`zip 超过 64MB：${length}`);
  }
  const hash = createHash('sha256');
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.byteLength;
    if (received > 64 * 1024 * 1024) throw new Error('zip 超过 64MB');
    hash.update(chunk);
  }
  const actual = hash.digest('hex');
  if (actual !== entry.sha256) {
    throw new Error(`sha256 不匹配：期望 ${entry.sha256}，实际 ${actual}`);
  }
}
