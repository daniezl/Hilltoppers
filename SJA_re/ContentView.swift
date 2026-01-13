//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup
import UserNotifications
import UIKit
import FirebaseAnalytics
import FirebaseFirestore
import FirebaseAuth

// MARK: - EST Timezone Extension
extension Date {
    static var currentEST: Date {
        // Always return the current time, but the app will format/interpret it as EST
        return Date()
    }
    
    static var estTimeZone: TimeZone {
        return TimeZone(identifier: "America/New_York")!
    }
}

struct NotificationScheduleSummary {
    let date: Date
    let success: Bool
    let scheduledCount: Int
}

class NotificationManager: ObservableObject {
    static let shared = NotificationManager()
    
    private init() {}
    
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                // print("✅ Notification permission granted")
            } else {
                // print("❌ Notification permission denied")
            }
        }
    }
    
    func scheduleBlockEndingNotifications(for blocks: [Block], testDate: Date?, dayType: String = "", clearExisting: Bool = true) {
        let center = UNUserNotificationCenter.current()
        
        if clearExisting {
            // Remove existing notifications before scheduling new ones
            center.removeAllPendingNotificationRequests()
        }
        
        // Check if notifications are enabled
        let notificationSettings = NotificationSettingsManager.shared
        guard notificationSettings.notificationsEnabled else {
            // print("🔔 [NOTIFICATIONS] Notifications are disabled - not scheduling any")
            return
        }
        
        let currentDate = testDate ?? Date.currentEST
        let scheduleFormatter = DateFormatter()
        scheduleFormatter.dateFormat = "MM/dd, HH:mm"
        scheduleFormatter.timeZone = Date.estTimeZone
        
        // Get user's preferred notification timing
        let minutesBeforeEnd = notificationSettings.notificationMinutes
        let secondsBeforeEnd = TimeInterval(minutesBeforeEnd * 60)
        
        // print("🔔 [NOTIFICATIONS] Scheduling notifications for \(blocks.count) blocks:")
        // print("🔔 [NOTIFICATIONS] User setting: \(minutesBeforeEnd) minute(s) before block ends")
        // print("🔔 [NOTIFICATIONS] User's lunch period: \(notificationSettings.selectedLunchPeriod)")
        
        // Create array to store all notifications for sorting
        struct NotificationEvent {
            let time: Date
            let title: String
            let body: String
            let identifier: String
            let type: String // "block_ending", "lunch_starting", "lunch_ending"
        }
        
        var allNotifications: [NotificationEvent] = []
        
        for (index, block) in blocks.enumerated() {
            if let startTime = parseTime(block.start, for: currentDate),
               let endTime = parseTime(block.end, for: currentDate) {
                
                // Handle regular blocks (including lunch blocks) - skip CP if it's the last block
                if !(block.name.lowercased().contains("cp") && index == blocks.count - 1) {
                    let blockEndWarning = endTime.addingTimeInterval(-secondsBeforeEnd)
                    
                    let nextBlock = (index + 1 < blocks.count) ? blocks[index + 1] : nil
                    let nextBlockText: String
                    if let nextBlock = nextBlock {
                        // Check if the next block should be shown based on day type and settings
                        let lower = dayType.lowercased()
                        let isGreenDay = dayType.isEmpty ? true : (lower.contains("green day") && !lower.contains("white"))
                        let shouldShow = BlockSettingsManager.shared.shouldShow(block: nextBlock.name, onGreenDay: isGreenDay)
                        
                        
                        if shouldShow {
                            nextBlockText = BlockSettingsManager.shared.getDisplayName(for: nextBlock.name, isGreenDay: isGreenDay)
                        } else {
                            nextBlockText = "Free Block"
                        }
                    } else {
                        nextBlockText = "End of schedule"
                    }
                    let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                    let blockTitle = "\(block.name) ending in \(minutesBeforeEnd) \(minuteText)"
                    let blockBody = "Up next: \(nextBlockText)"
                    
                    
                    if blockEndWarning > Date.currentEST {
                        allNotifications.append(NotificationEvent(
                            time: blockEndWarning,
                            title: blockTitle,
                            body: blockBody,
                            identifier: "block-\(block.id)",
                            type: "block_ending"
                        ))
                        
                        // For 5th lunch users, remove their lunch start notification when lunch block ends
                        if notificationSettings.selectedLunchPeriod == 5 {
                            if let subBlocks = block.subBlocks {
                                for subBlock in subBlocks {
                                    if subBlock.name.lowercased().contains("lunch") && subBlock.name.contains("\(notificationSettings.selectedLunchPeriod)") {
                                        allNotifications.append(NotificationEvent(
                                            time: blockEndWarning,
                                            title: "",
                                            body: "",
                                            identifier: "remove-5th-lunch-\(subBlock.id)",
                                            type: "remove_notification"
                                        ))
                                    }
                                }
                            }
                        }
                        
                        // Schedule notification to remove this notification when next block starts
                        if let nextBlock = nextBlock, let nextStartTime = parseTime(nextBlock.start, for: currentDate), nextStartTime > Date.currentEST {
                            allNotifications.append(NotificationEvent(
                                time: nextStartTime,
                                title: "", // Empty title to make it invisible
                                body: "",   // Empty body to make it invisible
                                identifier: "remove-\(block.id)",
                                type: "remove_notification"
                            ))
                        }
                    }
                }
                
                // Process sub-blocks (lunch periods)
                if let subBlocks = block.subBlocks {
                    for subBlock in subBlocks {
                        if let subStartTime = parseTime(subBlock.start, for: currentDate),
                           let subEndTime = parseTime(subBlock.end, for: currentDate) {
                            
                            // Handle lunch sub-blocks - ONLY for user's selected lunch period
                            if subBlock.name.lowercased().contains("lunch") && subBlock.name.contains("\(notificationSettings.selectedLunchPeriod)") {
                                
                                // Add lunch starting notification (skip for 1st lunch)
                                if notificationSettings.selectedLunchPeriod != 1 {
                                    let lunchStartWarning = subStartTime.addingTimeInterval(-secondsBeforeEnd)
                                    let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                                    let startTitle = "\(subBlock.name) starting in \(minutesBeforeEnd) \(minuteText)"
                                    let startBody = "Time to head to lunch!"
                                    if lunchStartWarning > Date.currentEST {
                                        allNotifications.append(NotificationEvent(
                                            time: lunchStartWarning,
                                            title: startTitle,
                                            body: startBody,
                                            identifier: "lunch-start-\(subBlock.id)",
                                            type: "lunch_starting"
                                        ))
                                    }
                                }
                                
                                // Add lunch ending notification (skip for 5th lunch)
                                if notificationSettings.selectedLunchPeriod != 5 {
                                    let lunchEndWarning = subEndTime.addingTimeInterval(-secondsBeforeEnd)
                                    let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                                    let endTitle = "\(subBlock.name) ending in \(minutesBeforeEnd) \(minuteText)"
                                    let endBody = "Time to head back to class!"
                                    if lunchEndWarning > Date.currentEST {
                                        allNotifications.append(NotificationEvent(
                                            time: lunchEndWarning,
                                            title: endTitle,
                                            body: endBody,
                                            identifier: "lunch-end-\(subBlock.id)",
                                            type: "lunch_ending"
                                        ))
                                        
                                        // Remove lunch start notification when lunch end notification is sent
                                        allNotifications.append(NotificationEvent(
                                            time: lunchEndWarning,
                                            title: "",
                                            body: "",
                                            identifier: "remove-lunch-start-\(subBlock.id)",
                                            type: "remove_notification"
                                        ))
                                        
                                        // Remove lunch end notification 10 minutes after it's sent
                                        let tenMinutesLater = lunchEndWarning.addingTimeInterval(10 * 60) // 10 minutes = 600 seconds
                                        if tenMinutesLater > Date.currentEST {
                                            allNotifications.append(NotificationEvent(
                                                time: tenMinutesLater,
                                                title: "",
                                                body: "",
                                                identifier: "remove-lunch-end-\(subBlock.id)",
                                                type: "remove_notification"
                                            ))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Sort notifications chronologically
        allNotifications.sort { $0.time < $1.time }
        
        // print("🔔 [NOTIFICATIONS] Found \(allNotifications.count) notifications to schedule in chronological order:")
        
        // Schedule all notifications
        for notification in allNotifications {
            let scheduledTime = scheduleFormatter.string(from: notification.time)
            let titleDescription = notification.title.isEmpty ? "—" : notification.title
            let messageDescription = notification.body.isEmpty ? "—" : notification.body
            let logIcon = notification.type == "remove_notification" ? "❌" : "✅"

            let request: UNNotificationRequest

            if notification.type == "remove_notification" {
                // For removal notifications, schedule a silent notification that will trigger removal
                let content = UNMutableNotificationContent()
                content.title = "" // Empty to make it silent
                content.body = ""   // Empty to make it silent
                content.sound = nil
                content.userInfo = ["type": "remove_notification", "target": notification.identifier.replacingOccurrences(of: "remove-", with: "block-")]

                let trigger = UNTimeIntervalNotificationTrigger(
                    timeInterval: notification.time.timeIntervalSinceNow,
                    repeats: false
                )

                request = UNNotificationRequest(
                    identifier: notification.identifier,
                    content: content,
                    trigger: trigger
                )
            } else {
                // Regular notification
                let content = UNMutableNotificationContent()
                content.title = notification.title
                content.body = notification.body
                content.sound = .default

                let trigger = UNTimeIntervalNotificationTrigger(
                    timeInterval: notification.time.timeIntervalSinceNow,
                    repeats: false
                )

                request = UNNotificationRequest(
                    identifier: notification.identifier,
                    content: content,
                    trigger: trigger
                )
            }

            // print("\(logIcon) time: \(scheduledTime)")
            if notification.type != "remove_notification" {
                // print("title: \(titleDescription)")
                // print("message: \(messageDescription)")
            }

            center.add(request) { error in
                if let error = error {
                    // print("❌ Failed to schedule notification \(notification.identifier): \(error)")
                }
            }
        }
        
    }
    
    func scheduleNotifications(for date: Date, dayType: String = "", clearExisting: Bool = true) async -> NotificationScheduleSummary {
        do {
            let blocks = try await ScheduleService.loadBlocks(for: date)
            return await scheduleNotifications(blocks: blocks, on: date, dayType: dayType, clearExisting: clearExisting)
        } catch {
            // print("❌ Failed to determine schedule for notifications on \(date): \(error)")
            return NotificationScheduleSummary(date: date, success: false, scheduledCount: 0)
        }
    }

    func scheduleNotifications(blocks: [Block], on date: Date, dayType: String = "", clearExisting: Bool = true) async -> NotificationScheduleSummary {
        let useDayType = dayType.isEmpty ? "Green Day" : dayType
        // print("🔔 [DAY-TYPE] Preparing notifications for \(date) with day type '\(useDayType)' and \(blocks.count) blocks")

        guard !blocks.isEmpty else {
            // print("🔔 [DAY-TYPE] No blocks available for \(date) - nothing to schedule")
            return NotificationScheduleSummary(date: date, success: true, scheduledCount: 0)
        }

        await MainActor.run {
            self.scheduleBlockEndingNotifications(for: blocks, testDate: date, dayType: useDayType, clearExisting: clearExisting)
        }
        return NotificationScheduleSummary(date: date, success: true, scheduledCount: blocks.count)
    }

    func scheduleUpcomingSchoolDays(
        startingFrom startDate: Date,
        maxCount: Int = 2,
        dayTypeProvider: @escaping (Date) async -> String?
    ) async -> [NotificationScheduleSummary] {
        var results: [NotificationScheduleSummary] = []
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        var date = startDate
        var attempts = 0
        let maxAttempts = 7

        while results.count < maxCount && attempts < maxAttempts {
            attempts += 1

            do {
                let blocks = try await ScheduleService.loadBlocks(for: date)
                if blocks.isEmpty {
                    // print("🗓️ [NOTIFICATIONS] No blocks for \(date) - moving to next day")
                } else {
                    let dayType = await dayTypeProvider(date) ?? ""
                    let summary = await scheduleNotifications(
                        blocks: blocks,
                        on: date,
                        dayType: dayType,
                        clearExisting: results.isEmpty
                    )
                    results.append(summary)
                }
            } catch {
                // print("❌ [NOTIFICATIONS] Failed to load schedule for \(date): \(error)")
                break
            }

            guard let nextDate = calendar.date(byAdding: .day, value: 1, to: date) else {
                break
            }
            date = nextDate
        }

        if results.isEmpty {
            await MainActor.run {
                UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            }
            // print("🔕 [NOTIFICATIONS] Cleared pending notifications - no upcoming school days to schedule")
        }

        return results
    }

    
    private func parseTime(_ timeString: String, for date: Date) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm" // 24-hour format like "08:15" or "13:30"
        formatter.timeZone = Date.estTimeZone
        
        if let time = formatter.date(from: timeString) {
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            let dateComponents = calendar.dateComponents([.year, .month, .day], from: date)
            let timeComponents = calendar.dateComponents([.hour, .minute], from: time)
            
            var combinedComponents = DateComponents()
            combinedComponents.year = dateComponents.year
            combinedComponents.month = dateComponents.month
            combinedComponents.day = dateComponents.day
            combinedComponents.hour = timeComponents.hour
            combinedComponents.minute = timeComponents.minute
            
            return calendar.date(from: combinedComponents)
        }
        
        return nil
    }
}

struct ContentView: View {
    @State private var noSchool: Bool? = nil // nil = loading, true/false = determined
    @State private var firebaseError: Bool = false
    @State private var isStale: Bool = false
    @State private var refreshID = UUID()
    @State private var isLoading: Bool = true
    
    // Background refresh state
    @State private var previousDayType: String = ""
    @State private var previousScheduleBlocks: [Block] = ContentView.loadCachedBlocks()
    @State private var previousNoSchool: Bool? = false
    @State private var scheduleLoaded: Bool = false
    @State private var dayTypeLoaded: Bool = false
    @State private var dragOffset: CGFloat = 0
    @State private var isRefreshReady: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var triggerDayTypeRipple: Bool = false
    @State private var disablePullToRefreshGesture = false
    @State private var lastOpenedDate: Date? = nil // Track when app was last opened
    @State private var currentDayType: String = "Loading..." // Track current day type for block filtering
    @State private var currentDayTypeDate: Date? = nil
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    @StateObject private var notificationManager = NotificationManager.shared
    @ObservedObject private var notificationSettings = NotificationSettingsManager.shared
    @EnvironmentObject private var router: NavigationRouter
    @EnvironmentObject private var timeSettings: TimeSettingsModel
    
    // Visual centering offsets
    private let scheduleOffset: CGFloat = 60
    private let noSchoolOffset: CGFloat = -30

    @State private var currentTime = Date.currentEST // Updated by timer to make UI flow
    @State private var updatePrompt: AppUpdatePrompt? = nil
    @State private var hasLoggedAppOpenForCurrentActivation = false
    
    // Computed property that returns the effective current time (real time or test date)
    var effectiveCurrentTime: Date {
        return timeSettings.useTestDate ? timeSettings.testDateOverride : currentTime
    }
    
    // Match the old optional testDate behaviour used throughout the views
    private var tomorrowReferenceDate: Date {
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let base = Date.currentEST
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: base) ?? base
        var components = calendar.dateComponents([.year, .month, .day], from: tomorrow)
        components.hour = 23
        components.minute = 59
        components.second = 0
        return calendar.date(from: components) ?? tomorrow
    }

    private var isViewingTomorrow: Bool {
        guard timeSettings.useTestDate else { return false }
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        return calendar.isDate(timeSettings.testDateOverride, inSameDayAs: tomorrowReferenceDate)
    }

    private var tomorrowButtonTitle: String {
        isViewingTomorrow ? "Back to Today" : "View Tomorrow"
    }

    private var tomorrowButtonSubtitle: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        formatter.timeZone = Date.estTimeZone
        if isViewingTomorrow {
            return formatter.string(from: Date.currentEST)
        } else {
            return formatter.string(from: tomorrowReferenceDate)
        }
    }

    var testDate: Date? {
        return timeSettings.useTestDate ? timeSettings.testDateOverride : nil
    }

    @ViewBuilder
    private var backgroundView: some View {
        if isViewingTomorrow {
            RoundedRectangle(cornerRadius: 0)
                .fill(Color.white)
                .ignoresSafeArea()
        } else {
            Color.white.ignoresSafeArea()
        }
    }

    private func beginScheduleReset() {
        isLoading = true
        scheduleLoaded = false
        dayTypeLoaded = false
        scheduleLoader.showBlocks = false
        triggerDayTypeRipple = false
    }

    @discardableResult
    private func enforceTodayDefaultIfNeeded() -> Bool {
        let now = Date.currentEST
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone

        var stateChanged = false
        var resetPrepared = false

        func prepareIfNeeded() {
            if !resetPrepared {
                beginScheduleReset()
                resetPrepared = true
            }
        }

        if timeSettings.useTestDate {
            prepareIfNeeded()
            timeSettings.useTestDate = false
            stateChanged = true
        }

        if !calendar.isDate(timeSettings.testDateOverride, inSameDayAs: now) {
            prepareIfNeeded()
            timeSettings.testDateOverride = now
            stateChanged = true
        }

        return stateChanged
    }

    var body: some View {
        ZStack {
            // Main content - always present
            VStack {
                Spacer()
                VStack(spacing: 24) { // padding between day type box and the schedule
                    // Only show content when noSchool state is determined
                    if let isNoSchool = noSchool {
                         // Only show DayTypeView when there is school
                        if !isNoSchool {
                                                     DayTypeView(testDate: testDate, isViewingTomorrow: isViewingTomorrow, firebaseError: $firebaseError, onLoadingComplete: { 
                             // print("🎯 [CONTENT] DayTypeView loading completed")
                             dayTypeLoaded = true 
                         }, triggerRipple: $triggerDayTypeRipple, showSplashScreen: .constant(false), currentDayType: $currentDayType, currentDayTypeDate: $currentDayTypeDate)
                         .padding(.top, isViewingTomorrow ? 8 : 0)
                             .id(refreshID)
                     }
                     
                     ScheduleView(testDate: testDate, noSchool: Binding(
                         get: { isNoSchool },
                         set: { noSchool = $0 }
                     ), isStale: $isStale, loader: scheduleLoader, onLoadingComplete: { 
                         // print("📋 [CONTENT] ScheduleView loading completed")
                         scheduleLoaded = true 
                     }, onPullRefresh: {
                             Task {
                                 await refreshAll()
                             }
                         }, showSplashScreen: .constant(false), disablePullToRefreshGesture: $disablePullToRefreshGesture, currentDayType: currentDayType, currentDayTypeDate: currentDayTypeDate)
                             .id(refreshID)
                             .onAppear {
                                 // Reset animation state when view appears
                                 scheduleLoader.showBlocks = false
                             }
                    }
                }
                .offset(y: scheduleOffset)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(isLoading ? 0.0 : 1.0)
            .animation(.easeOut(duration: 0.3).delay(isLoading ? 0 : 0.1), value: isLoading)
                
            // Skeleton loading overlay to mimic final layout
            if isLoading {
                SkeletonLoadingView(
                    scheduleOffset: scheduleOffset,
                    blockCount: previousScheduleBlocks.isEmpty ? 3 : min(previousScheduleBlocks.count, 5)
                )
                    .transition(.opacity)
                    .zIndex(1000)
            }
            
            // Pull-to-refresh indicator - circular design
            if dragOffset > 0 {
                VStack {
                    ZStack {
                        // Circular background
                        Circle()
                            .fill(Color.white.opacity(0.9))
                            .frame(width: 50, height: 50)
                        
                        // Arrow icon
                        Image(systemName: isRefreshReady ? "arrow.clockwise" : "arrow.down")
                            .font(.title2)
                            .foregroundColor(isRefreshReady ? .green : .gray)
                            .rotationEffect(.degrees(isRefreshReady ? 360 : 0))
                            .animation(.easeInOut(duration: 0.3), value: isRefreshReady)
                    }
                    .opacity(min(dragOffset / 60, 1.0))
                    .offset(y: min(dragOffset - 60, 0))
                    Spacer()
                }
                .allowsHitTesting(false)
                .zIndex(1000)
            }
            
            // Full-screen loading overlay during refresh
            if isRefreshing {
                Color.white
                    .ignoresSafeArea(.all)
                    .overlay(
                        ProgressView()
                            .scaleEffect(1.5)
                    )
                    .zIndex(1000)
            }
            
            // Settings button - top right
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    Button {
                        router.push(.settings)
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.title2)
                            .foregroundColor(.gray.opacity(0.7))
                            .padding()
                    }
                    .buttonStyle(.plain)
                }

                if isViewingTomorrow {
                    HStack {
                        Text("Tomorrow:")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.gray.opacity(1))
                            .padding(.leading, UIScreen.main.bounds.width * 0.28)
                        Spacer()
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
                Spacer()
            }
            .zIndex(500)
            
            if !isLoading {
                VStack {
                    Spacer()
                    HStack(alignment: .bottom) {
                        if isViewingTomorrow {
                            Button(action: toggleTomorrowView) {
                                Image(systemName: "chevron.backward")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.primary)
                                    .padding(.vertical, 12)
                                    .padding(.horizontal, 16)
                                    .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                                    .cornerRadius(18)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .padding(.leading, 38)
                        }

                        Spacer()

                        if !isViewingTomorrow {
                            Button(action: toggleTomorrowView) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(tomorrowButtonTitle)
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    Text(tomorrowButtonSubtitle)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.vertical, 12)
                                .padding(.horizontal, 18)
                                .frame(width: 160, alignment: .leading)
                                .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                                .cornerRadius(18)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .padding(.trailing, 32)
                        }
                    }
                    .padding(.bottom, 32)
                }
                .zIndex(500)
            } else {
                VStack {
                    Spacer()
                    SkeletonTomorrowButtonsOverlay(isViewingTomorrow: isViewingTomorrow)
                }
                .padding(.bottom, 32)
                .zIndex(500)
            }
        }
        .background(Color.clear)
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    // Only allow pull-to-refresh if balloon is not being dragged
                    if !disablePullToRefreshGesture && value.translation.height > 0 {
                        dragOffset = value.translation.height
                        isRefreshReady = value.translation.height > 80
                    }
                }
                .onEnded { value in
                    // Only allow pull-to-refresh if balloon is not being dragged
                    if !disablePullToRefreshGesture && value.translation.height > 80 {
                        // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Loading started (pull-to-refresh)")
                        isRefreshing = true
                        Task {
                            await refreshAll()
                            // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Pull-to-refresh completed")
                            // Don't set isRefreshing = false here, let updateLoadingState handle it
                        }
                    }
                    
                    // Reset drag state
                    withAnimation(.easeOut(duration: 0.3)) {
                        dragOffset = 0
                        isRefreshReady = false
                    }
                }
        )
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                logAppOpenIfNeeded()
                Task {
                    await performUpdateCheck()
                }

                let resetToToday = enforceTodayDefaultIfNeeded()
                let timestamp = String(format: "%.3f", Date().timeIntervalSince1970)
                // print("[\(timestamp)] App became active")

                // Check if this is first active of the day
                var calendar = Calendar.current
                calendar.timeZone = Date.estTimeZone
                let today = calendar.startOfDay(for: Date.currentEST)
                let isFirstActiveOfDay = lastOpenedDate == nil || !calendar.isDate(lastOpenedDate!, inSameDayAs: today)

                if isFirstActiveOfDay {
                    // print("🌅 [FIRST ACTIVE] First active of the day - showing loading screen")
                    isLoading = true
                    lastOpenedDate = Date.currentEST

                    Task {
                        await refreshAll()
                    }
                } else {
                    if resetToToday {
                        // print("🕒 [RESET] Returning to today's schedule after background - refreshing")
                        Task {
                            await refreshAll()
                        }
                    } else {
                        // print("📱 [BACKGROUND REFRESH] Not first active - background refresh only")

                        // Reschedule notifications for upcoming days with fresh data
                        scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)

                        // Background refresh without loading screen
                        Task {
                            await backgroundRefresh()
                        }
                    }
                }
            } else if newPhase == .background || newPhase == .inactive {
                hasLoggedAppOpenForCurrentActivation = false
            }
        }
        .onChange(of: scheduleLoaded) { _ in
            updateLoadingState()
        }
        .onChange(of: dayTypeLoaded) { _ in
            updateLoadingState()
        }
        .onChange(of: timeSettings.useTestDate) { isUsingTestDate in
            let modeDescription = isUsingTestDate ? "test date" : "real time"
            // print("🕒 [TIME-MODE] Switched to \(modeDescription) - rescheduling notifications")
            Task {
                await refreshAll()
            }
            scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
        }
        .onChange(of: timeSettings.testDateOverride) { newDate in
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            formatter.timeZone = Date.estTimeZone
            // print("🕒 [TEST-DATE] Updated to \(formatter.string(from: newDate)) - rescheduling notifications")
            Task {
                await refreshAll()
            }
            scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
        }
        .onChange(of: notificationSettings.notificationsEnabled) { _ in
            // Reschedule notifications when enabled/disabled changes
            // print("🔔 [NOTIFICATION-ENABLED] Notification enabled changed - rescheduling notifications")
            if notificationSettings.notificationsEnabled {
                scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
            } else {
                UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            }
        }
        .onChange(of: notificationSettings.notificationMinutes) { _ in
            // Reschedule notifications when timing changes
            // print("🔔 [NOTIFICATION-MINUTES] Notification minutes changed - rescheduling notifications")
            scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
        }
        .onChange(of: notificationSettings.selectedLunchPeriod) { _ in
            // Reschedule notifications when lunch period changes
            // print("🔔 [LUNCH-PERIOD] Lunch period changed - rescheduling notifications")
            scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("BlockSettingsChanged"))) { _ in
            // Reschedule notifications when block settings change
            // print("🔔 [BLOCK-SETTINGS] Block settings changed - rescheduling notifications")
            scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
        }
        .onChange(of: currentDayType) { newDayType in
            // Schedule notifications when day type becomes available
            if newDayType != "Loading..." && !scheduleLoader.blocks.isEmpty && noSchool != true {
                // print("🔔 [DAY-TYPE-CHANGE] Day type updated to: '\(newDayType)' - scheduling notifications")
                scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
            }
        }
        .onAppear {
            isLoading = true
            enforceTodayDefaultIfNeeded()
            // Reset to actual time on app startup
            // print("🔄 [APP-STARTUP] Using \(timeSettings.useTestDate ? "test date" : "real time") mode")

            // Start timer to update time continuously
            Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                currentTime = Date.currentEST
            }
            
            // Don't request notification permission on startup - only when user enables notifications
            
            // Don't schedule notifications here - wait for proper loading in updateLoadingState()
            
            // Check if this is first open of the day
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            let today = calendar.startOfDay(for: Date.currentEST)
            let isFirstOpenOfDay = lastOpenedDate == nil || !calendar.isDate(lastOpenedDate!, inSameDayAs: today)
            
            if isFirstOpenOfDay {
                // print("🌅 [FIRST OPEN] First open of the day - showing loading screen")
                isLoading = true
                lastOpenedDate = Date.currentEST
            } else {
                // print("📱 [SUBSEQUENT OPEN] Not first open of day - no loading screen needed")
                isLoading = false
            }
            
            // Initialize/refresh data
            Task {
                await refreshAll()
            }

            Task {
                await performUpdateCheck()
            }

            logAppOpenIfNeeded()
        }
        .preferredColorScheme(.light)
        .background(backgroundView)
        .alert(item: $updatePrompt) { prompt in
            switch prompt.importance {
            case .required:
                return Alert(
                    title: Text(prompt.title),
                    message: nil,
                    dismissButton: .default(Text("Update")) {
                        openUpdateURL(prompt.updateURL)
                    }
                )
            case .recommended:
                return Alert(
                    title: Text(prompt.title),
                    message: Text(prompt.message),
                    primaryButton: .default(Text("Update")) {
                        openUpdateURL(prompt.updateURL)
                    },
                    secondaryButton: .cancel(Text("Later"))
                )
            }
        }
        .disabled(updatePrompt?.importance == .required)
        .overlay {
            if updatePrompt?.importance == .required {
                Color.black.opacity(0.25).ignoresSafeArea()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
    
    @MainActor
    private func performUpdateCheck() async {
        guard let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
              !currentVersion.isEmpty else {
            return
        }

        updatePrompt = await AppUpdateManager.shared.checkForUpdate(currentVersion: currentVersion)
    }

    private func openUpdateURL(_ url: URL?) {
        guard let url else { return }
        UIApplication.shared.open(url)
    }
    
    private func logAppOpenIfNeeded() {
        guard !hasLoggedAppOpenForCurrentActivation else { return }
        hasLoggedAppOpenForCurrentActivation = true
        Analytics.logEvent(AnalyticsEventAppOpen, parameters: nil)
    }

    private static let cachedBlocksKey = "LastScheduleBlocks"

    private static func loadCachedBlocks() -> [Block] {
        guard let data = UserDefaults.standard.data(forKey: cachedBlocksKey) else { return [] }
        return (try? JSONDecoder().decode([Block].self, from: data)) ?? []
    }

    private static func saveCachedBlocks(_ blocks: [Block]) {
        guard let data = try? JSONEncoder().encode(blocks) else { return }
        UserDefaults.standard.set(data, forKey: cachedBlocksKey)
    }
    
    // Update loading state when both views are loaded
    private func updateLoadingState() {
        // On no_school days, only scheduleLoaded matters since DayTypeView is hidden
        let shouldFinishLoading = (noSchool == true) ? scheduleLoaded : (scheduleLoaded && dayTypeLoaded)
        
        // print("🔄 [CONTENT] updateLoadingState - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool ?? false), shouldFinish: \(shouldFinishLoading)")
        
        if shouldFinishLoading {
            // print("🎉 [CONTENT] *** ALL LOADING COMPLETED *** - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool ?? false)")
            
            // Store current state for future background comparisons
            // Note: This is simplified - you'd need to get the actual dayType from DayTypeView
            previousScheduleBlocks = scheduleLoader.blocks
            ContentView.saveCachedBlocks(scheduleLoader.blocks)
            previousNoSchool = noSchool
            // previousDayType would need to be set from the actual DayTypeView data
            
            isLoading = false
            isRefreshing = false // Also hide the refresh spinner when content is ready
            
            // print("🚀 [CONTENT] Setting isLoading = false, will trigger schedule animations")
            
            // Schedule notifications for blocks if there's school and day type is ready
            if noSchool != true && !scheduleLoader.blocks.isEmpty && currentDayType != "Loading..." {
                // print("📱 [NOTIFICATIONS] Scheduling notifications for \(scheduleLoader.blocks.count) blocks")
                // print("📱 [NOTIFICATIONS] Current day type: '\(currentDayType)'")
                scheduleUpcomingNotifications(startingFrom: effectiveCurrentTime)
            } else if currentDayType == "Loading..." {
                // print("📱 [NOTIFICATIONS] Skipping notification scheduling - day type still loading")
            }
            
            // Trigger animations immediately when loading completes
            if noSchool != true {
                scheduleLoader.showBlocks = true
                triggerDayTypeRipple = true
            } else {
                // Trigger ripple for no-school days too
                triggerDayTypeRipple = true
            }
        }
    }
    
    // Background refresh function - only updates UI if data changed
    @MainActor
    func backgroundRefresh() async {
        // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Background refresh started - checking for changes")
        
        // Store current state
        let currentDayType = previousDayType
        let currentBlocks = previousScheduleBlocks
        let currentNoSchool = previousNoSchool
        
        // Create temporary loaders to fetch new data without affecting UI
        let tempScheduleLoader = ScheduleLoader()
        var tempDayType = ""
        var tempNoSchool = false
        
        // Fetch new schedule data (similar to ScheduleView's refreshSchedule)
        do {
            let currentTime = testDate ?? Date.currentEST
            
            // Check Firebase for schedule changes
            if try await ScheduleTypeFetcher.isInSpecialPeriod(date: currentTime) {
                tempNoSchool = true
                tempScheduleLoader.blocks = []
            } else if let type = try await ScheduleTypeFetcher.fetchTypeFor(date: currentTime) {
                if type == "no_school" {
                    tempNoSchool = true
                    tempScheduleLoader.blocks = []
                } else if type == "custom" {
                    if let blocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: currentTime) {
                        tempScheduleLoader.blocks = blocks
                        tempNoSchool = false
                    }
                } else {
                    tempScheduleLoader.loadSchedule(from: type)
                    tempNoSchool = false
                }
            } else {
                // Load weekday schedule
                var calendar = Calendar.current
                calendar.timeZone = Date.estTimeZone
                let weekday = calendar.component(.weekday, from: currentTime)
                let scheduleFile: String?
                switch weekday {
                case 2, 3, 5: scheduleFile = "schedule_mon_thu"
                case 4: scheduleFile = "schedule_wed"
                case 6: scheduleFile = "schedule_fri"
                default: scheduleFile = nil
                }
                if let file = scheduleFile {
                    tempScheduleLoader.loadSchedule(from: file)
                    tempNoSchool = false
                } else {
                    tempScheduleLoader.blocks = []
                    tempNoSchool = true
                }
            }
        } catch {
            // print("Background refresh error: \(error)")
            return // Don't update if there's an error
        }
        
        // Fetch new HTML data (similar to DayTypeView's fetchHTML)
        let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"
        do {
            guard let url = URL(string: schoolURL) else { return }
            let (data, _) = try await URLSession.shared.data(from: url)
            if let html = String(data: data, encoding: .utf8) {
                // Extract day type from HTML (simplified version)
                tempDayType = extractDayTypeFromHTML(html: html)
            }
        } catch {
            // print("Background HTML fetch error: \(error)")
            return // Don't update if there's an error
        }
        
        // Compare data to see if anything changed
        let scheduleChanged = !areBlocksEqual(currentBlocks, tempScheduleLoader.blocks) || currentNoSchool != tempNoSchool
        let dayTypeChanged = currentDayType != tempDayType
        
        if scheduleChanged || dayTypeChanged {
            // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Data changed - updating UI")
            // print("Schedule changed: \(scheduleChanged), DayType changed: \(dayTypeChanged)")
            
            // Show loading screen for data refresh
            isLoading = true
            
            // Update stored state
            previousDayType = tempDayType
            previousScheduleBlocks = tempScheduleLoader.blocks
            ContentView.saveCachedBlocks(tempScheduleLoader.blocks)
            previousNoSchool = tempNoSchool
            
            // Trigger UI refresh
            await refreshAll()
        } else {
            // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] No changes detected - keeping current UI")
        }
    }

    private func scheduleUpcomingNotifications(startingFrom startDate: Date? = nil) {
        let referenceDate = startDate ?? Date.currentEST
        let snapshotDayType = currentDayType
        let snapshotTime = effectiveCurrentTime
        let notificationsEnabled = NotificationSettingsManager.shared.notificationsEnabled

        guard notificationsEnabled else {
            // print("🔕 [NOTIFICATIONS] Skipping scheduling - notifications disabled")
            return
        }

        Task {
            let _ = await notificationManager.scheduleUpcomingSchoolDays(
                startingFrom: referenceDate,
                dayTypeProvider: { targetDate in
                    var calendar = Calendar.current
                    calendar.timeZone = Date.estTimeZone
                    if calendar.isDate(targetDate, inSameDayAs: snapshotTime),
                       snapshotDayType != "Loading..." {
                        return snapshotDayType
                    }
                    return await DayTypeCache.predictedDayType(for: targetDate)
                }
            )
        }
    }
    
    // Helper function to compare block arrays
    private func areBlocksEqual(_ blocks1: [Block], _ blocks2: [Block]) -> Bool {
        guard blocks1.count == blocks2.count else { return false }
        for (block1, block2) in zip(blocks1, blocks2) {
            if block1.name != block2.name || block1.start != block2.start || block1.end != block2.end {
                return false
            }
        }
        return true
    }
    
    // Helper function to extract day type from HTML (simplified)
    private func extractDayTypeFromHTML(html: String) -> String {
        // This is a simplified version - you'd need to implement the actual HTML parsing logic
        if html.lowercased().contains("green day") {
            return "Green Day"
        } else if html.lowercased().contains("white day") {
            return "White Day"
        }
        return "Unknown"
    }
    
    // Centralized refresh function
    @MainActor
    private func toggleTomorrowView() {
        if isViewingTomorrow {
            timeSettings.useTestDate = false
            timeSettings.testDateOverride = Date.currentEST
        } else {
            timeSettings.useTestDate = true
            timeSettings.testDateOverride = tomorrowReferenceDate
        }

        currentDayType = "Loading..."
        currentDayTypeDate = nil
        isLoading = true
        scheduleLoaded = false
        dayTypeLoaded = false
        scheduleLoader.showBlocks = false
        triggerDayTypeRipple = false

        Task {
            await refreshAll()
        }
    }

    func refreshAll() async {
        // Reset loading states
        // print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Loading started (refreshAll)")
        isLoading = true
        scheduleLoaded = false
        dayTypeLoaded = false
        noSchool = false
        scheduleLoader.showBlocks = false
        triggerDayTypeRipple = false
        refreshID = UUID()
    }
    
}

