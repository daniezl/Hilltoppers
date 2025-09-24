import Foundation
import BackgroundTasks

final class BackgroundRefreshManager {
    static let shared = BackgroundRefreshManager()
    private let taskIdentifier = "com.danielzhang.SJA_re.refresh"
    private init() {}

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handleAppRefresh(task: refreshTask)
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
}
