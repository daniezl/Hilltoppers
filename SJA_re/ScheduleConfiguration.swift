import Foundation

// MARK: - Time Handling
struct TimeBlock: Codable {
    let name: String
    let start: String
    let end: String
    
    var startMinutes: Int {
        TimeBlock.timeStringToMinutes(start)
    }
    
    var endMinutes: Int {
        TimeBlock.timeStringToMinutes(end)
    }
    
    static func timeStringToMinutes(_ timeString: String) -> Int {
        let components = timeString.split(separator: ":").compactMap { Int($0) }
        guard components.count == 2 else { return 0 }
        return components[0] * 60 + components[1]
    }
}

// MARK: - Block with Lunches
struct BlockWithLunches: Codable {
    let name: String
    let start: String
    let end: String
    let lunches: [TimeBlock]
}

// MARK: - Schedule Configuration
struct ScheduleConfiguration: Codable {
    struct DaySchedule: Codable {
        let firstPeriod: TimeBlock
        let regularBlocks: [BlockWithLunches?]
    }
    
    let defaultSchedule: DaySchedule
    let specialDays: [String: DaySchedule]
    
    // Get the appropriate schedule for a given weekday
    func scheduleForWeekday(_ weekday: Int) -> DaySchedule {
        let weekdayName = Calendar.current.weekdaySymbols[weekday - 1].lowercased()
        return specialDays[weekdayName] ?? defaultSchedule
    }
    
    // Load configuration from a JSON file
    static func load() -> ScheduleConfiguration? {
        guard let url = Bundle.main.url(forResource: "scheduleConfig", withExtension: "json") else {
            print("Could not find scheduleConfig.json")
            return nil
        }
        
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            return try decoder.decode(ScheduleConfiguration.self, from: data)
        } catch {
            print("Error loading schedule configuration: \(error)")
            return nil
        }
    }
} 