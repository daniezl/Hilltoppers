import BackgroundTasks

enum BackgroundTaskManager {
    static func registerTasks() {
        BackgroundRefreshManager.shared.register()
        AppRefreshScheduler.shared.register()
    }

    static func rescheduleAll() {
        BackgroundRefreshManager.shared.scheduleAppRefresh()
        AppRefreshScheduler.shared.schedule()
    }
}
