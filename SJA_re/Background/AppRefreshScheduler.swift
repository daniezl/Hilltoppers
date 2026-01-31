import BackgroundTasks
import Foundation
import WidgetKit

final class AppRefreshScheduler {
    static let shared = AppRefreshScheduler()

    private let refreshTaskIdentifier = "danielzhang.Hilltoppers.scheduleRefresh"

    private init() {}

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskIdentifier, using: nil) { task in
            self.handleRefresh(task: task as? BGAppRefreshTask)
        }
    }

    func schedule(after interval: TimeInterval = 60 * 30) {
        cancelPending()

        let request = BGAppRefreshTaskRequest(identifier: refreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: interval)

        do {
            try BGTaskScheduler.shared.submit(request)
            print("🕒 [BG-SCHEDULE] Scheduled widget and notification refresh in \(interval / 60) minutes")
        } catch {
            print("❌ [BG-SCHEDULE] Failed to submit request: \(error)")
        }
    }

    func cancelPending() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: refreshTaskIdentifier)
    }

    private func handleRefresh(task: BGAppRefreshTask?) {
        guard let task else { return }

        schedule() // schedule next run

        let operation = RefreshScheduleOperation()
        task.expirationHandler = {
            operation.cancel()
        }

        operation.completionBlock = {
            task.setTaskCompleted(success: !operation.isCancelled)
        }

        OperationQueue.main.addOperation(operation)
    }
}
