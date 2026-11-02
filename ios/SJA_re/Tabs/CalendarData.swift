import SwiftUI

struct CalendarEvent: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let start: String
    let end: String
    let allDay: Bool
    let startTime: String?
    let endTime: String?

    private enum CodingKeys: String, CodingKey {
        case id, title, start, end, allDay, startTime, endTime
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        start = try container.decode(String.self, forKey: .start)
        let rawEnd = try container.decodeIfPresent(String.self, forKey: .end)
        end = (rawEnd ?? start) >= start ? (rawEnd ?? start) : start
        startTime = try container.decodeIfPresent(String.self, forKey: .startTime)
        endTime = try container.decodeIfPresent(String.self, forKey: .endTime)
        allDay = (try container.decodeIfPresent(Bool.self, forKey: .allDay) ?? false) || startTime == nil
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? "\(start):\(title)"
    }

    func time(_ timeFormat: TimeFormat) -> String? {
        guard !allDay, let startTime else { return nil }
        if let endTime { return SchoolTime.range(startTime, endTime, timeFormat) }
        return SchoolTime.clock(startTime, timeFormat)
    }
}

/// Which timetable a day runs on. Colors match the extension's calendar.
enum ScheduleFamily {
    case normal, friday, late, abdec, custom, off

    var fill: Color {
        switch self {
        case .normal: return Color(red: 0xe1/255, green: 0xe5/255, blue: 0xe9/255)
        case .friday: return Color(red: 0xcf/255, green: 0xe5/255, blue: 0xd5/255)
        case .late: return Color(red: 0xff/255, green: 0xe4/255, blue: 0x9a/255)
        case .abdec: return Color(red: 0xf8/255, green: 0xcf/255, blue: 0xcc/255)
        case .custom: return Color(red: 0xe1/255, green: 0xcf/255, blue: 0xf4/255)
        case .off: return .clear
        }
    }

    var ink: Color {
        switch self {
        case .normal: return Color(red: 0x36/255, green: 0x40/255, blue: 0x3b/255)
        case .friday: return Color(red: 0x21/255, green: 0x5c/255, blue: 0x34/255)
        case .late: return Color(red: 0x76/255, green: 0x55/255, blue: 0x00/255)
        case .abdec: return Color(red: 0xa1/255, green: 0x28/255, blue: 0x25/255)
        case .custom: return Color(red: 0x68/255, green: 0x40/255, blue: 0x8c/255)
        case .off: return Color(red: 0x87/255, green: 0x92/255, blue: 0x8b/255)
        }
    }

    var label: String {
        switch self {
        case .normal: return "Mon–Thurs / Wednesday"
        case .friday: return "Friday schedule"
        case .late: return "Late start"
        case .abdec: return "ABDEC"
        case .custom: return "Custom schedule"
        case .off: return "No school"
        }
    }

    init(type: String) {
        switch type {
        case "schedule_mon_thu", "schedule_wed": self = .normal
        case "schedule_fri": self = .friday
        case "late_start": self = .late
        case "abdec": self = .abdec
        case "no_school": self = .off
        default: self = .custom
        }
    }
}

struct CalendarDayInfo {
    let key: String
    let family: ScheduleFamily
    let scheduleLabel: String
    let noSchool: Bool
    /// "Green Day", "White Day" or "No School"; nil when the file does not say.
    let label: String?
    /// "Winter Break", "Late start" — stands in for the event list when it is empty.
    let note: String?
    let events: [CalendarEvent]
}

typealias SpecialPeriod = (start: String, end: String, details: String?)

@MainActor
final class CalendarStore: ObservableObject {
    @Published private(set) var events: [CalendarEvent]? { didSet { dataChanged() } }
    @Published private(set) var eventsFailed = false
    @Published private(set) var dayTypes: [String: String] = [:] { didSet { dataChanged() } }
    @Published private(set) var specialDays: [String: CloudflareDataLoader.SpecialDayRecord] = [:] { didSet { dataChanged() } }
    @Published private(set) var periods: [SpecialPeriod] = [] { didSet { dataChanged() } }

