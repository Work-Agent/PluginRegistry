# WorkStudio Plugin Registry

WorkStudio 的可安装插件清单。应用在运行期拉取本仓库生成的 [`index.json`](index.json)，并缓存在本地；插件本体仍由各自仓库发布。

## 目录

```text
plugins/<id>.json     # 一个插件一个文件，作者提交这个
index.json            # 由 CI 从 plugins/*.json 生成，应用只读这个
schema.json           # 字段定义
scripts/              # 校验与生成脚本（无第三方依赖）
```

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
| `id` | 是 | 插件 id，必须等于文件名与 `package.json` 的 `workstudio.id` |
| `name` | 是 | 展示名 |
| `description` | 是 | 一句话描述 |
| `version` | 是 | semver，必须与 zip 内 `package.json` 一致 |
| `source` | 是 | 自包含 zip 的 https 地址 |
| `sha256` | 是 | zip 的 64 位小写十六进制哈希 |
| `repo` | 否 | 源码仓库，用于审计 |
| `icon` / `category` / `tags` | 否 | 展示信息 |
| `deprecated` | 否 | 不再推荐安装，但保留条目 |

完整约束见 [`schema.json`](schema.json)。

## 提交流程

1. 把插件打包成自包含 zip（依赖应 bundle 进 `dist` 或随 zip 带 `node_modules`）；
2. 计算 `sha256`；
3. 新增或更新 `plugins/<id>.json`；
4. 提交 PR。CI 校验字段、id、版本、哈希格式；
5. 合并后 CI 自动重新生成 `index.json`。

新增插件需要人工 review；已有插件只改版本 / 哈希时，CI 通过且 `repo` 与 `source` 主机不变即可自动合并。

第一方插件可以在各自仓库的 release workflow 里自动更新本仓库的条目，避免手工 PR。

## 本地校验

```bash
npm run validate          # 字段与唯一性
npm run index             # 生成 index.json
npm run index:check       # 检查 index.json 是否最新
npm run validate:artifacts # 下载 zip 校验 sha256（需要网络）
```

## 安全

插件代码在 WorkStudio 主进程以完整权限运行。清单是分发渠道，合并条目等于为来源背书：

- 只接受可审计的 `repo` 与 https 发布产物；
- `sha256` 固定具体 zip，禁止指向会变化的地址；
- 下架时删除条目或标记 `deprecated`，已安装实例不受影响；
- 每周定时校验 zip 哈希，失败会显式报错。
