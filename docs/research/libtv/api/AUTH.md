# LibTV 官网认证与会话证据

本文只记录官网登录态请求的认证**结构**和会话行为，不保存任何凭据值。

## 已观察域

| 域 | 用途 |
|---|---|
| `www.liblib.tv` | 页面与静态资源入口 |
| `api.liblib.tv` | 项目、画布、社区、任务和协议 API |
| `api2.liblib.art` | 账户、会员、积分、通知和营销 API |
| `passport.liblib.art` | 登录身份检查 |
| `im.liblib.tv` | Agent 项目会话 API |

官网会加载 `https://www.liblib.art/cross-storage-hub.html` 协同跨域账户状态，并向
`passport.liblib.art/api/www/user/info` 发出身份检查请求。这里不读取也不复制跨域存储内容。

## 请求头形状

登录态画布请求中已观察到以下非标准头名称：

```text
token
webid
X-Log-ID
x-language
```

- `token` 与 `webid` 只确认“字段存在”，没有读取、输出或落盘其值；
- `X-Log-ID` 是请求关联/诊断字段，本地 mock 使用确定性请求 ID；
- `x-language` 表示界面语言；
- 浏览器仍会处理标准 Cookie/CORS 机制，但研究材料不保存 Cookie。

`api2.liblib.art` 与 `api.liblib.tv` 的响应 envelope 不完全相同：前者部分接口返回
`msg: null`，后者通常返回 `msg: string`；Agent 域使用 `message: string`。本地 client
需要在传输层兼容这些外部形状，再映射到统一错误对象。

## 会话恢复规则

1. 研究持续复用同一个浏览器 profile 和 LibTV 标签页；
2. 页面疑似失效时先在原标签页刷新，并以可见登录态和 HTTP 响应判断；
3. 只有页面明确要求重新登录、验证码、账户选择或人工确认时呼叫用户；
4. 不通过脚本导出 Cookie、Token、Access Key、手机号、验证码或账户 UUID；
5. 文档和 fixture 中所有身份、空间、项目与会话标识都替换为确定性占位值。

## 本地 mock 约束

当前仓库是纯前端子仓库，不实现真实认证。mock 层以固定的 `MockViewer` 表达登录态，
并至少支持以下可重复场景：

- `authenticated`: 有项目、会员摘要、积分和通知；
- `anonymous`: 首页公开内容可见，受限动作打开登录门；
- `session-expired`: 已打开编辑器被阻断，刷新后恢复到 `authenticated`；
- `account-switch-required`: 展示账户选择门但不连接真实账户系统。

未来接真实后端时，前端业务组件仍只消费规范化 viewer/session contract，不直接读取
Cookie 或非标准认证头。
