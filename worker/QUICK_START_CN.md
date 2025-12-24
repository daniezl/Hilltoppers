# Worker 快速开始（中文）

## 5 分钟快速部署

### 1. 安装和登录

```bash
cd worker
npm install
npx wrangler login
```

### 2. 创建 KV 存储

```bash
npx wrangler kv namespace create SCHEDULE_KV
```

**复制输出的 ID**，例如：`abc123def456...`

### 3. 配置 KV ID

编辑 `wrangler.toml`，将第 12 行的 `YOUR_KV_NAMESPACE_ID` 替换为刚才复制的 ID：

```toml
[[env.production.kv_namespaces]]
binding = "SCHEDULE_KV"
id = "abc123def456..."  # ← 替换这里
```

### 4. 设置邮箱权限

```bash
# 设置编辑器邮箱（可以创建和编辑草稿）
npx wrangler secret put EDITORS
# 输入：editor1@example.com,editor2@example.com

# 设置管理员邮箱（可以发布和回滚）
npx wrangler secret put ADMINS
# 输入：admin@example.com
```

### 5. 部署

```bash
npx wrangler deploy
```

完成！Worker 已部署。

## 验证部署

```bash
# 查看实时日志
npx wrangler tail

# 测试公共端点
curl https://你的worker名.你的子域名.workers.dev/api/special_days.json
```

## 常见问题

**Q: 如何更新邮箱列表？**
```bash
npx wrangler secret put EDITORS
# 输入新的邮箱列表
```

**Q: 如何查看当前配置？**
```bash
npx wrangler secret list
```

**Q: 部署失败怎么办？**
- 检查 KV namespace ID 是否正确
- 确认已登录：`npx wrangler whoami`
- 查看错误信息并修复

## 下一步

1. 配置 Cloudflare Access（见 `ADMIN_SETUP.md`）
2. 部署 Admin UI（见 `admin/README.md`）

详细说明请查看 `DEPLOYMENT_GUIDE.md`

