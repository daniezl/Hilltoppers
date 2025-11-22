# Special Periods 缓存读取逻辑详解

## 实际代码逻辑

### 情况 1: `isInSpecialPeriod()` 函数中的检查

```typescript
export async function isInSpecialPeriod(date: Date): Promise<boolean> {
  // 步骤 1: 先检查持久化缓存（Chrome Storage Local）
  const cachedPeriods = await getCachedSpecialPeriods();  // ← 这里检查持久化缓存
  if (cachedPeriods) {
    // ✅ 如果持久化缓存有效（< 4小时），直接使用，不再进行网络请求
    return checkIfDateInPeriods(date, cachedPeriods);
  }
  
  // 步骤 2: 持久化缓存无效或不存在，调用 loadSpecialPeriodsFromCloudflare()
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();  // ← 没有传 forceRefresh，默认 false
  if (cloudflarePeriods) {
    // 保存到持久化缓存
    await setCachedSpecialPeriods(cloudflarePeriods);
    return checkIfDateInPeriods(date, cloudflarePeriods);
  }
  
  return false;
}
```

在 `loadSpecialPeriodsFromCloudflare()` 中（当 `forceRefresh = false` 时）：

```typescript
async function loadSpecialPeriodsFromCloudflare(forceRefresh = false): Promise<...> {
  // 步骤 2.1: 检查内存缓存
  if (cachedSpecialPeriodsData && !forceRefresh) {
    // ✅ 如果内存缓存存在且不是强制刷新，直接返回内存缓存
    // 这避免了重复的网络请求（在同一个 Service Worker 生命周期内）
    return cachedSpecialPeriodsData;
  }
  
  // 步骤 2.2: 内存缓存也没有，才从 Cloudflare 加载
  const response = await fetch(url, { cache: 'no-cache' });
  // ... 解析数据 ...
  cachedSpecialPeriodsData = data;  // 更新内存缓存
  return data;
}
```

### 情况 2: `fetchSpecialDayData()` 中的强制刷新

```typescript
async function fetchSpecialDayData(date: Date): Promise<SpecialDayRecord | null> {
  // ⚠️ 注意：这里强制刷新（forceRefresh = true）
  const cloudflarePeriodsPromise = loadSpecialPeriodsFromCloudflare(true);
  // ...
}
```

在 `loadSpecialPeriodsFromCloudflare(true)` 中（强制刷新）：

```typescript
async function loadSpecialPeriodsFromCloudflare(forceRefresh = true): Promise<...> {
  // ⚠️ 因为 forceRefresh = true，跳过内存缓存检查
  // 即使内存缓存存在，也会强制从网络加载
  
  const response = await fetch(url, { cache: 'no-cache' });
  // ... 解析数据 ...
  cachedSpecialPeriodsData = data;  // 更新内存缓存
  return data;
}
```

## 📊 完整流程图

### 在 `isInSpecialPeriod()` 中的流程：

```
isInSpecialPeriod(date)
    ↓
┌──────────────────────────────────────┐
│ 1. 检查持久化缓存                     │
│    getCachedSpecialPeriods()         │
│    ├─ 读取 Chrome Storage Local      │
│    ├─ 检查是否 < 4小时                │
│    └─ 结果:                          │
│       ├─ ✅ 有效 → 直接返回，结束    │
│       └─ ❌ 无效 → 继续下一步        │
└──────────────────────────────────────┘
    ↓ (如果持久化缓存无效)
┌──────────────────────────────────────┐
│ 2. 调用 loadSpecialPeriodsFromCloudflare(false) │
│    ├─ 检查内存缓存 cachedSpecialPeriodsData    │
│    │   ├─ ✅ 存在 → 返回内存缓存，结束 │
│    │   └─ ❌ 不存在 → 继续下一步     │
│    │                                    │
│    └─ 从 Cloudflare 加载                │
│       ├─ 请求网络                       │
│       ├─ 更新内存缓存                   │
│       └─ 更新持久化缓存                 │
└──────────────────────────────────────┘
```

### 在 `fetchSpecialDayData()` 中的流程（强制刷新）：

```
fetchSpecialDayData(date)
    ↓
┌──────────────────────────────────────┐
│ 调用 loadSpecialPeriodsFromCloudflare(true) │
│ ⚠️ forceRefresh = true               │
│    ├─ 跳过内存缓存检查（因为强制刷新）│
│    └─ 直接从 Cloudflare 加载         │
│       ├─ 请求网络                     │
│       ├─ 更新内存缓存                 │
│       └─ 更新持久化缓存               │
└──────────────────────────────────────┘
```

## 🎯 为什么要这样设计？

### 三层缓存的好处：

1. **持久化缓存（4小时有效）**
   - ✅ 即使 Service Worker 重启，数据还在
   - ✅ 减少网络请求次数
   - ⚠️ 但可能不够新鲜（最多4小时过期）

2. **内存缓存（Service Worker 运行期间）**
   - ✅ 最快，零延迟
   - ✅ 避免同一生命周期内的重复请求
   - ⚠️ Service Worker 重启后丢失

3. **网络请求**
   - ✅ 数据最新
   - ⚠️ 需要网络，有延迟

### 实际场景示例：

**场景 A: 第一次检查（没有缓存）**
```
isInSpecialPeriod() 
  → 持久化缓存: 不存在 ❌
  → 内存缓存: 不存在 ❌
  → 从 Cloudflare 加载 ✅
  → 同时更新内存和持久化缓存
```

**场景 B: 第二次检查（同一 Service Worker 生命周期内，持久化缓存过期）**
```
isInSpecialPeriod()
  → 持久化缓存: 过期（> 4小时）❌
  → 调用 loadSpecialPeriodsFromCloudflare(false)
  → 内存缓存: 存在 ✅
  → 直接返回内存缓存，不进行网络请求
```

**场景 C: Service Worker 重启后（持久化缓存有效）**
```
isInSpecialPeriod()
  → 持久化缓存: 有效（< 4小时）✅
  → 直接使用，不检查内存缓存，不进行网络请求
```

**场景 D: 在 fetchSpecialDayData() 中（强制刷新）**
```
fetchSpecialDayData()
  → 跳过持久化缓存检查
  → 调用 loadSpecialPeriodsFromCloudflare(true)
  → 跳过内存缓存检查（因为强制刷新）
  → 直接从 Cloudflare 加载 ✅
  → 更新内存和持久化缓存
```

## 🔑 关键点总结

1. **持久化缓存优先**: 在 `isInSpecialPeriod()` 中，先检查持久化缓存
2. **内存缓存作为中间层**: 只有在持久化缓存无效时，才检查内存缓存
3. **强制刷新跳过所有缓存**: 在 `fetchSpecialDayData()` 中强制刷新，确保数据同步

