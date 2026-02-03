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

    func schedule() {
        cancelPending()
        
        let nextRefreshDate = calculateNextRefreshTime()
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskIdentifier)
        request.earliestBeginDate = nextRefreshDate

        do {
            try BGTaskScheduler.shared.submit(request)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
            formatter.timeZone = Date.estTimeZone
            let minutesUntil = Int(nextRefreshDate.timeIntervalSinceNow / 60)
            print("🕒 [BG-SCHEDULE] Scheduled widget and notification refresh at \(formatter.string(from: nextRefreshDate)) (in \(minutesUntil) minutes)")
        } catch {
            print("❌ [BG-SCHEDULE] Failed to submit request: \(error)")
        }
    }
    
    private func calculateNextRefreshTime() -> Date {
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        
        let now = Date()
        let nowInEST = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: now)
        let currentHour = nowInEST.hour ?? 0
        
        // School hours: 6am (6) to 4pm (16)
        let schoolStartHour = 6
        let schoolEndHour = 16
        
        if currentHour >= schoolStartHour && currentHour < schoolEndHour {
            // Within school hours: schedule for next hour (on the hour)
            let nextHour = currentHour + 1
            var components = nowInEST
            components.hour = nextHour
            components.minute = 0
            components.second = 0
            
            if let nextDate = calendar.date(from: components) {
                return nextDate
            }
        } else if currentHour >= schoolEndHour {
            // After 4pm: schedule for next day 6am
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now
            var components = calendar.dateComponents([.year, .month, .day], from: tomorrow)
            components.hour = schoolStartHour
            components.minute = 0
            components.second = 0
            
            if let nextDate = calendar.date(from: components) {
                return nextDate
            }
        } else {
            // Before 6am: schedule for today 6am (if not past) or next hour
            if currentHour < schoolStartHour {
                var components = nowInEST
                components.hour = schoolStartHour
                components.minute = 0
                components.second = 0
                
                if let nextDate = calendar.date(from: components), nextDate > now {
                    return nextDate
                }
            }
        }
        
        // Fallback: schedule for 1 hour from now
        return Date(timeIntervalSinceNow: 60 * 60)
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
