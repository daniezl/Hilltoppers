# Custom Schedule 格式说明

在 `special_days.json` 中如何编写自定义课程表（custom schedule）。

## 📋 基本结构

`special_days.json` 是一个 JSON 对象，key 是日期（格式：`yyyy-LL-dd`），value 是日期记录对象。

### 日期记录对象结构

```typescript
{
  "type": "custom",           // 必须是 "custom" 才会使用 schedule 字段
  "details": "可选描述",      // 可选，用于显示日期类型标签
  "schedule": [               // 自定义课程表数组
    {
      "name": "课程名称",
      "start": "HH:mm",       // 开始时间，24小时制
      "end": "HH:mm",         // 结束时间，24小时制
      "subBlocks": []         // 可选的子块数组（比如午餐时间段）
    }
  ]
}
```

## 📝 完整示例

### 示例 1: 简单的自定义课程表

```json
{
  "2025-11-21": {
    "type": "custom",
    "details": "Early Dismissal Day",
    "schedule": [
      { "name": "Chapel", "start": "08:00", "end": "08:10" },
      { "name": "A Block", "start": "08:20", "end": "09:00" },
      { "name": "B Block", "start": "09:05", "end": "09:45" },
      { "name": "C Block", "start": "09:50", "end": "10:30" },
      { "name": "D Block", "start": "10:35", "end": "11:15" },
      { "name": "E Block", "start": "11:20", "end": "12:00" }
    ]
  }
}
```

### 示例 2: 包含午餐子块的自定义课程表

```json
{
  "2025-11-22": {
    "type": "custom",
    "details": "Green Day - Special Schedule",
    "schedule": [
      { "name": "Chapel", "start": "08:00", "end": "08:10" },
      { "name": "A Block", "start": "08:20", "end": "09:20" },
      { "name": "B Block", "start": "09:25", "end": "10:25" },
      {
        "name": "C Block",
        "start": "11:05",
        "end": "12:40",
        "subBlocks": [
          { "name": "1st Lunch", "start": "11:05", "end": "11:25" },
          { "name": "2nd Lunch", "start": "11:25", "end": "11:45" },
          { "name": "3rd Lunch", "start": "11:45", "end": "12:05" },
          { "name": "4th Lunch", "start": "12:05", "end": "12:25" },
          { "name": "5th Lunch", "start": "12:20", "end": "12:40" }
        ]
      },
      { "name": "D Block", "start": "12:45", "end": "13:45" },
      { "name": "E Block", "start": "13:50", "end": "14:50" },
      { "name": "CP", "start": "14:55", "end": "15:15" }
    ]
  }
}
```

### 示例 3: 延迟开学的课程表

```json
{
  "2025-12-01": {
    "type": "custom",
    "details": "Late Start Day",
    "schedule": [
      {
        "name": "A Block",
        "start": "10:00",
        "end": "10:40"
      },
      {
        "name": "B Block",
        "start": "10:45",
        "end": "11:25"
      },
      {
        "name": "C Block",
        "start": "11:30",
        "end": "13:05",
        "subBlocks": [
          { "name": "1st Lunch", "start": "11:30", "end": "11:50" },
          { "name": "2nd Lunch", "start": "11:50", "end": "12:10" },
          { "name": "3rd Lunch", "start": "12:10", "end": "12:30" },
          { "name": "4th Lunch", "start": "12:30", "end": "12:50" },
          { "name": "5th Lunch", "start": "12:45", "end": "13:05" }
        ]
      },
      {
        "name": "D Block",
        "start": "13:10",
        "end": "13:50"
      },
      {
        "name": "E Block",
        "start": "13:55",
        "end": "14:35"
      },
      {
        "name": "CP",
        "start": "14:40",
        "end": "15:00"
      }
    ]
  }
}
```

## 🔑 重要字段说明

### `type` 字段
- **必须**是 `"custom"` 才会使用 `schedule` 字段
- 如果是其他类型（如 `"schedule_mon_thu"`、`"schedule_wed"` 等），会加载对应的本地 JSON 文件
- 如果 `type` 是 `"no_school"`，会显示 "No School"，忽略 `schedule` 字段

### `details` 字段
- **可选**字段
- 用于显示日期类型标签（如 "Green Day"、"White Day"、"Early Dismissal" 等）
- 如果为空且 `type` 是 `"custom"`，系统会尝试从 Bulletin 网站解析日期类型

### `schedule` 字段
- **可选**字段，但当 `type` 是 `"custom"` 时必须提供
- 是一个数组，包含多个课程块（Block）
- 每个课程块必须包含：
  - `name`: 课程名称（字符串）
  - `start`: 开始时间（格式：`"HH:mm"`，24小时制）
  - `end`: 结束时间（格式：`"HH:mm"`，24小时制）
  - `subBlocks`: 可选，子块数组（通常用于午餐时间段）

### `subBlocks` 字段
- **可选**字段
- 用于定义课程块内的子时间段（比如不同午餐时间）
- 每个子块的结构与主块相同：
  - `name`: 子块名称
  - `start`: 开始时间
  - `end`: 结束时间

## 📅 日期格式

- **key 格式**: `"yyyy-LL-dd"`（例如：`"2025-11-21"`）
- **时间格式**: `"HH:mm"`（24小时制，例如：`"08:00"`、`"14:30"`）
- 所有时间都是 **EST 时区**

## ✅ 验证规则

1. `type` 必须是 `"custom"` 才会使用 `schedule` 字段
2. `schedule` 必须是数组
3. 每个课程块必须有 `name`、`start`、`end` 字段
4. `start` 和 `end` 必须是有效的 `"HH:mm"` 格式
5. `subBlocks` 如果存在，必须是数组

## 💡 提示

1. **参考现有文件**: 可以参考 `public/schedule/` 目录下的 JSON 文件格式
   - `schedule_fri.json` - 周五课程表
   - `late_start.json` - 延迟开学课程表
   - `abdec.json` - ABDEC 课程表

2. **测试**: 修改后上传到 Cloudflare Pages，打开 popup 测试显示是否正确

3. **多个日期**: 可以在同一个 `special_days.json` 文件中定义多个日期：
   ```json
   {
     "2025-11-21": { "type": "custom", "schedule": [...] },
     "2025-11-22": { "type": "custom", "schedule": [...] },
     "2025-11-25": { "type": "no_school" }
   }
   ```

4. **日期类型标签**: 如果 `details` 字段包含 "green" 或 "white"，会自动识别为 "Green Day" 或 "White Day"

