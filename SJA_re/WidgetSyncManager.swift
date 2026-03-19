import Foundation
import WidgetKit

final class WidgetSyncManager {
    static let shared = WidgetSyncManager()

    private let suiteName = "group.danielzhang.Hilltoppers2"
    private let defaults: UserDefaults?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        defaults = UserDefaults(suiteName: suiteName)
        encoder = JSONEncoder()
        decoder = JSONDecoder()
    }

    func updateSchedule(scheduleDate: Date, events: [WidgetClassEvent], noSchoolReason: String?, dayTypeDisplay: String?, scheduleTitle: String? = nil) {
        let payload = ClassCountdownWidgetPayload(
            scheduleDate: scheduleDate,
            lastUpdated: Date(),
            events: events,
            noSchoolReason: noSchoolReason,
            dayTypeDisplay: dayTypeDisplay,
            scheduleTitle: scheduleTitle
        )

        writePayloadIfNeeded(payload)
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

        writePayloadIfNeeded(payload)
    }

    private func writePayloadIfNeeded(_ payload: ClassCountdownWidgetPayload) {
        guard let defaults else { return }

        let scheduleDateString: String = {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: payload.scheduleDate)
        }()

        if let existingData = defaults.data(forKey: widgetPayloadKey),
           let existingPayload = try? decoder.decode(ClassCountdownWidgetPayload.self, from: existingData),
           existingPayload.scheduleDate == payload.scheduleDate,
           existingPayload.events == payload.events,
           existingPayload.noSchoolReason == payload.noSchoolReason,
           existingPayload.dayTypeDisplay == payload.dayTypeDisplay,
           existingPayload.scheduleTitle == payload.scheduleTitle {
            RefreshTimelineStore.append(
                kind: .widgetPayloadSkip,
                details: "scheduleDate=\(scheduleDateString) events=\(payload.events.count) dayType=\(payload.dayTypeDisplay ?? "nil") scheduleTitle=\(payload.scheduleTitle ?? "nil") noSchoolReason=\(payload.noSchoolReason ?? "nil")"
            )
            return
        }

        guard let encoded = try? encoder.encode(payload) else { return }
        defaults.set(encoded, forKey: widgetPayloadKey)

        RefreshTimelineStore.append(
            kind: .widgetPayloadWrite,
            details: "scheduleDate=\(scheduleDateString) events=\(payload.events.count) dayType=\(payload.dayTypeDisplay ?? "nil") scheduleTitle=\(payload.scheduleTitle ?? "nil") noSchoolReason=\(payload.noSchoolReason ?? "nil")"
        )
        WidgetCenter.shared.reloadTimelines(ofKind: "ClassCountdownWidget")
    }

    /// 将 block 显示名设置写入 App Group，供 Widget 用缓存建课表时显示用户设置的课程名。
    func syncBlockPreferencesToAppGroup() {
        guard let defaults else { return }
        // 优先从本地持久化直接同步，避免后台刷新/未打开 app 时 shared.preferences 仍为空导致同步不到。
        if let localData = UserDefaults.standard.data(forKey: "blockPreferences") {
            defaults.set(localData, forKey: "BlockPreferences")
            return
        }

        let prefs = BlockPreferencesManager.shared.preferences
        guard let data = try? encoder.encode(prefs) else { return }
        defaults.set(data, forKey: "BlockPreferences")
    }
}
