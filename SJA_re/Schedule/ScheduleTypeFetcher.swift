import Foundation

struct SpecialDayInfo {
    let type: String
    let details: String?
}

struct ScheduleTypeFetcher {
    static func fetchTypeFor(date: Date) async throws -> String? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: date)
        
        // 从 Cloudflare 加载
        if let cloudflareData = try await CloudflareDataLoader.loadSpecialDays(),
           let dayData = cloudflareData[dateString],
           let type = dayData.type {
            return type
        }
        
        return nil
    }
    
    static func fetchSpecialDayInfo(date: Date) async throws -> SpecialDayInfo? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: date)
        
        // print("🔍 [SCHEDULE_TYPE] Fetching special day info for date: \(dateString)")
        
        // 从 Cloudflare 加载（使用缓存，因为 refreshSchedule 已经清除了缓存）
        if let cloudflareData = try await CloudflareDataLoader.loadSpecialDays() {
            // print("📦 [SCHEDULE_TYPE] Loaded \(cloudflareData.count) special days from Cloudflare")
            
            if let dayData = cloudflareData[dateString] {
                // print("✅ [SCHEDULE_TYPE] Found data for \(dateString): type=\(dayData.type ?? "nil"), details=\(dayData.details ?? "nil")")
                
                if let type = dayData.type {
                    return SpecialDayInfo(type: type, details: dayData.details)
                } else {
                    // print("⚠️ [SCHEDULE_TYPE] Day data exists but type is nil for \(dateString)")
                }
            } else {
                // print("❌ [SCHEDULE_TYPE] No data found for date \(dateString)")
                // print("📋 [SCHEDULE_TYPE] Available dates: \(Array(cloudflareData.keys.prefix(10)))")
            }
        } else {
            // print("❌ [SCHEDULE_TYPE] Failed to load special_days from Cloudflare")
        }
        
        return nil
    }

    static func isInSpecialPeriod(date: Date) async throws -> Bool {
        // 将日期转换为 EST 时区的日期字符串 (yyyy-MM-dd 格式)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: date)
        
        // 从 Cloudflare 加载
        if let periods = try await CloudflareDataLoader.loadSpecialPeriods() {
            for period in periods {
                // 使用日期字符串比较（与 Chrome extension 逻辑一致）
                if period.start <= dateString && dateString <= period.end {
                    // print("✅ [SPECIAL_PERIOD] Date \(dateString) is in special period: \(period.start) to \(period.end)")
                    return true
                }
            }
        }
        
        return false
    }
    
    /// 获取 special period 的详细信息
    static func getSpecialPeriodDetails(date: Date) async throws -> String? {
        // 将日期转换为 EST 时区的日期字符串 (yyyy-MM-dd 格式)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: date)
        
        // print("🔍 [SPECIAL_PERIOD] Checking details for date: \(dateString)")
        
        // 从 Cloudflare 加载
        if let periods = try await CloudflareDataLoader.loadSpecialPeriods() {
            // print("🔍 [SPECIAL_PERIOD] Loaded \(periods.count) periods")
            for period in periods {
                // print("🔍 [SPECIAL_PERIOD] Checking period: \(period.start) to \(period.end), details: '\(period.details ?? "nil")'")
                // 使用日期字符串比较
                if period.start <= dateString && dateString <= period.end {
                    // print("✅ [SPECIAL_PERIOD] Found matching period, details: '\(period.details ?? "nil")'")
                    return period.details
                }
            }
        } else {
            // print("⚠️ [SPECIAL_PERIOD] No periods loaded")
        }
        
        // print("❌ [SPECIAL_PERIOD] No matching period found for date: \(dateString)")
        return nil
    }

    static func loadCustomSchedule(for date: Date) async throws -> [Block]? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: date)
        
        // 从 Cloudflare 加载（使用缓存，因为 refreshSchedule 已经清除了缓存）
        if let cloudflareData = try await CloudflareDataLoader.loadSpecialDays(),
           let dayData = cloudflareData[dateString],
           let schedule = dayData.schedule {
            return schedule
        }
        
        return nil
    }

    // Batch fetch all special days in a date range
    static func fetchSpecialDaysDict(start: Date, end: Date) async throws -> [String: String] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let startString = formatter.string(from: start)
        let endString = formatter.string(from: end)
        
        // 从 Cloudflare 加载
        if let cloudflareData = try await CloudflareDataLoader.loadSpecialDays() {
            var dict: [String: String] = [:]
            for (dateKey, dayData) in cloudflareData {
                if dateKey >= startString && dateKey <= endString,
                   let type = dayData.type {
                    dict[dateKey] = type
                }
            }
            return dict
        }
        
        return [:]
    }

    // Batch fetch all special periods overlapping a date range
    static func fetchSpecialPeriods(start: Date, end: Date) async throws -> [(start: String, end: String, details: String?)] {
        // 将日期转换为 EST 时区的日期字符串 (yyyy-MM-dd 格式)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let startString = formatter.string(from: start)
        let endString = formatter.string(from: end)
        
        // 从 Cloudflare 加载
        if let periods = try await CloudflareDataLoader.loadSpecialPeriods() {
            // Filter periods that overlap the date range (使用日期字符串比较)
            return periods.filter { period in
                period.end >= startString && period.start <= endString
            }
        }
        
        return []
    }

    // Predict day type using batch-fetched data
    static func predictDayType(
        dbDayType: String,
        dbDate: Date,
        testDate: Date?
    ) async throws -> String {
        // print("FIREBASE CALL: predictDayType")
        let today = testDate ?? Date()
        
        do {
            // print("Fetching special days from \(dbDate) to \(today)")
            let specialDays = try await fetchSpecialDaysDict(start: dbDate, end: today)
            // print("Fetching special periods from \(dbDate) to \(today)")
            let specialPeriods = try await fetchSpecialPeriods(start: dbDate, end: today)
            
            var predictIsGreen = dbDayType.lowercased().contains("green")
            var date = Calendar.current.date(byAdding: .day, value: 1, to: dbDate) ?? dbDate
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            
            while date <= today {
                let dateString = formatter.string(from: date)
                let isSchoolDay: Bool = {
                    if let type = specialDays[dateString] {
                        // print("Checked \(dateString): special day type = \(type)")
                        return type != "no_school"
                    }
                    for period in specialPeriods {
                        // 使用日期字符串比较
                        if period.start <= dateString && dateString <= period.end {
                            // print("Checked \(dateString): in special period")
                            return false
                        }
                    }
                    let weekday = Calendar.current.component(.weekday, from: date)
                    if weekday == 1 || weekday == 7 {
                        // print("Checked \(dateString): weekend")
                        return false
                    }
                    // print("Checked \(dateString): regular school day")
                    return true
                }()
                
                if isSchoolDay {
                    // print("Toggled isGreen for \(dateString)")
                    predictIsGreen.toggle()
                }
                date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
            }
            
            // print("Final prediction: \(predictIsGreen ? "Green Day" : "White Day")")
            return predictIsGreen ? "Green Day" : "White Day"
        } catch {
            // print("Firebase error in predictDayType: \(error)")
            throw error
        }
    }
    
    // Generate detailed calculation steps showing day-by-day breakdown
    static func generateCalculationSteps(
        dbDayType: String,
        dbDate: Date,
        testDate: Date?
    ) async throws -> [(date: Date, prediction: String, isToday: Bool)] {
                 // print("FIREBASE CALL: generateCalculationSteps")
        let today = testDate ?? Date()
        
        do {
            // print("Fetching special days from \(dbDate) to \(today)")
            let specialDays = try await fetchSpecialDaysDict(start: dbDate, end: today)
            // print("Fetching special periods from \(dbDate) to \(today)")
            let specialPeriods = try await fetchSpecialPeriods(start: dbDate, end: today)
            
            var steps: [(date: Date, prediction: String, isToday: Bool)] = []
            var predictIsGreen = dbDayType.lowercased().contains("green")
            var date = Calendar.current.date(byAdding: .day, value: 1, to: dbDate) ?? dbDate
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            
            while date <= today {
                let dateString = formatter.string(from: date)
                let isToday = Calendar.current.isDate(date, inSameDayAs: today)
                
                let (isSchoolDay, dayDescription): (Bool, String) = {
                    // Check special days first
                    if let type = specialDays[dateString] {
                        // print("Checked \(dateString): special day type = \(type)")
                        if type == "no_school" {
                            return (false, "No school (special day)")
                        } else {
                            return (true, type.capitalized.replacingOccurrences(of: "_", with: " "))
                        }
                    }
                    
                    // Check special periods
                    for period in specialPeriods {
                        // 使用日期字符串比较
                        if period.start <= dateString && dateString <= period.end {
                            // print("Checked \(dateString): in special period")
                            let details = period.details ?? "Break"
                            return (false, "No school (\(details))")
                        }
                    }
                    
                    // Check if weekend
                    let weekday = Calendar.current.component(.weekday, from: date)
                    if weekday == 1 || weekday == 7 {
                        // print("Checked \(dateString): weekend")
                        return (false, "No school (weekend)")
                    }
                    
                    // Regular school day
                    // print("Checked \(dateString): regular school day")
                    return (true, "Regular school day")
                }()
                
                let prediction: String
                if isSchoolDay {
                    // print("Toggled isGreen for \(dateString)")
                    predictIsGreen.toggle()
                    prediction = predictIsGreen ? "Green Day" : "White Day"
                } else {
                    prediction = dayDescription
                }
                
                steps.append((date: date, prediction: prediction, isToday: isToday))
                
                // Stop if we've reached today
                if isToday { break }
                
                date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
            }
            
            return steps
        } catch {
            // print("Firebase error in generateCalculationSteps: \(error)")
            throw error
        }
    }
} 