struct BlockSettings: Codable {
    var name: String = ""
    var showOnGreenDay: Bool = true
    var showOnWhiteDay: Bool = true
}

// Legacy BlockSettings format for migration
struct BlockSettingsLegacy: Codable {
    var name: String = ""
    var showOnGreenDay: Bool = true
    var showOnWhiteDay: Bool = true
}

class BlockSettingsManager: ObservableObject {
    static let shared = BlockSettingsManager()
    
    @Published var blockA = BlockSettings()
    @Published var blockB = BlockSettings()
    @Published var blockC = BlockSettings()
    @Published var blockD = BlockSettings()
    @Published var blockE = BlockSettings()
    
    private init() {
        loadSettings()
    }
    
    func saveSettings() {
        let settings = [
            "A": blockA,
            "B": blockB,
            "C": blockC,
            "D": blockD,
            "E": blockE
        ]
        
        if let encoded = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(encoded, forKey: "BlockSettings")
            // print("✅ Block settings saved")
            
            // Notify that block settings changed so notifications can be rescheduled
            NotificationCenter.default.post(name: Notification.Name("BlockSettingsChanged"), object: nil)
        }
    }
    
    private func loadSettings() {
        guard let data = UserDefaults.standard.data(forKey: "BlockSettings"),
              let settings = try? JSONDecoder().decode([String: BlockSettings].self, from: data) else {
            // print("📱 Using default block settings")
            return
        }
        
        blockA = settings["A"] ?? BlockSettings()
        blockB = settings["B"] ?? BlockSettings()
        blockC = settings["C"] ?? BlockSettings()
        blockD = settings["D"] ?? BlockSettings()
        blockE = settings["E"] ?? BlockSettings()
        // print("✅ Block settings loaded")
    }
    
    func getDisplayName(for blockName: String, isGreenDay: Bool? = nil) -> String {
        // Try to get from new BlockPreferencesManager first
        if let blockKey = getBlockKey(from: blockName) {
            let pref = BlockPreferencesManager.shared.getPreference(for: blockKey)
            
            if pref.alternating {
                // Use provided isGreenDay, or try to get from getCurrentDayType, or default to true
                let isGreen: Bool
                if let provided = isGreenDay {
                    isGreen = provided
                } else if let dayType = getCurrentDayType() {
                    isGreen = dayType.lowercased().contains("green")
                } else {
                    isGreen = true // Default to green if unknown
                }
                
                let isFree = isGreen ? pref.freeGreen : pref.freeWhite
                if isFree {
                    return "Free Block"
                }
                let customName = isGreen ? pref.nameGreen : pref.nameWhite
                return customName.isEmpty ? blockName : customName
            } else {
                if pref.free {
                    return "Free Block"
                }
                return pref.name.isEmpty ? blockName : pref.name
            }
        }
        
        // Fall back to old format
        let settings: BlockSettings
        switch blockName {
        case "A Block": settings = blockA
        case "B Block": settings = blockB
        case "C Block": settings = blockC
        case "D Block": settings = blockD
        case "E Block": settings = blockE
        default: return blockName
        }
        
        return settings.name.isEmpty ? blockName : settings.name
    }
    
    func shouldShow(block blockName: String, onGreenDay: Bool) -> Bool {
        // Try to get from new BlockPreferencesManager first
        if let blockKey = getBlockKey(from: blockName) {
            let pref = BlockPreferencesManager.shared.getPreference(for: blockKey)
            
            if pref.alternating {
                let isFree = onGreenDay ? pref.freeGreen : pref.freeWhite
                return !isFree
            } else {
                return !pref.free
            }
        }
        
        // Fall back to old format
        let settings: BlockSettings
        switch blockName {
        case "A Block": settings = blockA
        case "B Block": settings = blockB
        case "C Block": settings = blockC
        case "D Block": settings = blockD
        case "E Block": settings = blockE
        default: return true // Show other blocks by default
        }
        
        // If both days are unchecked, never show the block (always "Free Block")
        if !settings.showOnGreenDay && !settings.showOnWhiteDay {
            return false
        }
        
        return onGreenDay ? settings.showOnGreenDay : settings.showOnWhiteDay
    }
    
    private func getBlockKey(from blockName: String) -> BlockKey? {
        let normalized = blockName.lowercased().trimmingCharacters(in: .whitespaces)
        if normalized.hasPrefix("a") && normalized.contains("block") { return "A" }
        if normalized.hasPrefix("b") && normalized.contains("block") { return "B" }
        if normalized.hasPrefix("c") && normalized.contains("block") { return "C" }
        if normalized.hasPrefix("d") && normalized.contains("block") { return "D" }
        if normalized.hasPrefix("e") && normalized.contains("block") { return "E" }
        return nil
    }
    
    private func getCurrentDayType() -> String? {
        // This should be implemented based on how you detect day type in your app
        // For now, return nil to use default behavior
        return nil
    }
}

