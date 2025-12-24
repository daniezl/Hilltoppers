# 部署说明

## 重要：必须上传 functions 文件夹

Pages Functions 需要 `functions/` 文件夹才能工作。

### 手动上传时

如果手动上传文件到 Cloudflare Pages，必须包含：

1. `dist/` 文件夹（前端代码）
2. `functions/` 文件夹（API 转发）

### 文件结构

```
admin/
├── dist/              ← 必须上传
│   ├── index.html
│   └── assets/
└── functions/         ← 必须上传（重要！）
    └── api/
        └── [[path]].js
```

### 如果使用 Git 部署

如果使用 Git 连接，`functions/` 文件夹会自动被识别。

### 验证 Function 是否工作

部署后，访问：
```
https://schedule-admin-ui.pages.dev/api/admin/user
```

应该返回 JSON，而不是 HTML。

如果还是返回 HTML，说明 Function 没有部署成功。

