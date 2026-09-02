import Foundation

struct DayTypeCache {
    private static let suiteName = "group.danielzhang.Hilltoppers2"
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static func cachedEffectiveDayType() -> (type: String, date: Date)? {
        guard let def = defaults,
              let type = def.string(forKey: "LastEffectiveDayType"),
              let date = def.object(forKey: "LastEffectiveDayDate") as? Date
        else {
            return nil
        }
        return (type, date)
    }

    static func cachedBulletinDayType() -> (type: String, date: Date)? {
        guard let def = defaults,
              let type = def.string(forKey: "LastBulletinDayType"),
              let date = def.object(forKey: "LastBulletinDate") as? Date
        else {
            return nil
        }
        return (type, date)
    }

    static func cachedPredictedDayType() -> (type: String, date: Date)? {
        guard let def = defaults,
              let type = def.string(forKey: "LastPredictedDayType"),
              let date = def.object(forKey: "LastPredictedDayDate") as? Date
        else {
            return nil
        }
        return (type, date)
    }

    /// 写入 day type 缓存（与 Widget 共享的 App Group）；由 DayTypeView.finishLoading 与 refreshDayTypeCache 调用。
    static func setCachedDayType(
        bulletinType: String?,
        bulletinDate: Date?,
        predictedType: String,
        predictedDate: Date,
        effectiveType: String,
        effectiveDate: Date
    ) {
        guard let def = defaults else { return }
        def.set(effectiveType, forKey: "LastEffectiveDayType")
        def.set(effectiveDate, forKey: "LastEffectiveDayDate")
        def.set(predictedType, forKey: "LastPredictedDayType")
        def.set(predictedDate, forKey: "LastPredictedDayDate")
        if let t = bulletinType, let d = bulletinDate {
            def.set(t, forKey: "LastBulletinDayType")
            def.set(d, forKey: "LastBulletinDate")
        } else {
            def.removeObject(forKey: "LastBulletinDayType")
            def.removeObject(forKey: "LastBulletinDate")
        }
    }

    /// 拉取 bulletin、解析 day type，必要时预测，并更新缓存。用于进入 app、手动刷新、Widget 刷新时。
    static func refreshDayTypeCache() async {
        guard let result = await DayTypeBulletinParser.fetchAndParse() else { return }
        let bulletinDayType = result.dayType
        let bulletinDate = result.date

        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let today = calendar.startOfDay(for: Date.currentEST)

        let predicted: String
        if calendar.isDate(bulletinDate, inSameDayAs: today) {
            predicted = bulletinDayType
        } else {
            do {
                predicted = try await ScheduleTypeFetcher.predictDayType(
                    dbDayType: bulletinDayType,
                    dbDate: bulletinDate,
                    testDate: today
                )
            } catch {
                return
            }
        }

        setCachedDayType(
            bulletinType: bulletinDayType,
            bulletinDate: bulletinDate,
            predictedType: predicted,
            predictedDate: today,
            effectiveType: predicted,
            effectiveDate: today
        )
    }

    static func predictedDayType(for date: Date) async -> String? {
        if let cached = cachedPredictedDayType() {
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            if calendar.isDate(cached.date, inSameDayAs: date) {
                return cached.type
            }
        }

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
