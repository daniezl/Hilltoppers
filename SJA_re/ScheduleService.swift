import Foundation

struct ScheduleService {
    /// True when `loadBlocks` would use no default JSON (Saturday/Sunday in EST), i.e. weekday not Mon–Fri school day mapping.
    /// Used by widget background refresh to set `noSchoolReason` to match `WidgetScheduleFromCache` (`No school (weekend)`).
    static func isLikelyWeekendNoDefaultSchedule(for date: Date) -> Bool {
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let weekday = calendar.component(.weekday, from: date)
        switch weekday {
        case 2, 3, 4, 5, 6:
            return false
        default:
            return true
        }
    }

    /// Reason string when `loadBlocks` returned no events for the widget payload (best-effort; weekend vs generic unavailable).
    static func widgetNoSchoolReasonWhenEmptyBlocks(for date: Date) -> String {
        if isLikelyWeekendNoDefaultSchedule(for: date) {
            return "No school (weekend)"
        }
        return "Schedule unavailable"
    }

    static func loadBlocks(for date: Date) async throws -> [Block] {
        if try await ScheduleTypeFetcher.isInSpecialPeriod(date: date) {
            print("📅 [SCHEDULE] Date \(date) is within a special period - treating as no school")
            return []
        }

        if let type = try await ScheduleTypeFetcher.fetchTypeFor(date: date) {
            switch type {
            case "no_school":
                print("📅 [SCHEDULE] Date \(date) marked as no school")
                return []
            case "custom":
                if let customBlocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: date) {
                    print("📅 [SCHEDULE] Loaded custom schedule with \(customBlocks.count) blocks for \(date)")
                    return customBlocks
                }
                return []
            default:
                let loader = ScheduleLoader()
                loader.loadSchedule(from: type)
                print("📅 [SCHEDULE] Loaded \(type) schedule with \(loader.blocks.count) blocks for \(date)")
                return loader.blocks
            }
        }

        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let weekday = calendar.component(.weekday, from: date)
        let scheduleFile: String?
        switch weekday {
        case 2, 3, 5:
            scheduleFile = "schedule_mon_thu"
        case 4:
            scheduleFile = "schedule_wed"
        case 6:
            scheduleFile = "schedule_fri"
        default:
            scheduleFile = nil
        }

        if let file = scheduleFile {
            let loader = ScheduleLoader()
            loader.loadSchedule(from: file)
            print("📅 [SCHEDULE] Loaded default schedule \(file) with \(loader.blocks.count) blocks for \(date)")
            return loader.blocks
        }

        print("📅 [SCHEDULE] No matching schedule for \(date) (likely weekend)")
        return []
    }
}