struct SettingsView: View {
    @EnvironmentObject private var router: NavigationRouter
    @StateObject private var authManager = AuthManager.shared
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    private let horizontalInset: CGFloat = 32

    var body: some View {
        VStack(spacing: 0) {
            // Menu items near top
            VStack(spacing: 16) {
                settingsRow(icon: "square.grid.2x2", title: "Widget") {
                    router.push(.settingsFeatureShowcase)
                }

                settingsRow(icon: "bell.badge", title: "Notifications") {
                    router.push(.settingsNotifications)
                }

                settingsRow(icon: "book.closed", title: "Courses") {
                    router.push(.settingsCourses)
                }

                // settingsRow(icon: "clock", title: "Time") {
                //     router.push(.settingsTime)
                // }
                
                // Account/Login row - Temporarily commented out
                // settingsRow(
                //     icon: "person.circle",
                //     title: authManager.isAuthenticated ? "Account" : "Sign In",
                //     accessory: {
                //         if authManager.isAuthenticated && authManager.isEmailVerified {
                //             Image(systemName: "checkmark.circle.fill")
                //                 .foregroundColor(.green)
                //                 .font(.body)
                //         } else if authManager.needsEmailVerification {
                //             Image(systemName: "exclamationmark.circle.fill")
                //                 .foregroundColor(.orange)
                //                 .font(.body)
                //         } else {
                //             EmptyView()
                //         }
                //     }
                // ) {
                //     router.push(.settingsAuth)
                // }

                settingsRow(icon: "ellipsis.circle", title: "More") {
                    router.push(.settingsMore)
                }
            }
            .padding(.top, 40)
            .padding(.horizontal, horizontalInset)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(.systemBackground).ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    router.popToRoot()
                }
                .foregroundColor(accentGreen)
            }
        }
    }

    // Beta badge removed
    // private var betaBadge: some View {
    //     Text("BETA")
    //         .font(.caption.bold())
    //         .padding(.vertical, 4)
    //         .padding(.horizontal, 10)
    //         .background(
    //             Capsule()
    //                 .fill(accentGreen.opacity(0.15))
    //         )
    //         .foregroundColor(accentGreen)
    // }

    private func settingsRow(icon: String, title: String, action: @escaping () -> Void) -> some View {
        settingsRow(icon: icon, title: title, accessory: { EmptyView() }, action: action)
    }

    private func settingsRow<Accessory: View>(icon: String, title: String, @ViewBuilder accessory: () -> Accessory, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(accentGreen)

                HStack(spacing: 10) {
                    Text(title)
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)

                    accessory()
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(red: 245/255, green: 246/255, blue: 245/255))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }
}

