import Foundation
import WidgetKit

final class RefreshScheduleOperation: Operation {
    override func main() {
        if isCancelled { return }

        let semaphore = DispatchSemaphore(value: 0)

        Task {
            do {
                RefreshTimelineStore.append(kind: .widgetBackgroundRefreshStart, details: "RefreshScheduleOperation()")
                await CloudflareDataLoader.refreshSpecialDataCache()
                RefreshTimelineStore.append(kind: .widgetBackgroundStageSpecialCacheRefreshed, details: "special_days/special_periods refreshed")
                await DayTypeCache.refreshDayTypeCache()
                RefreshTimelineStore.append(kind: .widgetBackgroundStageDayTypeRefreshed, details: "day type refreshed")
                ScheduleCacheForWidget.cacheDefaultSchedulesToAppGroup()
                RefreshTimelineStore.append(kind: .widgetBackgroundStageDefaultSchedulesCached, details: "default schedules cached (App Group)")
                await MainActor.run {
                    WidgetSyncManager.shared.syncBlockPreferencesToAppGroup()
                    RefreshTimelineStore.append(kind: .widgetBackgroundStageBlockPrefsSynced, details: "BlockPreferences synced (App Group)")
                }
                let calendar = Calendar.sja
                let referenceDate = Date.currentESTNoon
                let blocks = try await ScheduleService.loadBlocks(for: referenceDate)
                let noSchoolReason = blocks.isEmpty ? "Schedule unavailable" : nil
                let dayTypeDisplay = await DayTypeCache.predictedDayType(for: referenceDate)
                let scheduleTitle = widgetScheduleTitle(for: calendar.startOfDay(for: referenceDate))

                let events: [WidgetClassEvent] = blocks.compactMap { (block) -> WidgetClassEvent? in
                    guard let start = ScheduleTimeParser.date(from: block.start, on: referenceDate),
                          let end = ScheduleTimeParser.date(from: block.end, on: referenceDate) else {
                        return nil
                    }

                    return WidgetClassEvent(
                        blockName: block.name,
                        displayName: widgetDisplayName(for: block.name, dayTypeDisplay: dayTypeDisplay),
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
                        dayTypeDisplay: dayTypeDisplay,
                        scheduleTitle: scheduleTitle
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

// MARK: - Widget payload helpers (App target)

private extension RefreshScheduleOperation {
    var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: "group.danielzhang.Hilltoppers2")
    }

    struct BlockPreferenceMinimal: Codable {
        var name: String = ""
        var alternating: Bool = false
        var nameGreen: String = ""
        var nameWhite: String = ""
        var freeGreen: Bool = false
        var freeWhite: Bool = false
        var free: Bool = false
    }

    func widgetDisplayName(for blockName: String, dayTypeDisplay: String?) -> String {
        guard let def = appGroupDefaults,
              let data = def.data(forKey: "BlockPreferences"),
              let prefs = try? JSONDecoder().decode([String: BlockPreferenceMinimal].self, from: data),
              let key = widgetBlockKey(from: blockName),
              let pref = prefs[key] else {
            return blockName
        }

        let lower = (dayTypeDisplay ?? "").lowercased()
        let isGreenDay = lower.contains("green") && !lower.contains("white")
        if pref.alternating {
            let isFree = isGreenDay ? pref.freeGreen : pref.freeWhite
            if isFree { return "Free Block" }
            let custom = isGreenDay ? pref.nameGreen : pref.nameWhite
            return custom.isEmpty ? blockName : custom
        }

        if pref.free { return "Free Block" }
        return pref.name.isEmpty ? blockName : pref.name
    }

    func widgetBlockKey(from blockName: String) -> String? {
        let n = blockName.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if n.hasPrefix("a") && n.contains("block") { return "A" }
        if n.hasPrefix("b") && n.contains("block") { return "B" }
        if n.hasPrefix("c") && n.contains("block") { return "C" }
        if n.hasPrefix("d") && n.contains("block") { return "D" }
        if n.hasPrefix("e") && n.contains("block") { return "E" }
        return nil
    }

    struct SpecialDayRecord: Codable {
        let type: String?
        let details: String?
    }

    func widgetScheduleTitle(for date: Date) -> String? {
        guard let def = appGroupDefaults,
              let data = def.data(forKey: "CachedSpecialDaysData"),
              let specialDays = try? JSONDecoder().decode([String: SpecialDayRecord].self, from: data) else {
            return nil
        }

        let key = widgetDateString(from: date)
        guard let rec = specialDays[key], let type = rec.type else { return nil }
        if type == "no_school" { return nil }
        if type == "custom" {
            let d = rec.details?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (d != nil && !d!.isEmpty) ? d : "Custom Schedule"
        }
        return widgetFormatScheduleTitle(for: type)
    }

    func widgetFormatScheduleTitle(for type: String) -> String {
        if type.lowercased() == "abdec" { return "ABDEC" }
        return type.capitalized.replacingOccurrences(of: "_", with: " ")
    }

    func widgetDateString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = Date.estTimeZone
        return f.string(from: date)
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
