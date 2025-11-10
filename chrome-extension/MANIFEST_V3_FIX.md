# Manifest V3 合规性修复

## 问题描述
Chrome Web Store检测到扩展违反了Manifest V3规则，因为Firebase SDK尝试加载远程托管的代码：
- `https://apis.google.com/js/api.js`
- `https://www.google.com/recaptcha/api.js`
- `https://www.google.com/recaptcha/enterprise.js?render=`

## 解决方案

### 1. 添加Content Security Policy (CSP)
**文件**: `manifest.json`

添加了严格的CSP策略，只允许加载本地打包的代码：
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

### 2. 移除不必要的权限
**文件**: `manifest.json`

移除了 `https://www.googleapis.com/*` 和 `https://apis.google.com/*` 权限，因为不需要加载外部脚本。

### 3. 配置Firebase Auth
**文件**: `src/firebase/auth.ts`

- 显式设置 `browserLocalPersistence` 
- 配置Firebase Auth在Chrome扩展环境中运行
- 不使用需要加载外部脚本的功能（如reCAPTCHA）

### 4. 创建Vite插件移除Firebase远程代码引用
**文件**: `vite-plugin-remove-firebase-remote-code.ts`

创建了一个自定义Vite插件，在构建时：
- 移除Firebase SDK中硬编码的Google API URL
- 将脚本加载代码替换为空字符串
- 确保最终打包的代码不包含任何远程代码引用

### 5. 更新Vite配置
**文件**: `vite.config.ts`

- 使用 `esbuild` 而不是 `terser` 进行代码压缩
- 添加自定义插件来移除Firebase远程代码
- 配置 `target: 'esnext'` 以支持现代浏览器特性
- 确保所有依赖都被正确打包

## 验证

运行以下命令验证没有外部脚本引用：
```bash
cd dist
grep -r "apis.google.com\|www.google.com/recaptcha" .
```

如果没有输出，说明所有外部引用已被移除。

## 构建

```bash
npm run build
```

## 注意事项

1. **功能影响**: Firebase Auth的某些功能可能受限（如reCAPTCHA验证），但基本的登录、注册、Token管理功能不受影响。

2. **持续维护**: 如果升级Firebase版本，需要重新验证是否仍然合规。

3. **测试**: 在提交到Chrome Web Store前，请在本地测试所有Firebase功能（登录、登出、数据读写）确保正常工作。

## 相关资源

- [Chrome Extension Manifest V3 文档](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Firebase for Chrome Extensions 指南](https://firebase.google.com/docs/web/setup#chrome-extensions)
- [Content Security Policy](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)

