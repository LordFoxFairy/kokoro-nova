# CLI / Skill 完整归档

本页归档 LibTV CLI 页面当前可见的安装方式、官方 Skill 文档树、命令契约、
节点类型、模型 Schema、组合案例与三平台安装脚本。所有内容均来自登录后的
真实页面；未执行安装脚本、未触发 CLI 登录，也未记录 Cookie、Token 或
Access Key。

## 核心结论

- Agent 安装路径是把固定版本 Skill 包地址交给 AI 助手；手动路径是先按操作系统安装 CLI，再执行 `libtv login web`。
- CLI 术语中 `workspace` 是装画布的项目容器，`project` 是实际画布；目录绑定状态写入 `.libtv/project.json`。
- 命令面覆盖 account、workspace、project、group、node、upload、image、script、model、login 与 logout。
- 机器组合依赖 JSON/NDJSON、稳定的 stdout/stderr 边界和可嵌套 DAG；这对 GA 经 Redis 调度 CLI/画布操作很关键。
- 节点定义覆盖 text、image、video、video-clip、audio、script 与 storyboard，
  模型 Schema 另行定义 properties、config、rules 与 modeType。

## 截图方法

文档正文位于固定高度的内部滚动区。归档按 500px 步长连续滚动，并额外截取
精确底部；因此长页使用 `01`、`02` 等有序分段。最后一段可能与前一段少量
重叠，但不会漏掉底部内容。当前共 180 张 CLI 相关截图。

## 安装入口

| 文档/状态 | 连续截图 |
| --- | --- |
| AI Agent 安装与文档树 | [查看](screenshots/cli-install-and-documentation-tree.png) |
| macOS/Linux 手动安装与网页登录 | [查看](screenshots/cli-manual-install-macos-linux-and-web-login.png) |
| Windows CMD 手动安装 | [查看](screenshots/cli-manual-install-windows-cmd.png) |
| Windows PowerShell 手动安装 | [查看](screenshots/cli-manual-install-windows-powershell.png) |

## 核心命令

| 文档/状态 | 连续截图 |
| --- | --- |
| `command account` | [01](screenshots/cli-skill-command-account-01.png) [02](screenshots/cli-skill-command-account-02.png) [03](screenshots/cli-skill-command-account-03.png) [04](screenshots/cli-skill-command-account-04.png) |
| `command group` | [01](screenshots/cli-skill-command-group-01.png) [02](screenshots/cli-skill-command-group-02.png) [03](screenshots/cli-skill-command-group-03.png) [04](screenshots/cli-skill-command-group-04.png) [05](screenshots/cli-skill-command-group-05.png) [06](screenshots/cli-skill-command-group-06.png) [07](screenshots/cli-skill-command-group-07.png) |
| `command image` | [01](screenshots/cli-skill-command-image-01.png) [02](screenshots/cli-skill-command-image-02.png) [03](screenshots/cli-skill-command-image-03.png) [04](screenshots/cli-skill-command-image-04.png) [05](screenshots/cli-skill-command-image-05.png) |
| `command login` | [01](screenshots/cli-skill-command-login-01.png) [02](screenshots/cli-skill-command-login-02.png) [03](screenshots/cli-skill-command-login-03.png) [04](screenshots/cli-skill-command-login-04.png) |
| `command logout` | [01](screenshots/cli-skill-command-logout-01.png) |
| `command model` | [01](screenshots/cli-skill-command-model-01.png) [02](screenshots/cli-skill-command-model-02.png) [03](screenshots/cli-skill-command-model-03.png) [04](screenshots/cli-skill-command-model-04.png) |
| `command node` | [01](screenshots/cli-skill-command-node-01.png) [02](screenshots/cli-skill-command-node-02.png) [03](screenshots/cli-skill-command-node-03.png) [04](screenshots/cli-skill-command-node-04.png) [05](screenshots/cli-skill-command-node-05.png) [06](screenshots/cli-skill-command-node-06.png) [07](screenshots/cli-skill-command-node-07.png) [08](screenshots/cli-skill-command-node-08.png) [09](screenshots/cli-skill-command-node-09.png) [10](screenshots/cli-skill-command-node-10.png) |
| `command project` | [01](screenshots/cli-skill-command-project-01.png) [02](screenshots/cli-skill-command-project-02.png) [03](screenshots/cli-skill-command-project-03.png) [04](screenshots/cli-skill-command-project-04.png) [05](screenshots/cli-skill-command-project-05.png) [06](screenshots/cli-skill-command-project-06.png) [07](screenshots/cli-skill-command-project-07.png) |
| `command script` | [01](screenshots/cli-skill-command-script-01.png) [02](screenshots/cli-skill-command-script-02.png) [03](screenshots/cli-skill-command-script-03.png) [04](screenshots/cli-skill-command-script-04.png) |
| `command upload` | [01](screenshots/cli-skill-command-upload-01.png) [02](screenshots/cli-skill-command-upload-02.png) [03](screenshots/cli-skill-command-upload-03.png) |
| `command workspace` | [01](screenshots/cli-skill-command-workspace-01.png) [02](screenshots/cli-skill-command-workspace-02.png) [03](screenshots/cli-skill-command-workspace-03.png) [04](screenshots/cli-skill-command-workspace-04.png) [05](screenshots/cli-skill-command-workspace-05.png) [06](screenshots/cli-skill-command-workspace-06.png) |

