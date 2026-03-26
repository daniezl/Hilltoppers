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
                let noSchoolReason = blocks.isEmpty ? ScheduleService.widgetNoSchoolReasonWhenEmptyBlocks(for: referenceDate) : nil
                let dayTypeDisplay = await DayTypeCache.predictedDayType(for: referenceDate)
                let dayTypeResolution = resolveDayTypeDisplay(
                    primary: dayTypeDisplay,
                    referenceDate: referenceDate
                )
                let scheduleTitle = widgetScheduleTitle(for: calendar.startOfDay(for: referenceDate))

                let events: [WidgetClassEvent] = blocks.compactMap { (block) -> WidgetClassEvent? in
                    guard let start = ScheduleTimeParser.date(from: block.start, on: referenceDate),
                          let end = ScheduleTimeParser.date(from: block.end, on: referenceDate) else {
                        return nil
                    }

                    return WidgetClassEvent(
                        blockName: block.name,
                        displayName: widgetDisplayName(for: block.name, dayTypeDisplay: dayTypeResolution.value),
                        startDate: start,
                        endDate: end
                    )
                }

                // Refresh widget (always)
                await MainActor.run {
                    // #region agent log
                    let first = events.first
                    DebugEedcf6Logger.log(
                        hypothesisId: "H4_displayName_computed_in_background",
                        location: "RefreshScheduleOperation.perform",
                        message: "background computed payload fields",
                        data: [
                            "dayTypeDisplay": dayTypeDisplay ?? "nil",
                            "dayTypeDisplayResolved": dayTypeResolution.value ?? "nil",
                            "usedFallbackDayType": dayTypeResolution.usedFallback ? "true" : "false",
                            "scheduleTitle": scheduleTitle ?? "nil",
                            "eventsCount": "\(events.count)",
                            "firstBlockName": first?.blockName ?? "nil",
                            "firstDisplayName": first?.displayName ?? "nil"
                        ]
                    )
                    // #endregion
                    WidgetSyncManager.shared.updateSchedule(
                        scheduleDate: calendar.startOfDay(for: referenceDate),
                        events: events,
                        noSchoolReason: noSchoolReason,
                        dayTypeDisplay: dayTypeResolution.value,
                        scheduleTitle: scheduleTitle,
                        debugContext: [
                            "dayTypeDisplayResolved": dayTypeResolution.value ?? "nil",
                            "usedFallbackDayType": dayTypeResolution.usedFallback ? "true" : "false",
                            "firstDisplayName": first?.displayName ?? "nil"
                        ]
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
        let isGreenDayKnown = lower.contains("green") != lower.contains("white")
        let isGreenDay = lower.contains("green") && !lower.contains("white")
        if pref.alternating {
            if isGreenDayKnown {
                let isFree = isGreenDay ? pref.freeGreen : pref.freeWhite
                if isFree { return "Free Block" }
                let custom = trimmedNonEmpty(isGreenDay ? pref.nameGreen : pref.nameWhite)
                return custom ?? blockName
            }

            // Day type unknown: only use deterministic values that cannot pick the wrong side.
            if pref.freeGreen && pref.freeWhite { return "Free Block" }
            let green = trimmedNonEmpty(pref.nameGreen)
            let white = trimmedNonEmpty(pref.nameWhite)
            if let green, white == nil { return green }
            if let white, green == nil { return white }
            if let green, let white, green == white { return green }
            return blockName
        }

        if pref.free { return "Free Block" }
        return trimmedNonEmpty(pref.name) ?? blockName
    }

    func resolveDayTypeDisplay(primary: String?, referenceDate: Date) -> (value: String?, usedFallback: Bool) {
        if let primary = trimmedNonEmpty(primary) {
            return (primary, false)
        }
        if let fallback = cachedDayType(for: referenceDate) {
            return (fallback, true)
        }
        return (nil, false)
    }

    func cachedDayType(for referenceDate: Date) -> String? {
        guard let def = appGroupDefaults else { return nil }
        let cal = Calendar.sja
        if let date = def.object(forKey: "LastPredictedDayDate") as? Date,
           cal.isDate(date, inSameDayAs: referenceDate),
           let type = trimmedNonEmpty(def.string(forKey: "LastPredictedDayType")) {
            return type
        }
        if let date = def.object(forKey: "LastBulletinDate") as? Date,
           cal.isDate(date, inSameDayAs: referenceDate),
           let type = trimmedNonEmpty(def.string(forKey: "LastBulletinDayType")) {
            return type
        }
        return nil
    }

    func trimmedNonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }
        return trimmed
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
