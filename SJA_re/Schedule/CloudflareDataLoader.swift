import Foundation

struct CloudflareDataLoader {
    // 内存缓存（进程内有效）
    private static var cachedSpecialDays: [String: SpecialDayRecord]?
    private static var cachedSpecialPeriods: [(start: String, end: String, details: String?)]?

    // 持久化缓存使用 App Group，与 Widget 共享；日常显示只读缓存，刷新时才重新拉取并写入
    private static let specialDataSuiteName = "group.danielzhang.Hilltoppers2"
    private static let cachedSpecialDaysKey = "CachedSpecialDaysData"
    private static let cachedSpecialPeriodsKey = "CachedSpecialPeriodsData"

    private static var specialDataDefaults: UserDefaults? {
        UserDefaults(suiteName: specialDataSuiteName)
    }

    struct SpecialDayRecord: Codable {
        let type: String?
        let details: String?
        let schedule: [Block]?
        let color: String?
        let banner: String?

        enum CodingKeys: String, CodingKey {
            case type, details, schedule, color, banner
        }
    }

    private static func normalizeDateString(_ dateStr: String) -> String? {
        let dateFormatRegex = #"^\d{4}-\d{2}-\d{2}$"#
        if dateStr.range(of: dateFormatRegex, options: .regularExpression) != nil {
            return dateStr
        }
        let inputFormatter = DateFormatter()
        inputFormatter.dateFormat = "yyyy-M-d"
        inputFormatter.timeZone = Date.estTimeZone
        if let date = inputFormatter.date(from: dateStr) {
            let outputFormatter = DateFormatter()
            outputFormatter.dateFormat = "yyyy-MM-dd"
            outputFormatter.timeZone = Date.estTimeZone
            return outputFormatter.string(from: date)
        }
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: dateStr) {
            let outputFormatter = DateFormatter()
            outputFormatter.dateFormat = "yyyy-MM-dd"
            outputFormatter.timeZone = Date.estTimeZone
            return outputFormatter.string(from: date)
        }
        return nil
    }

    // MARK: - Persisted cache (read/write)

    private static func readCachedSpecialDaysFromStorage() -> [String: SpecialDayRecord]? {
        guard let defaults = specialDataDefaults,
              let data = defaults.data(forKey: cachedSpecialDaysKey) else { return nil }
        return try? JSONDecoder().decode([String: SpecialDayRecord].self, from: data)
    }

    private static func writeCachedSpecialDaysToStorage(_ days: [String: SpecialDayRecord]) {
        guard let defaults = specialDataDefaults,
              let data = try? JSONEncoder().encode(days) else { return }
        defaults.set(data, forKey: cachedSpecialDaysKey)
    }

    private struct StoredPeriod: Codable {
        let start: String
        let end: String
        let details: String?
    }

    private static func readCachedSpecialPeriodsFromStorage() -> [(start: String, end: String, details: String?)]? {
        guard let defaults = specialDataDefaults,
              let data = defaults.data(forKey: cachedSpecialPeriodsKey),
              let stored = try? JSONDecoder().decode([StoredPeriod].self, from: data) else { return nil }
        return stored.map { (start: $0.start, end: $0.end, details: $0.details) }
    }

    private static func writeCachedSpecialPeriodsToStorage(_ periods: [(start: String, end: String, details: String?)]) {
        guard let defaults = specialDataDefaults else { return }
        let stored = periods.map { StoredPeriod(start: $0.start, end: $0.end, details: $0.details) }
        guard let data = try? JSONEncoder().encode(stored) else { return }
        defaults.set(data, forKey: cachedSpecialPeriodsKey)
    }

    // MARK: - Load special_days

    /// 从 Cloudflare 加载 special_days：非刷新时优先用持久化缓存，刷新时拉取网络并更新缓存。
    static func loadSpecialDays(forceRefresh: Bool = false) async throws -> [String: SpecialDayRecord]? {
        if !forceRefresh, let cached = cachedSpecialDays {
            return cached
        }
        if !forceRefresh, let stored = readCachedSpecialDaysFromStorage() {
            cachedSpecialDays = stored
            return stored
        }

        guard let url = ScheduleConfig.specialDaysURL else { return nil }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                if let fallback = readCachedSpecialDaysFromStorage() {
                    cachedSpecialDays = fallback
                    return fallback
                }
                return nil
            }
            let decoder = JSONDecoder()
            let days = try decoder.decode([String: SpecialDayRecord].self, from: data)
            cachedSpecialDays = days
            writeCachedSpecialDaysToStorage(days)
            return days
        } catch {
            if let fallback = readCachedSpecialDaysFromStorage() {
                cachedSpecialDays = fallback
                return fallback
            }
            return nil
        }
    }

    // MARK: - Load special_periods

    /// 从 Cloudflare 加载 special_periods：非刷新时优先用持久化缓存，刷新时拉取网络并更新缓存。
    static func loadSpecialPeriods(forceRefresh: Bool = false) async throws -> [(start: String, end: String, details: String?)]? {
        if !forceRefresh, let cached = cachedSpecialPeriods {
            return cached
        }
        if !forceRefresh, let stored = readCachedSpecialPeriodsFromStorage() {
            cachedSpecialPeriods = stored
            return stored
        }

        guard let url = ScheduleConfig.specialPeriodsURL else { return nil }

        struct PeriodRecord: Codable {
            let start: String
            let end: String
            let details: String?
        }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                if let fallback = readCachedSpecialPeriodsFromStorage() {
                    cachedSpecialPeriods = fallback
                    return fallback
                }
                return nil
            }
            let decoder = JSONDecoder()
            let periods = try decoder.decode([PeriodRecord].self, from: data)
            let datePeriods = periods.compactMap { period -> (start: String, end: String, details: String?)? in
                guard let startString = normalizeDateString(period.start),
                      let endString = normalizeDateString(period.end) else { return nil }
                return (start: startString, end: endString, details: period.details)
            }
            cachedSpecialPeriods = datePeriods
            writeCachedSpecialPeriodsToStorage(datePeriods)
            return datePeriods
        } catch {
            if let fallback = readCachedSpecialPeriodsFromStorage() {
                cachedSpecialPeriods = fallback
                return fallback
            }
            return nil
        }
    }

    /// 仅刷新并缓存两个 JSON 文件（用于手动/后台刷新时调用，之后再读会走缓存）
    static func refreshSpecialDataCache() async {
        _ = try? await loadSpecialDays(forceRefresh: true)
        _ = try? await loadSpecialPeriods(forceRefresh: true)
    }

    /// 只清除内存缓存；持久化缓存保留，日常显示继续用缓存
    static func clearCache() {
        cachedSpecialDays = nil
        cachedSpecialPeriods = nil
    }
}