    /// Every visible cell asks for its day on each redraw, across two years of months.
    private var dayCache: [String: CalendarDayInfo] = [:]
    /// Lets a month skip redrawing until something it shows has actually changed.
    private(set) var revision = 0

    private func dataChanged() {
        dayCache.removeAll()
        revision += 1
    }

    private static let eventsCacheKey = "CachedCalendarEventsData"
    private static let dayTypesCacheKey = "CachedCalendarDayTypesData"
    private static let templateTypes = ["schedule_mon_thu", "schedule_wed", "schedule_fri", "late_start", "abdec"]
    private lazy var templates: [String: [Block]] = {
        Dictionary(uniqueKeysWithValues: Self.templateTypes.map { ($0, Self.bundledBlocks($0)) })
    }()

    private struct EventsFile: Decodable { let events: [CalendarEvent] }
    private struct DayTypesFile: Decodable { let days: [String: String] }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.eventsCacheKey),
           let cached = try? JSONDecoder().decode(EventsFile.self, from: data) {
            events = cached.events
        }
        if let data = UserDefaults.standard.data(forKey: Self.dayTypesCacheKey),
           let cached = try? JSONDecoder().decode(DayTypesFile.self, from: data) {
            dayTypes = cached.days
        }
    }

    func refresh() async {
        async let eventsData = Self.fetch("events.json")
        async let dayTypesData = Self.fetch("day_type.json")
        async let special = try? CloudflareDataLoader.loadSpecialDays()
        async let specialPeriods = try? CloudflareDataLoader.loadSpecialPeriods()

        if let data = await eventsData, let file = try? JSONDecoder().decode(EventsFile.self, from: data) {
            events = file.events
            eventsFailed = false
            UserDefaults.standard.set(data, forKey: Self.eventsCacheKey)
        } else if events == nil {
            events = []
            eventsFailed = true
        }
        if let data = await dayTypesData, let file = try? JSONDecoder().decode(DayTypesFile.self, from: data) {
            dayTypes = file.days
            UserDefaults.standard.set(data, forKey: Self.dayTypesCacheKey)
        }
        if let days = await special { specialDays = days }
        if let list = await specialPeriods { periods = list }
    }

    private static func fetch(_ name: String) async -> Data? {
        guard let url = URL(string: "\(ScheduleConfig.cloudflareBaseURL)/\(name)") else { return nil }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }

    private static func bundledBlocks(_ name: String) -> [Block] {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let blocks = try? JSONDecoder().decode([Block].self, from: data) else { return [] }
        return blocks
    }

    private func period(containing key: String) -> SpecialPeriod? {
        periods.first { key >= $0.start && key <= $0.end }
    }

    /// Same rules as data/scripts/fetch_day_type.mjs, so a blank day here agrees
    /// with the "No School" that file publishes, and still answers for months
    /// the file does not reach.
    func isDayOff(_ key: String) -> Bool {
        if period(containing: key) != nil { return true }
        if let type = specialDays[key]?.type { return type == "no_school" }
        let weekday = SchoolTime.date(fromKey: key).map { Calendar.sja.component(.weekday, from: $0) } ?? 2
        return weekday == 1 || weekday == 7 || dayTypes[key] == "No School"
    }

    private func defaultType(_ key: String) -> String {
        let weekday = SchoolTime.date(fromKey: key).map { Calendar.sja.component(.weekday, from: $0) } ?? 2
        return weekday == 4 ? "schedule_wed" : weekday == 6 ? "schedule_fri" : "schedule_mon_thu"
    }

    func describe(_ key: String) -> CalendarDayInfo {
        if let cached = dayCache[key] { return cached }
        let info = buildDayInfo(key)
        dayCache[key] = info
        return info
    }

    private func buildDayInfo(_ key: String) -> CalendarDayInfo {
        let special = specialDays[key]
        let noSchool = isDayOff(key)
        let dayEvents = (events ?? [])
            .filter { $0.start <= key && key <= $0.end }
            .sorted {
                if $0.allDay != $1.allDay { return $0.allDay }
                if $0.startTime != $1.startTime { return ($0.startTime ?? "") < ($1.startTime ?? "") }
                return $0.title < $1.title
            }

        let type = special?.type ?? defaultType(key)
        let custom = type == "custom" ? classifyCustom(special?.schedule ?? []) : nil
        let family: ScheduleFamily = noSchool ? .off : custom?.family ?? ScheduleFamily(type: type)

        let scheduleLabel: String
        if custom?.modified == true {
            scheduleLabel = "ABDEC · adjusted times"
        } else if family == .normal, custom == nil, let date = SchoolTime.date(fromKey: key) {
            scheduleLabel = "\(SchoolTime.string(date, "EEEE")) schedule"
        } else {
            scheduleLabel = family.label
        }

        // Holidays and late starts are nearly always events too, so this only
        // has to carry the days the calendar feed says nothing about.
        var note = special?.details ?? period(containing: key)?.details
        if note == nil, !noSchool, let specialType = special?.type {
            note = specialType == "custom" ? "Special schedule" : Self.humanize(specialType)
        }

        return CalendarDayInfo(
            key: key,
            family: family,
            scheduleLabel: scheduleLabel,
            noSchool: noSchool,
            label: noSchool ? "No School" : dayTypes[key],
            note: note,
            events: dayEvents
        )
    }

    /// The blocks a given day runs on, before any grade filtering.
    func blocks(for key: String) -> [Block] {
        if isDayOff(key) { return [] }
        let special = specialDays[key]
        if special?.type == "custom" { return special?.schedule ?? [] }
        return Self.bundledBlocks(special?.type ?? defaultType(key))
    }

    /// A "custom" entry that repeats a preset is that preset. ABDEC order with
    /// different times still counts as ABDEC.
    private func classifyCustom(_ blocks: [Block]) -> (family: ScheduleFamily, modified: Bool) {
        let signature = Self.signature(blocks)
        for type in Self.templateTypes {
            if let template = templates[type], !template.isEmpty, Self.signature(template) == signature {
                return (ScheduleFamily(type: type), false)
            }
        }
        let order = blocks
            .sorted { Self.paddedTime($0.start) < Self.paddedTime($1.start) }
            .compactMap { block -> String? in
                let name = block.name.trimmingCharacters(in: .whitespaces).uppercased()
                let letter = name.replacingOccurrences(of: " BLOCK", with: "")
                return letter.count == 1 && "ABCDE".contains(letter) ? letter : nil
            }
            .joined()
        return order == "ABDEC" ? (.abdec, true) : (.custom, false)
    }

    private static func paddedTime(_ time: String) -> String {
        time.count < 5 ? "0" + time : time
    }

    private static func signature(_ blocks: [Block]) -> String {
        blocks.map { block in
            let grades = (block.grades ?? []).sorted().map(String.init).joined(separator: ",")
            let children = (block.subBlocks ?? [])
                .map { "\($0.name.trimmingCharacters(in: .whitespaces))|\(paddedTime($0.start))|\(paddedTime($0.end))" }
                .joined(separator: ";")
            return "\(block.name.trimmingCharacters(in: .whitespaces))|\(paddedTime(block.start))|\(paddedTime(block.end))|\(grades)|\(children)"
        }
        .joined(separator: "\n")
    }

    private static func humanize(_ type: String) -> String {
        if type == "late_start" { return "Late start" }
        if type == "abdec" { return "ABDEC" }
        let spaced = type.replacingOccurrences(of: "_", with: " ")
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }
}
