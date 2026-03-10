import Foundation

/// 将默认课表 JSON 写入 App Group，供 Widget 在无 payload 时从缓存展示。
enum ScheduleCacheForWidget {
    private static let suiteName = "group.danielzhang.Hilltoppers2"
    private static let monThuKey = "CachedScheduleMonThu"
    private static let wedKey = "CachedScheduleWed"
    private static let friKey = "CachedScheduleFri"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    /// 从 main bundle 读取三个默认课表 JSON 并写入 App Group；刷新时调用以便 Widget 可用缓存展示。
    static func cacheDefaultSchedulesToAppGroup() {
        guard let def = defaults else { return }
        let namesAndKeys: [(String, String)] = [(monThuKey, "schedule_mon_thu"), (wedKey, "schedule_wed"), (friKey, "schedule_fri")]
        for (key, name) in namesAndKeys {
            if let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "scheduleConfig"),
               let data = try? Data(contentsOf: url) {
                def.set(data, forKey: key)
            } else if let url = Bundle.main.url(forResource: name, withExtension: "json"),
                      let data = try? Data(contentsOf: url) {
                def.set(data, forKey: key)
            }
        }
    }
}
