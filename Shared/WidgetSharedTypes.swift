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
    /// 特殊课表时显示（Late Start、ABDEC、Custom 等）；普通课表为 nil。
    let scheduleTitle: String?
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
