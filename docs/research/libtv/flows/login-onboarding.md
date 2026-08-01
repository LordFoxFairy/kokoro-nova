# 登录与首次引导流程

## 已观察链路

1. 游客可浏览首页、Skill、TV Show、作品详情和公开制作过程。
2. 点击注册/登录，或在只读制作过程点击“复制项目”，打开统一登录弹层。
3. 弹层提供手机号验证码、微信扫码和 QQ 扫码，并展示用户协议/隐私政策。
4. 登录成功后的早期会话曾出现获客渠道问卷，当前只归档第一步。
5. 问卷完成/跳过、返回原 intent 和默认 workspace/project 行为尚待重新登录验证。

截图：

- [首页未登录与登录入口](../pages/home/screenshots/unauthenticated-overview-and-login-prompt.png)
- [复制项目登录门槛](../pages/showcase/screenshots/copy-project-authentication-gate.png)
- [获客问卷第一步](../pages/onboarding/screenshots/acquisition-survey-step-1.png)

## 必须验证的状态

- 手机号无效、验证码发送中/频控/错误/过期、登录成功和服务错误。
- 微信/QQ 二维码加载、过期、刷新、扫码待确认、授权拒绝和成功。
- 用户协议未同意、隐私政策链接、已有账号与自动注册语义。
- 首次问卷全部步骤、必填/跳过、返回、提交失败和重复登录不再出现。
- 登录成功后恢复原提示词、附件、Skill 或 CloneProject intent。
- 多设备登录、退出、token 过期和 workspace 权限被撤销。

任何截图不得保留验证码、Cookie、Token 或可复用的凭据。二维码只保存界面形态，
不依赖其内容作为长期证据。