## 可组合示例

| 文档/状态 | 连续截图 |
| --- | --- |
| `example node type audio` | [01](screenshots/cli-skill-example-node-type-audio-01.png) |
| `example node type image` | [01](screenshots/cli-skill-example-node-type-image-01.png) |
| `example node type script` | [01](screenshots/cli-skill-example-node-type-script-01.png) |
| `example node type storyboard` | [01](screenshots/cli-skill-example-node-type-storyboard-01.png) |
| `example node type text` | [01](screenshots/cli-skill-example-node-type-text-01.png) |
| `example node type video` | [01](screenshots/cli-skill-example-node-type-video-01.png) [02](screenshots/cli-skill-example-node-type-video-02.png) |
| `example node type video clip` | [01](screenshots/cli-skill-example-node-type-video-clip-01.png) |
| `example pipes error handling` | [01](screenshots/cli-skill-example-pipes-error-handling-01.png) [02](screenshots/cli-skill-example-pipes-error-handling-02.png) [03](screenshots/cli-skill-example-pipes-error-handling-03.png) [04](screenshots/cli-skill-example-pipes-error-handling-04.png) |
| `example pipes group and node` | [01](screenshots/cli-skill-example-pipes-group-and-node-01.png) [02](screenshots/cli-skill-example-pipes-group-and-node-02.png) [03](screenshots/cli-skill-example-pipes-group-and-node-03.png) [04](screenshots/cli-skill-example-pipes-group-and-node-04.png) |
| `example pipes nested dag` | [01](screenshots/cli-skill-example-pipes-nested-dag-01.png) [02](screenshots/cli-skill-example-pipes-nested-dag-02.png) [03](screenshots/cli-skill-example-pipes-nested-dag-03.png) [04](screenshots/cli-skill-example-pipes-nested-dag-04.png) [05](screenshots/cli-skill-example-pipes-nested-dag-05.png) |
| `example pipes readme` | [01](screenshots/cli-skill-example-pipes-readme-01.png) [02](screenshots/cli-skill-example-pipes-readme-02.png) |
| `example workflow all in one` | [01](screenshots/cli-skill-example-workflow-all-in-one-01.png) |
| `example workflow common errors` | [01](screenshots/cli-skill-example-workflow-common-errors-01.png) [02](screenshots/cli-skill-example-workflow-common-errors-02.png) |
| `example workflow connect only` | [01](screenshots/cli-skill-example-workflow-connect-only-01.png) |
| `example workflow create and run` | [01](screenshots/cli-skill-example-workflow-create-and-run-01.png) |
| `example workflow group batch run` | [01](screenshots/cli-skill-example-workflow-group-batch-run-01.png) [02](screenshots/cli-skill-example-workflow-group-batch-run-02.png) |
| `example workflow update params` | [01](screenshots/cli-skill-example-workflow-update-params-01.png) |
| `example workflow workspace setup` | [01](screenshots/cli-skill-example-workflow-workspace-setup-01.png) [02](screenshots/cli-skill-example-workflow-workspace-setup-02.png) |
| `examples readme` | [01](screenshots/cli-skill-examples-readme-01.png) [02](screenshots/cli-skill-examples-readme-02.png) [03](screenshots/cli-skill-examples-readme-03.png) |

## Schema 与节点类型

