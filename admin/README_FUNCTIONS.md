# Pages Functions 配置说明

## 作用

这个 Function 将 `/api/*` 请求转发到 Worker，这样：
- 所有请求都通过 Pages 域名（`schedule-admin-ui.pages.dev`）
- Cloudflare Access 会自动处理认证
- Worker 能收到正确的认证头

## 部署

1. 重新部署 Pages 项目
2. `functions/` 文件夹会自动被识别
3. Function 会自动处理 `/api/*` 请求

## 如果 Function 不工作

如果 Function 不工作，可以在 Pages 项目的 Settings → Functions 中检查配置。

或者使用环境变量：
- 在 Pages Settings → Variables 中添加 `WORKER_URL`
- 值为：`https://schedule-admin-api.danielzhang089.workers.dev`

