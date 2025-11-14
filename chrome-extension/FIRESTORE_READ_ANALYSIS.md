# Firestore 读取分析报告

## 📊 所有 Firestore 读取操作

### 1. **`isInSpecialPeriod(date)`** 
**文件**: `src/services/scheduleService.ts:139-158`
- **读取**: 整个 `special_periods` 集合的所有文档
- **文档数**: N 个（假设 5-20 个）
- **调用时机**: 每次 `loadBlocksForDate()` 调用时
- **问题**: ⚠️ **每次都读取整个集合，没有缓存**

### 2. **`fetchSpecialDayData(date)`**
**文件**: `src/services/scheduleService.ts:80-92`
- **读取**: 1 个 `special_days/{date}` 文档
- **文档数**: 1 个
- **调用时机**: 每次 `loadBlocksForDate()` 调用时
- **状态**: ✅ 正常（单文档读取）

### 3. **`fetchSpecialDaysDict(start, end)`**
**文件**: `src/services/scheduleService.ts:170-194`
- **读取**: 日期范围内的多个 `special_days` 文档
- **文档数**: M 个（可能 10-100 个，取决于日期范围）
- **调用时机**: 只在 `predictDayType()` 中调用
- **问题**: ⚠️ **可能读取大量文档**

### 4. **`fetchSpecialPeriods(start, end)`**
**文件**: `src/services/scheduleService.ts:196-217`
- **读取**: 整个 `special_periods` 集合的所有文档
- **文档数**: N 个（假设 5-20 个）
- **调用时机**: 只在 `predictDayType()` 中调用
- **问题**: ⚠️ **每次都读取整个集合，重复读取**

### 5. **`loadFromRemote(userId)` - SchedulePreferences**
**文件**: `src/storage/schedulePreferences.ts:67-88`
- **读取**: 1 个 `users/{userId}` 文档
- **文档数**: 1 个
- **调用时机**: 
  - Popup 打开时
  - 设置页面打开时
- **状态**: ✅ 正常（单文档读取）

### 6. **`loadFromRemote(userId)` - BlockPreferences**
**文件**: `src/storage/blockPreferences.ts:98-119`
- **读取**: 1 个 `users/{userId}` 文档
- **文档数**: 1 个
- **调用时机**: 
  - Popup 打开时
  - 设置页面打开时
- **状态**: ✅ 正常（单文档读取）

---

## 🔄 调用链分析

### **`loadBlocksForDate(date)` 调用链**:

```
loadBlocksForDate(date)
  ├─ isInSpecialPeriod(date)          [读取整个 special_periods 集合]
  ├─ fetchSpecialDayData(date)        [读取1个 special_days 文档]
  └─ resolveBulletinDayType(date)     [可选，仅在需要时]
      └─ predictDayType(...)
          ├─ fetchSpecialDaysDict(...) [读取日期范围内的多个文档]
          └─ fetchSpecialPeriods(...)  [再次读取整个 special_periods 集合]
```

### **调用频率**:

1. **Background 定时刷新**: 每 1 小时 1 次
2. **Popup 打开**: 每次用户打开 popup（可能每天 10-20 次）
3. **总计**: 每天约 34-44 次 `loadBlocksForDate()` 调用

---

## 📈 读取量估算

### **每次 `loadBlocksForDate()` 调用（最坏情况）**:

- `isInSpecialPeriod()`: **N 个文档** (5-20)
- `fetchSpecialDayData()`: **1 个文档**
- `resolveBulletinDayType()` 触发时:
  - `fetchSpecialDaysDict()`: **M 个文档** (10-100)
  - `fetchSpecialPeriods()`: **N 个文档** (5-20)

**最坏情况总读取**: 1 + N + M + N = **1 + 2N + M 个文档**

假设 N=10, M=50:
- **最坏情况**: 1 + 20 + 50 = **71 个文档/次**
- **最好情况**: 1 + 10 = **11 个文档/次**

### **每天总读取量**:

假设每天 40 次调用，平均每次读取 20 个文档:
- **40 × 20 = 800 个文档读取/天**

如果 `resolveBulletinDayType()` 被频繁触发（每天 20 次），每次额外读取 70 个文档:
- **20 × 70 = 1,400 个额外文档读取**
- **总计: 2,200 个文档读取/天**

---

## ⚠️ 主要问题

### 1. **`isInSpecialPeriod()` 每次都读取整个集合**
- `special_periods` 集合很少变化（只有假期期间）
- 应该缓存，只在启动时或定期刷新

### 2. **`fetchSpecialPeriods()` 重复读取**
- 在 `predictDayType()` 中又读取了一次 `special_periods`
- 与 `isInSpecialPeriod()` 重复

### 3. **`fetchSpecialDaysDict()` 可能读取大量文档**
- 如果日期范围很大，可能读取 100+ 个文档
- 应该限制日期范围或使用缓存

### 4. **`resolveBulletinDayType()` 被频繁调用**
- 在多个地方被调用
- 触发时会进行大量的 Firestore 读取
- 应该减少调用频率或使用缓存

---

## 💡 优化建议

### 1. **缓存 `special_periods` 集合**
- 只在启动时读取一次
- 缓存 24 小时或更长时间
- 使用 `chrome.storage.local` 存储

### 2. **合并 `isInSpecialPeriod()` 和 `fetchSpecialPeriods()`**
- 统一到一个函数
- 使用缓存结果

### 3. **限制 `fetchSpecialDaysDict()` 的日期范围**
- 只在必要时查询
- 限制最大日期范围（如 30 天）

### 4. **减少 `resolveBulletinDayType()` 调用**
- 只在真正需要时调用
- 使用缓存结果

### 5. **添加本地缓存层**
- 使用 `chrome.storage.local` 缓存 Firestore 数据
- 设置合理的过期时间（如 1 小时）

---

## 🎯 预期优化效果

### **优化前**:
- 每天约 2,200 个文档读取

### **优化后**:
- `special_periods`: 每天 1 次（启动时） = **20 个文档**
- `special_days`: 每天 40 次 = **40 个文档**
- `fetchSpecialDaysDict()`: 每天 5 次（减少调用） = **250 个文档**
- **总计: 约 310 个文档读取/天**

**减少约 86% 的读取量！** 🎉

