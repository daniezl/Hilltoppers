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
        
        let currentDate = testDate ?? Date.currentEST
        
        for (index, block) in blocks.enumerated() {
            if let endTime = parseTime(block.end, for: currentDate) {
                // Calculate 2 minutes before end time
                let warningTime = endTime.addingTimeInterval(-120) // 2 minutes before
                
                // Only schedule if warning time is in the future
                if warningTime > Date.currentEST {
                    // Find the next block
                    let nextBlock = (index + 1 < blocks.count) ? blocks[index + 1] : nil
                    let nextBlockText = nextBlock?.name ?? "End of schedule"
                    
                    let content = UNMutableNotificationContent()
                    content.title = "\(block.name) ending in 2 minutes"
                    content.body = "Up next: \(nextBlockText)"
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
    @State private var originalTestDate: Date? = nil // Track original value
    @State private var lastOpenedDate: Date? = nil // Track when app was last opened
    @State private var currentDayType: String = "Loading..." // Track current day type for block filtering
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    @StateObject private var notificationManager = NotificationManager.shared
    @StateObject private var blockManager = BlockSettingsManager.shared
    
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
                        originalTestDate = testDate // Store current value before opening settings
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
                let hadCustomTime = testDate != nil
                if hadCustomTime {
                    print("🔄 [APP-ACTIVE] Had custom time - resetting to actual time and forcing refresh")
                } else {
                    print("🔄 [APP-ACTIVE] Already using actual time")
                }
                testDate = nil
                
                let timestamp = String(format: "%.3f", Date().timeIntervalSince1970)
                print("[\(timestamp)] App became active")
                
                // Check if this is first active of the day
                var calendar = Calendar.current
                calendar.timeZone = Date.estTimeZone
                let today = calendar.startOfDay(for: Date.currentEST)
                let isFirstActiveOfDay = lastOpenedDate == nil || !calendar.isDate(lastOpenedDate!, inSameDayAs: today)
                
                if isFirstActiveOfDay || hadCustomTime {
                    if isFirstActiveOfDay {
                        print("🌅 [FIRST ACTIVE] First active of the day - showing loading screen")
                    }
                    if hadCustomTime {
                        print("🔄 [CUSTOM TIME RESET] Had custom time - forcing full refresh")
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
        .onAppear {
            // Reset to actual time on app startup
            print("🔄 [APP-STARTUP] Resetting to actual time")
            testDate = nil
            
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
    @Binding var testDate: Date?
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
                    
                    // NavigationLink("Time") {
                    //     DeveloperOptionsView(testDate: $testDate, onDismissSettings: onDismiss)
                    // }
                    // .font(.title2)
                    // .foregroundColor(.black)
                    // .padding()
                    // .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                    // .cornerRadius(12)
                }
                .padding(.top, 40)
                
                Spacer()
            }
            .navigationBarHidden(true)
        }
    }
}

struct DeveloperOptionsView: View {
    @Binding var testDate: Date?
    let onDismissSettings: () -> Void
    @Environment(\.dismiss) private var dismiss
    
    @State private var customDate = Date()
    @State private var isUsingCustomDate = false
    
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Current Time")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    
                    Text(formatDateTime(testDate ?? Date.currentEST))
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.blue)
                }
                .padding(.vertical, 4)
            }
            
            Section {
                Toggle("Use Custom Date", isOn: $isUsingCustomDate)
                    .onChange(of: isUsingCustomDate) { newValue in
                        if !newValue {
                            // Auto-reset to actual time when toggle is turned off
                            print("🔄 [TOGGLE] Toggle OFF - resetting to actual time")
                            testDate = nil
                        } else {
                            // Apply custom date immediately when toggle is turned on
                            print("🔄 [TOGGLE] Toggle ON - applying custom date immediately: \(customDate)")
                            testDate = customDate
                        }
                    }
                
                if isUsingCustomDate {
                    DatePicker(
                        "Test Date",
                        selection: $customDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .datePickerStyle(CompactDatePickerStyle())
                    .environment(\.timeZone, Date.estTimeZone)
                    .onChange(of: customDate) { newDate in
                        // Apply date immediately when picker changes
                        print("🔄 [DATEPICKER] Date changed to: \(newDate) - applying immediately")
                        testDate = newDate
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
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(.blue)
            }
        }
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
        formatter.timeZone = Date.estTimeZone
        return formatter.string(from: date)
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

#Preview {
    ContentView()
}
