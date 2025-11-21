# 项目设置指南

## iOS 应用设置

### Firebase 配置

1. 从 Firebase Console 下载 `GoogleService-Info.plist` 文件
2. 将文件复制到 `SJA_re/` 目录
3. 确保文件名为 `GoogleService-Info.plist`（不是 `.example` 文件）

**注意**：`GoogleService-Info.plist` 包含敏感信息（API keys），不应提交到 Git。

### Cloudflare 配置

Cloudflare URL 配置在 `SJA_re/Info.plist` 中的 `CloudflareBaseURL` 键。

默认值为 `https://hilltoppers.pages.dev`。

如需修改，编辑 `SJA_re/Info.plist` 中的 `CloudflareBaseURL` 值。

## Chrome 扩展设置

### Firebase 配置

创建 `chrome-extension/.env.local` 文件：

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_FIREBASE_MEASUREMENT_API_SECRET=...
```

### Cloudflare 配置

在 `chrome-extension/.env.local` 文件中添加：

```
VITE_CLOUDFLARE_SCHEDULE_URL=https://hilltoppers.pages.dev
```

## 开发环境

### iOS 应用

1. 打开 `SJA_re.xcodeproj` 在 Xcode 中
2. 确保已配置 `GoogleService-Info.plist`
3. 选择目标设备并运行

### Chrome 扩展

1. 安装依赖：
   ```bash
   cd chrome-extension
   npm install
   ```

2. 开发模式：
   ```bash
   npm run dev
   ```

3. 生产构建：
   ```bash
   npm run build
   ```

4. 在 Chrome 中加载扩展：
   - 打开 `chrome://extensions`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `chrome-extension/dist/` 目录

