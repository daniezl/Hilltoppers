//
//  WidgetScheduleFromCache.swift
//  ClassCountdownWidget
//
//  仅从 App Group 缓存算出今日课表或 No School，用于无 payload 或 payload 过期时展示，不再显示 Open App。
//

import Foundation

enum WidgetScheduleFromCache {
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

    struct ScheduleResult {
        let noSchool: Bool
        let reason: String?
        let events: [WidgetClassEvent]
    }

    /// 仅从缓存算出今日课表；无缓存或周末等返回 noSchool 或空 events。
    static func scheduleForToday() -> ScheduleResult {
        guard let def = defaults else {
            return ScheduleResult(noSchool: true, reason: "Schedule unavailable", events: [])
        }
        let today = estCalendar.startOfDay(for: Date())
        let dateString = dateString(from: today)

        // 1. special_periods
        if let periods = loadCachedSpecialPeriods(def),
           let (_, details) = todayInPeriods(dateString, periods: periods) {
            return ScheduleResult(noSchool: true, reason: details ?? "Break", events: [])
        }

        // 2. special_days
        if let specialDays = loadCachedSpecialDays(def),
           let dayRecord = specialDays[dateString] {
            if dayRecord.type == "no_school" {
                return ScheduleResult(noSchool: true, reason: dayRecord.details ?? "No School", events: [])
            }
            if dayRecord.type == "custom", let blocks = dayRecord.schedule, !blocks.isEmpty {
                let events = blocksToEvents(blocks, on: today)
                return ScheduleResult(noSchool: false, reason: nil, events: events)
            }
            if let type = dayRecord.type, type != "no_school", type != "custom" {
                let cacheKey = defaultScheduleCacheKey(for: type)
                if let blocks = loadCachedDefaultSchedule(def, scheduleKey: cacheKey) {
                    let events = blocksToEvents(blocks, on: today)
                    return ScheduleResult(noSchool: false, reason: nil, events: events)
                }
            }
        }

        // 3. 默认按星期
        let weekday = estCalendar.component(.weekday, from: today)
        let key: String?
        switch weekday {
        case 2, 3, 5: key = "CachedScheduleMonThu"
        case 4: key = "CachedScheduleWed"
        case 6: key = "CachedScheduleFri"
        default: key = nil
        }
        if let cacheKey = key, let blocks = loadCachedDefaultSchedule(def, scheduleKey: cacheKey) {
            let events = blocksToEvents(blocks, on: today)
            return ScheduleResult(noSchool: false, reason: nil, events: events)
        }

        if key == nil {
            return ScheduleResult(noSchool: true, reason: "No school (weekend)", events: [])
        }
        return ScheduleResult(noSchool: true, reason: "Schedule unavailable", events: [])
    }

    private static func dateString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = estTimeZone
        return f.string(from: date)
    }

    private struct SpecialDayRecord: Codable {
        let type: String?
        let details: String?
        let schedule: [BlockMinimal]?
    }

    private struct BlockMinimal: Codable {
        let name: String
        let start: String
        let end: String
    }

    private struct StoredPeriod: Codable {
        let start: String
        let end: String
        let details: String?
    }

    private static func loadCachedSpecialDays(_ def: UserDefaults) -> [String: SpecialDayRecord]? {
        guard let data = def.data(forKey: "CachedSpecialDaysData") else { return nil }
        return try? JSONDecoder().decode([String: SpecialDayRecord].self, from: data)
    }

    private static func loadCachedSpecialPeriods(_ def: UserDefaults) -> [StoredPeriod]? {
        guard let data = def.data(forKey: "CachedSpecialPeriodsData") else { return nil }
        return try? JSONDecoder().decode([StoredPeriod].self, from: data)
    }

    private static func todayInPeriods(_ dateString: String, periods: [StoredPeriod]) -> (Bool, String?)? {
        for p in periods {
            if p.start <= dateString && dateString <= p.end {
                return (true, p.details)
            }
        }
        return nil
    }

    private static func defaultScheduleCacheKey(for type: String) -> String {
        switch type {
        case "schedule_mon_thu": return "CachedScheduleMonThu"
        case "schedule_wed": return "CachedScheduleWed"
        case "schedule_fri": return "CachedScheduleFri"
        default: return type
        }
    }

    private static func loadCachedDefaultSchedule(_ def: UserDefaults, scheduleKey: String) -> [BlockMinimal]? {
        guard let data = def.data(forKey: scheduleKey) else { return nil }
        return try? JSONDecoder().decode([BlockMinimal].self, from: data)
    }

    private static func blocksToEvents(_ blocks: [BlockMinimal], on baseDate: Date) -> [WidgetClassEvent] {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = estTimeZone
        var events: [WidgetClassEvent] = []
        let comps = estCalendar.dateComponents([.year, .month, .day], from: baseDate)
        guard let dayStart = estCalendar.date(from: comps) else { return [] }
        for block in blocks {
            guard let startTime = formatter.date(from: block.start),
                  let endTime = formatter.date(from: block.end) else { continue }
            let startHour = estCalendar.component(.hour, from: startTime)
            let startMin = estCalendar.component(.minute, from: startTime)
            let endHour = estCalendar.component(.hour, from: endTime)
            let endMin = estCalendar.component(.minute, from: endTime)
            guard let startDate = estCalendar.date(bySettingHour: startHour, minute: startMin, second: 0, of: dayStart),
                  let endDate = estCalendar.date(bySettingHour: endHour, minute: endMin, second: 0, of: dayStart) else { continue }
            events.append(WidgetClassEvent(
                blockName: block.name,
                displayName: block.name,
                startDate: startDate,
                endDate: endDate
            ))
        }
        return events
    }
}
