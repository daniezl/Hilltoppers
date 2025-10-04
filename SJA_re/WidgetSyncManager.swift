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

    func updateSchedule(scheduleDate: Date, events: [WidgetClassEvent], noSchoolReason: String?, dayTypeDisplay: String?) {
        let payload = ClassCountdownWidgetPayload(
            scheduleDate: scheduleDate,
            lastUpdated: Date(),
            events: events,
            noSchoolReason: noSchoolReason,
            dayTypeDisplay: dayTypeDisplay
        )

        writePayloadIfNeeded(payload)
    }

    func clearSchedule(reason: String?) {
        let startOfToday = Calendar.sja.startOfDay(for: Date())
        let payload = ClassCountdownWidgetPayload(
            scheduleDate: startOfToday,
            lastUpdated: Date(),
            events: [],
            noSchoolReason: reason,
            dayTypeDisplay: nil
        )

        writePayloadIfNeeded(payload)
    }

    private func writePayloadIfNeeded(_ payload: ClassCountdownWidgetPayload) {
        guard let defaults else { return }

        if let existingData = defaults.data(forKey: widgetPayloadKey),
           let existingPayload = try? decoder.decode(ClassCountdownWidgetPayload.self, from: existingData),
           existingPayload.scheduleDate == payload.scheduleDate,
           existingPayload.events == payload.events,
           existingPayload.noSchoolReason == payload.noSchoolReason,
           existingPayload.dayTypeDisplay == payload.dayTypeDisplay {
            return
        }

        guard let encoded = try? encoder.encode(payload) else { return }
        defaults.set(encoded, forKey: widgetPayloadKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "ClassCountdownWidget")
    }
}