struct TimeSettingsView: View {
    @EnvironmentObject private var timeSettings: TimeSettingsModel
    let onDismissRoot: () -> Void
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)

    var body: some View {
        Form {
            Section(footer: Text("Switch to a fixed test date to preview schedules in the future or past.")) {
                Toggle("Use Test Date", isOn: $timeSettings.useTestDate)
                    .onChange(of: timeSettings.useTestDate) { newValue in
                        if newValue {
                            let now = Date.currentEST
                            timeSettings.testDateOverride = now
                        }
                    }
            }

            if timeSettings.useTestDate {
                Section(header: Text("Test Date")) {
                    DatePicker(
                        "",
                        selection: $timeSettings.testDateOverride,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(.wheel)
                    .environment(\.timeZone, Date.estTimeZone)
                    .labelsHidden()
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(.systemBackground))
        .navigationTitle("Time")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismissRoot()
                }
                .foregroundColor(accentGreen)
            }
        }
    }
}


// Legacy BlockConfigurationView - kept for backward compatibility
struct BlockConfigurationView: View {
    @ObservedObject var blockManager: BlockSettingsManager
    let onDismissSettings: () -> Void
    @State private var showValidationAlert = false
    @State private var alertMessage = ""
    @Environment(\.dismiss) private var dismiss
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    
    var body: some View {
        VStack(spacing: 0) {
            // Header section
            VStack(spacing: 8) {
                Text("Courses Configuration")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                Text("Set the courses that appear on your schedule")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                Text("For Free Blocks, please uncheck both days")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
            }
            .padding(.top, 40)
            .padding(.bottom, 20)
            
            // Table Header
            HStack(spacing: 0) {
                Text("Block")
                    .font(.headline)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                
                Text("Course")
                    .font(.headline)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                
                Text("Green")
                    .font(.headline)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                
                Text("White")
                    .font(.headline)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 12)
            .background(Color(red: 245/255, green: 246/255, blue: 245/255))
            
            Divider()
            
            // Table Rows
            ScrollView {
                VStack(spacing: 0) {
                    BlockTableRow(blockName: "A", settings: $blockManager.blockA, onValidationError: showError, onSave: blockManager.saveSettings)
                    Divider()
                    BlockTableRow(blockName: "B", settings: $blockManager.blockB, onValidationError: showError, onSave: blockManager.saveSettings)
                    Divider()
                    BlockTableRow(blockName: "C", settings: $blockManager.blockC, onValidationError: showError, onSave: blockManager.saveSettings)
                    Divider()
                    BlockTableRow(blockName: "D", settings: $blockManager.blockD, onValidationError: showError, onSave: blockManager.saveSettings)
                    Divider()
                    BlockTableRow(blockName: "E", settings: $blockManager.blockE, onValidationError: showError, onSave: blockManager.saveSettings)
                }
            }
            .background(Color(.systemBackground))
            
            Spacer()
        }
        .navigationTitle("Courses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(accentGreen)
            }
        }
        .alert("Invalid Configuration", isPresented: $showValidationAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
    }
    
    private func showError(message: String) {
        alertMessage = message
        showValidationAlert = true
    }
}

struct BlockTableRow: View {
    let blockName: String
    @Binding var settings: BlockSettings
    let onValidationError: (String) -> Void
    let onSave: () -> Void
    
    var body: some View {
        HStack(spacing: 0) {
            // Block column
            Text(blockName)
                .font(.subheadline)
                .fontWeight(.medium)
                .frame(maxWidth: .infinity)
            
            // Course column
            let isFreeBlock = !settings.showOnGreenDay && !settings.showOnWhiteDay
            
            if isFreeBlock {
                Text("Free Block")
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8)
            } else {
                TextField("Enter course name", text: $settings.name)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8)
                    .onChange(of: settings.name) { _ in
                        onSave()
                    }
            }
            
            // Green Day column
            Button(action: {
                toggleGreenDay()
            }) {
                Image(systemName: settings.showOnGreenDay ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundColor(settings.showOnGreenDay ? .green : .gray)
            }
            .frame(maxWidth: .infinity)
            
            // White Day column
            Button(action: {
                toggleWhiteDay()
            }) {
                Image(systemName: settings.showOnWhiteDay ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundColor(settings.showOnWhiteDay ? .blue : .gray)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 16)
    }
    
    private func toggleGreenDay() {
        settings.showOnGreenDay.toggle()
        onSave()
    }
    
    private func toggleWhiteDay() {
        settings.showOnWhiteDay.toggle()
        onSave()
    }
}

class NotificationSettingsManager: ObservableObject {
    static let shared = NotificationSettingsManager()
    
    @Published var notificationsEnabled: Bool = false // Default disabled
    @Published var notificationMinutes: Int = 2 // Default 2 minutes before block ends
    @Published var selectedLunchPeriod: Int = 0 // Default Off
    
    private init() {
        loadSettings()
    }
    
    func saveSettings() {
        UserDefaults.standard.set(notificationsEnabled, forKey: "NotificationsEnabled")
        UserDefaults.standard.set(notificationMinutes, forKey: "NotificationMinutes")
        UserDefaults.standard.set(selectedLunchPeriod, forKey: "SelectedLunchPeriod")
        // print("✅ Notification settings saved: enabled=\(notificationsEnabled), minutes=\(notificationMinutes), lunch=\(selectedLunchPeriod)")
    }
    
    private func loadSettings() {
        notificationsEnabled = UserDefaults.standard.object(forKey: "NotificationsEnabled") as? Bool ?? false
        notificationMinutes = UserDefaults.standard.object(forKey: "NotificationMinutes") as? Int ?? 2
        selectedLunchPeriod = UserDefaults.standard.object(forKey: "SelectedLunchPeriod") as? Int ?? 0
        // print("✅ Notification settings loaded: enabled=\(notificationsEnabled), minutes=\(notificationMinutes), lunch=\(selectedLunchPeriod)")
    }
}

struct NotificationSettingsView: View {
    @ObservedObject private var notificationManager = NotificationSettingsManager.shared
    let onDismissSettings: () -> Void
    @State private var showingPermissionDeniedAlert = false
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    
    var body: some View {
        VStack(spacing: 0) {
            // Header section
            VStack(spacing: 8) {
                Text("Block End Notifications")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                Text("Get notified before each block ends")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 40)
            .padding(.bottom, 20)
            
            // Toggle section
            HStack {
                Toggle("Enable Notifications", isOn: Binding(
                    get: { notificationManager.notificationsEnabled },
                    set: { newValue in
                        if newValue {
                            // User wants to enable notifications - request permission first
                            requestNotificationPermission()
                        } else {
                            // User wants to disable notifications - no permission needed
                            notificationManager.notificationsEnabled = false
                            notificationManager.saveSettings()
                        }
                    }
                ))
                .font(.headline)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, notificationManager.notificationsEnabled ? 8 : 0)
            
            // Explanatory text - only show when notifications are enabled
            if notificationManager.notificationsEnabled {
                Text("The app refreshes the next two school days in the background, so you shouldn't need to open it daily.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
            
            // Picker section - only show when notifications are enabled
            if notificationManager.notificationsEnabled {
                VStack(spacing: 10) {
                    // Single line with embedded picker
                    HStack(spacing: 4) {
                        Text("Notify me")
                            .font(.headline)
                            .foregroundColor(.primary)
                        
                        Picker("Minutes", selection: $notificationManager.notificationMinutes) {
                            ForEach(0...10, id: \.self) { minutes in
                                Text("\(minutes)").tag(minutes)
                            }
                        }
                        .pickerStyle(WheelPickerStyle())
                        .frame(width: 60, height: 80)
                        .clipped()
                        
                        Text(notificationManager.notificationMinutes == 0 ? "when block ends" : "minute\(notificationManager.notificationMinutes == 1 ? "" : "s") before block ends")
                            .font(.headline)
                            .foregroundColor(.primary)
                        
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(UIColor.systemGroupedBackground))
                )
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .transition(.opacity.combined(with: .scale))
                
                // Lunch period selection
                VStack(spacing: 10) {
                    HStack {
                        Text("My Lunch Period")
                            .font(.headline)
                            .foregroundColor(.primary)
                        Spacer()
                    }
                    
                    // Lunch period picker
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { period in
                            Button(action: {
                                notificationManager.selectedLunchPeriod = period
                            }) {
                                Text("\(period)\(getOrdinalSuffix(period))")
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(notificationManager.selectedLunchPeriod == period ? .white : .primary)
                                    .frame(width: 50, height: 36)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(notificationManager.selectedLunchPeriod == period ? Color.green : Color(UIColor.systemGray5))
                                    )
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                        
                        // Off option
                        Button(action: {
                            notificationManager.selectedLunchPeriod = 0
                        }) {
                            Text("Off")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(notificationManager.selectedLunchPeriod == 0 ? .white : .primary)
                                .frame(width: 50, height: 36)
                                .background(
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(notificationManager.selectedLunchPeriod == 0 ? Color.green : Color(UIColor.systemGray5))
                                )
                        }
                        .buttonStyle(PlainButtonStyle())
                        
                        Spacer()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(UIColor.systemGroupedBackground))
                )
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .transition(.opacity.combined(with: .scale))
            }
            
            Spacer()
        }
        .background(Color(UIColor.systemBackground))
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(accentGreen)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: notificationManager.notificationsEnabled)
        .onChange(of: notificationManager.notificationMinutes) { _ in
            // Auto-save when picker value changes
            notificationManager.saveSettings()
        }
        .onChange(of: notificationManager.notificationsEnabled) { _ in
            // Auto-save when toggle changes
            notificationManager.saveSettings()
        }
        .onChange(of: notificationManager.selectedLunchPeriod) { _ in
            // Auto-save when lunch period changes
            notificationManager.saveSettings()
        }
        .alert("Notification Permission Required", isPresented: $showingPermissionDeniedAlert) {
            Button("Go to Settings") {
                if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(settingsUrl)
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("To receive notifications, please enable notifications for this app in Settings.")
        }
        .onAppear {
            checkNotificationPermissionStatus()
        }
    }
    
    // Check current notification permission status and sync with toggle
    private func checkNotificationPermissionStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                let isAuthorized = settings.authorizationStatus == .authorized
                // print("🔔 [PERMISSION CHECK] Current status: \(settings.authorizationStatus.rawValue), authorized: \(isAuthorized)")
                
                // If system permission is denied but app toggle is on, turn off the app toggle
                if !isAuthorized && notificationManager.notificationsEnabled {
                    // print("🔔 [PERMISSION CHECK] System permission denied - disabling app notifications")
                    notificationManager.notificationsEnabled = false
                    notificationManager.saveSettings()
                }
            }
        }
    }
    
