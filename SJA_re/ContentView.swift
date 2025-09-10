//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup
import UserNotifications

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

class NotificationManager: ObservableObject {
    static let shared = NotificationManager()
    
    private init() {}
    
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                print("✅ Notification permission granted")
            } else {
                print("❌ Notification permission denied")
            }
        }
    }
    
    func scheduleBlockEndingNotifications(for blocks: [Block], testDate: Date?) {
        let center = UNUserNotificationCenter.current()
        
        // Remove existing notifications
        center.removeAllPendingNotificationRequests()
        
        // Check if notifications are enabled
        let notificationSettings = NotificationSettingsManager.shared
        guard notificationSettings.notificationsEnabled else {
            print("🔔 [NOTIFICATIONS] Notifications are disabled - not scheduling any")
            return
        }
        
        let currentDate = testDate ?? Date.currentEST
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .medium
        timeFormatter.timeZone = Date.estTimeZone
        
        // Get user's preferred notification timing
        let minutesBeforeEnd = notificationSettings.notificationMinutes
        let secondsBeforeEnd = TimeInterval(minutesBeforeEnd * 60)
        
        print("🔔 [NOTIFICATIONS] Scheduling notifications for \(blocks.count) blocks:")
        print("🔔 [NOTIFICATIONS] User setting: \(minutesBeforeEnd) minute(s) before block ends")
        print("🔔 [NOTIFICATIONS] User's lunch period: \(notificationSettings.selectedLunchPeriod)")
        
        // Debug: Show all block names including sub-blocks
        print("🔔 [DEBUG] All blocks in schedule:")
        for (index, block) in blocks.enumerated() {
            let isLunch = block.name.lowercased().contains("lunch")
            let containsUserLunch = block.name.contains("\(notificationSettings.selectedLunchPeriod)")
            print("🔔   Block \(index + 1): '\(block.name)' (\(block.start) - \(block.end)) - isLunch: \(isLunch), containsUserPeriod: \(containsUserLunch)")
            
            // Show sub-blocks (lunch periods)
            if let subBlocks = block.subBlocks {
                print("🔔     Has \(subBlocks.count) sub-blocks:")
                for (subIndex, subBlock) in subBlocks.enumerated() {
                    let isSubLunch = subBlock.name.lowercased().contains("lunch")
                    let containsUserSubLunch = subBlock.name.contains("\(notificationSettings.selectedLunchPeriod)")
                    print("🔔     SubBlock \(subIndex + 1): '\(subBlock.name)' (\(subBlock.start) - \(subBlock.end)) - isLunch: \(isSubLunch), containsUserPeriod: \(containsUserSubLunch)")
                }
            } else {
                print("🔔     No sub-blocks")
            }
        }
        
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
                
                // Handle regular blocks (not lunch)
                if !block.name.lowercased().contains("lunch") {
                    let blockEndWarning = endTime.addingTimeInterval(-secondsBeforeEnd)
                    if blockEndWarning > Date.currentEST {
                        let nextBlock = (index + 1 < blocks.count) ? blocks[index + 1] : nil
                        let nextBlockText = nextBlock?.name ?? "End of schedule"
                        let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                        
                        allNotifications.append(NotificationEvent(
                            time: blockEndWarning,
                            title: "\(block.name) ending in \(minutesBeforeEnd) \(minuteText)",
                            body: "Up next: \(nextBlockText)",
                            identifier: "block-\(block.id)",
                            type: "block_ending"
                        ))
                    }
                }
                
                // Process sub-blocks (lunch periods)
                if let subBlocks = block.subBlocks {
                    for subBlock in subBlocks {
                        if let subStartTime = parseTime(subBlock.start, for: currentDate),
                           let subEndTime = parseTime(subBlock.end, for: currentDate) {
                            
                            // Handle lunch sub-blocks - ONLY for user's selected lunch period
                            if subBlock.name.lowercased().contains("lunch") && subBlock.name.contains("\(notificationSettings.selectedLunchPeriod)") {
                                print("🔔 [LUNCH DEBUG] Processing user's lunch: \(subBlock.name)")
                                
                                // Add lunch starting notification (skip for 1st lunch)
                                if notificationSettings.selectedLunchPeriod != 1 {
                                    let lunchStartWarning = subStartTime.addingTimeInterval(-secondsBeforeEnd)
                                    print("🔔 [LUNCH DEBUG] Start warning time: \(timeFormatter.string(from: lunchStartWarning))")
                                    
                                    if lunchStartWarning > Date.currentEST {
                                        let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                                        allNotifications.append(NotificationEvent(
                                            time: lunchStartWarning,
                                            title: "\(subBlock.name) starting in \(minutesBeforeEnd) \(minuteText)",
                                            body: "Time to head to lunch!",
                                            identifier: "lunch-start-\(subBlock.id)",
                                            type: "lunch_starting"
                                        ))
                                        print("🔔 [LUNCH DEBUG] ✅ Added lunch start notification")
                                    } else {
                                        print("🔔 [LUNCH DEBUG] ❌ Lunch start time is in the past")
                                    }
                                } else {
                                    print("🔔 [LUNCH DEBUG] ❌ Skipping lunch start (user has 1st lunch)")
                                }
                                
                                // Add lunch ending notification (skip for 5th lunch)
                                if notificationSettings.selectedLunchPeriod != 5 {
                                    let lunchEndWarning = subEndTime.addingTimeInterval(-secondsBeforeEnd)
                                    print("🔔 [LUNCH DEBUG] End warning time: \(timeFormatter.string(from: lunchEndWarning))")
                                    
                                    if lunchEndWarning > Date.currentEST {
                                        let minuteText = minutesBeforeEnd == 1 ? "minute" : "minutes"
                                        allNotifications.append(NotificationEvent(
                                            time: lunchEndWarning,
                                            title: "\(subBlock.name) ending in \(minutesBeforeEnd) \(minuteText)",
                                            body: "Time to head back to class!",
                                            identifier: "lunch-end-\(subBlock.id)",
                                            type: "lunch_ending"
                                        ))
                                        print("🔔 [LUNCH DEBUG] ✅ Added lunch end notification")
                                    } else {
                                        print("🔔 [LUNCH DEBUG] ❌ Lunch end time is in the past")
                                    }
                                } else {
                                    print("🔔 [LUNCH DEBUG] ❌ Skipping lunch end (user has 5th lunch)")
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Sort notifications chronologically
        allNotifications.sort { $0.time < $1.time }
        
        print("🔔 [NOTIFICATIONS] Found \(allNotifications.count) notifications to schedule in chronological order:")
        
        // Schedule all notifications
        for notification in allNotifications {
            let content = UNMutableNotificationContent()
            content.title = notification.title
            content.body = notification.body
            content.sound = .default
            
            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: notification.time.timeIntervalSinceNow,
                repeats: false
            )
            
            let request = UNNotificationRequest(
                identifier: notification.identifier,
                content: content,
                trigger: trigger
            )
            
            print("🔔   ✅ \(notification.type.uppercased()): \(notification.title)")
            print("🔔   ✅ BODY: \(notification.body)")
            print("🔔   ✅ TIME: \(timeFormatter.string(from: notification.time))")
            print("🔔   ✅ SECONDS FROM NOW: \(Int(notification.time.timeIntervalSinceNow))")
            print("🔔   ---")
            
            center.add(request) { error in
                if let error = error {
                    print("❌ Failed to schedule notification: \(error)")
                } else {
                    print("✅ Successfully scheduled \(notification.type)")
                }
            }
        }
        
        // Also print skipped blocks for reference
        for (index, block) in blocks.enumerated() {
            print("🔔 Block \(index + 1): \(block.name) (\(block.start) - \(block.end))")
            
            if let endTime = parseTime(block.end, for: currentDate) {
                let warningTime = endTime.addingTimeInterval(-secondsBeforeEnd)
                if warningTime <= Date.currentEST {
                    print("🔔   ❌ SKIPPING: Warning time \(timeFormatter.string(from: warningTime)) is in the past")
                }
            }
            
            if block.name.lowercased().contains("lunch") {
                if !block.name.contains("\(notificationSettings.selectedLunchPeriod)") {
                    print("🔔   ❌ SKIPPING LUNCH: Not user's lunch period (user has \(notificationSettings.selectedLunchPeriod))")
                } else {
                    if notificationSettings.selectedLunchPeriod == 1 {
                        print("🔔   ❌ SKIPPING LUNCH START: User has 1st lunch (no start notification needed)")
                    }
                    if notificationSettings.selectedLunchPeriod == 5 {
                        print("🔔   ❌ SKIPPING LUNCH END: User has 5th lunch (no end notification needed)")
                    }
                }
            }
        }
    }
    
    func scheduleNotificationsForToday(testDate: Date? = nil) {
        Task {
            do {
                let currentTime = testDate ?? Date.currentEST
                var blocks: [Block] = []
                
                // Check Firebase for schedule type first (same logic as ContentView)
                if try await ScheduleTypeFetcher.isInSpecialPeriod(date: currentTime) {
                    // No school - no notifications needed
                    return
                } else if let type = try await ScheduleTypeFetcher.fetchTypeFor(date: currentTime) {
                    if type == "no_school" {
                        // No school - no notifications needed
                        return
                    } else if type == "custom" {
                        if let customBlocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: currentTime) {
                            blocks = customBlocks
                        }
                    } else {
                        // Load from JSON file
                        let tempLoader = ScheduleLoader()
                        tempLoader.loadSchedule(from: type)
                        blocks = tempLoader.blocks
                    }
                } else {
                    // Load weekday schedule (same logic as ContentView)
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
                        let tempLoader = ScheduleLoader()
                        tempLoader.loadSchedule(from: file)
                        blocks = tempLoader.blocks
                    }
                }
                
                // Schedule notifications for the determined blocks
                await MainActor.run {
                    self.scheduleBlockEndingNotifications(for: blocks, testDate: testDate)
                }
                
            } catch {
                print("❌ Failed to determine schedule for notifications: \(error)")
            }
        }
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
    @State private var previousScheduleBlocks: [Block] = []
    @State private var previousNoSchool: Bool? = false
    @State private var scheduleLoaded: Bool = false
    @State private var dayTypeLoaded: Bool = false
    @State private var dragOffset: CGFloat = 0
    @State private var isRefreshReady: Bool = false
    @State private var isRefreshing: Bool = false
    @State private var triggerDayTypeRipple: Bool = false
    @State private var disablePullToRefreshGesture = false
    @State private var showSettings = false
    @State private var lastOpenedDate: Date? = nil // Track when app was last opened
    @State private var currentDayType: String = "Loading..." // Track current day type for block filtering
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    @StateObject private var notificationManager = NotificationManager.shared
    @ObservedObject private var notificationSettings = NotificationSettingsManager.shared
    @StateObject private var blockManager = BlockSettingsManager.shared
    
    // Visual centering offsets
    private let scheduleOffset: CGFloat = 60
    private let noSchoolOffset: CGFloat = -30
    
    // Dev option: Set this to a specific Date to test, or nil to use real time
    @State private var timeOffset: TimeInterval = 0 // Offset in seconds from real time
    @State private var currentTime = Date.currentEST // Updated by timer to make UI flow
    
    // Computed property that returns the effective current time (real time + offset)
    var effectiveCurrentTime: Date {
        return currentTime.addingTimeInterval(timeOffset)
    }
    
    // For compatibility, convert to optional Date like the old testDate
    var testDate: Date? {
        return timeOffset == 0 ? nil : effectiveCurrentTime
    }
    
//     let testDate: Date? = DateComponents(
//         calendar: .current,
//         year: 2025,
//         month: 5,
//         day: 22,
//         hour: 11,
//         minute: 28
//     ).date

    var body: some View {
        ZStack {
            // Main content - always present
            VStack {
                Spacer()
                                 VStack(spacing: 20) {
                     // Only show content when noSchool state is determined
                     if let isNoSchool = noSchool {
                         // Only show DayTypeView when there is school
                         if !isNoSchool {
                                                      DayTypeView(testDate: testDate, firebaseError: $firebaseError, onLoadingComplete: { 
                             print("🎯 [CONTENT] DayTypeView loading completed")
                             dayTypeLoaded = true 
                         }, triggerRipple: $triggerDayTypeRipple, showSplashScreen: .constant(false), currentDayType: $currentDayType)
                             .id(refreshID)
                     }
                     
                     ScheduleView(testDate: testDate, noSchool: Binding(
                         get: { isNoSchool },
                         set: { noSchool = $0 }
                     ), isStale: $isStale, loader: scheduleLoader, onLoadingComplete: { 
                         print("📋 [CONTENT] ScheduleView loading completed")
                         scheduleLoaded = true 
                     }, onPullRefresh: {
                             Task {
                                 await refreshAll()
                             }
                         }, showSplashScreen: .constant(false), disablePullToRefreshGesture: $disablePullToRefreshGesture, currentDayType: currentDayType)
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
                
            // Simple loading screen
            if isLoading {
                VStack(spacing: 20) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Loading...")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.white)
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
                            .shadow(radius: 4)
                        
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
            VStack {
                HStack {
                    Spacer()
                    Button(action: {
                        showSettings = true
                    }) {
                        Image(systemName: "gearshape.fill")
                            .font(.title2)
                            .foregroundColor(.gray.opacity(0.7))
                            .padding()
                    }
                }
                Spacer()
            }
            .zIndex(500)
            
            // Tomorrow button - bottom right
            // VStack {
            //     Spacer()
            //     HStack {
            //         Spacer()
            //         Button(action: {
            //             // No function for now
            //         }) {
            //             Text("tomorrow >")
            //                 .font(.system(size: 16, weight: .medium))
            //                 .foregroundColor(.white)
            //                 .padding(.horizontal, 16)
            //                 .padding(.vertical, 10)
            //                 .background(getDayTypeColor())
            //                 .cornerRadius(20)
            //         }
            //         .padding(.trailing, 16)
            //         .padding(.bottom, 30)
            //     }
            // }
            // .zIndex(500)
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
                        print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Loading started (pull-to-refresh)")
                        isRefreshing = true
                        Task {
                            await refreshAll()
                            print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Pull-to-refresh completed")
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
                // Reset to actual time whenever app becomes active
                let hadTimeOffset = timeOffset != 0
                if hadTimeOffset {
                    print("🔄 [APP-ACTIVE] Had time offset - resetting to actual time and forcing refresh")
                } else {
                    print("🔄 [APP-ACTIVE] Already using actual time")
                }
                timeOffset = 0
                
                let timestamp = String(format: "%.3f", Date().timeIntervalSince1970)
                print("[\(timestamp)] App became active")
                
                // Check if this is first active of the day
                var calendar = Calendar.current
                calendar.timeZone = Date.estTimeZone
                let today = calendar.startOfDay(for: Date.currentEST)
                let isFirstActiveOfDay = lastOpenedDate == nil || !calendar.isDate(lastOpenedDate!, inSameDayAs: today)
                
                if isFirstActiveOfDay || hadTimeOffset {
                    if isFirstActiveOfDay {
                        print("🌅 [FIRST ACTIVE] First active of the day - showing loading screen")
                    }
                    if hadTimeOffset {
                        print("🔄 [TIME OFFSET RESET] Had time offset - forcing full refresh")
                    }
                    
                    isLoading = true
                    if isFirstActiveOfDay {
                        lastOpenedDate = Date.currentEST
                    }
                    
                    // Full refresh with loading screen
                    Task {
                        await refreshAll()
                    }
                } else {
                    print("📱 [BACKGROUND REFRESH] Not first active - background refresh only")
                    
                    // Reschedule notifications for today with fresh Firebase data
                    notificationManager.scheduleNotificationsForToday(testDate: testDate)
                    
                    // Background refresh without loading screen
                    Task {
                        await backgroundRefresh()
                    }
                }
            }
        }
        .onChange(of: scheduleLoaded) { _ in
            updateLoadingState()
        }
        .onChange(of: dayTypeLoaded) { _ in
            updateLoadingState()
        }
        .onChange(of: timeOffset) { _ in
            // Reschedule notifications when time offset changes
            print("🔔 [TIME-OFFSET] Time offset changed - rescheduling notifications")
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
        }
        .onChange(of: notificationSettings.notificationsEnabled) { _ in
            // Reschedule notifications when enabled/disabled changes
            print("🔔 [NOTIFICATION-ENABLED] Notification enabled changed - rescheduling notifications")
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            if notificationSettings.notificationsEnabled {
                notificationManager.scheduleNotificationsForToday(testDate: testDate)
            }
        }
        .onChange(of: notificationSettings.notificationMinutes) { _ in
            // Reschedule notifications when timing changes
            print("🔔 [NOTIFICATION-MINUTES] Notification minutes changed - rescheduling notifications")
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
        }
        .onChange(of: notificationSettings.selectedLunchPeriod) { _ in
            // Reschedule notifications when lunch period changes
            print("🔔 [LUNCH-PERIOD] Lunch period changed - rescheduling notifications")
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("BlockSettingsChanged"))) { _ in
            // Reschedule notifications when block settings change
            print("🔔 [BLOCK-SETTINGS] Block settings changed - rescheduling notifications")
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
        }
        .onAppear {
            // Reset to actual time on app startup
            print("🔄 [APP-STARTUP] Resetting to actual time")
            timeOffset = 0
            
            // Start timer to update time continuously
            Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                currentTime = Date.currentEST
            }
            
            // Request notification permission
            notificationManager.requestPermission()
            
            // Only schedule notifications for today to avoid stale Firebase data
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
            
            // Check if this is first open of the day
            var calendar = Calendar.current
            calendar.timeZone = Date.estTimeZone
            let today = calendar.startOfDay(for: Date.currentEST)
            let isFirstOpenOfDay = lastOpenedDate == nil || !calendar.isDate(lastOpenedDate!, inSameDayAs: today)
            
            if isFirstOpenOfDay {
                print("🌅 [FIRST OPEN] First open of the day - showing loading screen")
                isLoading = true
                lastOpenedDate = Date.currentEST
            } else {
                print("📱 [SUBSEQUENT OPEN] Not first open of day - no loading screen needed")
                isLoading = false
            }
            
            // Initialize/refresh data
            Task {
                await refreshAll()
            }
        }
        .preferredColorScheme(.light)
        .sheet(isPresented: $showSettings, onDismiss: {
            // Always refresh when settings are dismissed (time offset might have changed)
            print("🔄 [SETTINGS] Settings dismissed - refreshing")
            // Clear old notifications since time might have changed
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
            Task {
                await refreshAll()
            }
        }) {
            SettingsView(timeOffset: $timeOffset, onDismiss: { 
                showSettings = false
            })
        }
    }
    
    // Update loading state when both views are loaded
    private func updateLoadingState() {
        // On no_school days, only scheduleLoaded matters since DayTypeView is hidden
        let shouldFinishLoading = (noSchool == true) ? scheduleLoaded : (scheduleLoaded && dayTypeLoaded)
        
        print("🔄 [CONTENT] updateLoadingState - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool ?? false), shouldFinish: \(shouldFinishLoading)")
        
        if shouldFinishLoading {
            print("🎉 [CONTENT] *** ALL LOADING COMPLETED *** - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool ?? false)")
            
            // Store current state for future background comparisons
            // Note: This is simplified - you'd need to get the actual dayType from DayTypeView
            previousScheduleBlocks = scheduleLoader.blocks
            previousNoSchool = noSchool
            // previousDayType would need to be set from the actual DayTypeView data
            
            isLoading = false
            isRefreshing = false // Also hide the refresh spinner when content is ready
            
            print("🚀 [CONTENT] Setting isLoading = false, will trigger schedule animations")
            
            // Schedule notifications for blocks if there's school
            if noSchool != true && !scheduleLoader.blocks.isEmpty {
                print("📱 [NOTIFICATIONS] Scheduling notifications for \(scheduleLoader.blocks.count) blocks")
                notificationManager.scheduleBlockEndingNotifications(for: scheduleLoader.blocks, testDate: testDate)
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
        print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Background refresh started - checking for changes")
        
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
            print("Background refresh error: \(error)")
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
            print("Background HTML fetch error: \(error)")
            return // Don't update if there's an error
        }
        
        // Compare data to see if anything changed
        let scheduleChanged = !areBlocksEqual(currentBlocks, tempScheduleLoader.blocks) || currentNoSchool != tempNoSchool
        let dayTypeChanged = currentDayType != tempDayType
        
        if scheduleChanged || dayTypeChanged {
            print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Data changed - updating UI")
            print("Schedule changed: \(scheduleChanged), DayType changed: \(dayTypeChanged)")
            
            // Show loading screen for data refresh
            isLoading = true
            
            // Update stored state
            previousDayType = tempDayType
            previousScheduleBlocks = tempScheduleLoader.blocks
            previousNoSchool = tempNoSchool
            
            // Trigger UI refresh
            await refreshAll()
        } else {
            print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] No changes detected - keeping current UI")
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
    func refreshAll() async {
        // Reset loading states
        print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Loading started (refreshAll)")
        isLoading = true
        scheduleLoaded = false
        dayTypeLoaded = false
        noSchool = false
        scheduleLoader.showBlocks = false
        triggerDayTypeRipple = false
        refreshID = UUID()
    }
    
    // Helper function to get day type color for tomorrow button
    private func getDayTypeColor() -> Color {
        let lower = currentDayType.lowercased()
        let isGreenDay = lower.contains("green day") && !lower.contains("white")
        let isWhiteDay = lower.contains("white day") && !lower.contains("green")
        
        if isGreenDay {
            // Green Day - Dark green background (same as DayTypeView)
            return Color(red: 20/255, green: 54/255, blue: 27/255)
        } else if isWhiteDay {
            // White Day - Use a darker color for visibility on button
            return Color(red: 100/255, green: 100/255, blue: 100/255)
        } else {
            // Unknown - Use gray
            return Color.gray.opacity(0.7)
        }
    }
}

struct BlockSettings: Codable {
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
            print("✅ Block settings saved")
            
            // Notify that block settings changed so notifications can be rescheduled
            NotificationCenter.default.post(name: Notification.Name("BlockSettingsChanged"), object: nil)
        }
    }
    
    private func loadSettings() {
        guard let data = UserDefaults.standard.data(forKey: "BlockSettings"),
              let settings = try? JSONDecoder().decode([String: BlockSettings].self, from: data) else {
            print("📱 Using default block settings")
            return
        }
        
        blockA = settings["A"] ?? BlockSettings()
        blockB = settings["B"] ?? BlockSettings()
        blockC = settings["C"] ?? BlockSettings()
        blockD = settings["D"] ?? BlockSettings()
        blockE = settings["E"] ?? BlockSettings()
        print("✅ Block settings loaded")
    }
    
    func getDisplayName(for blockName: String) -> String {
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
}

struct SettingsView: View {
    @Binding var timeOffset: TimeInterval
    let onDismiss: () -> Void
    
    @ObservedObject private var blockManager = BlockSettingsManager.shared
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Done button only
                HStack {
                    Spacer()
                    
                    Button("Done") {
                        onDismiss()
                    }
                    .font(.body)
                    .foregroundColor(.blue)
                }
                .padding(.horizontal, 40)
                .padding(.top, 20)
                
                // Menu items near top
                VStack(spacing: 16) {
                    NavigationLink("Block") {
                        BlockConfigurationView(blockManager: blockManager, onDismissSettings: onDismiss)
                    }
                    .font(.title2)
                    .foregroundColor(.black)
                    .padding()
                    .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                    .cornerRadius(12)
                    
                    NavigationLink("Notifications") {
                        NotificationSettingsView(onDismissSettings: onDismiss)
                    }
                    .font(.title2)
                    .foregroundColor(.black)
                    .padding()
                    .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                    .cornerRadius(12)
                    
                    NavigationLink("Time") {
                        DeveloperOptionsView(timeOffset: $timeOffset, onDismissSettings: onDismiss)
                    }
                    .font(.title2)
                    .foregroundColor(.black)
                    .padding()
                    .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                    .cornerRadius(12)
                }
                .padding(.top, 40)
                
                Spacer()
            }
            .navigationBarHidden(true)
        }
    }
}

struct DeveloperOptionsView: View {
    @Binding var timeOffset: TimeInterval
    let onDismissSettings: () -> Void
    @Environment(\.dismiss) private var dismiss
    
    @State private var customDate = Date()
    @State private var isUsingCustomTime = false
    @State private var currentTime = Date.currentEST // Updated by timer
    @State private var lastCustomDate = Date() // Remember last custom time setting
    @State private var selectedSeconds = 0 // For seconds picker
    @State private var timer: Timer? = nil
    @State private var resetToRealTimeOnOpen = true
    @State private var referenceTime = Date.currentEST // Fixed reference time for offset calculation
    
    // Computed properties for effective time
    var effectiveCurrentTime: Date {
        return currentTime.addingTimeInterval(timeOffset)
    }
    
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Current Time")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    
                    Text(formatDateTime(effectiveCurrentTime))
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.green)
                    
                    if timeOffset != 0 {
                        Text("Offset: \(formatOffset(timeOffset))")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }
            
            Section {
                Toggle("Reset to real time on open", isOn: $resetToRealTimeOnOpen)
                    .onChange(of: resetToRealTimeOnOpen) { newValue in
                        UserDefaults.standard.set(newValue, forKey: "ResetToRealTimeOnOpen")
                        print("🔄 [RESET SETTING] Reset to real time on open: \(newValue)")
                    }
                
                Toggle("Use Custom Time", isOn: $isUsingCustomTime)
                    .onChange(of: isUsingCustomTime) { newValue in
                        // Save the toggle state
                        UserDefaults.standard.set(newValue, forKey: "IsUsingCustomTime")
                        
                        if !newValue {
                            // Reset to actual time when toggle is turned off
                            print("🔄 [TOGGLE] Toggle OFF - resetting to actual time")
                            timeOffset = 0
                        } else {
                            // When toggling on, check if we should reset to real time
                            if resetToRealTimeOnOpen {
                                // Reset custom time to current real time
                                customDate = referenceTime
                                selectedSeconds = 0
                                timeOffset = 0
                                print("🔄 [TOGGLE] Toggle ON with reset enabled - set to current real time")
                            } else {
                                // Calculate offset from reference time
                                let calendar = Calendar.current
                                let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: customDate)
                                if let dateWithoutSeconds = calendar.date(from: components) {
                                    let dateWithSeconds = dateWithoutSeconds.addingTimeInterval(TimeInterval(selectedSeconds))
                                    let offset = dateWithSeconds.timeIntervalSince(referenceTime)
                                    timeOffset = offset
                                    print("🔄 [TOGGLE] Toggle ON - calculated offset: \(offset) seconds")
                                }
                            }
                        }
                    }
                
                if isUsingCustomTime {
                    DatePicker(
                        "Custom Time",
                        selection: $customDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(.wheel)
                    .environment(\.timeZone, Date.estTimeZone)
                    .onChange(of: customDate) { newDate in
                        // Strip seconds from DatePicker and add our selected seconds
                        let calendar = Calendar.current
                        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: newDate)
                        if let dateWithoutSeconds = calendar.date(from: components) {
                            let dateWithSeconds = dateWithoutSeconds.addingTimeInterval(TimeInterval(selectedSeconds))
                            let offset = dateWithSeconds.timeIntervalSince(referenceTime)
                            timeOffset = offset
                            print("🔄 [DATEPICKER] Date changed - calculated offset: \(offset) seconds")
                            
                            // Save the exact time that was SET
                            UserDefaults.standard.set(dateWithSeconds, forKey: "LastCustomTime")
                        }
                    }
                    
                    // Seconds picker
                    HStack {
                        Text("Seconds:")
                            .font(.headline)
                        
                        Picker("Seconds", selection: $selectedSeconds) {
                            ForEach(0..<60, id: \.self) { second in
                                Text("\(second)").tag(second)
                            }
                        }
                        .pickerStyle(WheelPickerStyle())
                        .frame(width: 80, height: 100)
                        .clipped()
                        
                        Spacer()
                    }
                    .onChange(of: selectedSeconds) { newSeconds in
                        // Strip seconds from DatePicker and add our selected seconds
                        let calendar = Calendar.current
                        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: customDate)
                        if let dateWithoutSeconds = calendar.date(from: components) {
                            let dateWithSeconds = dateWithoutSeconds.addingTimeInterval(TimeInterval(newSeconds))
                            let offset = dateWithSeconds.timeIntervalSince(referenceTime)
                            timeOffset = offset
                            print("🔄 [SECONDS] Seconds changed to: \(newSeconds) - calculated offset: \(offset) seconds")
                            
                            // Save the exact time that was SET
                            UserDefaults.standard.set(dateWithSeconds, forKey: "LastCustomTime")
                        }
                    }
                }
            }
        }
        .navigationTitle("Time")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Set white navigation bar background for iOS 16+ compatibility
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor.white
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
            
            // Set reference time for offset calculations
            referenceTime = Date.currentEST
            
            // Start timer to update time display continuously
            timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                currentTime = Date.currentEST
            }
            
            // Load reset setting (default to true if not set)
            if UserDefaults.standard.object(forKey: "ResetToRealTimeOnOpen") == nil {
                resetToRealTimeOnOpen = true
                UserDefaults.standard.set(true, forKey: "ResetToRealTimeOnOpen")
            } else {
                resetToRealTimeOnOpen = UserDefaults.standard.bool(forKey: "ResetToRealTimeOnOpen")
            }
            
            // Always load the last toggle state - don't auto-turn it off
            isUsingCustomTime = UserDefaults.standard.bool(forKey: "IsUsingCustomTime")
            
            // Load last custom date from UserDefaults, or use current time as default
            if let savedCustomTime = UserDefaults.standard.object(forKey: "LastCustomTime") as? Date {
                lastCustomDate = savedCustomTime
                customDate = savedCustomTime
                // Extract seconds from saved time
                let calendar = Calendar.current
                selectedSeconds = calendar.component(.second, from: savedCustomTime)
            } else {
                lastCustomDate = Date.currentEST
                customDate = Date.currentEST
                selectedSeconds = 0
            }
        }
        .onDisappear {
            // Clean up timer when view disappears
            timer?.invalidate()
            timer = nil
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(.blue)
            }
        }
    }
    
    private func formatDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .medium // Changed to medium to include seconds
        formatter.timeZone = Date.estTimeZone
        return formatter.string(from: date)
    }
    
    private func formatOffset(_ offset: TimeInterval) -> String {
        let totalSeconds = Int(offset)
        let hours = totalSeconds / 3600
        let minutes = abs(totalSeconds % 3600) / 60
        let seconds = abs(totalSeconds % 60)
        
        if abs(hours) > 0 {
            return String(format: "%+dh %dm %ds", hours, minutes, seconds)
        } else if abs(totalSeconds) >= 60 {
            return String(format: "%+dm %ds", totalSeconds / 60, seconds)
        } else {
            return String(format: "%+ds", totalSeconds)
        }
    }
}

