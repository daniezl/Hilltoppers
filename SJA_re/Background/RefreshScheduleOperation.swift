import Foundation
import WidgetKit

final class RefreshScheduleOperation: Operation {
    override func main() {
        if isCancelled { return }

        let semaphore = DispatchSemaphore(value: 0)

        Task {
            do {
                await CloudflareDataLoader.refreshSpecialDataCache()
                let calendar = Calendar.sja
                let referenceDate = Date.currentESTNoon
                let blocks = try await ScheduleService.loadBlocks(for: referenceDate)
                let noSchoolReason = blocks.isEmpty ? "Schedule unavailable" : nil
                let dayTypeDisplay = await DayTypeCache.predictedDayType(for: referenceDate)

                let events: [WidgetClassEvent] = blocks.compactMap { block in
                    guard let start = ScheduleTimeParser.date(from: block.start, on: referenceDate),
                          let end = ScheduleTimeParser.date(from: block.end, on: referenceDate) else {
                        return nil
                    }

                    return WidgetClassEvent(
                        blockName: block.name,
                        displayName: block.name,
                        startDate: start,
                        endDate: end
                    )
                }

                // Refresh widget (always)
                await MainActor.run {
                    WidgetSyncManager.shared.updateSchedule(
                        scheduleDate: calendar.startOfDay(for: referenceDate),
                        events: events,
                        noSchoolReason: noSchoolReason,
                        dayTypeDisplay: dayTypeDisplay
                    )
                    WidgetKit.WidgetCenter.shared.reloadAllTimelines()
                }
                
                // Refresh notifications (if enabled)
                let notificationsEnabled = await MainActor.run {
                    NotificationSettingsManager.shared.notificationsEnabled
                }
                
                if notificationsEnabled {
                    let notificationResults = await NotificationManager.shared.scheduleUpcomingSchoolDays(
                        startingFrom: Date.currentEST,
                        dayTypeProvider: { date in
                            await DayTypeCache.predictedDayType(for: date)
                        }
                    )
                    print("✅ [BG-SCHEDULE] Widget and notifications refreshed - scheduled \(notificationResults.count) day(s)")
                } else {
                    print("✅ [BG-SCHEDULE] Widget refreshed (notifications disabled)")
                }
            } catch {
                print("❌ [BG-SCHEDULE] Refresh failed: \(error)")
            }

            semaphore.signal()
        }

        semaphore.wait()
    }
}

private enum ScheduleTimeParser {
    static func date(from time: String, on base: Date) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = .sjaEST
        guard let parsed = formatter.date(from: time) else { return nil }

        var calendar = Calendar.sja
        let components = calendar.dateComponents([.year, .month, .day], from: base)
        return calendar.date(bySettingHour: calendar.component(.hour, from: parsed),
                             minute: calendar.component(.minute, from: parsed),
                             second: 0,
                             of: calendar.date(from: components) ?? base)
    }
}

private extension Date {
    static var currentESTNoon: Date {
        var calendar = Calendar.sja
        let now = Date()
        let start = calendar.startOfDay(for: now)
        return calendar.date(bySettingHour: 12, minute: 0, second: 0, of: start) ?? now
    }
}
