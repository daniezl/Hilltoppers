import Foundation
import BackgroundTasks
import WidgetKit

final class BackgroundRefreshManager {
    static let shared = BackgroundRefreshManager()
    private let taskIdentifier = "com.danielzhang.SJA_re.refresh"
    private let dailyRefreshIdentifier = "com.danielzhang.SJA_re.dailyRefresh"
    private init() {}

    func register() {
        // Register 6-hour refresh task
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handleAppRefresh(task: refreshTask)
        }
        
        // Register daily midnight refresh task
        BGTaskScheduler.shared.register(forTaskWithIdentifier: dailyRefreshIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handleDailyRefresh(task: refreshTask)
        }
    }

    func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60 * 6) // Roughly every 6 hours
        do {
            try BGTaskScheduler.shared.submit(request)
            print("🕒 [BG-REFRESH] Scheduled background refresh")
        } catch {
            print("❌ [BG-REFRESH] Failed to schedule background refresh: \(error)")
        }
    }

    private func handleAppRefresh(task: BGAppRefreshTask) {
        scheduleAppRefresh()

        let refreshTask = Task { () -> Bool in
            let notificationsEnabled = await MainActor.run {
                NotificationSettingsManager.shared.notificationsEnabled
            }
            guard notificationsEnabled else {
                print("🔕 [BG-REFRESH] Notifications disabled - skipping background scheduling")
                return true
            }
            return await self.performBackgroundRefresh()
        }

        task.expirationHandler = {
            print("⏰ [BG-REFRESH] Task expired - cancelling work")
            refreshTask.cancel()
        }

        Task {
            let success = (try? await refreshTask.value) ?? false
            task.setTaskCompleted(success: success && !refreshTask.isCancelled)
            print("✅ [BG-REFRESH] Completed background refresh with success=\(success)")
        }
    }

    private func performBackgroundRefresh() async -> Bool {
        let results = await NotificationManager.shared.scheduleUpcomingSchoolDays(
            startingFrom: Date.currentEST,
            dayTypeProvider: { date in
                await DayTypeCache.predictedDayType(for: date)
            }
        )

        return !results.isEmpty && results.allSatisfy { $0.success }
    }
    
    // MARK: - Daily Midnight Refresh
    
    func scheduleDailyRefresh() {
        let nextMidnight = calculateNextMidnightEST()
        let request = BGAppRefreshTaskRequest(identifier: dailyRefreshIdentifier)
        request.earliestBeginDate = nextMidnight
        
        do {
            try BGTaskScheduler.shared.submit(request)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            formatter.timeZone = Date.estTimeZone
            print("🕛 [DAILY-REFRESH] Scheduled daily refresh at midnight EST: \(formatter.string(from: nextMidnight))")
        } catch {
            print("❌ [DAILY-REFRESH] Failed to schedule daily refresh: \(error)")
        }
    }
    
    private func calculateNextMidnightEST() -> Date {
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        
        let now = Date()
        let todayInEST = calendar.startOfDay(for: now)
        
        // Get tomorrow's midnight in EST
        guard let tomorrowMidnight = calendar.date(byAdding: .day, value: 1, to: todayInEST) else {
            // Fallback: schedule for 1 hour from now if calculation fails
            return Date(timeIntervalSinceNow: 60 * 60)
        }
        
        return tomorrowMidnight
    }
    
    private func handleDailyRefresh(task: BGAppRefreshTask) {
        // Schedule next midnight refresh
        scheduleDailyRefresh()
        
        let refreshTask = Task { () -> Bool in
            // Refresh notifications
            let notificationsEnabled = await MainActor.run {
                NotificationSettingsManager.shared.notificationsEnabled
            }
            var notificationSuccess = true
            if notificationsEnabled {
                notificationSuccess = await self.performBackgroundRefresh()
            } else {
                print("🔕 [DAILY-REFRESH] Notifications disabled - skipping notification scheduling")
            }
            
            // Always refresh widget at midnight
            let widgetSuccess = await self.performWidgetRefresh()
            
            return notificationSuccess && widgetSuccess
        }
        
        task.expirationHandler = {
            print("⏰ [DAILY-REFRESH] Task expired - cancelling work")
            refreshTask.cancel()
        }
        
        Task {
            let success = (try? await refreshTask.value) ?? false
            task.setTaskCompleted(success: success && !refreshTask.isCancelled)
            print("✅ [DAILY-REFRESH] Completed daily refresh at midnight with success=\(success)")
        }
    }
    
    private func performWidgetRefresh() async -> Bool {
        do {
            RefreshTimelineStore.append(kind: .widgetDailyRefreshStart, details: "BackgroundRefreshManager.performWidgetRefresh()")
            await CloudflareDataLoader.refreshSpecialDataCache()
            RefreshTimelineStore.append(kind: .widgetDailyStageSpecialCacheRefreshed, details: "special_days/special_periods refreshed")
            await DayTypeCache.refreshDayTypeCache()
            RefreshTimelineStore.append(kind: .widgetDailyStageDayTypeRefreshed, details: "day type refreshed")
            ScheduleCacheForWidget.cacheDefaultSchedulesToAppGroup()
            RefreshTimelineStore.append(kind: .widgetDailyStageDefaultSchedulesCached, details: "default schedules cached (App Group)")
            await MainActor.run {
                WidgetSyncManager.shared.syncBlockPreferencesToAppGroup()
                RefreshTimelineStore.append(kind: .widgetDailyStageBlockPrefsSynced, details: "BlockPreferences synced (App Group)")
            }
            // Calculate current EST noon (same logic as RefreshScheduleOperation)
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            let now = Date()
            let start = calendar.startOfDay(for: now)
            let referenceDate = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: start) ?? now
            
            let blocks = try await ScheduleService.loadBlocks(for: referenceDate)
            let noSchoolReason = blocks.isEmpty ? ScheduleService.widgetNoSchoolReasonWhenEmptyBlocks(for: referenceDate) : nil
            let dayTypeDisplay = await DayTypeCache.predictedDayType(for: referenceDate)
            let dayTypeResolution = resolveDayTypeDisplay(
                primary: dayTypeDisplay,
                referenceDate: referenceDate
            )
            let scheduleTitle = widgetScheduleTitle(for: calendar.startOfDay(for: referenceDate))
            
            let events: [WidgetClassEvent] = blocks.compactMap { (block) -> WidgetClassEvent? in
                guard let start = parseTime(block.start, on: referenceDate),
                      let end = parseTime(block.end, on: referenceDate) else {
                    return nil
                }
                
                return WidgetClassEvent(
                    blockName: block.name,
                    displayName: widgetDisplayName(for: block.name, dayTypeDisplay: dayTypeResolution.value),
                    startDate: start,
                    endDate: end
                )
            }
            
            await MainActor.run {
                // #region agent log
                let first = events.first
                DebugEedcf6Logger.log(
                    hypothesisId: "H4_displayName_computed_in_background",
                    location: "BackgroundRefreshManager.performWidgetRefresh",
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
            
            print("✅ [DAILY-REFRESH] Widget refreshed successfully")
            return true
        } catch {
            print("❌ [DAILY-REFRESH] Widget refresh failed: \(error)")
            return false
        }
    }

    // MARK: - Widget payload helpers (App target)

    private var appGroupDefaults: UserDefaults? {
        UserDefaults(suiteName: "group.danielzhang.Hilltoppers2")
    }

    private struct BlockPreferenceMinimal: Codable {
        var name: String = ""
        var alternating: Bool = false
        var nameGreen: String = ""
        var nameWhite: String = ""
        var freeGreen: Bool = false
        var freeWhite: Bool = false
        var free: Bool = false
    }

    private func widgetDisplayName(for blockName: String, dayTypeDisplay: String?) -> String {
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

    private func resolveDayTypeDisplay(primary: String?, referenceDate: Date) -> (value: String?, usedFallback: Bool) {
        if let primary = trimmedNonEmpty(primary) {
            return (primary, false)
        }
        if let fallback = cachedDayType(for: referenceDate) {
            return (fallback, true)
        }
        return (nil, false)
    }

    private func cachedDayType(for referenceDate: Date) -> String? {
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

    private func trimmedNonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private func widgetBlockKey(from blockName: String) -> String? {
        let n = blockName.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if n.hasPrefix("a") && n.contains("block") { return "A" }
        if n.hasPrefix("b") && n.contains("block") { return "B" }
        if n.hasPrefix("c") && n.contains("block") { return "C" }
        if n.hasPrefix("d") && n.contains("block") { return "D" }
        if n.hasPrefix("e") && n.contains("block") { return "E" }
        return nil
    }

    private struct SpecialDayRecord: Codable {
        let type: String?
        let details: String?
    }

    private func widgetScheduleTitle(for date: Date) -> String? {
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

    private func widgetFormatScheduleTitle(for type: String) -> String {
        if type.lowercased() == "abdec" { return "ABDEC" }
        return type.capitalized.replacingOccurrences(of: "_", with: " ")
    }

    private func widgetDateString(from date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = Date.estTimeZone
        return f.string(from: date)
    }
    
    private func parseTime(_ timeString: String, on base: Date) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = Date.estTimeZone
        guard let parsed = formatter.date(from: timeString) else { return nil }
        
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let components = calendar.dateComponents([.year, .month, .day], from: base)
        return calendar.date(bySettingHour: calendar.component(.hour, from: parsed),
                             minute: calendar.component(.minute, from: parsed),
                             second: 0,
                             of: calendar.date(from: components) ?? base)
    }
}
