//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct RippleEffect: View {
    let isGreenDay: Bool
    let showRipple: Bool
    @State private var rippleScale: CGFloat = 0.0
    
    var body: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(isGreenDay ? Color(red: 245/255, green: 246/255, blue: 245/255) : Color(red: 20/255, green: 54/255, blue: 27/255))
            .overlay(
                Circle()
                    .fill(isGreenDay ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color(red: 245/255, green: 246/255, blue: 245/255))
                    .scaleEffect(rippleScale)
                    .animation(.easeOut(duration: 0.8), value: rippleScale)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .onAppear {
                rippleScale = 0.0
            }
            .onChange(of: showRipple) { shouldShow in
                if shouldShow {
                    rippleScale = 5.0  // Large enough to fill the rectangle
                }
            }
    }
}

struct PredictionStep {
    let date: Date
    let prediction: String
    let isToday: Bool
}

enum NetworkErrorType {
    case permissionDenied
    case noInternet
    case serverError
    case timeout
    case other(String)
    
    var alertTitle: String {
        switch self {
        case .permissionDenied:
            return "Network Access Required"
        case .noInternet:
            return "No Internet Connection"
        case .serverError:
            return "Server Error"
        case .timeout:
            return "Connection Timeout"
        case .other:
            return "Network Error"
        }
    }
    
    var alertMessage: String {
        switch self {
        case .permissionDenied:
            return "This app needs internet access to load the daily schedule. Please enable WiFi/Cellular access for this app in Settings."
        case .noInternet:
            return "Please check your internet connection and try again."
        case .serverError:
            return "The school server is currently unavailable. Please try again later."
        case .timeout:
            return "The connection is taking too long. Please try again."
        case .other(let message):
            return message
        }
    }
    
    var showSettingsButton: Bool {
        switch self {
        case .permissionDenied:
            return true
        default:
            return false
        }
    }
}


enum DayTypeSource {
    case manualOverride
    case bulletin
    case archiveFallback
    case unknown

    var label: String? {
        switch self {
        case .manualOverride:
            return "Manual override"
        case .archiveFallback:
            return "Predicted from archive"
        case .unknown:
            return "Day type unavailable"
        case .bulletin:
            return nil
        }
    }
}

struct DayTypeView: View {
    let testDate: Date?
    let isViewingTomorrow: Bool
    @Binding var firebaseError: Bool
    let onLoadingComplete: () -> Void
    @Binding var triggerRipple: Bool
    @Binding var showSplashScreen: Bool
    @Binding var currentDayType: String
    @Binding var currentDayTypeDate: Date?
    @State private var htmlTitle = "Loading..."
    @State private var dayType = "Loading..."
    @State private var fullHTML: String? = nil
    @State private var dailyBulletinHTML: String? = nil
    @State private var isDateToday: Bool? = nil
    @State private var showBulletinInfo = false
    @State private var showPredictionDetail = false
    @State private var dbDate: Date? = nil
    @State private var predicted: String = "Loading..."
    @State private var calculationSteps: [PredictionStep]? = nil
    @State private var isLoadingSteps = false
    @State private var hasTriedAutoRefresh = false
    @State private var showColorRipple = false
    @State private var showNetworkErrorAlert = false
    @State private var currentNetworkError: NetworkErrorType?
    @State private var networkRetryCount = 0
    private let maxRetryCount = 3
    @State private var lastRequestTime: Date? = nil
    private let minimumRequestInterval: TimeInterval = 5.0 // 5 seconds between requests
    @State private var showDailyBulletinConfirm = false
    @State private var dayTypeSource: DayTypeSource = .bulletin
    @State private var announcementMessage: String? = nil
    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

    var isWhiteDay: Bool {
        let lower = dayType.lowercased()
        return lower.contains("white day") && !lower.contains("green")
    }
    var isGreenDay: Bool {
        let lower = dayType.lowercased()
        return lower.contains("green day") && !lower.contains("white")
    }

    var displayDayType: String {
        if isGreenDay {
            return "Green Day"
        } else if isWhiteDay {
            return "White Day"
        } else {
            return dayType
        }
    }
    
    // This returns the day type that's actually displayed to the user
    var effectiveDayType: String {
        return isDateToday == false ? predicted : displayDayType
    }

    private var shouldShowOutdatedWarning: Bool {
        return isDateToday == false && !isViewingTomorrow
    }

