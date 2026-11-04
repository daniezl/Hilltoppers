### 必须：Google 登录（和邮箱密码并存）

登录页最上面是「Sign in with Google」，下面是原来的邮箱 + 密码登录 / 注册，两种方式都能用；
老账号照常登录，不需要迁移，随时可以在 Account 页把 Google 连到已有账号上。扩展里唯一
没法写死的值是 OAuth client id，需要在同一个 Google Cloud 项目里配一次：

1. Google Cloud Console → API 和凭据 → 创建凭据 → OAuth 客户端 ID，应用类型选
   **Web 应用**（不要选「Chrome 扩展程序」，那种类型不能自定义重定向 URI）。
2. 在「已获授权的重定向 URI」里加上 `https://<扩展 ID>.chromiumapp.org/`。
   扩展 ID 在 `chrome://extensions` 上可以看到，
   `chrome-extension/src/firebase/auth.ts` 里的 `googleRedirectUrl()` 返回的就是
   这个字符串。用「加载已解压的扩展程序」从别的目录加载时扩展 ID 会变；想让多台
   机器共用一个 client，就在 `manifest.json` 里用 `key` 固定 ID。
3. Firebase 控制台 → Authentication → 登录方式 → 启用 **Google**。
4. 把 client id 写进 `chrome-extension/.env.local`（已被 git 忽略）再重新构建：

   ```
   VITE_GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
   ```

5. 发布 OAuth 同意屏幕（OAuth consent screen → Publishing status → In production）。
   留在 Testing 时只有名单里的测试用户能授权，上限 100 人。`openid email profile` 是
   非敏感权限，不需要 Google 审核。
6. 如果学校的 Workspace 管理员限制了第三方应用，要把这个 client id 加进允许列表，
   否则学生看到的是 “app blocked”，而不是授权页。

没配好之前 Account 页面照常打开，Google 按钮会直接说还没设置好，不会弹出窗口；下面的
邮箱密码登录完全不受影响。

**老账号怎么用上 Google**：先照常用邮箱密码登录，然后在 Account → Connections →
Google sign-in 点 Connect。uid 不变，课表偏好和 Toppings 都留在原账号上，之后就多了
Google 这一种登录方式。还没连接的时候用同一个邮箱点 Google 会报
`auth/account-exists-with-different-credential`，页面会提示先回到邮箱密码登录再连接。
