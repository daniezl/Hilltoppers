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
            await CloudflareDataLoader.refreshSpecialDataCache()
            // Calculate current EST noon (same logic as RefreshScheduleOperation)
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            let now = Date()
            let start = calendar.startOfDay(for: now)
            let referenceDate = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: start) ?? now
            
            let blocks = try await ScheduleService.loadBlocks(for: referenceDate)
            let noSchoolReason = blocks.isEmpty ? "Schedule unavailable" : nil
            let dayTypeDisplay = await DayTypeCache.predictedDayType(for: referenceDate)
            
            let events: [WidgetClassEvent] = blocks.compactMap { block in
                guard let start = parseTime(block.start, on: referenceDate),
                      let end = parseTime(block.end, on: referenceDate) else {
                    return nil
                }
                
                return WidgetClassEvent(
                    blockName: block.name,
                    displayName: block.name,
                    startDate: start,
                    endDate: end
                )
            }
            
            await MainActor.run {
                WidgetSyncManager.shared.updateSchedule(
                    scheduleDate: calendar.startOfDay(for: referenceDate),
                    events: events,
                    noSchoolReason: noSchoolReason,
                    dayTypeDisplay: dayTypeDisplay
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
