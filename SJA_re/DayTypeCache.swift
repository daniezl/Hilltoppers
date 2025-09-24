import Foundation

struct DayTypeCache {
    private static let defaults = UserDefaults.standard

    static func cachedEffectiveDayType() -> (type: String, date: Date)? {
        guard
            let type = defaults.string(forKey: "LastEffectiveDayType"),
            let date = defaults.object(forKey: "LastEffectiveDayDate") as? Date
        else {
            return nil
        }
        return (type, date)
    }

    static func cachedBulletinDayType() -> (type: String, date: Date)? {
        guard
            let type = defaults.string(forKey: "LastBulletinDayType"),
            let date = defaults.object(forKey: "LastBulletinDate") as? Date
        else {
            return nil
        }
        return (type, date)
    }

    static func predictedDayType(for date: Date) async -> String? {
        if let bulletin = cachedBulletinDayType() {
            do {
                return try await ScheduleTypeFetcher.predictDayType(
                    dbDayType: bulletin.type,
                    dbDate: bulletin.date,
                    testDate: date
                )
            } catch {
                print("❌ [DAYTYPE-CACHE] Prediction failed: \(error)")
            }
        }

        if let effective = cachedEffectiveDayType() {
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            if calendar.isDate(effective.date, inSameDayAs: date) {
                return effective.type
            }
            if let toggled = toggleDayType(from: effective.type) {
                return toggled
            }
        }

        return nil
    }

    private static func toggleDayType(from type: String) -> String? {
        let lower = type.lowercased()
        if lower.contains("green") {
            return "White Day"
        }
        if lower.contains("white") {
            return "Green Day"
        }
        return nil
    }
}