| 文档/状态 | 连续截图 |
| --- | --- |
| `model schema` | [01](screenshots/cli-skill-model-schema-01.png) [02](screenshots/cli-skill-model-schema-02.png) [03](screenshots/cli-skill-model-schema-03.png) [04](screenshots/cli-skill-model-schema-04.png) [05](screenshots/cli-skill-model-schema-05.png) [06](screenshots/cli-skill-model-schema-06.png) [07](screenshots/cli-skill-model-schema-07.png) [08](screenshots/cli-skill-model-schema-08.png) [09](screenshots/cli-skill-model-schema-09.png) [10](screenshots/cli-skill-model-schema-10.png) |
| `node type audio` | [01](screenshots/cli-skill-node-type-audio-01.png) [02](screenshots/cli-skill-node-type-audio-02.png) [03](screenshots/cli-skill-node-type-audio-03.png) [04](screenshots/cli-skill-node-type-audio-04.png) |
| `node type image` | [01](screenshots/cli-skill-node-type-image-01.png) [02](screenshots/cli-skill-node-type-image-02.png) [03](screenshots/cli-skill-node-type-image-03.png) [04](screenshots/cli-skill-node-type-image-04.png) |
| `node type script` | [01](screenshots/cli-skill-node-type-script-01.png) [02](screenshots/cli-skill-node-type-script-02.png) [03](screenshots/cli-skill-node-type-script-03.png) [04](screenshots/cli-skill-node-type-script-04.png) [05](screenshots/cli-skill-node-type-script-05.png) [06](screenshots/cli-skill-node-type-script-06.png) |
| `node type storyboard` | [01](screenshots/cli-skill-node-type-storyboard-01.png) [02](screenshots/cli-skill-node-type-storyboard-02.png) |
| `node type text` | [01](screenshots/cli-skill-node-type-text-01.png) [02](screenshots/cli-skill-node-type-text-02.png) [03](screenshots/cli-skill-node-type-text-03.png) |
| `node type video` | [01](screenshots/cli-skill-node-type-video-01.png) [02](screenshots/cli-skill-node-type-video-02.png) [03](screenshots/cli-skill-node-type-video-03.png) [04](screenshots/cli-skill-node-type-video-04.png) |
| `node type video clip` | [01](screenshots/cli-skill-node-type-video-clip-01.png) [02](screenshots/cli-skill-node-type-video-clip-02.png) [03](screenshots/cli-skill-node-type-video-clip-03.png) [04](screenshots/cli-skill-node-type-video-clip-04.png) |
| `node types readme` | [01](screenshots/cli-skill-node-types-readme-01.png) [02](screenshots/cli-skill-node-types-readme-02.png) [03](screenshots/cli-skill-node-types-readme-03.png) [04](screenshots/cli-skill-node-types-readme-04.png) [05](screenshots/cli-skill-node-types-readme-05.png) |

## 安装脚本与 Skill 总览

| 文档/状态 | 连续截图 |
| --- | --- |
| `install guide` | [01](screenshots/cli-skill-install-guide-01.png) [02](screenshots/cli-skill-install-guide-02.png) [03](screenshots/cli-skill-install-guide-03.png) [04](screenshots/cli-skill-install-guide-04.png) [05](screenshots/cli-skill-install-guide-05.png) [06](screenshots/cli-skill-install-guide-06.png) |
| `installer macos linux` | [01](screenshots/cli-skill-installer-macos-linux-01.png) [02](screenshots/cli-skill-installer-macos-linux-02.png) [03](screenshots/cli-skill-installer-macos-linux-03.png) [04](screenshots/cli-skill-installer-macos-linux-04.png) [05](screenshots/cli-skill-installer-macos-linux-05.png) [06](screenshots/cli-skill-installer-macos-linux-06.png) [07](screenshots/cli-skill-installer-macos-linux-07.png) [08](screenshots/cli-skill-installer-macos-linux-08.png) [09](screenshots/cli-skill-installer-macos-linux-09.png) [10](screenshots/cli-skill-installer-macos-linux-10.png) [11](screenshots/cli-skill-installer-macos-linux-11.png) [12](screenshots/cli-skill-installer-macos-linux-12.png) [13](screenshots/cli-skill-installer-macos-linux-13.png) [14](screenshots/cli-skill-installer-macos-linux-14.png) [15](screenshots/cli-skill-installer-macos-linux-15.png) [16](screenshots/cli-skill-installer-macos-linux-16.png) [17](screenshots/cli-skill-installer-macos-linux-17.png) [18](screenshots/cli-skill-installer-macos-linux-18.png) [19](screenshots/cli-skill-installer-macos-linux-19.png) |
| `installer windows cmd` | [01](screenshots/cli-skill-installer-windows-cmd-01.png) [02](screenshots/cli-skill-installer-windows-cmd-02.png) |
| `installer windows powershell` | [01](screenshots/cli-skill-installer-windows-powershell-01.png) [02](screenshots/cli-skill-installer-windows-powershell-02.png) [03](screenshots/cli-skill-installer-windows-powershell-03.png) [04](screenshots/cli-skill-installer-windows-powershell-04.png) [05](screenshots/cli-skill-installer-windows-powershell-05.png) [06](screenshots/cli-skill-installer-windows-powershell-06.png) [07](screenshots/cli-skill-installer-windows-powershell-07.png) [08](screenshots/cli-skill-installer-windows-powershell-08.png) [09](screenshots/cli-skill-installer-windows-powershell-09.png) [10](screenshots/cli-skill-installer-windows-powershell-10.png) [11](screenshots/cli-skill-installer-windows-powershell-11.png) [12](screenshots/cli-skill-installer-windows-powershell-12.png) [13](screenshots/cli-skill-installer-windows-powershell-13.png) |
| `skill readme` | [01](screenshots/cli-skill-skill-readme-01.png) [02](screenshots/cli-skill-skill-readme-02.png) [03](screenshots/cli-skill-skill-readme-03.png) |
