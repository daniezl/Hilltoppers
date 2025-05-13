import Foundation

struct Period: Codable, Identifiable {
    let id: UUID
    let name: String
    let startTime: String
    let endTime: String
    let subPeriods: [Period]?

    private enum CodingKeys: String, CodingKey {
        case name, startTime, endTime, subPeriods
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = UUID()
        self.name = try container.decode(String.self, forKey: .name)
        self.startTime = try container.decode(String.self, forKey: .startTime)
        self.endTime = try container.decode(String.self, forKey: .endTime)
        self.subPeriods = try container.decodeIfPresent([Period].self, forKey: .subPeriods)
    }
}

struct Schedule: Codable {
    let dayType: String
    let periods: [Period]
}

class ScheduleLoader {
    static func loadSchedule(named fileName: String) -> Schedule? {
        guard let url = Bundle.main.url(forResource: fileName, withExtension: "json", subdirectory: "schedules"),
              let data = try? Data(contentsOf: url),
              let schedule = try? JSONDecoder().decode(Schedule.self, from: data) else {
            return nil
        }
        return schedule
    }
}
