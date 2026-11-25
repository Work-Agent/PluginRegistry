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

## 自动合并

自动合并只对可信机器人（当前是 `workstudio-registry-bot[bot]`）发起的 PR 生效，并额外要求：

- PR 来自本仓库，不是 fork
- 只修改一个 `plugins/<id>.json`
- 条目已存在，不是新插件
- `repo` 不变，`source` 仍是该仓库的 GitHub Release 资产
- 新版本 semver 大于旧版本
- 除 `version` / `source` / `sha256` 外，其他字段不变
- 没有 `manual-review` 标签
- `validate` 和 `verify-artifact` 两个 check 通过

`verify-artifact` 会下载 PR 中的 zip 并实际计算 sha256，结果必须与条目一致；目前只支持 `https://github.com` 的 Release 资产。其他来源需要人工审核。

### 仓库设置

要启用自动合并，需要在 PluginRegistry 配置：

1. `Settings → General → Allow auto-merge` 打开
2. `main` 的 branch protection / ruleset 要求：
   - `validate`
   - `verify-artifact`
3. 自动合并 workflow 需要 GitHub App secrets：
   - `REGISTRY_APP_CLIENT_ID`
   - `REGISTRY_APP_PRIVATE_KEY`

PluginRegistry 是 public 时，可以把现有 Organization secret 的访问范围加上
PluginRegistry；也可以在本仓库单独建 Repository secret。

App 至少需要：

- `Contents: write`
- `Pull requests: write`
- 安装到 `PluginRegistry`

自动合并使用 App token，因此合并后的 `push` 会正常触发 `index.yml`，重新生成 `index.json`。

如果启用了 required review，App 不能自动批准，auto-merge 会等待人工 review；要么由人工合并，要么在 ruleset 中为 App 配置 bypass。

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
