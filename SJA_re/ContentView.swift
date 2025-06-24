//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {
    @State private var noSchool: Bool = false
    @State private var firebaseError: Bool = false
    @State private var isStale: Bool = false
    @State private var refreshID = UUID()
    @State private var isLoading: Bool = true
    @State private var isFirstLaunch: Bool = true
    
    // Background refresh state
    @State private var previousDayType: String = ""
    @State private var previousScheduleBlocks: [Block] = []
    @State private var previousNoSchool: Bool = false
    @State private var scheduleLoaded: Bool = false
    @State private var dayTypeLoaded: Bool = false
    @State private var dragOffset: CGFloat = 0
    @State private var isRefreshReady: Bool = false
    @State private var showSplashScreen: Bool = true
    @State private var isRefreshing: Bool = false
    @State private var triggerDayTypeRipple: Bool = false
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    
    // Visual centering offsets
    private let scheduleOffset: CGFloat = 60
    private let noSchoolOffset: CGFloat = -30
    
    // Set this to a specific Date to test, or nil to use real time
    
//   let testDate: Date? = nil
    
     let testDate: Date? = DateComponents(
         calendar: .current,
         year: 2025,
         month: 5,
         day: 22,
         hour: 11,
         minute: 28
     ).date

    var body: some View {
        ZStack {
            // Main content - always present
            VStack {
                Spacer()
                                 VStack(spacing: 20) {
                     // Only show DayTypeView when there is school
                     if !noSchool {
                         DayTypeView(testDate: testDate, firebaseError: $firebaseError, onLoadingComplete: { 
                             dayTypeLoaded = true 
                         }, triggerRipple: $triggerDayTypeRipple, showSplashScreen: $showSplashScreen)
                             .id(refreshID)
                     }
                     
                     ScheduleView(testDate: testDate, noSchool: $noSchool, isStale: $isStale, loader: scheduleLoader, onLoadingComplete: { 
                         scheduleLoaded = true 
                     }, onPullRefresh: {
                         Task {
                             await refreshAll()
                         }
                     }, showSplashScreen: $showSplashScreen)
                         .id(refreshID)
                         .onAppear {
                             // Reset animation state when view appears
                             scheduleLoader.showBlocks = false
                         }
                 }
                .offset(y: scheduleOffset)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(isLoading ? 0.0 : 1.0)
            .animation(.easeOut(duration: 0.3).delay(isLoading ? 0 : (showSplashScreen ? 0.5 : 0)), value: isLoading)
                
            // Splash screen overlay - only on first launch
            if showSplashScreen && isFirstLaunch {
                SplashScreenView(isLoading: $isLoading, onAnimationComplete: {
                    showSplashScreen = false
                    isFirstLaunch = false
                })
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
            
            // Full-screen loading overlay during refresh (but not during splash)
            if isRefreshing && !showSplashScreen {
                Color.white
                    .ignoresSafeArea(.all)
                    .overlay(
                        ProgressView()
                            .scaleEffect(1.5)
                    )
                    .zIndex(1000)
            }
        }
        .background(Color.clear)
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    // Allow pulling from anywhere on the screen
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                        isRefreshReady = value.translation.height > 80
                    }
                }
                .onEnded { value in
                    // Allow pulling from anywhere on the screen
                    if value.translation.height > 80 {
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
                print("[\(timestamp)] Background refresh started")
                
                // Refresh in background without showing splash or loading indicators
                Task {
                    await backgroundRefresh()
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
            // Initialize previous state on first load
            if isFirstLaunch {
                Task {
                    await refreshAll()
                }
            }
        }
        .preferredColorScheme(.light)
    }
    
    // Update loading state when both views are loaded
    private func updateLoadingState() {
        // On no_school days, only scheduleLoaded matters since DayTypeView is hidden
        let shouldFinishLoading = noSchool ? scheduleLoaded : (scheduleLoaded && dayTypeLoaded)
        
        if shouldFinishLoading {
            print("[\(String(format: "%.3f", Date().timeIntervalSince1970))] Loading completed - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool)")
            
            // Store current state for future background comparisons
            // Note: This is simplified - you'd need to get the actual dayType from DayTypeView
            previousScheduleBlocks = scheduleLoader.blocks
            previousNoSchool = noSchool
            // previousDayType would need to be set from the actual DayTypeView data
            
            isLoading = false
            isRefreshing = false // Also hide the refresh spinner when content is ready
            
            // Only trigger animation if there are blocks to show
            if !noSchool {
                if showSplashScreen {
                    // Small delay after splash screen before blocks slide in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        scheduleLoader.showBlocks = true
                        triggerDayTypeRipple = true
                    }
                } else {
                    // No delay for refresh - immediate animation
                    scheduleLoader.showBlocks = true
                    triggerDayTypeRipple = true
                }
            } else {
                // Trigger ripple for no-school days too
                if showSplashScreen {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        triggerDayTypeRipple = true
                    }
                } else {
                    triggerDayTypeRipple = true
                }
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

#Preview {
    ContentView()
}