    // Request notification permission when user tries to enable notifications
    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                if granted {
                    // print("✅ Notification permission granted")
                    notificationManager.notificationsEnabled = true
                    notificationManager.saveSettings()
                } else {
                    // print("❌ Notification permission denied")
                    showingPermissionDeniedAlert = true
                }
            }
        }
    }
    
    // Helper function for ordinal suffixes
    private func getOrdinalSuffix(_ number: Int) -> String {
        switch number {
        case 1: return "st"
        case 2: return "nd"
        case 3: return "rd"
        default: return "th"
        }
    }
}

private struct SkeletonLoadingView: View {
    let scheduleOffset: CGFloat
    let blockCount: Int
    private let cardBackground = Color(red: 245/255, green: 246/255, blue: 245/255)
    private let topOverlayPadding: CGFloat = 32

    var body: some View {
        ZStack {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: topOverlayPadding)

                VStack(spacing: 24) {
                    HStack {
                        Spacer(minLength: 0)
                        SkeletonDayTypeCardPlaceholder(cardBackground: cardBackground)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16)

                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 16) {
                            SkeletonScheduleCardPlaceholder(cardBackground: cardBackground, blockCount: blockCount)
                        }
                        .padding(.leading, 44)
                        .padding(.trailing, 40)
                        .padding(.top, 8)
                    }
                    .allowsHitTesting(false)
                }
                .offset(y: scheduleOffset)

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct SkeletonTomorrowButtonsOverlay: View {
    let isViewingTomorrow: Bool
    private let cardBackground = Color(red: 245/255, green: 246/255, blue: 245/255)

    var body: some View {
        HStack(alignment: .bottom) {
            if isViewingTomorrow {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(cardBackground)
                    .frame(width: 52, height: 44)
                    .overlay(
                        SkeletonBar(cornerRadius: 8, height: 12)
                            .frame(width: 20)
                    )
                    .padding(.leading, 38)
            }

            Spacer()

            if !isViewingTomorrow {
                VStack(alignment: .leading, spacing: 4) {
                    SkeletonBar(cornerRadius: 8, height: 16)
                        .frame(width: 120)
                    SkeletonBar(cornerRadius: 8, height: 12)
                        .frame(width: 96)
                        .opacity(0.6)
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 18)
                .frame(width: 160, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(cardBackground)
                )
                .padding(.trailing, 32)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct SkeletonDayTypeCardPlaceholder: View {
    let cardBackground: Color

    var body: some View {
        VStack(spacing: 7) {
            SkeletonBar(cornerRadius: 10, height: 24)
                .frame(width: 150)

            SkeletonBar(cornerRadius: 8, height: 9)
                .frame(width: 100)
                .opacity(0.65)

            SkeletonBar(cornerRadius: 6, height: 7)
                .frame(width: 70)
                .opacity(0.45)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 24)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(cardBackground)
        )
    }
}

private struct SkeletonScheduleCardPlaceholder: View {
    let cardBackground: Color
    let blockCount: Int

    var body: some View {
        let placeholderCount = max(min(blockCount, 5), 2)

        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBar(cornerRadius: 8, height: 16)
                        .frame(width: 120)

                    SkeletonBar(cornerRadius: 8, height: 12)
                        .frame(width: 80)
                        .opacity(0.8)
                }

                Spacer()

                SkeletonBar(cornerRadius: 6, height: 12)
                    .frame(width: 90)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)

            Rectangle()
                .fill(Color(UIColor.systemGray3).opacity(0.35))
                .frame(height: 1)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

            VStack(spacing: 8) {
                ForEach(0..<placeholderCount, id: \.self) { _ in
                    SkeletonScheduleBlockRowPlaceholder()
                }
            }
            .padding(.bottom, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(cardBackground)
        )
        .frame(maxWidth: .infinity)
    }
}

private struct SkeletonScheduleBlockRowPlaceholder: View {
    var body: some View {
        SkeletonBar(cornerRadius: 10, height: 18)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 28)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(UIColor.systemGray5).opacity(0.2))
                    .padding(.horizontal, 12)
            )
    }
}

private struct SkeletonCircle: View {
    let diameter: CGFloat

    var body: some View {
        Circle()
            .fill(Color(UIColor.systemGray5))
            .frame(width: diameter, height: diameter)
            .overlay(
                SkeletonShimmer()
                    .mask(Circle())
            )
    }
}

private struct SkeletonBar: View {
    let cornerRadius: CGFloat
    let height: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color(UIColor.systemGray5))
            .frame(height: height)
            .overlay(
                SkeletonShimmer()
                    .mask(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    )
            )
    }
}

private struct SkeletonShimmer: View {
    @State private var startPoint: UnitPoint = UnitPoint(x: -1, y: 0.5)
    @State private var endPoint: UnitPoint = UnitPoint(x: 0, y: 0.5)

    var body: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                Color.white.opacity(0.0),
                Color.white.opacity(0.6),
                Color.white.opacity(0.0)
            ]),
            startPoint: startPoint,
            endPoint: endPoint
        )
        .onAppear {
            startPoint = UnitPoint(x: -1, y: 0.5)
            endPoint = UnitPoint(x: 0, y: 0.5)

            let animation = Animation.linear(duration: 1.2).repeatForever(autoreverses: false)
            withAnimation(animation) {
                startPoint = UnitPoint(x: 1, y: 0.5)
                endPoint = UnitPoint(x: 2, y: 0.5)
            }
        }
    }
}

// MARK: - Login View (matching Chrome extension)

enum LoginAuthMode {
    case signIn
    case register
    
    var title: String {
        switch self {
        case .signIn: return "Sign In"
        case .register: return "Create Account"
        }
    }
    
    var submitButtonTitle: String {
        switch self {
        case .signIn: return "Sign in with email"
        case .register: return "Create account"
        }
    }
    
    var togglePrompt: String {
        switch self {
        case .signIn: return "Need an account? Register"
        case .register: return "Have an account? Sign in"
        }
    }
}

enum LoginFeedbackType {
    case success
    case error
    case info
    case warning
    
    var color: Color {
        switch self {
        case .success: return .green
        case .error: return .red
        case .info: return .blue
        case .warning: return .orange
        }
    }
    
    var iconName: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.circle.fill"
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        }
    }
}

struct LoginFeedback {
    let type: LoginFeedbackType
    let message: String
}

struct LoginView: View {
    @StateObject private var authManager = AuthManager.shared
    @EnvironmentObject private var router: NavigationRouter
    @State private var authMode: LoginAuthMode = .signIn
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var showPassword: Bool = false
    @State private var isBusy: Bool = false
    @State private var feedback: LoginFeedback?
    @State private var resendCooldown: Int = 0
    @State private var redirecting: Bool = false
    
