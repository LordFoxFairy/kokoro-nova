# 容器发布

Kokoro Nova 使用 GitHub Container Registry（GHCR）发布镜像：

```text
ghcr.io/lordfoxfairy/kokoro-nova
```

## 自动发布

`.github/workflows/ci.yml` 在 `main` 和 Pull Request 上执行：

1. `pnpm install --frozen-lockfile`
2. TypeScript 类型检查
3. ESLint
4. Vitest 单元 / contract 测试
5. Next.js 生产构建

只有验证通过后，推送 `v*` Git tag 才会构建并推送容器镜像。以 `v0.1.0` 为例：

```bash
git tag -a v0.1.0 -m "release v0.1.0"
git push origin v0.1.0
```

发布结果包含：

```text
ghcr.io/lordfoxfairy/kokoro-nova:0.1.0
ghcr.io/lordfoxfairy/kokoro-nova:0.1
ghcr.io/lordfoxfairy/kokoro-nova:0
ghcr.io/lordfoxfairy/kokoro-nova:latest
ghcr.io/lordfoxfairy/kokoro-nova:sha-<commit>
```

工作流使用仓库自带的 `GITHUB_TOKEN`，不需要在仓库里保存长期 Docker 凭证。镜像带有
`org.opencontainers.image.source`，会自动关联到
[`LordFoxFairy/kokoro-nova`](https://github.com/LordFoxFairy/kokoro-nova)。

首次发布后，在仓库的 **Packages → kokoro-nova → Package settings** 确认可见性为
**Public**。个人账号的 GHCR 包首次创建可能默认是 Private；一旦改成 Public，后续 tag
发布的版本会沿用该设置，并可匿名拉取。

## 本地构建与运行

```bash
docker build --pull -t kokoro-nova:local .
docker run --rm \
  --name kokoro-nova \
  -p 3200:3200 \
  -v kokoro-nova-data:/app/.data \
  kokoro-nova:local
```

打开 <http://localhost:3200>。`.data` 是文件型 mock workspace，挂载 volume 后项目、任务、
积分和本地生成媒体会在容器重启后保留；删除 volume 即可回到初始 fixture。

镜像内置 `ffmpeg`，因此离线 provider 和视频合成路径可以在容器里生成真实的本地媒体文件。

### 外部环境变量

Dockerfile 只提供部署默认值，启动方可以通过 `-e` 或平台的 environment 配置覆盖：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 默认以生产模式启动 |
| `PORT` | `3200` | Next.js 监听端口 |
| `HOSTNAME` | `0.0.0.0` | 容器内监听地址 |
| `NEXT_TELEMETRY_DISABLED` | `1` | 关闭构建 / 运行时遥测 |
| `NEXT_DIST_DIR` | `.next-prod` | 镜像内已构建的 Next.js 输出目录；通常保持默认值 |
| `DATA_DIR` | `/app/.data` | 文件型 mock workspace 的绝对目录；变更时须将同一路径挂载为持久 volume，并保证容器用户可写。 |

例如部署平台把外部端口设为 `8080` 时，只需要映射并覆盖 `PORT`：

```bash
docker run --rm -e PORT=8080 -p 8080:8080 \
  -v kokoro-nova-data:/app/.data \
  ghcr.io/lordfoxfairy/kokoro-nova:latest
```

## 拉取公开镜像

```bash
docker pull ghcr.io/lordfoxfairy/kokoro-nova:latest
docker run --rm -p 3200:3200 -v kokoro-nova-data:/app/.data \
  ghcr.io/lordfoxfairy/kokoro-nova:latest
```

演示或部署时建议固定版本 tag；需要可复现构建时固定 GHCR digest。
