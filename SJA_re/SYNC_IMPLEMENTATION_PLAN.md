# 数据同步实现方案 (Data Sync Implementation Plan)

## 📝 概述

目前只实现了 Firebase Authentication（登录功能），还没有实现数据同步。本文档说明如何添加云端数据同步功能。

## 🎯 目标

实现跨设备的课程设置和通知偏好同步，包括冲突解决。

## 📊 当前状态

### 已实现 ✅
- Firebase Authentication（邮箱登录、注册、验证）
- 本地数据存储（UserDefaults）
  - BlockSettings（课程设置）
  - NotificationSettings（通知设置）

### 待实现 ⏳
- Firestore 数据同步
- 冲突解决策略
- 跨设备同步

## 🏗️ 实现步骤

### 步骤 1: 创建 Firestore 数据模型

```swift
// SyncManager.swift
import FirebaseFirestore
import FirebaseAuth

struct UserSettingsCloud: Codable {
    let userId: String
    let blockSettings: [String: BlockSettings]
    let notificationSettings: NotificationSettingsData
    let lastModified: Date
    let deviceId: String
    
    struct NotificationSettingsData: Codable {
        let enabled: Bool
        let minutes: Int
        let lunchPeriod: Int
    }
}

class SyncManager: ObservableObject {
    static let shared = SyncManager()
    private let db = Firestore.firestore()
    
    @Published var syncStatus: SyncStatus = .idle
    @Published var lastSyncTime: Date?
    
    enum SyncStatus {
        case idle
        case syncing
        case success
        case failed(String)
    }
    
    private init() {}
}
```

### 步骤 2: 实现上传功能

```swift
extension SyncManager {
    func uploadSettings() async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw SyncError.notAuthenticated
        }
        
        // 收集本地数据
        let blockManager = BlockSettingsManager.shared
        let notificationManager = NotificationSettingsManager.shared
        
        let settings = UserSettingsCloud(
            userId: userId,
            blockSettings: [
                "A": blockManager.blockA,
                "B": blockManager.blockB,
                "C": blockManager.blockC,
                "D": blockManager.blockD,
                "E": blockManager.blockE
            ],
            notificationSettings: UserSettingsCloud.NotificationSettingsData(
                enabled: notificationManager.notificationsEnabled,
                minutes: notificationManager.notificationMinutes,
                lunchPeriod: notificationManager.selectedLunchPeriod
            ),
            lastModified: Date(),
            deviceId: UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        )
        
        // 上传到 Firestore
        try await db.collection("userSettings")
            .document(userId)
            .setData(from: settings)
        
        await MainActor.run {
            self.syncStatus = .success
            self.lastSyncTime = Date()
        }
    }
}
```

### 步骤 3: 实现下载功能

```swift
extension SyncManager {
    func downloadSettings() async throws -> UserSettingsCloud? {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw SyncError.notAuthenticated
        }
        
        let snapshot = try await db.collection("userSettings")
            .document(userId)
            .getDocument()
        
        if snapshot.exists {
            return try snapshot.data(as: UserSettingsCloud.self)
        }
        
        return nil
    }
    
    func applyCloudSettings(_ cloudSettings: UserSettingsCloud) {
        // 应用到本地
        let blockManager = BlockSettingsManager.shared
        blockManager.blockA = cloudSettings.blockSettings["A"] ?? BlockSettings()
        blockManager.blockB = cloudSettings.blockSettings["B"] ?? BlockSettings()
        blockManager.blockC = cloudSettings.blockSettings["C"] ?? BlockSettings()
        blockManager.blockD = cloudSettings.blockSettings["D"] ?? BlockSettings()
        blockManager.blockE = cloudSettings.blockSettings["E"] ?? BlockSettings()
        blockManager.saveSettings()
        
        let notificationManager = NotificationSettingsManager.shared
        notificationManager.notificationsEnabled = cloudSettings.notificationSettings.enabled
        notificationManager.notificationMinutes = cloudSettings.notificationSettings.minutes
        notificationManager.selectedLunchPeriod = cloudSettings.notificationSettings.lunchPeriod
        notificationManager.saveSettings()
    }
}
```

### 步骤 4: 实现冲突解决

