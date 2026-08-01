# CLI 自动化流程

详细对象和命令见 [LibTV CLI 契约](../references/libtv-cli/README.md)。

## 登录与作用域

1. 安装当前页面解析出的版本固定 CLI/Skill 包，不依赖可能失效的 `latest` URL。
2. `login web` 或 `login phone` 建立 CLI 本地凭据；不与 OpenAPI Access Key 混用。
3. `account list/use` 选择个人或团队账户 scope。
4. `workspace create/list/use` 选择项目容器；切换会清除旧 project/group 绑定。
5. `project create/list/use` 绑定实际画布并同步 workspace/team。
6. `group create/use` 可设置默认普通分组范围。

本地 `.libtv/project.json` 只是便利状态。每条服务端命令仍须校验 account、team、
workspace、project 和 group 是否一致且可访问。

## 创建与运行

1. `upload` 上传本地资源并创建 image/video/audio 资源节点。
2. `node create/update` 写节点类型、内容、位置、模型参数和上下游连接。
3. 用 node ID 作为稳定引用；显示名仅适合交互查询。
4. `image shortcut` 执行 Slash 预设；`script storyboard` 按脚本行建立并顺序生成
   分镜图组。
5. 用户确认后才使用 `--run`；自动付费模式必须由调用方显式授权。
6. `node --run` 内部提交、轮询、写回并等待终态；外部 Agent 不再套重复轮询。
7. stdout 只读 JSON/NDJSON，下游从 `nodeKey/newNodeKey` 连接管道；进度走 stderr。

## 错误与恢复

- CLI 非零退出码、stderr 和 stdout 业务 JSON 必须分别采集。
- 管道逐行携带 correlation id；某行失败时不能把错误文本混入 NDJSON stdout。
- 生成超时后先查询节点/Job 状态，不重复执行 `--run`。
- workspace/project/group 本地绑定丢失时重新 `use`，不要从目录名猜服务端 ID。
- 凭据、Access Key、手机号、验证码和素材签名 URL不写入执行日志。

CLI 1.1.1 的精确错误码、网络中断、部分 storyboard 失败和退出码组合仍需安全
实机覆盖；私有 HTTP 未发布前，以官方 CLI 子进程契约作为兼容边界。
