import Foundation

struct CloudflareDataLoader {
    // 缓存 special_days 和 special_periods 数据
    private static var cachedSpecialDays: [String: SpecialDayRecord]?
    private static var cachedSpecialPeriods: [(start: String, end: String, details: String?)]?
    
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
    /// 返回日期字符串格式 (start: "yyyy-MM-dd", end: "yyyy-MM-dd", details: String?)
    static func loadSpecialPeriods() async throws -> [(start: String, end: String, details: String?)]? {
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
                let details: String?
            }
            
            let decoder = JSONDecoder()
            let periods = try decoder.decode([PeriodRecord].self, from: data)
            
            // 日期格式验证和规范化函数
            func normalizeDateString(_ dateStr: String) -> String? {
                // 检查是否已经是 "yyyy-MM-dd" 格式
                let dateFormatRegex = #"^\d{4}-\d{2}-\d{2}$"#
                if dateStr.range(of: dateFormatRegex, options: .regularExpression) != nil {
                    return dateStr
                }
                
                // 尝试解析并规范化格式（处理 "2026-1-6" -> "2026-01-06"）
                let inputFormatter = DateFormatter()
                inputFormatter.dateFormat = "yyyy-M-d"
                inputFormatter.timeZone = Date.estTimeZone
                
                if let date = inputFormatter.date(from: dateStr) {
                    let outputFormatter = DateFormatter()
                    outputFormatter.dateFormat = "yyyy-MM-dd"
                    outputFormatter.timeZone = Date.estTimeZone
                    return outputFormatter.string(from: date)
                }
                
                // 尝试 ISO8601 格式
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
            
            let datePeriods = periods.compactMap { period -> (start: String, end: String, details: String?)? in
                // 规范化日期字符串
                guard let startString = normalizeDateString(period.start),
                      let endString = normalizeDateString(period.end) else {
                    print("⚠️ [CLOUDFLARE] Failed to parse period dates: start=\(period.start), end=\(period.end)")
                    return nil
                }
                
                return (start: startString, end: endString, details: period.details)
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

