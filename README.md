# WorkStudio Plugin Registry

WorkStudio 的可安装插件清单。应用读取本仓库的 [`index.json`](index.json)；插件本体由各自仓库发布。

## 插件列表

下表由 `npm run index` 根据 `plugins/*.json` 生成，请勿手工编辑标记区间内的内容。

<!-- plugins:start -->
> 共 2 个插件，按 id 排序；版本号链接到 zip，仓库链接到源码。安装入口是 [`index.json`](index.json)。

| 插件 | 说明 | 版本 | 分类 | 标签 | 仓库 |
| --- | --- | --- | --- | --- | --- |
| **HTML 编辑器** <code>内置</code><br>`html-editor` | HTML 编辑器：源码编辑、分屏预览与保存 | [0.1.0](<https://github.com/Work-Agent/HTMLEditor/releases/download/v0.1.0/html-editor-0.1.0.zip>) | 开发 | <code>html</code> <code>editor</code> <code>preview</code> | [Work-Agent/HTMLEditor](<https://github.com/Work-Agent/HTMLEditor>) |
| **Markdown 编辑器** <code>内置</code><br>`markdown-editor` | 支持 Live Preview、表格、数学公式与 Mermaid 的 Markdown 编辑器 | [0.1.0](<https://github.com/Work-Agent/MarkdownEditor/releases/download/0.1/markdown-editor-0.1.0.zip>) | 文档 | <code>markdown</code> <code>editor</code> <code>live-preview</code> | [Work-Agent/MarkdownEditor](<https://github.com/Work-Agent/MarkdownEditor>) |
<!-- plugins:end -->

## 提交插件

1. 将插件打包成自包含 zip（依赖 bundle 进 `dist`，或随 zip 带 `node_modules`）；
2. 计算 zip 的 `sha256`；
3. 新增或更新 `plugins/<id>.json`；
4. 提交 PR，CI 会自动校验。

新插件需要人工 review；已有插件更新 `version` / `source` / `sha256` 且校验通过后会自动合并。第一方插件可以在各自的 release workflow 中自动提交更新。

`builtin` 只允许内置插件填写，普通插件添加该字段会被 CI 拒绝。

## 条目格式

```json
{
  "id": "docx",
  "name": "Word 文档",
  "description": "读写 docx",
  "version": "0.3.1",
  "repo": "https://github.com/acme/plugin-docx",
  "source": "https://github.com/acme/plugin-docx/releases/download/v0.3.1/plugin-docx.zip",
  "sha256": "9f2c…",
  "icon": "file-text",
  "category": "文档",
  "tags": ["office"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 必须等于文件名与 zip 内 `package.json` 的 `workstudio.id` |
| `builtin` | 内置插件必填 | 是否随 WorkStudio 安装包内置；仅限 `text-editor` / `markdown-editor` / `html-editor`，值为 `true` |
| `name` / `description` | 是 | 展示信息 |
| `version` | 是 | semver，必须与 zip 内 `package.json` 一致 |
| `source` | 是 | 自包含 zip 的 https 地址 |
| `sha256` | 是 | zip 的 64 位小写十六进制哈希 |
| `repo` | 否 | 源码仓库，用于审计 |
| `icon` / `category` / `tags` | 否 | 展示信息 |
| `deprecated` | 否 | 标记下架，但保留条目 |

完整约束见 [`schema.json`](schema.json)。

## 本地校验

```bash
npm run validate           # 字段、id 与唯一性
npm run index              # 生成 index.json 与 README 插件列表
npm run index:check        # 检查生成文件是否最新
npm run validate:artifacts # 下载 zip 校验 sha256
```

插件代码在 WorkStudio 主进程以完整权限运行，因此只接受可审计的 `repo` 与固定版本的 https zip。