struct BlockConfigurationView: View {
    @ObservedObject var blockManager: BlockSettingsManager
    let onDismissSettings: () -> Void
    @State private var showValidationAlert = false
    @State private var alertMessage = ""
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        VStack(spacing: 0) {
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
            
            Spacer()
        }
        .navigationTitle("Block")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Set white navigation bar background for iOS 16+ compatibility
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor.white
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(.blue)
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
    
    @Published var notificationsEnabled: Bool = true // Default enabled
    @Published var notificationMinutes: Int = 2 // Default 2 minutes before block ends
    @Published var selectedLunchPeriod: Int = 1 // Default 1st lunch (1-5)
    
    private init() {
        loadSettings()
    }
    
    func saveSettings() {
        UserDefaults.standard.set(notificationsEnabled, forKey: "NotificationsEnabled")
        UserDefaults.standard.set(notificationMinutes, forKey: "NotificationMinutes")
        UserDefaults.standard.set(selectedLunchPeriod, forKey: "SelectedLunchPeriod")
        print("✅ Notification settings saved: enabled=\(notificationsEnabled), minutes=\(notificationMinutes), lunch=\(selectedLunchPeriod)")
    }
    
    private func loadSettings() {
        notificationsEnabled = UserDefaults.standard.object(forKey: "NotificationsEnabled") as? Bool ?? true
        notificationMinutes = UserDefaults.standard.object(forKey: "NotificationMinutes") as? Int ?? 2
        selectedLunchPeriod = UserDefaults.standard.object(forKey: "SelectedLunchPeriod") as? Int ?? 1
        print("✅ Notification settings loaded: enabled=\(notificationsEnabled), minutes=\(notificationMinutes), lunch=\(selectedLunchPeriod)")
    }
}

