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
    @State private var scheduleLoaded: Bool = false
    @State private var dayTypeLoaded: Bool = false
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var scheduleLoader = ScheduleLoader()
    
    // Visual centering offset
    private let centerOffset: CGFloat = -35
    
    // Set this to a specific Date to test, or nil to use real time
    
   let testDate: Date? = nil
    
//     let testDate: Date? = DateComponents(
//         calendar: .current,
//         year: 2025,
//         month: 5,
//         day: 23,
//         hour: 9,
//         minute: 02
//     ).date

    var body: some View {
        ZStack {
            // Main content - always present
            VStack(spacing: 0) {
                // Staleness warning banner - at the very top
//                if isStale {
//                    HStack {
//                        Image(systemName: "clock.arrow.circlepath")
//                            .foregroundColor(.orange)
//                        Text("Schedule may be outdated")
//                            .font(.caption)
//                            .foregroundColor(.secondary)
//                        Spacer()
//                        Button("Refresh") {
//                            // Trigger refresh in child views
//                        }
//                        .font(.caption2)
//                        .foregroundColor(.blue)
//                    }
//                    .padding(.horizontal, 16)
//                    .padding(.vertical, 8)
//                    .background(Color.orange.opacity(0.1))
//                }
                
                // Firebase error warning banner
//                if firebaseError {
//                    HStack {
//                        Image(systemName: "exclamationmark.triangle.fill")
//                            .foregroundColor(.orange)
//                        Text("Unable to connect to schedule server")
//                            .font(.caption)
//                            .foregroundColor(.secondary)
//                        Spacer()
//                        Button("Dismiss") {
//                            firebaseError = false
//                        }
//                        .font(.caption2)
//                        .foregroundColor(.blue)
//                    }
//                    .padding(.horizontal, 16)
//                    .padding(.vertical, 8)
//                    .background(Color.orange.opacity(0.1))
//                }
                
                if noSchool {
                    Spacer()
                    Text("No school")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                        .offset(y: centerOffset)
                    Spacer()
                } else {
                    DayTypeView(testDate: testDate, firebaseError: $firebaseError, onLoadingComplete: { 
                        dayTypeLoaded = true 
                    })
                        .id(refreshID)
                    ScheduleView(testDate: testDate, noSchool: $noSchool, isStale: $isStale, loader: scheduleLoader, onLoadingComplete: { 
                        scheduleLoaded = true 
                    })
                        .id(refreshID)
                        .onAppear {
                            // Reset animation state when view appears
                            scheduleLoader.showBlocks = false
                        }
                }
            }
            .opacity(isLoading ? 0.0 : 1.0)
            
            // Loading overlay
            if isLoading {
                Color.white
                    .ignoresSafeArea()
                
                VStack {
                    Spacer()
                        ProgressView()
                            .scaleEffect(1.5)
                    .offset(y: centerOffset)
                    Spacer()
                }
            }
        }
        .refreshable {
            await refreshAll()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                Task {
                    await refreshAll()
                }
            }
        }
        .onChange(of: scheduleLoaded) { _ in
            updateLoadingState()
        }
        .onChange(of: dayTypeLoaded) { _ in
            updateLoadingState()
        }
        .preferredColorScheme(.light)
    }
    
    // Update loading state when both views are loaded
    private func updateLoadingState() {
        if scheduleLoaded && dayTypeLoaded {
            isLoading = false
            
            // Trigger schedule blocks animation immediately after loading completes
            scheduleLoader.showBlocks = true
        }
    }
    
    // Centralized refresh function
    @MainActor
    func refreshAll() async {
        // Reset loading states
        isLoading = true
        scheduleLoaded = false
        dayTypeLoaded = false
        noSchool = false
        scheduleLoader.showBlocks = false
        refreshID = UUID()
    }
}

#Preview {
    ContentView()
}
