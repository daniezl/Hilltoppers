import Foundation

struct WidgetClassEvent: Codable, Equatable {
    let blockName: String
    let displayName: String
    let startDate: Date
    let endDate: Date
}

struct ClassCountdownWidgetPayload: Codable, Equatable {
    let scheduleDate: Date
    let lastUpdated: Date
    let events: [WidgetClassEvent]
    let noSchoolReason: String?
    let dayTypeDisplay: String?
}

enum ClassCountdownPhase: Equatable {
    case blockStarts(WidgetClassEvent)
    case blockEnds(WidgetClassEvent)
    case finished
    case noSchool(String)
    case stale
    case empty
}

let widgetPayloadKey = "ClassCountdownWidgetPayload"

extension TimeZone {
    static let sjaEST = TimeZone(identifier: "America/New_York") ?? .current
}

extension Calendar {
    static var sja: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .sjaEST
        return calendar
    }
}
