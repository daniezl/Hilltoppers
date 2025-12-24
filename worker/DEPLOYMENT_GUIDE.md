# Worker 部署指南

本指南详细说明如何部署 Cloudflare Worker 和配置环境变量。

## 前置要求

1. 安装 Node.js (v18 或更高版本)
2. 安装 Wrangler CLI
3. Cloudflare 账号
4. 已配置的域名（可选，但推荐）

## 步骤 1: 安装依赖

```bash
cd worker
npm install
```

## 步骤 2: 登录 Cloudflare

```bash
npx wrangler login
```

这会打开浏览器，让你登录 Cloudflare 账号并授权 Wrangler。

## 步骤 3: 创建 KV Namespace

KV Namespace 用于存储 schedule 数据。

```bash
# 创建生产环境的 KV namespace（注意：使用空格，不是冒号）
npx wrangler kv namespace create SCHEDULE_KV

# 输出示例：
# 🌀 Creating namespace with title "schedule-admin-api-SCHEDULE_KV"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "SCHEDULE_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**重要**: 复制输出的 `id`，下一步会用到。

## 步骤 4: 更新 wrangler.toml

编辑 `wrangler.toml`，将 KV namespace ID 填入：

```toml
[[env.production.kv_namespaces]]
binding = "SCHEDULE_KV"
id = "你刚才复制的 ID"
```

## 步骤 5: 设置环境变量

有两种方式设置环境变量：

### 方式 A: 使用 Wrangler Secrets（推荐用于敏感信息）

```bash
# 设置 EDITORS（编辑器邮箱列表）
npx wrangler secret put EDITORS
# 然后输入：editor1@example.com,editor2@example.com

# 设置 ADMINS（管理员邮箱列表）
npx wrangler secret put ADMINS
# 然后输入：admin@example.com
```

**注意**: Secrets 是加密存储的，不会在日志中显示。

### 方式 B: 在 Cloudflare Dashboard 设置（推荐用于非敏感配置）

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → 选择你的 Worker
3. 点击 **Settings** → **Variables**
4. 在 **Environment Variables** 部分添加：
   - `EDITORS`: `editor1@example.com,editor2@example.com`
   - `ADMINS`: `admin@example.com`

### 方式 C: 在 wrangler.toml 中设置（仅用于开发）

```toml
[env.production.vars]
EDITORS = "editor1@example.com,editor2@example.com"
ADMINS = "admin@example.com"
```

**注意**: 这种方式不推荐用于生产环境，因为配置会提交到代码仓库。

## 步骤 6: 部署 Worker

### 首次部署

```bash
npx wrangler deploy
```

### 后续更新

```bash
# 方式 1: 直接部署
npx wrangler deploy

# 方式 2: 部署到特定环境
npx wrangler deploy --env production
```

## 步骤 7: 验证部署

### 检查 Worker 状态

```bash
npx wrangler deployments list
```

### 查看实时日志

```bash
npx wrangler tail
```

### 测试 API 端点

```bash
# 测试用户信息端点（需要 Cloudflare Access 认证）
curl https://your-worker.your-subdomain.workers.dev/api/admin/user \
  -H "Cf-Access-Authenticated-User-Email: admin@example.com"

# 测试公共端点
curl https://your-worker.your-subdomain.workers.dev/api/special_days.json
```

## 步骤 8: 配置自定义域名（可选）

### 在 Cloudflare Dashboard 配置

1. 进入 **Workers & Pages** → 你的 Worker → **Settings**
2. 找到 **Triggers** → **Routes**
3. 点击 **Add Route**
4. 配置：
   - **Route**: `api.yourdomain.com/*`
   - **Zone**: 选择你的域名
5. 保存

### 或使用 Wrangler

```bash
npx wrangler routes add api.yourdomain.com/* --zone yourdomain.com
```

## 环境变量格式说明

### EDITORS 格式

```
editor1@example.com,editor2@example.com,editor3@example.com
```

- 多个邮箱用**逗号**分隔
- 不需要空格（但空格会被自动去除）
- 大小写不敏感

### ADMINS 格式

```
admin@example.com
```

- 单个或多个邮箱，格式同上
- Admin 自动拥有 editor 权限

## 常见问题

### 1. 部署失败：KV namespace 未找到

**解决方案**: 确保 `wrangler.toml` 中的 KV namespace ID 正确。

### 2. 403 错误：用户未授权

**检查清单**:
- 确认邮箱在 `EDITORS` 或 `ADMINS` 环境变量中
- 检查邮箱拼写（大小写不敏感，但拼写必须正确）
- 确认 Cloudflare Access 正确配置
- 查看 Worker 日志：`npx wrangler tail`

### 3. 环境变量未生效

**解决方案**:
- 使用 `npx wrangler secret list` 查看已设置的 secrets
- 在 Dashboard 中检查 Variables 设置
- 重新部署 Worker：`npx wrangler deploy`

### 4. 如何更新环境变量

```bash
# 更新 secret
npx wrangler secret put EDITORS
# 输入新值

# 或在 Dashboard 中更新 Variables
# 更新后无需重新部署，会自动生效
```

### 5. 查看当前配置

```bash
# 查看所有 secrets（不显示值）
npx wrangler secret list

# 查看 Worker 信息
npx wrangler whoami
```

## 开发环境

### 本地开发

```bash
# 启动本地开发服务器
npx wrangler dev

# 使用本地 KV（可选）
npx wrangler dev --local
```

### 本地环境变量

创建 `.dev.vars` 文件（不要提交到 git）：

```bash
EDITORS=editor1@example.com,editor2@example.com
ADMINS=admin@example.com
```

## 生产环境检查清单

- [ ] KV namespace 已创建并配置
- [ ] `EDITORS` 环境变量已设置
- [ ] `ADMINS` 环境变量已设置
- [ ] Worker 已成功部署
- [ ] 自定义域名已配置（如需要）
- [ ] Cloudflare Access 已配置
- [ ] 测试了认证和授权流程
- [ ] 查看了 Worker 日志确认无错误

## 快速参考命令

```bash
# 登录
npx wrangler login

# 创建 KV namespace
npx wrangler kv namespace create SCHEDULE_KV

# 设置环境变量（secrets）
npx wrangler secret put EDITORS
npx wrangler secret put ADMINS

# 部署
npx wrangler deploy

# 查看日志
npx wrangler tail

# 查看部署列表
npx wrangler deployments list

# 查看 secrets 列表
npx wrangler secret list
```

## 下一步

部署完成后，继续配置：
1. Cloudflare Access（见 `ADMIN_SETUP.md`）
2. Admin UI 部署（见 `admin/README.md`）