    let onDismiss: () -> Void
    
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Text("Sign in to Hilltoppers")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    Text("Sync your schedule and class preferences across every device.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.top, 20)
                
                // Feedback Message
                if let feedback = feedback {
                    LoginFeedbackView(feedback: feedback)
                }
                
                // Email Verification Notice
                if authManager.needsEmailVerification {
                    LoginEmailVerificationNotice(
                        isBusy: $isBusy,
                        resendCooldown: $resendCooldown,
                        onResend: handleResendVerification,
                        onRefresh: handleRefreshVerification
                    )
                }
                
                // Authenticated User Notice
                if authManager.isAuthenticated && !authManager.needsEmailVerification {
                    LoginAuthenticatedNotice(identity: authManager.userIdentity)
                }
                
                // Login Form (hide when email needs verification)
                if !authManager.needsEmailVerification {
                    VStack(spacing: 16) {
                        // Email Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            TextField("Enter your email", text: $email)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                                .disabled(isBusy)
                                .padding(12)
                                .background(Color(UIColor.systemGray6))
                                .cornerRadius(8)
                        }
                        
                        // Password Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            HStack {
                                if showPassword {
                                    TextField("Enter password", text: $password)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                        .disabled(isBusy)
                                } else {
                                    SecureField("Enter password", text: $password)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                        .disabled(isBusy)
                                }
                                
                                Button(action: { showPassword.toggle() }) {
                                    Text(showPassword ? "Hide" : "Show")
                                        .font(.caption)
                                        .foregroundColor(accentGreen)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(12)
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(8)
                        }
                        
                        // Submit Button
                        Button(action: handleEmailSubmit) {
                            HStack {
                                if isBusy {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Text(authMode.submitButtonTitle)
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(accentGreen)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(isBusy)
                        
                        // Toggle Mode Button
                        Button(action: toggleAuthMode) {
                            Text(authMode.togglePrompt)
                                .font(.subheadline)
                                .foregroundColor(accentGreen)
                        }
                        .disabled(isBusy)
                    }
                    .padding(.horizontal)
                }
                
                Spacer(minLength: 40)
                
                // Sign Out Button (if authenticated)
                if authManager.isAuthenticated {
                    Button(action: handleSignOut) {
                        Text("Sign Out")
                            .font(.subheadline)
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .disabled(isBusy)
                }
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismiss()
                }
                .foregroundColor(accentGreen)
            }
        }
        .onAppear {
            // Auto-redirect if authenticated and verified
            if authManager.isAuthenticated && !authManager.needsEmailVerification && !redirecting {
                redirecting = true
                Task {
                    await proceedAfterLogin()
                }
            }
        }
        .onChange(of: authManager.isAuthenticated) { isAuthenticated in
            if isAuthenticated && !authManager.needsEmailVerification && !redirecting {
                redirecting = true
                Task {
                    await proceedAfterLogin()
                }
            }
        }
        .onChange(of: authManager.needsEmailVerification) { needsVerification in
            if !needsVerification && authManager.isAuthenticated && !redirecting {
                redirecting = true
                Task {
                    await proceedAfterLogin()
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            // Check verification status when app returns to foreground
            if authManager.needsEmailVerification {
                Task {
                    await checkVerificationStatus()
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func handleEmailSubmit() {
        guard !isBusy else { return }
        
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        let trimmedPassword = password.trimmingCharacters(in: .whitespaces)
        
        guard !trimmedEmail.isEmpty, !trimmedPassword.isEmpty else {
            feedback = LoginFeedback(type: .error, message: "Email and password are required.")
            return
        }
        
        isBusy = true
        feedback = nil
        redirecting = false
        
        Task {
            do {
                if authMode == .register {
                    try await authManager.register(email: trimmedEmail, password: trimmedPassword)
                    feedback = LoginFeedback(
                        type: .info,
                        message: "Account created. We just sent a verification email — please check your inbox (including spam or junk folders)."
                    )
                    
                    // Send verification email
                    do {
                        try await authManager.sendVerificationEmail()
                        resendCooldown = 60
                        startCooldownTimer()
                    } catch {
                        feedback = LoginFeedback(
                            type: .error,
                            message: "Account created, but the verification email could not be sent. Please try resending in a moment."
                        )
                    }
                } else {
                    try await authManager.signIn(email: trimmedEmail, password: trimmedPassword)
                    
                    if authManager.needsEmailVerification {
                        feedback = LoginFeedback(
                            type: .warning,
                            message: "Signed in. Please verify your email to finish setting up syncing."
                        )
                    } else {
                        feedback = LoginFeedback(type: .success, message: "Signed in successfully.")
                        
                        // Save password to system Passwords using Shared Web Credentials
                        // Note: This requires Associated Domains to be configured in the app
                        // Without Associated Domains, the API will fail silently
                        print("🔐 [Login] Attempting to save password to system Passwords...")
                        SharedWebCredentialsManager.shared.savePassword(
                            account: trimmedEmail,
                            password: trimmedPassword
                        ) { success, error in
                            if success {
                                print("✅ [Login] Password saved to system Passwords - user should see system prompt")
                            } else if let error = error {
                                let nsError = error as NSError
                                print("❌ [Login] Failed to save password: \(nsError.localizedDescription)")
                                print("   Error domain: \(nsError.domain), code: \(nsError.code)")
                                print("   Note: This may require Associated Domains to be configured")
                            }
                        }
                        
                        // Proceed to next screen
                        await proceedAfterLogin()
                    }
                }
                password = ""
            } catch let error as AuthError {
                if case .tooManyRequests = error {
                    feedback = LoginFeedback(
                        type: .error,
                        message: "Too many attempts. Please wait a minute before trying again and check your spam folder for earlier emails."
                    )
                    resendCooldown = max(resendCooldown, 60)
                    startCooldownTimer()
                } else {
                    feedback = LoginFeedback(type: .error, message: error.localizedDescription)
                }
            } catch {
                feedback = LoginFeedback(type: .error, message: error.localizedDescription)
            }
            
            isBusy = false
        }
    }
    
    private func handleResendVerification() {
        guard !isBusy, resendCooldown == 0 else {
            if resendCooldown > 0 {
                feedback = LoginFeedback(
                    type: .info,
                    message: "Please wait \(resendCooldown) seconds before sending another verification email."
                )
            }
            return
        }
        
        isBusy = true
        feedback = nil
        
        Task {
            do {
                try await authManager.sendVerificationEmail()
                feedback = LoginFeedback(
                    type: .info,
                    message: "Verification email sent. Please check your inbox (including spam or junk folders)."
                )
                resendCooldown = 60
                startCooldownTimer()
            } catch let error as AuthError {
                if case .tooManyRequests = error {
                    feedback = LoginFeedback(
                        type: .error,
                        message: "Too many attempts. Please wait one minute before trying again."
                    )
                    resendCooldown = 60
                    startCooldownTimer()
                } else {
                    feedback = LoginFeedback(type: .error, message: error.localizedDescription)
                }
            } catch {
                feedback = LoginFeedback(type: .error, message: error.localizedDescription)
            }
            
            isBusy = false
        }
    }
    
    private func handleRefreshVerification() {
        guard !isBusy else { return }
        
        isBusy = true
        feedback = nil
        
        Task {
            await checkVerificationStatus()
            isBusy = false
        }
    }
    
    private func checkVerificationStatus() async {
        do {
            let isVerified = try await authManager.reloadUser()
            
            if isVerified {
                await MainActor.run {
                    feedback = LoginFeedback(type: .success, message: "Email verified! Opening settings…")
                }
                await proceedAfterLogin()
            } else {
                await MainActor.run {
                    feedback = LoginFeedback(
                        type: .warning,
                        message: "We still cannot confirm the verification. Click the link in your email, then try again."
                    )
                }
            }
        } catch {
            await MainActor.run {
                feedback = LoginFeedback(type: .error, message: "Failed to check verification status.")
            }
        }
    }
    
    private func proceedAfterLogin() async {
        // Load preferences and navigate to courses settings
        await BlockPreferencesManager.shared.loadPreferences()
        await SchedulePreferencesManager.shared.loadPreferences()
        await MainActor.run {
            router.push(.settingsCourses)
        }
    }
    
    private func handleSignOut() {
        guard !isBusy else { return }
        
        isBusy = true
        feedback = nil
        redirecting = false
        
        Task {
            do {
                try await authManager.signOut()
                feedback = LoginFeedback(type: .info, message: "Signed out. You can still browse settings locally.")
                email = ""
                password = ""
            } catch {
                feedback = LoginFeedback(type: .error, message: "Failed to sign out.")
            }
            
            isBusy = false
        }
    }
    
    private func toggleAuthMode() {
        authMode = authMode == .signIn ? .register : .signIn
        feedback = nil
    }
    
    // MARK: - Cooldown Timer
    
    private func startCooldownTimer() {
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            if resendCooldown > 0 {
                resendCooldown -= 1
            } else {
                timer.invalidate()
            }
        }
    }
}

struct LoginFeedbackView: View {
    let feedback: LoginFeedback
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: feedback.type.iconName)
                .foregroundColor(feedback.type.color)
                .font(.title3)
            
            Text(feedback.message)
                .font(.subheadline)
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
            
            Spacer()
        }
        .padding()
        .background(feedback.type.color.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct LoginEmailVerificationNotice: View {
    @Binding var isBusy: Bool
    @Binding var resendCooldown: Int
    let onResend: () -> Void
    let onRefresh: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "envelope.badge")
                    .foregroundColor(.orange)
                    .font(.title3)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Verify your email")
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text("Check your inbox (including spam or junk folders) and click the verification link.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            
            HStack(spacing: 12) {
                Button(action: onResend) {
                    HStack {
                        if isBusy {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Text(resendCooldown > 0 ? "Resend (\(resendCooldown)s)" : "Resend email")
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(UIColor.systemGray5))
                    .foregroundColor(.primary)
                    .cornerRadius(8)
                }
                .disabled(isBusy || resendCooldown > 0)
                
                Button(action: onRefresh) {
                    Text("I've verified")
                        .font(.subheadline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(red: 20/255, green: 54/255, blue: 27/255))
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
                .disabled(isBusy)
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct LoginAuthenticatedNotice: View {
    let identity: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.title3)
            
            VStack(alignment: .leading, spacing: 4) {
                Text("You're signed in")
                    .font(.headline)
                    .foregroundColor(.primary)
                
                Text("as \(identity)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

// MARK: - Block Preferences Manager (matching Chrome extension)

typealias BlockKey = String // "A", "B", "C", "D", "E"

struct BlockPreference: Codable, Equatable {
    var name: String = ""
    var alternating: Bool = false
    var nameGreen: String = ""
    var nameWhite: String = ""
    var freeGreen: Bool = false
    var freeWhite: Bool = false
    var free: Bool = false
    var nameBackup: String = ""
    var nameGreenBackup: String = ""
    var nameWhiteBackup: String = ""
    var migrated: Bool = true
    
    // Legacy fields for migration (not saved to cloud)
    var showOnGreen: Bool?
    var showOnWhite: Bool?
    
    static func == (lhs: BlockPreference, rhs: BlockPreference) -> Bool {
        return lhs.name == rhs.name &&
               lhs.alternating == rhs.alternating &&
               lhs.nameGreen == rhs.nameGreen &&
               lhs.nameWhite == rhs.nameWhite &&
               lhs.freeGreen == rhs.freeGreen &&
               lhs.freeWhite == rhs.freeWhite &&
               lhs.free == rhs.free
    }
}

typealias BlockPreferenceRecord = [BlockKey: BlockPreference]

class BlockPreferencesManager: ObservableObject {
    static let shared = BlockPreferencesManager()
    
    @Published var preferences: BlockPreferenceRecord = [:]
    @Published var isLoading: Bool = false
    @Published var saveStatus: SaveStatus = .idle
    @Published var hasConflict: Bool = false
    @Published var remotePreferences: BlockPreferenceRecord?
    
    enum SaveStatus: Equatable {
        case idle
        case saving
        case success
        case error(String)
    }
    
    private let db = Firestore.firestore()
    private let storageKey = "blockPreferences"
    private let usersCollection = "users"
    private var authStateListener: AuthStateDidChangeListenerHandle?
    
    private init() {
        setupAuthListener()
        // Perform initial migration check synchronously on first load
        _ = loadFromLocalStorage()
        // Then load async (may reload from cloud if authenticated)
        loadPreferences()
    }
    
    deinit {
        if let listener = authStateListener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }
    
    private func setupAuthListener() {
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                await self?.loadPreferences()
            }
        }
    }
    
    // MARK: - Load Preferences
    
    func loadPreferences() async {
        await MainActor.run {
            isLoading = true
            hasConflict = false
            remotePreferences = nil
        }
        
        // Load local preferences first
        let local = loadFromLocalStorage()
        
        // Try to load from cloud if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            if let remote = await loadFromRemote(userId: user.uid) {
                // Check for conflict
                if !arePreferencesEqual(local, remote) {
                    // Conflict detected - store both and let user choose
                    await MainActor.run {
                        self.preferences = local // Keep local as current
                        self.remotePreferences = remote
                        self.hasConflict = true
                        self.isLoading = false
                    }
                    return
                } else {
                    // No conflict - use remote
                    await MainActor.run {
                        self.preferences = remote
                        self.isLoading = false
                    }
                    // Cache locally
                    await saveToLocalStorage(remote)
                    return
                }
            }
        }
        
        // Fall back to local storage (no remote or not authenticated)
        await MainActor.run {
            self.preferences = local
            self.isLoading = false
        }
    }
    
    private func loadPreferences() {
        Task {
            await loadPreferences()
        }
    }
    
    // Check if two preference records are equal
    private func arePreferencesEqual(_ local: BlockPreferenceRecord, _ remote: BlockPreferenceRecord) -> Bool {
        let allKeys = Set(local.keys).union(Set(remote.keys))
        for key in allKeys {
            let localPref = local[key] ?? BlockPreference()
            let remotePref = remote[key] ?? BlockPreference()
            if localPref != remotePref {
                return false
            }
        }
        return true
    }
    
    // Use local preferences and upload to cloud
    func useLocalPreferences() async {
        let (remote, prefs, user) = await MainActor.run {
            (self.remotePreferences, self.preferences, Auth.auth().currentUser)
        }
        
        guard let remote = remote else { return }
        guard let user = user, user.isEmailVerified else { return }
        
        // Save local preferences to cloud
        do {
            try await saveToRemote(userId: user.uid, preferences: prefs)
            await MainActor.run {
                self.hasConflict = false
                self.remotePreferences = nil
            }
            // print("✅ [BlockPreferences] Uploaded local preferences to cloud")
        } catch {
            // print("❌ [BlockPreferences] Failed to upload local preferences: \(error)")
        }
    }
    
    // Use remote preferences
    func useRemotePreferences() async {
        let remote = await MainActor.run {
            self.remotePreferences
        }
        
        guard let remote = remote else { return }
        
        await MainActor.run {
            self.preferences = remote
            self.hasConflict = false
            self.remotePreferences = nil
        }
        
        // Cache locally
        await saveToLocalStorage(remote)
        // print("✅ [BlockPreferences] Using remote preferences")
    }
    
    private func loadFromLocalStorage() -> BlockPreferenceRecord {
        // Check if migration has been completed
        let migrationKey = "BlockPreferences_Migrated_v1"
        let hasMigrated = UserDefaults.standard.bool(forKey: migrationKey)
        
        // Only migrate if we haven't migrated before
        if !hasMigrated {
            // Check if old format exists
            if let oldData = UserDefaults.standard.data(forKey: "BlockSettings"),
               let oldSettings = try? JSONDecoder().decode([String: BlockSettingsLegacy].self, from: oldData),
               !oldSettings.isEmpty {
                // Old format exists - migrate it
                // print("🔄 [BlockPreferences] Old format detected, migrating...")
                if let migrated = migrateFromOldBlockSettings() {
                    // Mark migration as completed (only set to true after successful migration)
                    UserDefaults.standard.set(true, forKey: migrationKey)
                    // print("✅ [BlockPreferences] Migration completed and marked!")
                    return migrated
                }
            } else {
                // No old format to migrate, mark as completed anyway
                UserDefaults.standard.set(true, forKey: migrationKey)
                // print("ℹ️ [BlockPreferences] No old format found, migration marked as completed")
            }
        } else {
            // print("ℹ️ [BlockPreferences] Migration already completed, skipping")
        }
        
        // Load new format if exists
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(BlockPreferenceRecord.self, from: data) {
            return migratePreferences(decoded)
        }
        
        // Return defaults
        return createDefaultPreferences()
    }
    
    // MARK: - Migration from Old BlockSettings Format
    
    private func migrateFromOldBlockSettings() -> BlockPreferenceRecord? {
        // Read old format
        guard let oldData = UserDefaults.standard.data(forKey: "BlockSettings") else {
            return nil
        }
        
        guard let oldSettings = try? JSONDecoder().decode([String: BlockSettingsLegacy].self, from: oldData) else {
            // print("⚠️ [BlockPreferences] Failed to decode old format")
            return nil
        }
        
        // print("🔄 [BlockPreferences] Migrating from old format...")
        // print("🔄 [BlockPreferences] Old settings: \(oldSettings)")
        
        // Convert each block from old format to new format
        var newPrefs: BlockPreferenceRecord = [:]
        let blockKeys: [BlockKey] = ["A", "B", "C", "D", "E"]
        
        for key in blockKeys {
            let oldSetting = oldSettings[key] ?? BlockSettingsLegacy()
            
            var newPref = BlockPreference()
            newPref.migrated = true
            
            let showOnGreen = oldSetting.showOnGreenDay
            let showOnWhite = oldSetting.showOnWhiteDay
            let oldName = oldSetting.name
            
            // Simple conversion: map old format to new format
            if !showOnGreen && !showOnWhite {
                // Free Block: both unchecked
                newPref.free = true
                newPref.name = "Free Block"
                newPref.nameBackup = oldName
                newPref.alternating = false
            } else if showOnGreen && !showOnWhite {
                // Only green day
                newPref.alternating = true
                newPref.nameGreen = oldName
                newPref.nameWhite = ""
                newPref.freeGreen = false
                newPref.freeWhite = true
            } else if !showOnGreen && showOnWhite {
                // Only white day
                newPref.alternating = true
                newPref.nameGreen = ""
                newPref.nameWhite = oldName
                newPref.freeGreen = true
                newPref.freeWhite = false
            } else {
                // Both days (normal)
                newPref.alternating = false
                newPref.free = false
                newPref.name = oldName
            }
            
            newPrefs[key] = newPref
            // print("✅ [BlockPreferences] \(key): '\(oldName)' (G:\(showOnGreen), W:\(showOnWhite)) -> alt:\(newPref.alternating), free:\(newPref.free)")
        }
        
        // Save to new format (this overwrites any existing new format)
        if let encoded = try? JSONEncoder().encode(newPrefs) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
            // print("✅ [BlockPreferences] Saved migrated data to '\(storageKey)'")
            return newPrefs
        } else {
            // print("❌ [BlockPreferences] Failed to encode!")
            return nil
        }
    }
    
    private func loadFromRemote(userId: String) async -> BlockPreferenceRecord? {
        do {
            let docRef = db.collection(usersCollection).document(userId)
            let document = try await docRef.getDocument()
            
            guard document.exists,
                  let data = document.data(),
                  let prefsData = data["blockPreferences"] as? [String: Any] else {
                return nil
            }
            
            // Convert to BlockPreferenceRecord
            var prefs: BlockPreferenceRecord = [:]
            for (key, value) in prefsData {
                if let dict = value as? [String: Any],
                   let jsonData = try? JSONSerialization.data(withJSONObject: dict),
                   let pref = try? JSONDecoder().decode(BlockPreference.self, from: jsonData) {
                    prefs[key] = pref
                }
            }
            
            return prefs.isEmpty ? nil : prefs
        } catch {
            // print("❌ [BlockPreferences] Failed to load from remote: \(error)")
            return nil
        }
    }
    
    // MARK: - Save Preferences
    
    func savePreferences() async {
        let prefsToSave = await MainActor.run {
            self.preferences
        }
        
        // Save locally first
        await saveToLocalStorage(prefsToSave)
        
        // Save to cloud if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            await MainActor.run {
                self.saveStatus = .saving
            }
            
            do {
                try await saveToRemote(userId: user.uid, preferences: prefsToSave)
                await MainActor.run {
                    self.saveStatus = .success
                    // Reset after 3 seconds
                    Task {
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        await MainActor.run {
                            if case .success = self.saveStatus {
                                self.saveStatus = .idle
                            }
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    self.saveStatus = .error(error.localizedDescription)
                }
            }
        } else {
            await MainActor.run {
                self.saveStatus = .idle
            }
        }
        
        // Notify that block settings changed
        NotificationCenter.default.post(name: Notification.Name("BlockSettingsChanged"), object: nil)
    }
    
    private func saveToLocalStorage(_ preferences: BlockPreferenceRecord) async {
        if let encoded = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
            // print("✅ [BlockPreferences] Saved to local storage")
        }
    }
    
    private func saveToRemote(userId: String, preferences: BlockPreferenceRecord) async throws {
        // Clean preferences (remove legacy fields)
        let cleaned = cleanPreferences(preferences)
        
        // Convert to Firestore-compatible format
        var prefsDict: [String: Any] = [:]
        for (key, pref) in cleaned {
            if let jsonData = try? JSONEncoder().encode(pref),
               let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                prefsDict[key] = dict
            }
        }
        
        let docRef = db.collection(usersCollection).document(userId)
        try await docRef.setData([
            "blockPreferences": prefsDict,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)
        
        // print("✅ [BlockPreferences] Saved to cloud")
    }
    
    private func cleanPreferences(_ preferences: BlockPreferenceRecord) -> BlockPreferenceRecord {
        var cleaned: BlockPreferenceRecord = [:]
        for (key, pref) in preferences {
            cleaned[key] = BlockPreference(
                name: pref.name,
                alternating: pref.alternating,
                nameGreen: pref.nameGreen,
                nameWhite: pref.nameWhite,
                freeGreen: pref.freeGreen,
                freeWhite: pref.freeWhite,
                free: pref.free,
                nameBackup: pref.nameBackup,
                nameGreenBackup: pref.nameGreenBackup,
                nameWhiteBackup: pref.nameWhiteBackup,
                migrated: true
            )
        }
        return cleaned
    }
    
    // MARK: - Defaults
    
    private func createDefaultPreferences() -> BlockPreferenceRecord {
        return [
            "A": BlockPreference(),
            "B": BlockPreference(),
            "C": BlockPreference(),
            "D": BlockPreference(),
            "E": BlockPreference()
        ]
    }
    
    // MARK: - Migration
    
    private func migratePreferences(_ prefs: BlockPreferenceRecord) -> BlockPreferenceRecord {
        var migrated: BlockPreferenceRecord = [:]
        
        for (key, pref) in prefs {
            if pref.migrated {
                migrated[key] = pref
                continue
            }
            
            // Migrate from old format (showOnGreen/showOnWhite)
            let showOnGreen = pref.showOnGreen ?? true
            let showOnWhite = pref.showOnWhite ?? true
            let name = pref.name
            
            var newPref = BlockPreference()
            newPref.name = name
            
            if !showOnGreen && !showOnWhite {
                // Both unchecked -> free block
                newPref.free = true
                newPref.name = "Free Block"
                newPref.nameBackup = name.isEmpty || name == "Free Block" ? "" : name
                newPref.alternating = false
            } else if showOnGreen && !showOnWhite {
                // Only green -> alternating
                newPref.alternating = true
                newPref.nameGreen = name
                newPref.nameWhite = ""
                newPref.freeGreen = false
                newPref.freeWhite = true
            } else if !showOnGreen && showOnWhite {
                // Only white -> alternating
                newPref.alternating = true
                newPref.nameGreen = ""
                newPref.nameWhite = name
                newPref.freeGreen = true
                newPref.freeWhite = false
            } else {
                // Both checked -> normal
                newPref.alternating = false
                newPref.free = false
            }
            
            newPref.migrated = true
            migrated[key] = newPref
        }
        
        return migrated
    }
    
    // MARK: - Helper Methods
    
    func getPreference(for key: BlockKey) -> BlockPreference {
        return preferences[key] ?? BlockPreference()
    }
    
    func updatePreference(for key: BlockKey, preference: BlockPreference) {
        preferences[key] = preference
        Task {
            await savePreferences()
        }
    }
    
    func resetToDefaults() {
        preferences = createDefaultPreferences()
        Task {
            await savePreferences()
        }
    }
}

// MARK: - Schedule Preferences Manager (matching Chrome extension)

enum TimeFormat: String, Codable {
    case hour12 = "12h"
    case hour24 = "24h"
}

struct SchedulePreferences: Codable, Equatable {
    var lunchPeriod: Int = 1
    var timeFormat: TimeFormat = .hour12
}

class SchedulePreferencesManager: ObservableObject {
    static let shared = SchedulePreferencesManager()
    
    @Published var preferences: SchedulePreferences = SchedulePreferences()
    @Published var isLoading: Bool = false
    
    private let db = Firestore.firestore()
    private let storageKey = "schedulePreferences"
    private let usersCollection = "users"
    private var authStateListener: AuthStateDidChangeListenerHandle?
    
    private init() {
        setupAuthListener()
        loadPreferences()
    }
    
    deinit {
        if let listener = authStateListener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }
    
    private func setupAuthListener() {
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                await self?.loadPreferences()
            }
        }
    }
    
    // MARK: - Load Preferences
    
    func loadPreferences() async {
        await MainActor.run {
            isLoading = true
        }
        
        // Try to load from cloud first if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            if let remote = await loadFromRemote(userId: user.uid) {
                await MainActor.run {
                    self.preferences = remote
                    self.isLoading = false
                }
                // Cache locally
                await saveToLocalStorage(remote)
                return
            }
        }
        
        // Fall back to local storage
        let local = loadFromLocalStorage()
        await MainActor.run {
            self.preferences = local
            self.isLoading = false
        }
    }
    
    private func loadPreferences() {
        Task {
            await loadPreferences()
        }
    }
    
    private func loadFromLocalStorage() -> SchedulePreferences {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(SchedulePreferences.self, from: data) else {
            return SchedulePreferences()
        }
        return decoded
    }
    
    private func loadFromRemote(userId: String) async -> SchedulePreferences? {
        do {
            let docRef = db.collection(usersCollection).document(userId)
            let document = try await docRef.getDocument()
            
            guard document.exists,
                  let data = document.data(),
                  let prefsData = data["schedulePreferences"] as? [String: Any] else {
                return nil
            }
            
            // Convert to SchedulePreferences
            if let jsonData = try? JSONSerialization.data(withJSONObject: prefsData),
               let prefs = try? JSONDecoder().decode(SchedulePreferences.self, from: jsonData) {
                return prefs
            }
            
            return nil
        } catch {
            // print("❌ [SchedulePreferences] Failed to load from remote: \(error)")
            return nil
        }
    }
    
    // MARK: - Save Preferences
    
    func savePreferences() async {
        let prefsToSave = await MainActor.run {
            self.preferences
        }
        
        // Save locally first
        await saveToLocalStorage(prefsToSave)
        
        // Save to cloud if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            do {
                try await saveToRemote(userId: user.uid, preferences: prefsToSave)
                // print("✅ [SchedulePreferences] Saved to cloud")
            } catch {
                // print("❌ [SchedulePreferences] Failed to save to cloud: \(error)")
            }
        }
    }
    
    private func saveToLocalStorage(_ preferences: SchedulePreferences) async {
        if let encoded = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
            // print("✅ [SchedulePreferences] Saved to local storage")
        }
    }
    
    private func saveToRemote(userId: String, preferences: SchedulePreferences) async throws {
        let docRef = db.collection(usersCollection).document(userId)
        
        if let jsonData = try? JSONEncoder().encode(preferences),
           let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
            try await docRef.setData([
                "schedulePreferences": dict,
                "updatedAt": FieldValue.serverTimestamp()
            ], merge: true)
        }
    }
}

