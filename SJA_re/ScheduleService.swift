import Foundation

struct ScheduleService {
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