```swift
extension SyncManager {
    func syncWithConflictResolution() async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw SyncError.notAuthenticated
        }
        
        await MainActor.run {
            self.syncStatus = .syncing
        }
        
        // 获取云端数据
        let cloudSettings = try await downloadSettings()
        
        // 获取本地最后修改时间
        let localLastModified = getLocalLastModifiedTime()
        
        if let cloudSettings = cloudSettings {
            // 云端有数据，比较时间戳
            if cloudSettings.lastModified > localLastModified {
                // 云端更新，使用云端数据
                print("📥 Cloud data is newer, downloading...")
                applyCloudSettings(cloudSettings)
            } else {
                // 本地更新，上传到云端
                print("📤 Local data is newer, uploading...")
                try await uploadSettings()
            }
        } else {
            // 云端没有数据，首次上传
            print("📤 First time sync, uploading...")
            try await uploadSettings()
        }
        
        await MainActor.run {
            self.syncStatus = .success
            self.lastSyncTime = Date()
        }
    }
    
    private func getLocalLastModifiedTime() -> Date {
        // 从 UserDefaults 读取最后修改时间
        // 或使用当前时间作为默认值
        return UserDefaults.standard.object(forKey: "LocalSettingsLastModified") as? Date ?? Date.distantPast
    }
}
```

### 步骤 5: 集成到登录流程

```swift
// 在 AuthView.swift 中，登录成功后同步
private func handleEmailSubmit() {
    // ... 登录代码 ...
    
    if authMode == .signIn {
        try await authManager.signIn(email: trimmedEmail, password: trimmedPassword)
        
        // 登录成功后自动同步
        Task {
            do {
                try await SyncManager.shared.syncWithConflictResolution()
                print("✅ Settings synced successfully")
            } catch {
                print("⚠️ Sync failed: \(error.localizedDescription)")
                // 同步失败不影响使用，继续使用本地数据
            }
        }
    }
}
```

### 步骤 6: 实时监听（可选）

```swift
extension SyncManager {
    func startRealtimeSync() {
        guard let userId = Auth.auth().currentUser?.uid else { return }
        
        db.collection("userSettings")
            .document(userId)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self,
                      let snapshot = snapshot,
                      snapshot.exists else { return }
                
                do {
                    let cloudSettings = try snapshot.data(as: UserSettingsCloud.self)
                    // 检查是否来自其他设备
                    if cloudSettings.deviceId != UIDevice.current.identifierForVendor?.uuidString {
                        print("📥 Settings updated from another device")
                        self.applyCloudSettings(cloudSettings)
                    }
                } catch {
                    print("❌ Failed to parse cloud settings: \(error)")
                }
            }
    }
}
```

## 🎨 用户界面改进

### 在 Settings 中显示同步状态

```swift
struct SettingsView: View {
    @StateObject private var syncManager = SyncManager.shared
    
    var body: some View {
        VStack {
            // 现有的设置项...
            
            // 同步状态
            HStack {
                Image(systemName: syncStatusIcon)
                    .foregroundColor(syncStatusColor)
                Text(syncStatusText)
                    .font(.caption)
                Spacer()
                if case .syncing = syncManager.syncStatus {
                    ProgressView()
                }
            }
            .padding()
        }
    }
    
    private var syncStatusIcon: String {
        switch syncManager.syncStatus {
        case .idle: return "cloud"
        case .syncing: return "cloud.fill"
        case .success: return "checkmark.icloud.fill"
        case .failed: return "exclamationmark.icloud.fill"
        }
    }
}
```

## ⚠️ 注意事项

### 1. Firestore 规则设置

```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 2. 数据冲突处理策略选择

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 云端优先 | 简单 | 可能丢失本地未同步的更改 | 单设备使用为主 |
| 最后修改时间 | 自动化 | 可能覆盖有用的数据 | 大部分情况 ✅ |
| 用户选择 | 最安全 | 增加用户操作 | 重要数据 |
| 合并策略 | 不丢失数据 | 复杂度高 | 复杂应用 |

**推荐：最后修改时间策略**，简单且适用大部分场景。

### 3. 离线支持

Firestore 自带离线缓存：
```swift
let settings = FirestoreSettings()
settings.isPersistenceEnabled = true
db.settings = settings
```

### 4. 成本考虑

Firestore 免费额度（每天）：
- 50,000 次读取
- 20,000 次写入
- 20,000 次删除

对于个人 app 完全够用。

## 🚀 实现时间估计

- **基础同步功能**：2-3 小时
- **冲突解决**：1-2 小时  
- **UI 集成**：1 小时
- **测试和调试**：2-3 小时

**总计：6-9 小时**

## 📋 检查清单

实现数据同步前：
- [ ] 在 Firebase Console 启用 Firestore
- [ ] 设置 Firestore 安全规则
- [ ] 创建 SyncManager.swift
- [ ] 实现上传/下载功能
- [ ] 实现冲突解决
- [ ] 集成到登录流程
- [ ] 添加同步状态 UI
- [ ] 测试多设备同步
- [ ] 测试冲突场景
- [ ] 测试离线场景

## 🎯 下一步

如果需要实现数据同步功能，请告诉我，我可以：
1. 创建 `SyncManager.swift`
2. 更新 `AuthView.swift` 集成同步
3. 添加同步状态显示
4. 实现冲突解决界面

是否需要我现在实现这些功能？

