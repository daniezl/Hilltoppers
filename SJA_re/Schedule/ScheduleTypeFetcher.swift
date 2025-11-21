import Foundation

struct SpecialDayInfo {
    let type: String
    let details: String?
}

struct ScheduleTypeFetcher {
    static func fetchTypeFor(date: Date) async throws -> String? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
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
        let dateString = formatter.string(from: date)
        
        // 从 Cloudflare 加载
        if let cloudflareData = try await CloudflareDataLoader.loadSpecialDays(),
           let dayData = cloudflareData[dateString],
           let type = dayData.type {
            return SpecialDayInfo(type: type, details: dayData.details)
        }
        
        return nil
    }

    static func isInSpecialPeriod(date: Date) async throws -> Bool {
        // 从 Cloudflare 加载
        if let periods = try await CloudflareDataLoader.loadSpecialPeriods() {
            for period in periods {
                if date >= period.start && date <= period.end {
                    return true
                }
            }
        }
        
        return false
    }

    static func loadCustomSchedule(for date: Date) async throws -> [Block]? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        
        // 从 Cloudflare 加载
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
    static func fetchSpecialPeriods(start: Date, end: Date) async throws -> [(start: Date, end: Date)] {
        // 从 Cloudflare 加载
        if let periods = try await CloudflareDataLoader.loadSpecialPeriods() {
            // Filter periods that overlap the date range
            return periods.filter { period in
                period.end >= start && period.start <= end
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
                        if date >= period.0 && date <= period.1 {
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
                        if date >= period.0 && date <= period.1 {
                            // print("Checked \(dateString): in special period")
                            return (false, "No school (break)")
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