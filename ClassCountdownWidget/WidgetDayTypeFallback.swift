//
//  WidgetDayTypeFallback.swift
//  ClassCountdownWidget
//
//  当主 app 当天未运行且未自动刷新时，Widget 用此从 App Group 缓存读出 bulletin + special_days/special_periods 推算当日 day type。
//

import Foundation

enum WidgetDayTypeFallback {
    private static let suiteName = "group.danielzhang.Hilltoppers2"
    private static let estTimeZone = TimeZone(identifier: "America/New_York")!

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    private static var estCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = estTimeZone
        return cal
    }

    /// 仅从缓存读取：若 LastPredictedDayDate 是今天则返回 LastPredictedDayType；否则用 bulletin + special 缓存推算今天。
    /// 无缓存或推算失败返回 nil。
    static func dayTypeForToday() -> String? {
        guard let def = defaults else { return nil }
        let today = estCalendar.startOfDay(for: Date())

        if let predType = def.string(forKey: "LastPredictedDayType"),
           let predDate = def.object(forKey: "LastPredictedDayDate") as? Date,
           estCalendar.isDate(predDate, inSameDayAs: today) {
            return predType
        }

        guard let bulletinType = def.string(forKey: "LastBulletinDayType"),
              let bulletinDate = def.object(forKey: "LastBulletinDate") as? Date,
              let specialDays = loadCachedSpecialDays(def),
              let specialPeriods = loadCachedSpecialPeriods(def) else {
            return nil
        }

        return predictDayType(
            dbDayType: bulletinType,
            dbDate: bulletinDate,
            testDate: today,
            specialDays: specialDays,
            specialPeriods: specialPeriods
        )
    }

    private struct SpecialDayMinimal: Codable {
        let type: String?
    }

    private struct StoredPeriod: Codable {
        let start: String
        let end: String
        let details: String?
    }

    private static func loadCachedSpecialDays(_ def: UserDefaults) -> [String: String]? {
        guard let data = def.data(forKey: "CachedSpecialDaysData"),
              let decoded = try? JSONDecoder().decode([String: SpecialDayMinimal].self, from: data) else {
            return nil
        }
        return decoded.mapValues { $0.type ?? "" }
    }

    private static func loadCachedSpecialPeriods(_ def: UserDefaults) -> [(start: String, end: String)]? {
        guard let data = def.data(forKey: "CachedSpecialPeriodsData"),
              let stored = try? JSONDecoder().decode([StoredPeriod].self, from: data) else {
            return nil
        }
        return stored.map { (start: $0.start, end: $0.end) }
    }

    private static func dateString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = estTimeZone
        return f.string(from: date)
    }

    private static func predictDayType(
        dbDayType: String,
        dbDate: Date,
        testDate: Date,
        specialDays: [String: String],
        specialPeriods: [(start: String, end: String)]
    ) -> String? {
        var predictIsGreen = dbDayType.lowercased().contains("green")
        var date = estCalendar.date(byAdding: .day, value: 1, to: dbDate) ?? dbDate

        while date <= testDate {
            let dateString = dateString(date)
            let isSchoolDay: Bool = {
                if let type = specialDays[dateString] {
                    return type != "no_school"
                }
                for period in specialPeriods {
                    if period.start <= dateString && dateString <= period.end {
                        return false
                    }
                }
                let weekday = estCalendar.component(.weekday, from: date)
                if weekday == 1 || weekday == 7 {
                    return false
                }
                return true
            }()
            if isSchoolDay {
                predictIsGreen.toggle()
            }
            date = estCalendar.date(byAdding: .day, value: 1, to: date) ?? date
        }

        return predictIsGreen ? "Green Day" : "White Day"
    }
}