struct NotificationSettingsView: View {
    @ObservedObject private var notificationManager = NotificationSettingsManager.shared
    let onDismissSettings: () -> Void
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        VStack(spacing: 0) {
            // Header section
            VStack(spacing: 8) {
                Text("Block End Notification")
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
                Toggle("Enable Notifications", isOn: $notificationManager.notificationsEnabled)
                    .font(.headline)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, notificationManager.notificationsEnabled ? 20 : 0)
            
            // Picker section - only show when notifications are enabled
            if notificationManager.notificationsEnabled {
                VStack(spacing: 10) {
                    // Single line with embedded picker
                    HStack(spacing: 4) {
                        Text("Alert me")
                            .font(.headline)
                            .foregroundColor(.primary)
                            .frame(width: 70, alignment: .trailing)
                        
                        Picker("Minutes", selection: $notificationManager.notificationMinutes) {
                            ForEach(1...30, id: \.self) { minutes in
                                Text("\(minutes)").tag(minutes)
                            }
                        }
                        .pickerStyle(WheelPickerStyle())
                        .frame(width: 60, height: 80)
                        .clipped()
                        
                        Text("minute\(notificationManager.notificationMinutes == 1 ? "" : "s") before block ends")
                            .font(.headline)
                            .foregroundColor(.primary)
                            .frame(width: 180, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(UIColor.systemGroupedBackground))
                )
                .padding(.horizontal, 20)
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
        .onAppear {
            // Set white navigation bar background for iOS 16+ compatibility
            let appearance = UINavigationBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor.white
            UINavigationBar.appearance().standardAppearance = appearance
            UINavigationBar.appearance().scrollEdgeAppearance = appearance
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(.blue)
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

#Preview {
    ContentView()
}
