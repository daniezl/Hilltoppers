# Chrome 扩展刷新流程详解

## 📋 目录
1. [触发时机](#触发时机)
2. [缓存层级](#缓存层级)
3. [完整刷新流程](#完整刷新流程)
4. [文件读取顺序](#文件读取顺序)
5. [缓存策略](#缓存策略)

---

## 🕐 触发时机

### 自动刷新
1. **扩展安装/启动时** (`onInstalled` / `onStartup`)
   - 立即执行一次刷新

2. **定时刷新** (`REFRESH_ALARM`)
   - **在校时间内**：每 **60 分钟** 自动刷新一次
   - **非在校时间**：不刷新，等待下次在校时间开始（6am）再刷新

### 手动刷新
- 用户通过 popup 触发 `requestScheduleRefresh` 消息
- 无论何时都可以手动刷新

---

## 💾 缓存层级

系统使用**三层缓存机制**：

### 1. 内存缓存（Memory Cache）
- **位置**：Service Worker 内存中
- **生命周期**：Service Worker 运行期间
- **存储内容**：
  - `cachedSpecialDaysData`: special_days 完整数据
  - `cachedSpecialPeriodsData`: special_periods 完整数据
  - `cachedSchedule`: 当前日期的课程表 blocks
  - `cachedDateKey`: 当前日期键
  - `cachedDayType`: 当前日期类型

### 2. 持久化缓存（Chrome Storage Local）
- **位置**：`chrome.storage.local`
- **生命周期**：持久存储，直到被清除或过期
- **存储内容**：
  - `firestore_cache_special_periods`: special_periods 缓存（4小时有效）
  - `firestore_cache_special_days`: special_days 缓存（15分钟有效）
  - `firestore_cache_day_type_resolved`: 解析后的日期类型缓存

### 3. 浏览器缓存（HTTP Cache）
- **位置**：浏览器 HTTP 缓存
- **控制**：使用 `cache: 'no-cache'` 强制绕过

---

## 🔄 完整刷新流程

### 步骤 1: `refreshSchedule()` 被调用
**位置**: `background.ts:253`

```
refreshSchedule()
  ↓
保存当前缓存作为 fallback
  ↓
调用 loadBlocksForDate(today)
```

### 步骤 2: `loadBlocksForDate(date)` 开始执行
**位置**: `scheduleService.ts:515`

#### 2.1 检查 Special Periods
```
isInSpecialPeriod(date)
  ↓
1. 读取持久化缓存: getCachedSpecialPeriods()
   ├─ 如果缓存有效（< 4小时）→ 直接返回缓存数据 ✅
   └─ 如果缓存无效或不存在
       ↓
2. 检查内存缓存: cachedSpecialPeriodsData
   ├─ 如果存在且未强制刷新 → 返回内存缓存 ✅
   └─ 如果不存在或强制刷新
       ↓
3. 从 Cloudflare 加载: loadSpecialPeriodsFromCloudflare()
   ├─ 请求: GET https://hilltoppers.pages.dev/special_periods.json
   ├─ 更新内存缓存: cachedSpecialPeriodsData = data
   └─ 更新持久化缓存: setCachedSpecialPeriods(data)
```

**如果日期在 special period 中** → 直接返回 `{ blocks: [], dayType: 'No School' }` ✅

#### 2.2 获取 Special Day 数据
```
fetchSpecialDayData(date)
  ↓
并行执行（Promise.all）:
  ├─ loadSpecialDaysFromCloudflare(true)  // 强制刷新
  └─ loadSpecialPeriodsFromCloudflare(true)  // 强制刷新
```

**Special Days 加载流程**:
```
loadSpecialDaysFromCloudflare(forceRefresh=true)
  ↓
1. 检查内存缓存: cachedSpecialDaysData
   └─ 因为 forceRefresh=true，跳过内存缓存
       ↓
2. 从 Cloudflare 加载
   ├─ 请求: GET https://hilltoppers.pages.dev/special_days.json
   ├─ 使用 cache: 'no-cache' 绕过浏览器缓存
   ├─ 更新内存缓存: cachedSpecialDaysData = data
   └─ 返回数据
       ↓
3. 如果加载失败（网络错误/HTTP错误/解析错误）
   └─ 读取持久化缓存: getCachedSpecialDay(dateKey)
       ├─ 如果缓存有效（< 15分钟）→ 返回缓存数据 ✅
       └─ 如果缓存无效 → 返回 null
       ↓
4. 如果加载成功
   ├─ 比较新旧数据，只更新变化的部分
   ├─ 更新持久化缓存: setCachedSpecialDay() 对每个变化的日期
   └─ 返回请求日期的数据（如果存在）
       └─ 如果不存在，尝试从持久化缓存读取
```

**Special Periods 加载流程**（在 fetchSpecialDayData 中并行执行）:
```
loadSpecialPeriodsFromCloudflare(forceRefresh=true)
  ↓
1. 检查内存缓存: cachedSpecialPeriodsData
   └─ 因为 forceRefresh=true，跳过内存缓存
       ↓
2. 从 Cloudflare 加载
   ├─ 请求: GET https://hilltoppers.pages.dev/special_periods.json
   ├─ 使用 cache: 'no-cache' 绕过浏览器缓存
   ├─ 更新内存缓存: cachedSpecialPeriodsData = data
   └─ 更新持久化缓存: setCachedSpecialPeriods(data)
```

#### 2.3 根据 Special Day 类型加载课程表

**情况 A: `rawType === 'no_school'`**
```
→ 返回 { blocks: [], dayType: 'No School' } ✅
```

**情况 B: `rawType === 'custom'`**
```
1. 从 specialDayData.schedule 解码课程表
2. 如果没有 dayTypeLabel，调用 resolveBulletinDayType()
   └─ 读取缓存 → 如果不存在 → 从 Bulletin 网站抓取
3. 返回 { blocks: customBlocks, dayType: dayTypeLabel } ✅
```

**情况 C: `rawType` 是其他类型（如 'schedule_mon_thu'）**
```
1. 加载对应类型的课程表: loadScheduleByType(rawType)
   └─ 读取本地 JSON 文件: schedule/{rawType}.json
2. 如果没有 dayTypeLabel，调用 resolveBulletinDayType()
3. 返回 { blocks: typedBlocks, dayType: dayTypeLabel } ✅
```

**情况 D: 没有 special day 记录**
```
1. 如果没有 dayTypeLabel，调用 resolveBulletinDayType()
2. 根据星期几获取默认课程表: getDefaultScheduleForWeekday()
   ├─ 周一/周二/周四 → schedule_mon_thu.json
   ├─ 周三 → schedule_wed.json
   ├─ 周五 → schedule_fri.json
   └─ 周末 → null
3. 加载默认课程表: loadJsonSchedule(fallbackKey)
   └─ 读取本地 JSON 文件
4. 返回 { blocks: fallbackBlocks, dayType: dayTypeLabel } ✅
```

#### 2.4 resolveBulletinDayType() 流程（如果需要）
```
resolveBulletinDayType(targetDate)
  ↓
1. 读取缓存: getCachedDayType(dateKey)
   ├─ 如果缓存存在 → 直接返回 ✅
   └─ 如果缓存不存在
       ↓
2. 从 Bulletin 网站抓取: fetchBulletinHtml()
   ├─ 请求: GET https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/
   └─ 解析 HTML（使用 DOMParser 或正则表达式）
       ↓
3. 提取日期类型和日期
   ├─ 如果日期匹配 → 缓存并返回
   └─ 如果日期不匹配 → 使用 predictDayType() 预测
       └─ 需要读取 special_days 和 special_periods（可能触发额外加载）
```

### 步骤 3: 更新 Background 缓存
**位置**: `background.ts:280-320`

```
1. 验证数据有效性
   ├─ 有 blocks 或有效的 dayType → 更新缓存 ✅
   └─ 无效数据 → 保留之前的缓存（如果是同一天）
       ↓
2. 更新内存缓存
   ├─ cachedSchedule = blocks
   ├─ cachedDateKey = todayKey
   ├─ cachedDayType = dayType
   └─ cachedTimestamp = Date.now()
       ↓
3. 发送消息通知其他组件
   └─ chrome.runtime.sendMessage('scheduleUpdated')
```

---

## 📁 文件读取顺序

### 每次刷新时读取的文件

#### 1. **Cloudflare Pages**（强制刷新，绕过浏览器缓存）
- `https://hilltoppers.pages.dev/special_days.json`
  - **时机**: 每次 `fetchSpecialDayData()` 调用时（强制刷新）
  - **缓存**: 先检查内存缓存 → 跳过（因为强制刷新）→ 网络请求 → 更新内存和持久化缓存
  
- `https://hilltoppers.pages.dev/special_periods.json`
  - **时机**: 每次 `fetchSpecialDayData()` 调用时（强制刷新，并行执行）
  - **缓存**: 先检查内存缓存 → 跳过（因为强制刷新）→ 网络请求 → 更新内存和持久化缓存

#### 2. **本地 JSON 文件**（从扩展包中读取）
- `schedule/schedule_mon_thu.json`
- `schedule/schedule_wed.json`
- `schedule/schedule_fri.json`
- `schedule/abdec.json`
- `schedule/late_start.json`
- 等等...

**时机**: 当需要加载特定类型的课程表时

#### 3. **Bulletin 网站**（可选，仅在需要时）
- `https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/`

**时机**: 
- 当 special day 类型是 `custom` 但没有 `dayTypeLabel` 时
- 当没有 special day 记录且需要确定日期类型时
- 缓存未命中时

---

## 🎯 缓存策略

### Special Periods
- **持久化缓存有效期**: 4 小时
- **内存缓存**: Service Worker 运行期间
- **刷新策略**: 
  - 在 `fetchSpecialDayData()` 中强制刷新（与 special_days 同步）
  - 在 `isInSpecialPeriod()` 中按需加载（如果缓存无效）

### Special Days
- **持久化缓存有效期**: 15 分钟
- **内存缓存**: Service Worker 运行期间
- **刷新策略**: 
  - 在 `fetchSpecialDayData()` 中强制刷新
  - 增量更新：只更新变化的数据

### Day Type（从 Bulletin 解析）
- **持久化缓存**: 无明确过期时间（但会检查日期匹配）
- **刷新策略**: 
  - 先检查缓存
  - 如果缓存不存在或日期不匹配，才从网站抓取

### 课程表 Blocks
- **内存缓存**: 在 `background.ts` 中，每次刷新时更新
- **持久化缓存**: 不直接缓存，通过 special_days 的 schedule 字段间接缓存

---

## 🔍 关键优化点

### 1. 并行加载
- `special_days` 和 `special_periods` 在 `fetchSpecialDayData()` 中并行加载
- 使用 `Promise.all()` 同时执行，不增加总等待时间

### 2. 增量更新
- Special days 只更新变化的数据，不全部重写
- 比较新旧数据，只更新 `type`、`details` 或 `schedule` 变化的日期

### 3. 多层缓存
- 内存缓存 → 持久化缓存 → 网络请求
- 减少不必要的网络请求

### 4. 智能回退
- 网络失败时使用缓存
- 数据无效时保留之前的缓存（如果是同一天）
- 解析失败时使用正则表达式 fallback

---

## 📊 刷新流程图

```
定时刷新（60分钟）或手动刷新
    ↓
refreshSchedule()
    ↓
loadBlocksForDate(today)
    ↓
┌─────────────────────────────────────┐
│ 1. isInSpecialPeriod()               │
│    ├─ 检查持久化缓存（4小时）         │
│    ├─ 检查内存缓存                    │
│    └─ 如果无效 → 从 Cloudflare 加载  │
└─────────────────────────────────────┘
    ↓ (如果不在 special period)
┌─────────────────────────────────────┐
│ 2. fetchSpecialDayData()             │
│    ├─ 并行加载:                      │
│    │  ├─ special_days (强制刷新)     │
│    │  └─ special_periods (强制刷新)   │
│    ├─ 更新持久化缓存                 │
│    └─ 返回今天的数据                 │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 3. 根据类型加载课程表                │
│    ├─ no_school → 空课程表           │
│    ├─ custom → 从 specialDayData     │
│    ├─ 其他类型 → 从本地 JSON          │
│    └─ 默认 → 根据星期几加载           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 4. 更新 Background 缓存             │
│    ├─ 验证数据有效性                 │
│    ├─ 更新内存缓存                   │
│    └─ 发送更新消息                   │
└─────────────────────────────────────┘
```

---

## ⚠️ 注意事项

1. **强制刷新时机**: 只有在 `fetchSpecialDayData()` 中才会强制刷新 special_days 和 special_periods，其他地方的调用会使用缓存

2. **缓存失效**: 
   - Special periods: 4 小时后失效
   - Special days: 15 分钟后失效
   - Day type: 根据日期匹配判断

3. **网络请求**: 
   - 每次刷新都会从 Cloudflare 加载 special_days 和 special_periods（因为强制刷新）
   - 但使用内存缓存可以避免同一 Service Worker 生命周期内的重复请求

4. **错误处理**: 
   - 网络失败 → 使用持久化缓存
   - 数据无效 → 保留之前的缓存（如果是同一天）
   - 解析失败 → 使用 fallback 机制

