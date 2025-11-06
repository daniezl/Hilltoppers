# Email Authentication Feature

## 概述 (Overview)

iOS app 现在支持通过邮箱登录和注册，与 Chrome 扩展的功能保持一致。

## 新增文件 (New Files)

### 1. AuthManager.swift
Firebase 认证管理类，提供以下功能：
- ✅ 邮箱密码登录 (`signIn`)
- ✅ 邮箱密码注册 (`register`)
- ✅ 发送验证邮件 (`sendVerificationEmail`)
- ✅ 刷新用户状态检查验证 (`reloadUser`)
- ✅ 退出登录 (`signOut`)
- ✅ 自动监听认证状态变化
- ✅ 详细的错误处理和本地化错误消息

### 2. AuthView.swift
登录/注册界面，包含：
- ✅ 邮箱和密码输入框
- ✅ 显示/隐藏密码功能
- ✅ 登录和注册模式切换
- ✅ 邮箱验证提醒
- ✅ 自动检测验证状态（每5秒）
- ✅ 重发验证邮件（带60秒冷却）
- ✅ 实时反馈消息（成功/错误/警告/信息）
- ✅ 用户友好的界面设计

### 3. 更新的文件
- `NavigationRouter.swift`: 添加 `.settingsAuth` 路由
- `ContentView.swift`: 
  - 在 `navigationDestination` 中添加 AuthView 路由处理
  - 在 `SettingsView` 中添加登录选项
  - 显示登录状态指示器（已验证✓ / 需要验证⚠️）

## 功能特性 (Features)

### 登录流程 (Sign In Flow)
1. 用户输入邮箱和密码
2. 点击"Sign in with email"
3. 如果邮箱未验证，显示验证提醒
4. 验证后可以正常使用

### 注册流程 (Registration Flow)
1. 切换到"Create Account"模式
2. 输入邮箱和密码（至少6个字符）
3. 点击"Create account"
4. 自动发送验证邮件
5. 提示用户检查邮箱（包括垃圾邮件文件夹）
6. 点击邮件中的验证链接
7. 返回 app，点击"I've verified"或等待自动检测

### 邮箱验证 (Email Verification)
- ✅ 注册后自动发送验证邮件
- ✅ 可以重新发送验证邮件（60秒冷却）
- ✅ 自动检测验证状态（每5秒）
- ✅ App 返回前台时立即检查
- ✅ 验证完成后自动更新状态

### 状态指示器 (Status Indicators)
在 Settings 中的 Account/Sign In 选项旁边：
- 未登录：无指示器
- 已登录且已验证：绿色 ✓
- 已登录但未验证：橙色 ⚠️

## 测试步骤 (Testing Steps)

### 1. 将新文件添加到 Xcode 项目
```bash
# 在 Xcode 中：
# File > Add Files to "SJA_re"
# 选择 AuthManager.swift 和 AuthView.swift
# 确保 "Copy items if needed" 被选中
# Target 选择 "SJA_re"
```

### 2. 测试注册流程
1. 运行 app
2. 进入 Settings
3. 点击 "Sign In"
4. 点击 "Need an account? Register"
5. 输入邮箱和密码（至少6个字符）
6. 点击 "Create account"
7. 查看邮件，点击验证链接
8. 返回 app，点击 "I've verified"
9. 确认显示 "Email verified! You're all set."

### 3. 测试登录流程
1. 如果已注册，点击 "Have an account? Sign in"
2. 输入邮箱和密码
3. 点击 "Sign in with email"
4. 如果邮箱未验证，会显示验证提醒
5. 如果已验证，直接登录成功

### 4. 测试验证邮件重发
1. 在验证提醒状态下
2. 点击 "Resend email"
3. 确认显示60秒倒计时
4. 在倒计时期间，按钮应该是禁用的

### 5. 测试退出登录
1. 已登录状态下
2. 在 AuthView 底部点击 "Sign Out"
3. 确认退出成功

### 6. 测试错误处理
- 使用无效邮箱格式
- 使用错误的密码
- 使用已存在的邮箱注册
- 密码少于6个字符
- 网络断开时操作

## 与 Chrome 扩展的一致性 (Consistency with Chrome Extension)

| 功能 | Chrome 扩展 | iOS App |
|------|------------|---------|
| 邮箱密码登录 | ✅ | ✅ |
| 邮箱密码注册 | ✅ | ✅ |
| 邮箱验证 | ✅ | ✅ |
| 自动检测验证 | ✅ | ✅ |
| 重发验证邮件 | ✅ | ✅ |
| 验证冷却时间 | ✅ (60s) | ✅ (60s) |
| 错误处理 | ✅ | ✅ |
| 退出登录 | ✅ | ✅ |

## 错误消息本地化 (Localized Error Messages)

所有错误都有用户友好的本地化消息：
- Invalid email format
- Wrong password
- User not found
- Email already in use
- Weak password (< 6 chars)
- Network errors
- Too many requests
- Account disabled

## 注意事项 (Notes)

1. **Firebase Auth 依赖**: 需要确保 Xcode 项目中已经正确配置 Firebase Auth
2. **GoogleService-Info.plist**: 已存在，无需更改
3. **Info.plist**: 可能需要添加邮箱发送权限（如果还没有）
4. **测试邮箱**: 建议使用真实的邮箱地址测试验证流程
5. **垃圾邮件**: 提醒用户检查垃圾邮件文件夹

## 未来改进 (Future Improvements)

- [ ] 添加忘记密码功能
- [ ] 添加修改密码功能
- [ ] 添加 Google Sign-In (OAuth)
- [ ] 添加 Apple Sign-In
- [ ] 跨设备同步功能实现

## 相关文件 (Related Files)

- Chrome Extension: `/chrome-extension/src/firebase/auth.ts`
- Chrome Extension: `/chrome-extension/src/login/Login.tsx`
- iOS App: `/SJA_re/AuthManager.swift`
- iOS App: `/SJA_re/AuthView.swift`
- Firebase Config: `/SJA_re/GoogleService-Info.plist`

