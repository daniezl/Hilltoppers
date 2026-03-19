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

// MARK: - Debug: Refresh Timeline (App Group shared for app + widget)

enum RefreshTimelineKind: String, Codable, CaseIterable {
    case appActiveStart
    case appActiveStageSpecialCacheRefreshed
    case appActiveStageDayTypeRefreshed
    case appActiveStageDefaultSchedulesCached
    case appActiveStageBlockPrefsSynced
    case appManualRefreshScheduleStart
    case appManualRefreshScheduleCompleted

    case widgetBackgroundRefreshStart
    case widgetBackgroundStageSpecialCacheRefreshed
    case widgetBackgroundStageDayTypeRefreshed
    case widgetBackgroundStageDefaultSchedulesCached
    case widgetBackgroundStageBlockPrefsSynced
    case widgetBackgroundPayloadWrite
    case widgetBackgroundPayloadSkip

    case widgetPayloadWrite
    case widgetPayloadSkip

    case widgetDailyRefreshStart
    case widgetDailyStageSpecialCacheRefreshed
    case widgetDailyStageDayTypeRefreshed
    case widgetDailyStageDefaultSchedulesCached
    case widgetDailyStageBlockPrefsSynced
    case widgetDailyPayloadWrite
    case widgetDailyPayloadSkip
}

struct RefreshTimelineEvent: Codable, Equatable, Identifiable {
    let id: UUID
    let timestamp: Date
    let kind: RefreshTimelineKind
    let details: String?

    init(id: UUID = UUID(), timestamp: Date = Date(), kind: RefreshTimelineKind, details: String? = nil) {
        self.id = id
        self.timestamp = timestamp
        self.kind = kind
        self.details = details
    }
}

enum RefreshTimelineStore {
    private static let suiteName = "group.danielzhang.Hilltoppers2"
    private static let storageKey = "DebugRefreshTimelineEvents"
    private static let retentionDays: Double = 30
    private static let maxEvents = 2000

    private static let queue = DispatchQueue(label: "RefreshTimelineStore.queue")

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static func append(_ event: RefreshTimelineEvent) {
        queue.async {
            guard let defaults else { return }

            let existing = (defaults.data(forKey: storageKey))
                .flatMap { try? JSONDecoder().decode([RefreshTimelineEvent].self, from: $0) } ?? []

            let cutoff = Date().addingTimeInterval(-retentionDays * 24 * 60 * 60)
            let prunedExisting = existing.filter { $0.timestamp >= cutoff }
            let merged = ([event] + prunedExisting).prefix(maxEvents)
            guard let encoded = try? JSONEncoder().encode(Array(merged)) else { return }
            defaults.set(encoded, forKey: storageKey)
        }
    }

    static func append(kind: RefreshTimelineKind, details: String? = nil) {
        append(RefreshTimelineEvent(kind: kind, details: details))
    }

    static func loadRecent(limit: Int = maxEvents) -> [RefreshTimelineEvent] {
        guard let defaults else { return [] }
        guard let data = defaults.data(forKey: storageKey),
              let events = try? JSONDecoder().decode([RefreshTimelineEvent].self, from: data) else {
            return []
        }
        let cutoff = Date().addingTimeInterval(-retentionDays * 24 * 60 * 60)
        let filtered = events.filter { $0.timestamp >= cutoff }
        return Array(filtered.prefix(limit))
    }

    static func clear() {
        queue.async {
            defaults?.removeObject(forKey: storageKey)
        }
    }
}