// MARK: - New Block Configuration View (matching Chrome extension)

struct NewBlockConfigurationView: View {
    @StateObject private var prefsManager = BlockPreferencesManager.shared
    @StateObject private var schedulePrefsManager = SchedulePreferencesManager.shared
    @StateObject private var authManager = AuthManager.shared
    @EnvironmentObject private var router: NavigationRouter
    
    let onDismissSettings: () -> Void
    
    @State private var feedback: LoginFeedback?
    @State private var showResetAlert = false
    @State private var showSignOutAlert = false
    @State private var showClearDataAlert = false
    
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    private let blockKeys: [BlockKey] = ["A", "B", "C", "D", "E"]
    private let defaultBlockNames: [BlockKey: String] = [
        "A": "A Block",
        "B": "B Block",
        "C": "C Block",
        "D": "D Block",
        "E": "E Block"
    ]
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Content
            ScrollView {
                VStack(spacing: 24) {
                    // Login Card
                    VStack(alignment: .leading, spacing: 16) {
                        if authManager.isAuthenticated, let email = authManager.userEmail {
                            // Signed in state
                            HStack(spacing: 12) {
                                // User initial circle
                                Circle()
                                    .fill(accentGreen.opacity(0.12))
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Text(getUserInitial(from: email))
                                            .font(.system(size: 18, weight: .semibold))
                                            .foregroundColor(accentGreen)
                                    )
                                
                                // Email address
                                Text(email)
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                // Sign out button
                                Button(action: { showSignOutAlert = true }) {
                                    Text("Sign out")
                                        .font(.footnote.weight(.semibold))
                                        .padding(.vertical, 9)
                                        .padding(.horizontal, 14)
                                        .background(Color.red.opacity(0.12))
                                        .foregroundColor(.red)
                                        .cornerRadius(11)
                                }
                                .buttonStyle(.plain)
                            }
                        } else {
                            // Not signed in state
                            HStack {
                                Text("Sign in to sync your schedule across devices.")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                // Sign in button
                                Button(action: {
                                    router.push(.coursesLogin)
                                }) {
                                    Text("Sign in")
                                        .font(.subheadline)
                                        .foregroundColor(accentGreen)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(accentGreen.opacity(0.12))
                                        .cornerRadius(6)
                                }
                            }
                        }
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(8)
                    .padding(.horizontal)
                    .padding(.top)
                    
                    // Conflict Resolution Banner
                    if prefsManager.hasConflict {
                        ConflictResolutionBanner()
                            .padding(.horizontal)
                    }
                    
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Class & Schedule Settings")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                
                                Text("Rename blocks and control how classes appear on Green and White days. Changes save automatically.")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            // Auto-save indicator
                            if case .saving = prefsManager.saveStatus {
                                HStack(spacing: 4) {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Text("Saving…")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            } else if case .success = prefsManager.saveStatus {
                                HStack(spacing: 4) {
                                    Image(systemName: "checkmark")
                                        .font(.caption)
                                    Text("Saved")
                                        .font(.caption)
                                }
                                .foregroundColor(.green)
                            }
                            
                            // Reset Button
                            Button(action: { showResetAlert = true }) {
                                Text("Reset")
                                    .font(.footnote.weight(.semibold))
                                    .padding(.vertical, 9)
                                    .padding(.horizontal, 14)
                                    .background(Color.red.opacity(0.12))
                                    .foregroundColor(.red)
                                    .cornerRadius(11)
                            }
                            .buttonStyle(.plain)
                            .disabled(prefsManager.isLoading || prefsManager.saveStatus == .saving)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top)
                    
                    // Error Message
                    if case .error(let message) = prefsManager.saveStatus {
                        HStack {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.red)
                            Text(message)
                                .font(.subheadline)
                                .foregroundColor(.red)
                            Spacer()
                        }
                        .padding()
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                        .padding(.horizontal)
                    }
                    
                    if prefsManager.isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        // Display Settings
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Display Settings")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 12) {
                                HStack {
                                    Text("Time format")
                                        .font(.subheadline)
                                    
                                    Spacer()
                                    
                                    Picker("Time format", selection: Binding(
                                        get: { schedulePrefsManager.preferences.timeFormat },
                                        set: { newValue in
                                            schedulePrefsManager.preferences.timeFormat = newValue
                                            Task {
                                                await schedulePrefsManager.savePreferences()
                                            }
                                        }
                                    )) {
                                        Text("12-hour").tag(TimeFormat.hour12)
                                        Text("24-hour").tag(TimeFormat.hour24)
                                    }
                                    .pickerStyle(.segmented)
                                    .frame(width: 150)
                                }
                                .padding()
                                .background(Color(UIColor.secondarySystemBackground))
                                .cornerRadius(8)
                            }
                            .padding(.horizontal)
                        }
                        
                        // Class Blocks
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Class Blocks")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 0) {
                                // Table Header
                                HStack(spacing: 0) {
                                    Text("Block")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(width: 50, alignment: .leading)
                                        .padding(.leading, 12)
                                    
                                    Rectangle()
                                        .fill(Color(UIColor.separator))
                                        .frame(width: 1)
                                    
                                    Text("Course name")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.leading, 12)
                                    
                                    Rectangle()
                                        .fill(Color(UIColor.separator))
                                        .frame(width: 1)
                                    
                                    Text("Free")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(width: 50, alignment: .center)
                                    
                                    Rectangle()
                                        .fill(Color(UIColor.separator))
                                        .frame(width: 1)
                                    
                                    Text("Alternating")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(width: 80, alignment: .center)
                                }
                                .padding(.vertical, 12)
                                .background(Color(UIColor.secondarySystemBackground))
                                
                                Divider()
                                
                                // Table Rows
                                ForEach(blockKeys, id: \.self) { key in
                                    BlockPreferenceRow(
                                        blockKey: key,
                                        preference: Binding(
                                            get: { prefsManager.getPreference(for: key) },
                                            set: { newValue in
                                                prefsManager.updatePreference(for: key, preference: newValue)
                                            }
                                        )
                                    )
                                    
                                    if key != blockKeys.last {
                                        Divider()
                                    }
                                }
                            }
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(8)
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.bottom)
            }
        }
        .navigationTitle("Courses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(accentGreen)
            }
        }
        .alert("Reset to Defaults", isPresented: $showResetAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Reset", role: .destructive) {
                handleReset()
            }
        } message: {
            Text("Are you sure you want to reset all settings to defaults? This will erase all your custom block names and preferences.")
        }
        .alert("Sign Out", isPresented: $showSignOutAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Sign Out", role: .destructive) {
                handleSignOut()
            }
        } message: {
            Text("Are you sure you want to sign out? Your changes will stay on this device only and won't sync to other devices.")
        }
        .onAppear {
            Task {
                await prefsManager.loadPreferences()
                await schedulePrefsManager.loadPreferences()
            }
        }
    }
    
    private func handleSignOut() {
        Task {
            do {
                try await authManager.signOut()
                feedback = LoginFeedback(type: .info, message: "Signed out. Changes will now stay on this device only.")
            } catch {
                feedback = LoginFeedback(type: .error, message: "Failed to sign out.")
            }
        }
    }
    
    private func handleReset() {
        prefsManager.resetToDefaults()
        schedulePrefsManager.preferences = SchedulePreferences()
        Task {
            await schedulePrefsManager.savePreferences()
        }
        feedback = LoginFeedback(type: .info, message: "Preferences reset to defaults.")
    }
    
    // Get user's initial from email
    private func getUserInitial(from email: String) -> String {
        guard !email.isEmpty else { return "?" }
        let firstChar = email.prefix(1).uppercased()
        return firstChar
    }
}

