import Foundation
import WidgetKit

final class WidgetSyncManager {
    static let shared = WidgetSyncManager()
    private static let widgetKind = "ClassCountdownWidget"

    private let suiteName = "group.danielzhang.Hilltoppers2"
    private let defaults: UserDefaults?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        defaults = UserDefaults(suiteName: suiteName)
        encoder = JSONEncoder()
        decoder = JSONDecoder()
    }

    func updateSchedule(
        scheduleDate: Date,
        events: [WidgetClassEvent],
        noSchoolReason: String?,
        dayTypeDisplay: String?,
        scheduleTitle: String? = nil,
        debugContext: [String: String] = [:]
    ) {
        let payload = ClassCountdownWidgetPayload(
            scheduleDate: scheduleDate,
            lastUpdated: Date(),
            events: events,
            noSchoolReason: noSchoolReason,
            dayTypeDisplay: dayTypeDisplay,
            scheduleTitle: scheduleTitle
        )

        writePayloadIfNeeded(payload, debugContext: debugContext)
        syncBlockPreferencesToAppGroup()
    }

    func clearSchedule(reason: String?) {
        let startOfToday = Calendar.sja.startOfDay(for: Date())
        let payload = ClassCountdownWidgetPayload(
            scheduleDate: startOfToday,
            lastUpdated: Date(),
            events: [],
            noSchoolReason: reason,
            dayTypeDisplay: nil,
            scheduleTitle: nil
        )

        writePayloadIfNeeded(payload, debugContext: [:])
    }

    private func writePayloadIfNeeded(_ payload: ClassCountdownWidgetPayload, debugContext: [String: String]) {
        guard let defaults else { return }

        let scheduleDateString: String = {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: payload.scheduleDate)
        }()

        let firstEventDisplayName = payload.events.first?.displayName ?? "nil"
        let debugSuffix = formatDebugContext(debugContext)

        if let existingData = defaults.data(forKey: widgetPayloadKey),
           let existingPayload = try? decoder.decode(ClassCountdownWidgetPayload.self, from: existingData),
           existingPayload.scheduleDate == payload.scheduleDate,
           existingPayload.events == payload.events,
           existingPayload.noSchoolReason == payload.noSchoolReason,
           existingPayload.dayTypeDisplay == payload.dayTypeDisplay,
           existingPayload.scheduleTitle == payload.scheduleTitle {
            // #region agent log
            DebugEedcf6Logger.log(
                hypothesisId: "H2_payload_skipped_due_to_equality",
                location: "WidgetSyncManager.writePayloadIfNeeded",
                message: "payload skip (no changes detected)",
                data: [
                    "scheduleDate": scheduleDateString,
                    "eventsCount": "\(payload.events.count)",
                    "firstDisplayName": firstEventDisplayName,
                    "dayTypeDisplay": payload.dayTypeDisplay ?? "nil",
                    "scheduleTitle": payload.scheduleTitle ?? "nil",
                    "noSchoolReason": payload.noSchoolReason ?? "nil"
                ]
            )
            // #endregion
            RefreshTimelineStore.append(
                kind: .widgetPayloadSkip,
                details: "scheduleDate=\(scheduleDateString) events=\(payload.events.count) dayType=\(payload.dayTypeDisplay ?? "nil") scheduleTitle=\(payload.scheduleTitle ?? "nil") noSchoolReason=\(payload.noSchoolReason ?? "nil")\(debugSuffix)"
            )
            return
        }

        guard let encoded = try? encoder.encode(payload) else { return }
        defaults.set(encoded, forKey: widgetPayloadKey)

        // #region agent log
        DebugEedcf6Logger.log(
            hypothesisId: "H2_payload_written_due_to_change",
            location: "WidgetSyncManager.writePayloadIfNeeded",
            message: "payload write (changes detected)",
            data: [
                "scheduleDate": scheduleDateString,
                "eventsCount": "\(payload.events.count)",
                "firstDisplayName": firstEventDisplayName,
                "dayTypeDisplay": payload.dayTypeDisplay ?? "nil",
                "scheduleTitle": payload.scheduleTitle ?? "nil",
                "noSchoolReason": payload.noSchoolReason ?? "nil"
            ]
        )
        // #endregion

        RefreshTimelineStore.append(
            kind: .widgetPayloadWrite,
            details: "scheduleDate=\(scheduleDateString) events=\(payload.events.count) dayType=\(payload.dayTypeDisplay ?? "nil") scheduleTitle=\(payload.scheduleTitle ?? "nil") noSchoolReason=\(payload.noSchoolReason ?? "nil")\(debugSuffix)"
        )
        WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
    }

    private func formatDebugContext(_ context: [String: String]) -> String {
        guard !context.isEmpty else { return "" }
        let rendered = context
            .sorted(by: { $0.key < $1.key })
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: " ")
        return rendered.isEmpty ? "" : " \(rendered)"
    }

    /// 将 block 显示名设置写入 App Group，供 Widget 用缓存建课表时显示用户设置的课程名。
    func syncBlockPreferencesToAppGroup(reloadTimelines: Bool = false) {
        guard let defaults else { return }
        var didWrite = false
        // 优先从本地持久化直接同步，避免后台刷新/未打开 app 时 shared.preferences 仍为空导致同步不到。
        if let localData = UserDefaults.standard.data(forKey: "blockPreferences") {
            // #region agent log
            DebugEedcf6Logger.log(
                hypothesisId: "H1_blockprefs_sync_local_data",
                location: "WidgetSyncManager.syncBlockPreferencesToAppGroup",
                message: "sync BlockPreferences from localData",
                data: [
                    "localDataBytes": "\(localData.count)",
                    "appGroupHasBeforeBytes": "\(defaults.data(forKey: "BlockPreferences")?.count ?? 0)"
                ]
            )
            // #endregion
            defaults.set(localData, forKey: "BlockPreferences")
            didWrite = true
            // #region agent log
            DebugEedcf6Logger.log(
                hypothesisId: "H1_blockprefs_sync_appgroup_after_set",
                location: "WidgetSyncManager.syncBlockPreferencesToAppGroup",
                message: "BlockPreferences wrote to app group",
                data: [
                    "appGroupAfterBytes": "\(defaults.data(forKey: "BlockPreferences")?.count ?? 0)"
                ]
            )
            // #endregion
            if reloadTimelines, didWrite {
                WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
            }
            return
        }

        let prefs = BlockPreferencesManager.shared.preferences
        guard let data = try? encoder.encode(prefs) else { return }
        defaults.set(data, forKey: "BlockPreferences")
        didWrite = true

        // #region agent log
        DebugEedcf6Logger.log(
            hypothesisId: "H1_blockprefs_sync_shared_preferences",
            location: "WidgetSyncManager.syncBlockPreferencesToAppGroup",
            message: "sync BlockPreferences from shared.preferences",
            data: [
                "encodedBytes": "\(data.count)",
                "appGroupAfterBytes": "\(defaults.data(forKey: "BlockPreferences")?.count ?? 0)"
            ]
        )
        // #endregion

        if reloadTimelines, didWrite {
            WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
        }
    }
}