    var body: some View {
        VStack(spacing: 0) {
            if let announcement = announcementMessage, !announcement.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "megaphone.fill")
                        .foregroundColor(.orange)
                        .font(.system(size: 16))
                    Text(announcement)
                        .font(.callout)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(12)
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 12)
            }
            if isDateToday == false {
                VStack(spacing: 0) {
                    Text(predicted)
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(predicted == "Green Day" ? .white : .black)
                        .onTapGesture {
                            if calculationSteps != nil {
                                showPredictionDetail = true
                            } else {
                                showDailyBulletinConfirm = true
                            }
                        }
                        .padding()
                        .background(
                            RippleEffect(isGreenDay: predicted == "Green Day", showRipple: showColorRipple)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                                .foregroundColor(predicted == "White Day" ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color(white: 0.85))
                                .padding(4) // inset the dashed border
                        )

                    if let sourceLabel = dayTypeSource.label {
                        Text(sourceLabel)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .padding(.top, 6)
                    }
                }
                .padding([.top, .leading, .trailing], 16)
                .padding(.bottom, 0)
                .alert(isPresented: $showBulletinInfo) {
                    Alert(
                        title: Text("\(dayType)"),
                        message: Text("Date: \(bulletinDateString())\n\(daysAwayFromBulletin())"),
                        dismissButton: .default(Text("OK"))
                    )
                }
                .sheet(isPresented: $showPredictionDetail) {
                    PredictionDetailView(
                        dayType: dayType,
                        dbDate: dbDate,
                        testDate: testDate,
                        calculationSteps: calculationSteps,
                        showOutdatedWarning: shouldShowOutdatedWarning,
                        onDismiss: { showPredictionDetail = false }
                    )
                }
            } else {
                Spacer()
                    .frame(height: 24)
                Text(displayDayType)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(isGreenDay ? .white : .black)
                    .onTapGesture {
                        showDailyBulletinConfirm = true
                    }
                    .padding()
                    .background(
                        RippleEffect(isGreenDay: isGreenDay, showRipple: showColorRipple)
                    )
                if let sourceLabel = dayTypeSource.label {
                    Text(sourceLabel)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.top, 6)
                }
            }
        }
        .alert(isPresented: $showNetworkErrorAlert) {
            if let error = currentNetworkError {
                if error.showSettingsButton {
                    return Alert(
                        title: Text(error.alertTitle),
                        message: Text(error.alertMessage + "\n\nDebug: Check console for detailed network logs."),
                        primaryButton: .default(Text("Open Settings")) {
                            openAppSettings()
                        },
                        secondaryButton: .cancel(Text("Force Retry")) {
                            forceRetryFetch()
                        }
                    )
                } else {
                    return Alert(
                        title: Text(error.alertTitle),
                        message: Text(error.alertMessage + "\n\nDebug: Check console for detailed network logs."),
                        primaryButton: .default(Text("Force Retry")) {
                            forceRetryFetch()
                        },
                        secondaryButton: .cancel(Text("Use Offline")) {
                            useFallbackData()
                        }
                    )
                }
            } else {
                return Alert(title: Text("Error"), message: Text("An unknown error occurred."), dismissButton: .default(Text("OK")))
            }
        }
        .onAppear {
            print("🎯 [DAYTYPE] ========== DAYTYPE VIEW APPEARED ==========")
            print("🎯 [DAYTYPE] Splash screen showing: \(showSplashScreen)")
            print("🎯 [DAYTYPE] Test date: \(testDate?.description ?? "nil")")
            
            // Skip unnecessary network tests - just fetch what we need
            
            self.htmlTitle = "Loading..."
            self.dayType = "Loading..."
            self.isDateToday = nil
            self.hasTriedAutoRefresh = false
            self.showColorRipple = false
            self.networkRetryCount = 0
            self.currentDayTypeDate = nil
            
            // Much shorter delay - just enough for UI setup
            let delay: UInt64 = showSplashScreen ? 200_000_000 : 0 // 0.2s or immediate
            
            if showSplashScreen {
                print("⏳ [DAYTYPE] Splash screen showing - minimal delay of 0.2s")
            } else {
                print("🚀 [DAYTYPE] No splash screen - fetching immediately")
            }
            
            print("🚀 [DAYTYPE] Starting day type fetch...")
            self.startDayTypeFetch(afterDelay: delay)
        }
        .onChange(of: dayType) { newDayType in
            // Auto-refresh if we get "Please Refresh" and haven't tried yet
            // But don't trigger refresh loading state during initial splash
            if newDayType == "Please Refresh" && !hasTriedAutoRefresh {
                hasTriedAutoRefresh = true
                // print("Auto-refreshing due to 'Please Refresh' state")
                
                // Wait a moment then try again (without triggering isRefreshing)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    self.startDayTypeFetch()
                }
            }
        }
        .onChange(of: predicted) { newPredicted in
            // Auto-refresh if prediction shows "Please Refresh" and haven't tried yet
            if newPredicted == "Please Refresh" && !hasTriedAutoRefresh {
                hasTriedAutoRefresh = true
                // print("Auto-refreshing due to prediction 'Please Refresh' state")
                
                // Wait a moment then try again
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    self.startDayTypeFetch()
                }
            }
        }
        .onChange(of: triggerRipple) { shouldTrigger in
            if shouldTrigger {
                showColorRipple = true
            }
        }
        .onChange(of: dayType) { newDayType in
            // If we get "Please Refresh", reset everything completely
            if newDayType == "Please Refresh" {
                showColorRipple = false
                // Reset the trigger in ContentView too, but don't trigger refresh loading during splash
                DispatchQueue.main.async {
                    triggerRipple = false
                    // Only trigger refresh loading if splash screen is not showing
                    if !showSplashScreen {
                        // This would be where we'd trigger isRefreshing, but we don't have access here
                        // The auto-refresh will handle it without showing the loading overlay
                    }
                }
            } else {
                // For normal day type changes, just reset ripple
                showColorRipple = false
                // Reset the trigger in ContentView too
                DispatchQueue.main.async {
                    triggerRipple = false
                }
            }
        }
        .onChange(of: predicted) { newPredicted in
            // If prediction shows "Please Refresh", reset everything completely
            if newPredicted == "Please Refresh" {
                showColorRipple = false
                // Reset the trigger in ContentView too
                DispatchQueue.main.async {
                    triggerRipple = false
                }
            } else {
                // For normal prediction changes, just reset ripple
                showColorRipple = false
                // Reset the trigger in ContentView too
                DispatchQueue.main.async {
                    triggerRipple = false
                }
            }
        }
        .onChange(of: effectiveDayType) { newEffectiveDayType in
            // Update the shared day type state in ContentView with the actually displayed day type
            currentDayType = newEffectiveDayType
        }
        .onAppear {
            // Initialize the shared day type state with the effective day type
            currentDayType = effectiveDayType
        }
        .alert("Do you want to go to the Daily Bulletin?", isPresented: $showDailyBulletinConfirm) {
            Button("Yes") {
                openDailyBulletin()
            }
            Button("No", role: .cancel) { }
        }
    }

    private func openAppSettings() {
        if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
            if UIApplication.shared.canOpenURL(settingsUrl) {
                UIApplication.shared.open(settingsUrl)
            }
        }
    }
    
    private func openDailyBulletin() {
        if let bulletinUrl = URL(string: schoolURL) {
            if UIApplication.shared.canOpenURL(bulletinUrl) {
                UIApplication.shared.open(bulletinUrl)
            }
        }
    }
    
    
    private func analyzeNetworkError(_ error: Error) -> NetworkErrorType {
        let nsError = error as NSError
        print("🔍 [DAYTYPE] Network error details - Code: \(nsError.code), Domain: \(nsError.domain), Description: \(nsError.localizedDescription)")
        
        // Check for specific network permission/access errors
        switch nsError.code {
        case NSURLErrorNotConnectedToInternet:
            // This could be either no internet or permission denied
            // Check retry count to differentiate
            if networkRetryCount < 2 {
                return .noInternet
            } else {
                return .permissionDenied
            }
        case NSURLErrorTimedOut:
            return .timeout
        case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost:
            return .serverError
        case NSURLErrorUserCancelledAuthentication, NSURLErrorUserAuthenticationRequired:
            return .permissionDenied
        case NSURLErrorDataNotAllowed:
            return .permissionDenied
        case NSURLErrorNetworkConnectionLost:
            // This is error -1005: connection established but then dropped
            // Often caused by server-side rejection or firewall
            print("🔍 [DAYTYPE] Connection lost error - server may be rejecting requests")
            return .serverError
        case NSURLErrorSecureConnectionFailed:
            return .serverError
        default:
            if nsError.domain == NSURLErrorDomain {
                return .other("Network error: \(nsError.localizedDescription)")
            } else {
                return .other("Unknown error: \(nsError.localizedDescription)")
            }
        }
    }

    func testConnectivity() {
        print("🌐 [CONNECTIVITY] ========== TESTING CONNECTIVITY ==========")
        
        // Test multiple endpoints to check connectivity
        let testURLs = [
            "https://www.google.com",
            "https://www.apple.com", 
            "https://httpbin.org/get"
        ]
        
        for (index, testURL) in testURLs.enumerated() {
            guard let url = URL(string: testURL) else { continue }
            
            print("🌐 [CONNECTIVITY] Testing endpoint \(index + 1): \(testURL)")
            
            Task {
                do {
                    let startTime = Date()
                    let (data, response) = try await URLSession.shared.data(from: url)
                    let endTime = Date()
                    let duration = endTime.timeIntervalSince(startTime)
                    
                    if let httpResponse = response as? HTTPURLResponse {
                        print("✅ [CONNECTIVITY] Test \(index + 1) SUCCESS - Status: \(httpResponse.statusCode), Duration: \(String(format: "%.2f", duration))s, Data: \(data.count) bytes")
                    } else {
                        print("❌ [CONNECTIVITY] Test \(index + 1) FAILED - No HTTP response")
                    }
                } catch {
                    print("❌ [CONNECTIVITY] Test \(index + 1) FAILED: \(error)")
                    print("❌ [CONNECTIVITY] Error details - Domain: \((error as NSError).domain), Code: \((error as NSError).code)")
                }
            }
        }
    }
    
    func testSimpleDomain() {
        print("🧪 [TEST] Testing main school domain...")
        
        Task {
            do {
                let testURL = URL(string: "https://stjacademy.org")!
                var request = URLRequest(url: testURL)
                request.timeoutInterval = 5.0
                
                // Same Chrome headers for domain test
                request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
                
                let (_, response) = try await URLSession.shared.data(for: request)
                
                if let httpResponse = response as? HTTPURLResponse {
                    print("✅ [TEST] Main domain works! Status: \(httpResponse.statusCode)")
                }
            } catch {
                print("❌ [TEST] Main domain failed: \(error)")
            }
        }
    }
    

    private func startDayTypeFetch(afterDelay delay: UInt64 = 0) {
        Task {
            if delay > 0 {
                do {
                    try await Task.sleep(nanoseconds: delay)
                } catch {
                    print("⚠️ [DAYTYPE] Delay sleep cancelled - proceeding")
                }
            }

            await MainActor.run {
                self.announcementMessage = nil
                self.dayTypeSource = .bulletin
                self.currentDayTypeDate = nil
            }

            // 清除缓存以确保获取最新数据
            CloudflareDataLoader.clearCache()
            print("🗑️ [DAYTYPE] Cleared Cloudflare cache")

            let referenceDate = self.testDate ?? Date()
            if await loadManualOverride(for: referenceDate) {
                return
            }

            fetchHTML(from: schoolURL)
        }
    }

    private func loadManualOverride(for referenceDate: Date) async -> Bool {
        do {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = Date.estTimeZone
            let dateString = formatter.string(from: referenceDate)

            // 从 Cloudflare 加载 special_days 数据
            guard let cloudflareData = try await CloudflareDataLoader.loadSpecialDays(),
                  let dayData = cloudflareData[dateString] else {
                return false
            }

            // 读取 banner 信息
            let rawAnnouncementValue = dayData.banner
            let rawAnnouncement = rawAnnouncementValue?.trimmingCharacters(in: .whitespacesAndNewlines)
            await MainActor.run {
                if let announcement = rawAnnouncement, !announcement.isEmpty {
                    self.announcementMessage = announcement
                } else {
                    self.announcementMessage = nil
                }
            }

            // 优先使用 type 字段，如果没有则使用 color 字段
            let normalized: String?
            if let typeValue = dayData.type {
                // 如果 type 是 "no_school" 或 "custom"，这些不是标准的 day type，跳过
                if typeValue == "no_school" || typeValue == "custom" {
                    return false
                }
                // 尝试从 type 字段解析 day type
                normalized = normalizedStandardDayType(from: typeValue)
                if normalized != nil {
                    await MainActor.run {
                        print("🧭 [DAYTYPE] Using manual override type '\(typeValue)' -> '\(normalized!)'")
                    }
                }
            } else if let colorValue = dayData.color {
                // 如果没有 type，使用 color 字段
                normalized = normalizedStandardDayType(from: colorValue)
                if normalized != nil {
                    await MainActor.run {
                        print("🧭 [DAYTYPE] Using manual override color '\(colorValue)' -> '\(normalized!)'")
                    }
                }
            } else {
                // 既没有 type 也没有 color，无法确定 day type
                return false
            }

            guard let finalNormalized = normalized else {
                print("⚠️ [DAYTYPE] Manual override type/color not recognized")
                return false
            }

            await MainActor.run {
                self.dayTypeSource = .manualOverride
                self.dayType = finalNormalized
                self.predicted = finalNormalized
                self.dbDate = referenceDate
                self.isDateToday = true
                self.firebaseError = false
                self.calculationSteps = nil
                self.showNetworkErrorAlert = false
                self.currentNetworkError = nil
                self.finishLoading()
            }
            return true
        } catch {
            print("❌ [DAYTYPE] Failed to load manual override: \(error)")
            return false
        }
    }


    func fetchHTML(from urlString: String) {
        print("🌐 [SIMPLE] Fetching: \(urlString)")
        
        // First test just the main domain
        testSimpleDomain()
        
        guard let url = URL(string: urlString) else {
            print("❌ [SIMPLE] Bad URL")
            return
        }
        
        Task {
            do {
                // Create request that looks exactly like Chrome
                var request = URLRequest(url: url)
                request.timeoutInterval = 5.0  // Back to reasonable timeout
                
                // Chrome headers to bypass app blocking
                request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
                request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8", forHTTPHeaderField: "Accept")
                request.setValue("gzip, deflate, br", forHTTPHeaderField: "Accept-Encoding")
                request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
                request.setValue("1", forHTTPHeaderField: "Upgrade-Insecure-Requests")
                request.setValue("navigate", forHTTPHeaderField: "Sec-Fetch-Mode")
                request.setValue("document", forHTTPHeaderField: "Sec-Fetch-Dest")
                request.setValue("none", forHTTPHeaderField: "Sec-Fetch-Site")
                request.setValue("?1", forHTTPHeaderField: "Sec-Ch-Ua-Mobile")
                
                print("🌐 [SIMPLE] Using Chrome headers to bypass blocking")
                
                let (data, response) = try await URLSession.shared.data(for: request)
                
                // Check response
                if let httpResponse = response as? HTTPURLResponse {
                    print("📡 [SIMPLE] Status: \(httpResponse.statusCode)")
                }
                guard let html = String(data: data, encoding: .utf8) else {
                    print("❌ [SIMPLE] Can't convert data to string")
                    return
                }
                
                print("✅ [SIMPLE] Got HTML data: \(data.count) bytes")
                
                // Just parse and print what we find
                await MainActor.run {
                    self.parseAndPrintDayType(html)
                }
                
            } catch {
                print("❌ [SIMPLE] Error: \(error)")
                let nsError = error as NSError
                print("❌ [SIMPLE] Error code: \(nsError.code)")
                print("❌ [SIMPLE] Error domain: \(nsError.domain)")
                
                if nsError.code == -1001 {
                    print("💡 [SIMPLE] This is a timeout - school server is likely blocking mobile apps")
                } else if nsError.code == -1005 {
                    print("💡 [SIMPLE] Connection lost - server rejected the request")
                }
                await MainActor.run {
                    self.useFallbackData()
                }
            }
        }
    }
    
    func parseAndPrintDayType(_ html: String) {
        print("🔍 [SIMPLE] Parsing HTML for day type and date...")
        
        do {
            let doc = try SwiftSoup.parse(html)
            
            // First, find the bulletin date
            let bulletinDate = self.extractDBDate(from: html)
            print("📅 [SIMPLE] Bulletin date: \(bulletinDate?.description ?? "not found")")
            
            // Check all h4 elements for day type
            let h4s = try doc.select("h4")
            print("📋 [SIMPLE] Found \(h4s.count) h4 elements")
            
            var foundDayType: String? = nil
            
            for (index, h4) in h4s.enumerated() {
                let text = try h4.text()
                print("📝 [SIMPLE] H4 #\(index + 1): '\(text)'")
                
                if text.lowercased().contains("green day") {
                    print("✅ [SIMPLE] FOUND GREEN DAY!")
                    foundDayType = "Green Day"
                    break
                } else if text.lowercased().contains("white day") {
                    print("✅ [SIMPLE] FOUND WHITE DAY!")
                    foundDayType = "White Day"
                    break
                }
            }
            
            guard let dayType = foundDayType else {
                print("❌ [SIMPLE] No day type found in h4 elements - attempting archive fallback")
                self.tryFallbackUsingArchive()
                return
            }
            
            // Set the day type we found
            self.dayType = dayType
            
            if !isStandardDayType(dayType) {
                print("⚠️ [SIMPLE] Day type '\(dayType)' is not a standard Green/White day - attempting archive fallback")
                self.tryFallbackUsingArchive()
                return
            }
            
            // Now check if we need to predict (bulletin date != today)
            if let dbDate = bulletinDate {
                self.dbDate = dbDate
                let today = self.testDate ?? Date()
                let isToday = Calendar.current.isDate(dbDate, inSameDayAs: today)
                self.isDateToday = isToday
                
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                print("📊 [SIMPLE] Bulletin: \(formatter.string(from: dbDate)), Today: \(formatter.string(from: today)), Same? \(isToday)")
                
                if !isToday {
                    print("🔮 [SIMPLE] Need to predict - bulletin is from different day")
                    self.generateSimplePrediction(bulletinDayType: dayType, bulletinDate: dbDate)
                } else {
                    print("✅ [SIMPLE] Bulletin is from today - no prediction needed")
                    self.finishLoading()
                }
            } else {
                print("⚠️ [SIMPLE] No bulletin date found - assuming today")
                self.isDateToday = true
                self.finishLoading()
            }
            
        } catch {
            print("❌ [SIMPLE] Parse error: \(error)")
            self.useFallbackData()
        }
    }
    
    private func tileShadowColor(isGreen: Bool) -> Color {
        return isGreen ? Color.black.opacity(0.3) : Color.black.opacity(0.15)
    }

    private func isStandardDayType(_ text: String) -> Bool {
        return normalizedStandardDayType(from: text) != nil
    }

    private func normalizedStandardDayType(from text: String) -> String? {
        let lower = text.lowercased()
        let containsGreenDay = lower.contains("green day")
        let containsWhiteDay = lower.contains("white day")
        if containsGreenDay && !containsWhiteDay {
            return "Green Day"
        }
        if containsWhiteDay && !containsGreenDay {
            return "White Day"
        }
        let containsGreen = lower.contains("green")
        let containsWhite = lower.contains("white")
        if containsGreen && !containsWhite {
            return "Green Day"
        }
        if containsWhite && !containsGreen {
            return "White Day"
        }
        return nil
    }

    private func tryFallbackUsingArchive() {
        print("🧭 [SIMPLE] Attempting to recover day type from archive list")
        Task {
            let referenceDate = self.testDate ?? Date()
            do {
                if let fallback = try await fetchLatestKnownDayType(before: referenceDate) {
                    await MainActor.run {
                        print("🧭 [SIMPLE] Using fallback day type '\(fallback.type)' from \(fallback.date)")
                        self.dayTypeSource = .archiveFallback
                        self.dayType = fallback.type
                        self.dbDate = fallback.date
                        self.isDateToday = false
                        self.generateSimplePrediction(bulletinDayType: fallback.type, bulletinDate: fallback.date)
                    }
                } else {
                    await MainActor.run {
                        print("❌ [SIMPLE] Archive fallback did not find a usable day type")
                        self.useFallbackData()
                    }
                }
            } catch {
                await MainActor.run {
                    print("❌ [SIMPLE] Archive fallback failed: \(error)")
                    self.useFallbackData()
                }
            }
        }
    }

    private func fetchLatestKnownDayType(before referenceDate: Date) async throws -> (type: String, date: Date)? {
        let html = try await fetchArchiveHTML()
        let doc = try SwiftSoup.parse(html)
        let cards = try doc.select("div.news-card")

        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone

        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d, yyyy"
        formatter.timeZone = Date.estTimeZone

        for card in cards.array() {
            guard let dateText = try card.select("p.date").first()?.text().trimmingCharacters(in: .whitespacesAndNewlines),
                  let date = formatter.date(from: dateText) else {
                continue
            }

            if calendar.isDate(date, inSameDayAs: referenceDate) || date > referenceDate {
                continue
            }

            guard let excerpt = try card.select("p.excerpt").first()?.text().trimmingCharacters(in: .whitespacesAndNewlines),
                  let normalized = normalizedStandardDayType(from: excerpt) else {
                continue
            }

            return (normalized, date)
        }

        return nil
    }

    private func fetchArchiveHTML() async throws -> String {
        guard let url = URL(string: schoolURL) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 5.0
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8", forHTTPHeaderField: "Accept")
        request.setValue("gzip, deflate, br", forHTTPHeaderField: "Accept-Encoding")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        request.setValue("1", forHTTPHeaderField: "Upgrade-Insecure-Requests")
        request.setValue("navigate", forHTTPHeaderField: "Sec-Fetch-Mode")
        request.setValue("document", forHTTPHeaderField: "Sec-Fetch-Dest")
        request.setValue("none", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("?1", forHTTPHeaderField: "Sec-Ch-Ua-Mobile")

        let (data, _) = try await URLSession.shared.data(for: request)
        guard let html = String(data: data, encoding: .utf8) else {
            throw URLError(.cannotDecodeRawData)
        }
        return html
    }

    func generateSimplePrediction(bulletinDayType: String, bulletinDate: Date) {
        print("🎯 [SIMPLE] Generating prediction...")
        
        Task {
            do {
                let steps = try await ScheduleTypeFetcher.generateCalculationSteps(
                    dbDayType: bulletinDayType,
                    dbDate: bulletinDate,
                    testDate: self.testDate
                )
                
                await MainActor.run {
                    print("✅ [SIMPLE] Got \(steps.count) prediction steps")
                    
                    // Cache the steps
                    self.calculationSteps = steps.map { step in
                        PredictionStep(
                            date: step.date,
                            prediction: step.prediction,
                            isToday: step.isToday
                        )
                    }
                    
                    // Find today's prediction
                    self.predicted = self.getTodaysPrediction() ?? "Unknown"
                    print("🎯 [SIMPLE] Today's prediction: '\(self.predicted)'")
                    self.firebaseError = false
                    
                    self.finishLoading()
                }
            } catch {
                print("❌ [SIMPLE] Prediction failed: \(error)")
                await MainActor.run {
                    self.predicted = "Please Refresh"
                    self.firebaseError = true
                    self.finishLoading()
                }
            }
        }
    }
    
    
    func processSuccessfulHTML(_ html: String) {
        print("🔄 [DAYTYPE] ========== PROCESSING HTML ===========")
        
        // Reset retry count on successful request
        self.networkRetryCount = 0
        
        self.fullHTML = html
        let trimmedHTML = self.extractDailyBulletinSection(from: html)
        self.dailyBulletinHTML = trimmedHTML
        
        print("🔍 [DAYTYPE] Trimmed HTML found: \(trimmedHTML != nil)")
        if let trimmed = trimmedHTML {
            print("🔍 [DAYTYPE] Trimmed HTML preview (first 200 chars): \(String(trimmed.prefix(200)))")
        }
        
        self.htmlTitle = self.getTitleFromHTML(html: trimmedHTML ?? html)
        self.dayType = self.getDayTypeFromHTML(html: trimmedHTML ?? html)
        print("📅 [DAYTYPE] Parsed day type: '\(self.dayType)'")
        self.dayTypeSource = .bulletin
        
        self.dbDate = self.extractDBDate(from: trimmedHTML ?? html)
        print("📆 [DAYTYPE] Extracted DB date: \(self.dbDate?.description ?? "nil")")
        
        if let dbDate = self.dbDate {
            let calendar = Calendar.current
            let today = self.testDate ?? Date()
            self.isDateToday = calendar.isDate(dbDate, inSameDayAs: today)
            
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            print("🔍 [DAYTYPE] DB date: \(formatter.string(from: dbDate)), Today: \(formatter.string(from: today)), isToday: \(self.isDateToday ?? false)")
            
            if self.isDateToday == false {
                print("🔮 [DAYTYPE] Generating prediction for future date...")
                self.generatePrediction(for: dbDate)
            } else {
                print("📅 [DAYTYPE] DB date is today - no prediction needed")
                self.firebaseError = false
                self.finishLoading()
            }
        } else {
            print("⚠️ [DAYTYPE] No DB date found - using fallback")
            self.useFallbackData()
        }
    }
    
    func generatePrediction(for dbDate: Date) {
        print("📊 [DAYTYPE] ========== GENERATING PREDICTION ===========")
        
        Task {
            do {
                print("📊 [DAYTYPE] Calling Firebase generateCalculationSteps...")
                let steps = try await ScheduleTypeFetcher.generateCalculationSteps(
                    dbDayType: self.dayType,
                    dbDate: dbDate,
                    testDate: self.testDate
                )
                
                await MainActor.run {
                    print("✅ [DAYTYPE] Received \(steps.count) calculation steps from Firebase")
                    // Cache the steps
                    self.calculationSteps = steps.map { step in
                        PredictionStep(
                            date: step.date,
                            prediction: step.prediction,
                            isToday: step.isToday
                        )
                    }
                    
                    // Get today's prediction from the cached steps
                    self.predicted = self.getTodaysPrediction() ?? "Unknown"
                    print("🎯 [DAYTYPE] Today's prediction: '\(self.predicted)'")
                    self.firebaseError = false
                    
                    self.finishLoading()
                }
            } catch {
                print("❌ [DAYTYPE] Firebase prediction failed: \(error)")
                await MainActor.run {
                    self.predicted = "Please Refresh"
                    self.firebaseError = true
                    self.finishLoading()
                }
            }
        }
    }
    
    func useFallbackData() {
        print("🔄 [SIMPLE] Network failed - showing Unknown")
        
        // Since we can't fetch real data, show Unknown
        self.dayType = "Unknown"
        self.dayTypeSource = .unknown
        self.dbDate = nil
        self.isDateToday = true  // Show as solid box (not dashed) since we can't predict
        self.predicted = "Unknown"
        self.firebaseError = false
        
        print("📅 [SIMPLE] Set day type to: Unknown (network failure)")
        
        self.finishLoading()
    }
    
    func forceRetryFetch() {
        print("🔄 [DAYTYPE] ========== FORCE RETRY REQUESTED ===========")
        self.networkRetryCount = 0 // Reset retry count
        self.currentNetworkError = nil
        self.showNetworkErrorAlert = false
        
        // Add a small delay to ensure UI updates
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            print("🔄 [DAYTYPE] Executing force retry...")
            self.startDayTypeFetch()
        }
    }
    
    func finishLoading() {
        print("✅ [DAYTYPE] ========== FINISHING LOAD ===========")
        print("✅ [DAYTYPE] Final day type: '\(self.dayType)'")
        print("✅ [DAYTYPE] Final prediction: '\(self.predicted)'")
        print("✅ [DAYTYPE] Is today: \(self.isDateToday ?? false)")
        
        let defaults = UserDefaults.standard
        let referenceDate = self.testDate ?? Date()
        let effectiveType = self.effectiveDayType
        self.currentDayTypeDate = referenceDate
        defaults.set(effectiveType, forKey: "LastEffectiveDayType")
        defaults.set(referenceDate, forKey: "LastEffectiveDayDate")
        defaults.set(self.predicted, forKey: "LastPredictedDayType")
        defaults.set(referenceDate, forKey: "LastPredictedDayDate")
        if let dbDate = self.dbDate {
            defaults.set(dbDate, forKey: "LastBulletinDate")
            defaults.set(self.dayType, forKey: "LastBulletinDayType")
        } else {
            defaults.removeObject(forKey: "LastBulletinDate")
            defaults.removeObject(forKey: "LastBulletinDayType")
        }
        print("💾 [DAYTYPE] Cached effective day type '\(effectiveType)' for \(referenceDate)")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            print("✅ [DAYTYPE] Calling onLoadingComplete()")
            self.onLoadingComplete()
        }
    }

    func getTitleFromHTML(html: String) -> String {
        let shortHTML = html.prefix(500) + "..."
        return String(shortHTML)
    }
    
    func getDayTypeFromHTML(html: String) -> String {
        do {
            let doc: Document = try SwiftSoup.parse(html)
            
            // Method 1: Check h4 > span (original method)
            let h4s = try doc.select("h4")
            for h4 in h4s {
                let h4Text = try h4.text().trimmingCharacters(in: .whitespacesAndNewlines)
                print("🔍 [DAYTYPE] Checking h4 text: '\(h4Text)'")
                
                if h4Text.localizedCaseInsensitiveContains("white day") {
                    print("✅ [DAYTYPE] Found White Day in h4 text")
                    return "White Day"
                } else if h4Text.localizedCaseInsensitiveContains("green day") {
                    print("✅ [DAYTYPE] Found Green Day in h4 text")
                    return "Green Day"
                }
                
                // Also check spans within h4
                let spans = try h4.select("span")
                for span in spans {
                    let spanText = try span.text().trimmingCharacters(in: .whitespacesAndNewlines)
                    print("🔍 [DAYTYPE] Checking h4 > span text: '\(spanText)'")
                    if spanText.localizedCaseInsensitiveContains("white day") {
                        print("✅ [DAYTYPE] Found White Day in h4 > span")
                        return "White Day"
                    } else if spanText.localizedCaseInsensitiveContains("green day") {
                        print("✅ [DAYTYPE] Found Green Day in h4 > span")
                        return "Green Day"
                    }
                }
            }
            
            // Method 2: Check all elements containing "day" text
            let allElements = try doc.select("*")
            for element in allElements {
                let text = try element.text().trimmingCharacters(in: .whitespacesAndNewlines)
                if text.localizedCaseInsensitiveContains("white day") {
                    print("✅ [DAYTYPE] Found White Day in \(element.tagName()) element")
                    return "White Day"
                } else if text.localizedCaseInsensitiveContains("green day") {
                    print("✅ [DAYTYPE] Found Green Day in \(element.tagName()) element")
                    return "Green Day"
                }
            }
            
            print("⚠️ [DAYTYPE] No day type found in HTML")
            return "Day type not found"
        } catch {
            print("❌ [DAYTYPE] Parse error: \(error)")
            return "Parse error: \(error)"
        }
    }

    func extractDailyBulletinSection(from html: String) -> String? {
        do {
            let doc: Document = try SwiftSoup.parse(html)
            if let section = try doc.select("section.daily-bulletin").first() {
                return try section.outerHtml()
            }
        } catch {
            print("Error extracting daily bulletin section: \(error)")
        }
        return nil
    }

    func extractDBDate(from html: String) -> Date? {
        do {
            let doc: Document = try SwiftSoup.parse(html)
            if let dateDiv = try doc.select("div.date").first() {
                let dateText = try dateDiv.text().trimmingCharacters(in: .whitespacesAndNewlines)
                let formatter = DateFormatter()
                formatter.dateFormat = "MMMM d, yyyy"
                return formatter.date(from: dateText)
            }
        } catch {
            print("Error extracting or parsing date: \(error)")
        }
        return nil
    }

    func inverseDayType(from dayType: String) -> String {
        let lower = dayType.lowercased()
        let hasGreen = lower.contains("green")
        let hasWhite = lower.contains("white")
        if hasGreen && hasWhite {
            return "Unknown"
        } else if hasGreen {
            return "White Day"
        } else if hasWhite {
            return "Green Day"
        } else {
            return "Unknown"
        }
    }

    func bulletinDateString() -> String {
        if let html = fullHTML,
           let doc = try? SwiftSoup.parse(html),
           let dateDiv = try? doc.select("div.date").first(),
           let dateText = try? dateDiv.text().trimmingCharacters(in: .whitespacesAndNewlines) {
            return dateText
        }
        return "Unknown"
    }
    


    func daysAwayFromBulletin() -> String {
        guard let html = fullHTML,
              let doc = try? SwiftSoup.parse(html),
              let dateDiv = try? doc.select("div.date").first(),
              let dateText = try? dateDiv.text().trimmingCharacters(in: .whitespacesAndNewlines) else {
            return ""
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d, yyyy"
        guard let bulletinDate = formatter.date(from: dateText) else { return "" }
        let today = self.testDate ?? Date()
        let days = Calendar.current.dateComponents([.day], from: bulletinDate, to: today).day ?? 0
        if days == 1 {
            return "(Yesterday)"
        } else if days > 1 {
            if days >= 7 && days < 14 {
                let weekday = bulletinDate.weekdayName()
                return "(last \(weekday))"
            } else if days >= 14 {
                let weekday = bulletinDate.weekdayName()
                return "(\(days) days ago) ((\(weekday)))"
            }
            let weekday = bulletinDate.weekdayName()
            return "(on \(weekday))"
        } else {
            return ""
        }
    }
    
    func getTodaysPrediction() -> String? {
        guard let steps = calculationSteps else { return nil }
        
        // Find today's step
        for step in steps {
            if step.isToday {
                return step.prediction
            }
        }
        
        return nil
    }


}

