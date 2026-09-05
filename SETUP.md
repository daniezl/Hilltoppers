# 项目设置指南

## iOS 应用设置

### Firebase 配置

不需要做任何事。`ios/SJA_re/GoogleService-Info.plist` 已经在仓库里，clone 下来
直接就能编译。

这个文件里是 Firebase 的客户端配置（API key、project ID、bundle ID），和扩展
打包进去的那套 web config 是同一类东西，本来就是公开的，不是密钥。真正防止
别人乱写数据的是 Firestore 的 Security Rules，不是藏这个文件。

### Cloudflare 配置

Cloudflare URL 配置在 `ios/SJA_re/Info.plist` 中的 `CloudflareBaseURL` 键。

默认值为 `https://hilltoppers.pages.dev`。

如需修改，编辑 `ios/SJA_re/Info.plist` 中的 `CloudflareBaseURL` 值。

## Chrome 扩展设置

不需要做任何事。Firebase 和 Cloudflare 的配置都以默认值写在代码里
（`chrome-extension/src/firebase/config.ts` 和 `scheduleService.ts`），
`npm ci && npm run build` 出来的扩展直接可用。

### 可选：分析上报

唯一没有写进仓库的是 GA4 的 `VITE_FIREBASE_MEASUREMENT_API_SECRET` —— 它是真正
的密钥，拿到它就能往我们的 GA4 属性里写事件。不设置的话分析静默关闭，其他功能
不受影响，日常开发不需要它。

要开就在 `chrome-extension/.env.local`（已被 git 忽略）里加一行：

```
VITE_FIREBASE_MEASUREMENT_API_SECRET=...
```

### 可选：指向别的后端

同一批 `VITE_*` 变量仍然可以覆盖默认值，用于指向另一个 Firebase 项目或另一份
课表数据。变量名见 `config.ts`。

### Firestore 规则：`feedback` 集合

popup 底部的 "Something wrong or missing? Tell me →" 打开 `feedback.html`，提交
写进 Firestore 的 `feedback` 集合。它是**只写不读**的：任何人（包括未登录）都能
新建一条，谁也读不了，只有在 Firebase 控制台里能看。这是刻意的 —— 人只会把
真话打进一个只有作者看的框里。

在 Firebase 控制台 → Firestore → Rules 里加上这一段，没有它每次提交都会被拒：

```
match /feedback/{id} {
  allow create: if request.resource.data.message is string
    && request.resource.data.message.size() > 0
    && request.resource.data.message.size() <= 2000
    && request.resource.data.keys().hasOnly(
         ['message', 'contact', 'uid', 'email', 'extensionVersion', 'createdAt']);
  allow read, update, delete: if false;
}
```

字段含义见 `chrome-extension/src/services/feedbackService.ts`。`uid` / `email`
只在提交者恰好登录了的时候有值，方便回信；`contact` 是他们自己填的。

"Tell me" 里的 me 由 `FEEDBACK_AUDIENCE` 一个常量控制，有第二个人一起看这些
反馈的时候把它改成 `'us'` 即可。

## 开发环境

### iOS 应用

1. 在 Xcode 中打开 `ios/SJA_re.xcodeproj`
2. 选择目标设备并运行

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

