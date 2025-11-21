import Foundation

struct CloudflareDataLoader {
    // 缓存 special_days 和 special_periods 数据
    private static var cachedSpecialDays: [String: SpecialDayRecord]?
    private static var cachedSpecialPeriods: [(start: Date, end: Date)]?
    
    struct SpecialDayRecord: Codable {
        let type: String?
        let details: String?
        let schedule: [Block]?
        
        enum CodingKeys: String, CodingKey {
            case type, details, schedule
        }
    }
    
    /// 从 Cloudflare 加载 special_days 数据
    static func loadSpecialDays() async throws -> [String: SpecialDayRecord]? {
        if let cached = cachedSpecialDays {
            return cached
        }
        
        guard let url = ScheduleConfig.specialDaysURL else {
            return nil
        }
        
        do {
            print("🌐 [CLOUDFLARE] Loading special_days from: \(url.absoluteString)")
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("❌ [CLOUDFLARE] Failed to load special_days: HTTP \(((response as? HTTPURLResponse)?.statusCode ?? 0))")
                return nil
            }
            
            let decoder = JSONDecoder()
            let days = try decoder.decode([String: SpecialDayRecord].self, from: data)
            cachedSpecialDays = days
            print("✅ [CLOUDFLARE] Successfully loaded \(days.count) special days")
            return days
        } catch {
            print("❌ [CLOUDFLARE] Error loading special_days: \(error.localizedDescription)")
            return nil
        }
    }
    
    /// 从 Cloudflare 加载 special_periods 数据
    static func loadSpecialPeriods() async throws -> [(start: Date, end: Date)]? {
        if let cached = cachedSpecialPeriods {
            return cached
        }
        
        guard let url = ScheduleConfig.specialPeriodsURL else {
            return nil
        }
        
        do {
            print("🌐 [CLOUDFLARE] Loading special_periods from: \(url.absoluteString)")
            let (data, response) = try await URLSession.shared.data(from: url)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("❌ [CLOUDFLARE] Failed to load special_periods: HTTP \(((response as? HTTPURLResponse)?.statusCode ?? 0))")
                return nil
            }
            
            struct PeriodRecord: Codable {
                let start: String
                let end: String
            }
            
            let decoder = JSONDecoder()
            let periods = try decoder.decode([PeriodRecord].self, from: data)
            
            let dateFormatter = ISO8601DateFormatter()
            dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            let datePeriods = periods.compactMap { period -> (start: Date, end: Date)? in
                guard let startDate = dateFormatter.date(from: period.start) ?? ISO8601DateFormatter().date(from: period.start),
                      let endDate = dateFormatter.date(from: period.end) ?? ISO8601DateFormatter().date(from: period.end) else {
                    return nil
                }
                return (start: startDate, end: endDate)
            }
            
            cachedSpecialPeriods = datePeriods
            print("✅ [CLOUDFLARE] Successfully loaded \(datePeriods.count) special periods")
            return datePeriods
        } catch {
            print("❌ [CLOUDFLARE] Error loading special_periods: \(error.localizedDescription)")
            return nil
        }
    }
    
    /// 清除缓存（用于测试或强制刷新）
    static func clearCache() {
        cachedSpecialDays = nil
        cachedSpecialPeriods = nil
    }
}