extension Date {
    func weekdayName() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE"
        return formatter.string(from: self)
    }
}

struct PredictionDetailView: View {
    let dayType: String
    let dbDate: Date?
    let testDate: Date?
    let calculationSteps: [PredictionStep]?
    let showOutdatedWarning: Bool
    let onDismiss: () -> Void
    
    @State private var showDailyBulletinConfirm = false
    
    private let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"
    
    var body: some View {
        NavigationView {
            GeometryReader { proxy in
                ScrollView {
                    VStack {
                        if let dbDate = dbDate {
                            VStack(spacing: 0) {
                            if let predictions = calculationSteps {
                                VStack(spacing: 0) {
                                    HStack {
                                        Text(formatShortDate(dbDate))
                                            .font(.system(.callout, design: .monospaced))
                                            .fontWeight(.medium)
                                            .frame(width: 50, alignment: .leading)
                                        
                                        Image(systemName: "arrow.right")
                                            .font(.caption)
                                            .foregroundColor(.gray)
                                        
                                        Text(dayType)
                                            .font(.callout)
                                            .fontWeight(.medium)
                                            .foregroundColor(.blue)
                                            .underline()
                                        
                                        Spacer()
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(getBackgroundColor(for: dayType))
                                    .onTapGesture {
                                        showDailyBulletinConfirm = true
                                    }
                                    
                                    Divider()
                                        .padding(.horizontal, 16)
                                    
                                    ForEach(Array(predictions.enumerated()), id: \.offset) { index, step in
                                        VStack(spacing: 0) {
                                            HStack {
                                                Text(formatShortDate(step.date))
                                                    .font(.system(.callout, design: .monospaced))
                                                    .fontWeight(.medium)
                                                    .frame(width: 50, alignment: .leading)
                                                
                                                Image(systemName: "arrow.right")
                                                    .font(.caption)
                                                    .foregroundColor(.gray)
                                                
                                                HStack(spacing: 4) {
                                                    if let (mainText, parenthetical) = parseText(step.prediction) {
                                                        Text(mainText)
                                                            .font(.callout)
                                                            .fontWeight(getFontWeight(for: step.prediction, isToday: step.isToday))
                                                        if !parenthetical.isEmpty {
                                                            Text("(\(parenthetical))")
                                                                .font(.caption)
                                                                .foregroundColor(.secondary)
                                                        }
                                                    } else {
                                                        Text(step.prediction)
                                                            .font(.callout)
                                                            .fontWeight(getFontWeight(for: step.prediction, isToday: step.isToday))
                                                    }
                                                }
                                                
                                                Spacer()
                                            }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 12)
                                            .background(getBackgroundColor(for: step.prediction))
                                            
                                            if index < predictions.count - 1 {
                                                Divider()
                                                    .padding(.horizontal, 16)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                        .cornerRadius(12)
                        .padding(.horizontal, 56)
                        
                    } else {
                        Text("No bulletin date available for calculations")
                            .foregroundColor(.secondary)
                            .padding()
                    }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: proxy.size.height, alignment: .top)
                    .padding(.vertical, max(0, (proxy.size.height - 400) / 4))
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        onDismiss()
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if showOutdatedWarning {
                    VStack(spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                                .font(.system(size: 16))
                            
                            Text("The Daily Bulletin is outdated. This prediction is based on the latest information from the school website.")
                                .font(.callout)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.leading)
                            
                            Spacer()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(8)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
                }
            }
            .alert("Do you want to go to the Daily Bulletin?", isPresented: $showDailyBulletinConfirm) {
                Button("Yes") {
                    openDailyBulletin()
                }
                Button("No", role: .cancel) { }
            }
        }
    }
    
    private func openDailyBulletin() {
        if let bulletinUrl = URL(string: schoolURL) {
            if UIApplication.shared.canOpenURL(bulletinUrl) {
                UIApplication.shared.open(bulletinUrl)
            }
        }
    }
    
    func getBackgroundColor(for prediction: String) -> Color {
        let lower = prediction.lowercased()
        if lower.contains("green day") {
            return Color.green.opacity(0.1)
        } else if lower.contains("white day") {
            return Color(.systemGray6)
        } else {
            return Color.white
        }
    }
    
    func parseText(_ text: String) -> (mainText: String, parenthetical: String)? {
        // Look for text in parentheses at the end
        if let range = text.range(of: "\\s*\\([^)]+\\)$", options: .regularExpression) {
            let mainText = String(text[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
            let parenthetical = String(text[range]).trimmingCharacters(in: .whitespaces)
                .replacingOccurrences(of: "(", with: "")
                .replacingOccurrences(of: ")", with: "")
            return (mainText, parenthetical)
        }
        return nil
    }
    
    func getFontWeight(for prediction: String, isToday: Bool) -> Font.Weight {
        if isToday {
            return .semibold
        } else if prediction.lowercased().contains("no school") {
            return .light
        } else {
            return .medium
        }
    }
    
    func formatLongDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d, yyyy"
        return formatter.string(from: date)
    }
    
    func formatShortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d"
        return formatter.string(from: date)
    }
    

}

#Preview {
    VStack(spacing: 0) {
        DayTypeView(testDate: nil, isViewingTomorrow: false, firebaseError: .constant(false), onLoadingComplete: {}, triggerRipple: .constant(false), showSplashScreen: .constant(false), currentDayType: .constant("Green Day"), currentDayTypeDate: .constant(nil))
    }
}
