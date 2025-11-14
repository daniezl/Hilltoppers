# Firestore 读取优化总结

## 🎯 优化目标

减少Firestore读取量，避免超过quota limit。

## ✅ 已实施的优化

### 1. **添加本地缓存层**
**文件**: `src/storage/firestoreCache.ts` (新文件)

创建了完整的缓存系统：
- 使用 `chrome.storage.local` 存储缓存数据
- `special_periods` 缓存 24 小时（很少变化）
- `special_days` 缓存 1 小时（每天可能更新）
- 自动序列化/反序列化 Date 对象

### 2. **优化 `isInSpecialPeriod()`**
**文件**: `src/services/scheduleService.ts:165-206`

**之前**: 每次都读取整个 `special_periods` 集合
**现在**: 
- 先检查缓存
- 缓存未命中时才读取 Firestore
- 读取后自动缓存结果

**效果**: 从每次读取 N 个文档减少到每天只读取 1 次

### 3. **优化 `fetchSpecialDayData()`**
**文件**: `src/services/scheduleService.ts:89-118`

**之前**: 每次都读取 Firestore
**现在**: 
- 先检查缓存
- 缓存未命中时才读取 Firestore
- 读取后自动缓存结果

**效果**: 相同日期的数据在缓存有效期内不会重复读取

### 4. **优化 `fetchSpecialDaysDict()`**
**文件**: `src/services/scheduleService.ts:218-258`

**之前**: 每次都读取日期范围内的所有文档
**现在**: 
- 先检查缓存
- 限制最大查询范围为 90 天
- 缓存结果

**效果**: 
- 减少不必要的文档读取
- 大日期范围查询被限制

### 5. **优化 `fetchSpecialPeriods()`**
**文件**: `src/services/scheduleService.ts:261-299`

**之前**: 每次都读取整个 `special_periods` 集合
**现在**: 
- 先检查缓存
- 使用缓存中的数据进行过滤
- 缓存未命中时才读取 Firestore

**效果**: 与 `isInSpecialPeriod()` 共享缓存，避免重复读取

### 6. **移除 Background 中的用户设置读取**
**文件**: `src/background/background.ts`

**之前**: 每 5 分钟读取一次用户设置
**现在**: 不再读取用户设置

**效果**: 每天减少 288 次用户文档读取

### 7. **延长 Background 刷新间隔**
**文件**: `src/background/background.ts`

**之前**: 每 5 分钟刷新一次
**现在**: 每 60 分钟（1 小时）刷新一次

**效果**: 每天减少 288 次到 24 次刷新

## 📊 优化效果估算

### **优化前**:
- Background 刷新: 288 次/天 (每 5 分钟)
- Popup 打开: 10-20 次/天
- 每次 `loadBlocksForDate()` 调用:
  - `isInSpecialPeriod()`: N 个文档 (5-20)
  - `fetchSpecialDayData()`: 1 个文档
  - `resolveBulletinDayType()` 触发时:
    - `fetchSpecialDaysDict()`: M 个文档 (10-100)
    - `fetchSpecialPeriods()`: N 个文档 (5-20)
- **总计**: 每天约 2,200-8,000 个文档读取

### **优化后**:
- Background 刷新: 24 次/天 (每 60 分钟)
- Popup 打开: 10-20 次/天
- `special_periods`: 每天 1 次（启动时或缓存过期）
- `special_days`: 每天约 34-44 次（但大部分从缓存读取）
- `fetchSpecialDaysDict()`: 每天约 5 次（减少调用，限制范围）
- **总计**: 每天约 50-100 个文档读取

### **减少比例**: 
- **约 95-98% 的读取量减少！** 🎉

## 🔍 缓存策略

### **`special_periods` 集合**
- **缓存时长**: 24 小时
- **原因**: 很少变化（只有假期期间）
- **更新时机**: 启动时或缓存过期时

### **`special_days` 集合**
- **缓存时长**: 1 小时
- **原因**: 每天可能更新
- **更新时机**: 缓存未命中时自动更新

### **用户设置**
- **不再在 Background 中读取**
- **只在 Popup 或设置页面打开时读取**

## 🚀 使用方式

### **自动缓存**
所有 Firestore 读取操作都会自动使用缓存，无需手动管理。

### **清除缓存**
如果需要清除缓存，可以调用：
```typescript
import { clearCache } from './storage/firestoreCache';
await clearCache();
```

## 📝 注意事项

1. **缓存大小**: 缓存存储在 `chrome.storage.local` 中，有 10MB 限制
2. **缓存失效**: 缓存会在指定时间后自动失效
3. **数据一致性**: 缓存可能导致数据不是最新的，但这是可接受的权衡
4. **测试**: 在生产环境部署前，请测试所有功能确保正常工作

## 🔄 未来优化建议

1. **添加缓存预热**: 在 Background 启动时预加载常用数据
2. **智能缓存更新**: 根据数据变化频率调整缓存时长
3. **增量更新**: 只更新变化的数据，而不是全部重新读取
4. **压缩缓存**: 压缩缓存数据以减少存储空间

