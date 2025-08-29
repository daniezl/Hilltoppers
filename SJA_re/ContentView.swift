//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup
import UserNotifications

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
        
        let currentDate = testDate ?? Date()
        
        for block in blocks {
            if let endTime = parseTime(block.end, for: currentDate) {
                // Calculate 2 minutes before end time
                let warningTime = endTime.addingTimeInterval(-120) // 2 minutes before
                
                // Only schedule if warning time is in the future
                if warningTime > Date() {
                    let content = UNMutableNotificationContent()
                    content.title = "Block Ending Soon"
                    content.body = "\(block.name) ends in 2 minutes"
                    content.sound = .default
                    
                    let trigger = UNTimeIntervalNotificationTrigger(
                        timeInterval: warningTime.timeIntervalSinceNow,
                        repeats: false
                    )
                    
                    let request = UNNotificationRequest(
                        identifier: "block-\(block.id)",
                        content: content,
                        trigger: trigger
                    )
                    
                    center.add(request) { error in
                        if let error = error {
                            print("❌ Failed to schedule notification: \(error)")
                        } else {
                            print("✅ Scheduled notification for \(block.name) at \(warningTime)")
                        }
                    }
                }
            }
        }
    }
    
    func scheduleNotificationsForToday(testDate: Date? = nil) {
        Task {
            do {
                let currentTime = testDate ?? Date()
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
                    let weekday = Calendar.current.component(.weekday, from: currentTime)
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
        
        if let time = formatter.date(from: timeString) {
            let calendar = Calendar.current
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
    @State private var originalTestDate: Date? = nil // Track original value
    @State private var lastOpenedDate: Date? = nil // Track when app was last opened
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    @StateObject private var notificationManager = NotificationManager.shared
    
    // Visual centering offsets
    private let scheduleOffset: CGFloat = 60
    private let noSchoolOffset: CGFloat = -30
    
    // Dev option: Set this to a specific Date to test, or nil to use real time
    @State private var testDate: Date? = nil
    
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
                         }, triggerRipple: $triggerDayTypeRipple, showSplashScreen: .constant(false))
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
                         }, showSplashScreen: .constant(false), disablePullToRefreshGesture: $disablePullToRefreshGesture)
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
            
            // Pull-to-refresh indicator - on top of everything
            if dragOffset > 0 {
                VStack {
                    HStack {
                        Image(systemName: isRefreshReady ? "arrow.clockwise" : "arrow.down")
                            .foregroundColor(isRefreshReady ? .green : .gray)
                            .rotationEffect(.degrees(isRefreshReady ? 360 : 0))
                            .animation(.easeInOut(duration: 0.3), value: isRefreshReady)
                        Text(isRefreshReady ? "Release to refresh" : "Pull to refresh")
                            .font(.caption)
                            .foregroundColor(isRefreshReady ? .green : .gray)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .background(Color.white.opacity(0.9))
                    .cornerRadius(12)
                    .shadow(radius: 4)
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
//            VStack {
//                HStack {
//                    Spacer()
//                    Button(action: {
//                        originalTestDate = testDate // Store current value before opening settings
//                        showSettings = true
//                    }) {
//                        Image(systemName: "gearshape.fill")
//                            .font(.title2)
//                            .foregroundColor(.gray.opacity(0.7))
//                            .padding()
//                    }
//                }
//                Spacer()
//            }
//            .zIndex(500)
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
                let timestamp = String(format: "%.3f", Date().timeIntervalSince1970)
                print("[\(timestamp)] App became active")
                
                // Check if this is first active of the day
                let today = Calendar.current.startOfDay(for: Date())
                let isFirstActiveOfDay = lastOpenedDate == nil || !Calendar.current.isDate(lastOpenedDate!, inSameDayAs: today)
                
                if isFirstActiveOfDay {
                    print("🌅 [FIRST ACTIVE] First active of the day - showing loading screen")
                    isLoading = true
                    lastOpenedDate = Date()
                    
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
        .onAppear {
            // Request notification permission
            notificationManager.requestPermission()
            
            // Only schedule notifications for today to avoid stale Firebase data
            notificationManager.scheduleNotificationsForToday(testDate: testDate)
            
            // Check if this is first open of the day
            let today = Calendar.current.startOfDay(for: Date())
            let isFirstOpenOfDay = lastOpenedDate == nil || !Calendar.current.isDate(lastOpenedDate!, inSameDayAs: today)
            
            if isFirstOpenOfDay {
                print("🌅 [FIRST OPEN] First open of the day - showing loading screen")
                isLoading = true
                lastOpenedDate = Date()
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
            // Only refresh if testDate actually changed
            if originalTestDate != testDate {
                print("🔄 [SETTINGS] Test date changed from \(originalTestDate?.description ?? "nil") to \(testDate?.description ?? "nil") - refreshing")
                // Clear old notifications since date changed
                UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
                Task {
                    await refreshAll()
                }
            } else {
                print("✅ [SETTINGS] No changes - skipping refresh")
            }
        }) {
            SettingsView(testDate: $testDate, onDismiss: { 
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
            let currentTime = testDate ?? Date()
            
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
                let weekday = Calendar.current.component(.weekday, from: currentTime)
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
}

struct SettingsView: View {
    @Binding var testDate: Date?
    let onDismiss: () -> Void
    
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
                
                // Menu items centered
                VStack(spacing: 20) {
                    Spacer()
                    
                    VStack(spacing: 16) {
                        NavigationLink("Developer Options") {
                            DeveloperOptionsView(testDate: $testDate)
                        }
                        .font(.title2)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal, 40)
                    
                    Spacer()
                    Spacer()
                }
            }
            .navigationBarHidden(true)
        }
    }
}

struct DeveloperOptionsView: View {
    @Binding var testDate: Date?
    
    @State private var customDate = Date()
    @State private var isUsingCustomDate = false
    
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Current Time")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    
                    Text(formatDateTime(testDate ?? Date()))
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.blue)
                }
                .padding(.vertical, 4)
            }
            
            Section {
                Toggle("Use Custom Date", isOn: $isUsingCustomDate)
                
                if isUsingCustomDate {
                    DatePicker(
                        "Test Date",
                        selection: $customDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(CompactDatePickerStyle())
                }
            }
            
            Section {
                Button("Set to Custom Time") {
                    testDate = isUsingCustomDate ? customDate : nil
                }
                .disabled(!isUsingCustomDate)
                
                Button("Reset to Actual Time") {
                    testDate = nil
                    isUsingCustomDate = false
                }
            }
        }
        .navigationTitle("Developer Options")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let currentTestDate = testDate {
                customDate = currentTestDate
                isUsingCustomDate = true
            }
        }
    }
    
    private func formatDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

#Preview {
    ContentView()
}