// MARK: - Migration Helper (for testing)

extension BlockPreferencesManager {
    /// Clear new format data for testing migration (DEBUG ONLY)
    /// Call this in Xcode debugger: BlockPreferencesManager.clearNewFormatForTesting()
    static func clearNewFormatForTesting() {
        UserDefaults.standard.removeObject(forKey: "blockPreferences")
        UserDefaults.standard.removeObject(forKey: "BlockPreferences_Migrated_v1")
        // print("🧹 [BlockPreferences] Cleared new format - migration will run on next load")
    }
}

// MARK: - Supporting Views for NewBlockConfigurationView

struct AccountStatusHeader: View {
    @ObservedObject var authManager: AuthManager
    let onSignOut: () -> Void
    let onOpenLogin: () -> Void
    
    @State private var signOutPending = false
    
    var body: some View {
        VStack(spacing: 0) {
            if authManager.currentUser == nil {
                // Not initialized or checking
                HStack {
                    Text("Checking sign-in status…")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            } else if let user = authManager.currentUser {
                // Signed in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Signed in as")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(authManager.userIdentity)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        
                        if authManager.needsEmailVerification {
                            Text("Email not verified")
                                .font(.caption)
                                .foregroundColor(.orange)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.2))
                                .cornerRadius(4)
                        }
                    }
                    
                    Spacer()
                    
                    Button(action: {
                        signOutPending = true
                        onSignOut()
                        signOutPending = false
                    }) {
                        Text(signOutPending ? "Signing out…" : "Sign out")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color(UIColor.systemGray5))
                            .cornerRadius(6)
                    }
                    .disabled(signOutPending)
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            } else {
                // Not signed in
                VStack(spacing: 12) {
                    Text("Sign in to sync your schedule and class preferences across devices.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    
                    Button(action: onOpenLogin) {
                        Text("Go to Sign In")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color(red: 20/255, green: 54/255, blue: 27/255))
                            .cornerRadius(8)
                    }
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            }
        }
    }
}

struct FeedbackBanner: View {
    let feedback: LoginFeedback
    
    var body: some View {
        HStack {
            Image(systemName: feedback.type.iconName)
                .foregroundColor(feedback.type.color)
            Text(feedback.message)
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer()
        }
        .padding()
        .background(feedback.type.color.opacity(0.1))
    }
}

struct EmailVerificationBanner: View {
    let onOpenLogin: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your email is not verified. Open the sign-in page to resend the verification email or confirm the link in your inbox.")
                .font(.subheadline)
                .foregroundColor(.primary)
            
            Button(action: onOpenLogin) {
                Text("Manage verification")
                    .font(.subheadline)
                    .foregroundColor(Color(red: 20/255, green: 54/255, blue: 27/255))
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
    }
}

struct NotSignedInBanner: View {
    var body: some View {
        HStack {
            Image(systemName: "info.circle.fill")
                .foregroundColor(.blue)
            Text("Not signed in. Changes are saved to this device only.")
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer()
        }
        .padding()
        .background(Color.blue.opacity(0.1))
    }
}

struct BlockPreferenceRow: View {
    let blockKey: BlockKey
    @Binding var preference: BlockPreference
    
    var body: some View {
        HStack(spacing: 0) {
            // Block Label - just the letter
            Text(blockKey)
                .font(.subheadline)
                .fontWeight(.medium)
                .frame(width: 50, alignment: .leading)
                .padding(.leading, 12)
            
            Rectangle()
                .fill(Color(UIColor.separator))
                .frame(width: 1)
            
            // Course Name Input - takes most space
            if preference.alternating {
                // Alternating mode: show Green and White inputs stacked
                VStack(alignment: .leading, spacing: 6) {
                    // Green day row
                    HStack(spacing: 6) {
                        Text("🟩")
                            .font(.caption2)
                        CourseNameTextField(
                            text: Binding(
                                get: { preference.nameGreen },
                                set: { newValue in
                                    preference.nameGreen = newValue
                                    savePreference()
                                }
                            ),
                            placeholder: "Green day",
                            disabled: preference.freeGreen
                        )
                    }
                    
                    // White day row
                    HStack(spacing: 6) {
                        Text("⬜")
                            .font(.caption2)
                        CourseNameTextField(
                            text: Binding(
                                get: { preference.nameWhite },
                                set: { newValue in
                                    preference.nameWhite = newValue
                                    savePreference()
                                }
                            ),
                            placeholder: "White day",
                            disabled: preference.freeWhite
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
                .padding(.vertical, 6)
            } else {
                // Non-alternating mode: single input
                CourseNameTextField(
                    text: Binding(
                        get: { preference.name },
                        set: { newValue in
                            preference.name = newValue
                            savePreference()
                        }
                    ),
                    placeholder: "Course name",
                    disabled: preference.free
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
            }
            
            Rectangle()
                .fill(Color(UIColor.separator))
                .frame(width: 1)
            
            // Free Checkbox(es)
            if preference.alternating {
                // Alternating mode: show two checkboxes (one for Green, one for White)
                VStack(spacing: 6) {
                    // Green day free checkbox
                    Button(action: {
                        preference.freeGreen.toggle()
                        if preference.freeGreen {
                            preference.nameGreenBackup = preference.nameGreen
                            preference.nameGreen = "Free Block"
                        } else {
                            preference.nameGreen = preference.nameGreenBackup.isEmpty ? "" : preference.nameGreenBackup
                        }
                        savePreference()
                    }) {
                        Image(systemName: preference.freeGreen ? "checkmark.square.fill" : "square")
                            .font(.system(size: 18))
                            .foregroundColor(preference.freeGreen ? .blue : .gray)
                    }
                    .buttonStyle(.plain)
                    
                    // White day free checkbox
                    Button(action: {
                        preference.freeWhite.toggle()
                        if preference.freeWhite {
                            preference.nameWhiteBackup = preference.nameWhite
                            preference.nameWhite = "Free Block"
                        } else {
                            preference.nameWhite = preference.nameWhiteBackup.isEmpty ? "" : preference.nameWhiteBackup
                        }
                        savePreference()
                    }) {
                        Image(systemName: preference.freeWhite ? "checkmark.square.fill" : "square")
                            .font(.system(size: 18))
                            .foregroundColor(preference.freeWhite ? .blue : .gray)
                    }
                    .buttonStyle(.plain)
                }
                .frame(width: 50, alignment: .center)
                .padding(.vertical, 6)
            } else {
                // Non-alternating mode: single checkbox
                Button(action: {
                    preference.free.toggle()
                    if preference.free {
                        preference.nameBackup = preference.name
                        preference.name = "Free Block"
                    } else {
                        preference.name = preference.nameBackup.isEmpty ? "" : preference.nameBackup
                    }
                    savePreference()
                }) {
                    Image(systemName: preference.free ? "checkmark.square.fill" : "square")
                        .font(.system(size: 18))
                        .foregroundColor(preference.free ? .blue : .gray)
                }
                .buttonStyle(.plain)
                .frame(width: 50, alignment: .center)
            }
            
            Rectangle()
                .fill(Color(UIColor.separator))
                .frame(width: 1)
            
            // Alternating Checkbox
            Button(action: {
                preference.alternating.toggle()
                if preference.alternating {
                    // When enabling alternating, copy current name to both fields if they're empty
                    if preference.nameGreen.isEmpty {
                        preference.nameGreen = preference.free ? "" : preference.name
                    }
                    if preference.nameWhite.isEmpty {
                        preference.nameWhite = preference.free ? "" : preference.name
                    }
                    if preference.free {
                        preference.freeGreen = true
                        preference.freeWhite = true
                    }
                }
                savePreference()
            }) {
                Image(systemName: preference.alternating ? "checkmark.square.fill" : "square")
                    .font(.system(size: 18))
                    .foregroundColor(preference.alternating ? .blue : .gray)
            }
            .buttonStyle(.plain)
            .frame(width: 80, alignment: .center)
        }
        .padding(.vertical, 10)
    }
    
    private func savePreference() {
        BlockPreferencesManager.shared.updatePreference(for: blockKey, preference: preference)
    }
}

// Custom TextField with fade gradient when text is truncated
struct CourseNameTextField: View {
    @Binding var text: String
    let placeholder: String
    let disabled: Bool
    @FocusState private var isFocused: Bool
    
    var body: some View {
        ZStack(alignment: .trailing) {
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .disabled(disabled)
                .foregroundColor(disabled ? .secondary : .primary)
                .lineLimit(1)
                .submitLabel(.done)
                .focused($isFocused)
                .onSubmit {
                    // Dismiss keyboard when Done is pressed
                    isFocused = false
                }
            
            // Fade gradient overlay on the right side to indicate text continues
            // This creates a visual fade effect instead of ellipsis
            LinearGradient(
                gradient: Gradient(stops: [
                    .init(color: Color.clear, location: 0.0),
                    .init(color: Color(UIColor.systemBackground).opacity(0.3), location: 0.5),
                    .init(color: Color(UIColor.systemBackground), location: 1.0)
                ]),
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: 25)
            .allowsHitTesting(false)
        }
    }
}

// MARK: - Conflict Resolution Banner

struct ConflictResolutionBanner: View {
    @StateObject private var prefsManager = BlockPreferencesManager.shared
    @State private var isResolving = false
    
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Settings Conflict")
                .font(.headline)
                .foregroundColor(.primary)
            
            Text("Your local settings differ from your account settings. Choose which settings to use.")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            HStack(spacing: 12) {
                // Use Local Button
                Button(action: {
                    isResolving = true
                    Task {
                        await BlockPreferencesManager.shared.useLocalPreferences()
                        isResolving = false
                    }
                }) {
                    Text("Use Local")
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(accentGreen)
                        .cornerRadius(8)
                }
                .disabled(isResolving)
                
                // Use Account Button
                Button(action: {
                    isResolving = true
                    Task {
                        await BlockPreferencesManager.shared.useRemotePreferences()
                        isResolving = false
                    }
                }) {
                    Text("Use Account")
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(accentGreen)
                        .cornerRadius(8)
                }
                .disabled(isResolving)
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(8)
    }
}

#Preview {
    NavigationStack {
        ContentView()
            .environmentObject(NavigationRouter())
            .environmentObject(TimeSettingsModel())
    }
}
