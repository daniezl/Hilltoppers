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
    @State private var dragOffset: CGFloat = 0
    @State private var isRefreshReady: Bool = false
    @State private var showSplashScreen: Bool = true
    @State private var isRefreshing: Bool = false
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
         day: 26,
         hour: 11,
         minute: 28
     ).date

    var body: some View {
        ZStack {
            // Main content - always present
            Group {
                if noSchool {
                    Text("No school")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                        .offset(y: noSchoolOffset)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                } else {
                    VStack {
                        Spacer()
                        VStack(spacing: 20) {
                            DayTypeView(testDate: testDate, firebaseError: $firebaseError, onLoadingComplete: { 
                                dayTypeLoaded = true 
                            })
                                .id(refreshID)
                            ScheduleView(testDate: testDate, noSchool: $noSchool, isStale: $isStale, loader: scheduleLoader, onLoadingComplete: { 
                                scheduleLoaded = true 
                            }, onPullRefresh: {
                                Task {
                                    await refreshAll()
                                }
                            })
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
                }
            }
            .opacity(isLoading ? 0.0 : 1.0)
            .animation(.easeOut(duration: 0.3).delay(isLoading ? 0 : (showSplashScreen ? 0.5 : 0)), value: isLoading)
                
            // Splash screen overlay
            if showSplashScreen {
                SplashScreenView(isLoading: $isLoading, onAnimationComplete: {
                    showSplashScreen = false
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
                        isRefreshing = true
                        Task {
                            await refreshAll()
                            print("Pull-to-refresh completed")
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
                isRefreshing = true
                Task {
                    await refreshAll()
                    print("App became active - refresh completed")
                    // Don't set isRefreshing = false here, let updateLoadingState handle it
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
        // On no_school days, only dayTypeLoaded matters
        let shouldFinishLoading = noSchool ? dayTypeLoaded : (scheduleLoaded && dayTypeLoaded)
        
        if shouldFinishLoading {
            print("Loading completed - dayTypeLoaded: \(dayTypeLoaded), scheduleLoaded: \(scheduleLoaded), noSchool: \(noSchool)")
            isLoading = false
            isRefreshing = false // Also hide the refresh spinner when content is ready
            
            // Only trigger animation if there are blocks to show
            if !noSchool {
                scheduleLoader.showBlocks = true
            }
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
