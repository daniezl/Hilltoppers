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

struct DayTypeView: View {
    let testDate: Date?
    @Binding var firebaseError: Bool
    let onLoadingComplete: () -> Void
    @Binding var triggerRipple: Bool
    @Binding var showSplashScreen: Bool
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
    private let maxRetryCount = 2
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

    var body: some View {
        VStack(spacing: 0) {
            if isDateToday == false {
                VStack(spacing: 0) {
                    Text(predicted)
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(predicted == "Green Day" ? .white : .black)
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
                        .onTapGesture { 
                            showPredictionDetail = true 
                        }
                }
                .padding([.top, .leading, .trailing], 16).padding(.bottom, 0)
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
                        onDismiss: { showPredictionDetail = false }
                    )
                }
            } else {
                Spacer()
                    .frame(height: 24)
                Text(displayDayType)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(isGreenDay ? .white : .black)
                    .padding()
                    .background(
                        RippleEffect(isGreenDay: isGreenDay, showRipple: showColorRipple)
                    )
            }
        }
        .alert(isPresented: $showNetworkErrorAlert) {
            if let error = currentNetworkError {
                if error.showSettingsButton {
                    return Alert(
                        title: Text(error.alertTitle),
                        message: Text(error.alertMessage),
                        primaryButton: .default(Text("Open Settings")) {
                            openAppSettings()
                        },
                        secondaryButton: .cancel(Text("Try Again")) {
                            retryNetworkRequest()
                        }
                    )
                } else {
                    return Alert(
                        title: Text(error.alertTitle),
                        message: Text(error.alertMessage),
                        primaryButton: .default(Text("Try Again")) {
                            retryNetworkRequest()
                        },
                        secondaryButton: .cancel()
                    )
                }
            } else {
                return Alert(title: Text("Error"), message: Text("An unknown error occurred."), dismissButton: .default(Text("OK")))
            }
        }
        .onAppear {
            print("🎯 [DAYTYPE] DayTypeView appeared - initializing...")
            self.htmlTitle = "Loading..."
            self.dayType = "Loading..."
            self.isDateToday = nil
            self.hasTriedAutoRefresh = false
            self.showColorRipple = false
            self.networkRetryCount = 0
            
            // Delay loading if splash screen is showing to let animation complete
            if showSplashScreen {
                print("⏳ [DAYTYPE] Splash screen showing - delaying HTML fetch by 0.8s")
                Task {
                    do {
                        try await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
                        fetchHTML(from: schoolURL)
                    } catch {
                        // If cancelled, proceed immediately
                        print("⚠️ [DAYTYPE] Sleep cancelled - proceeding immediately")
                        fetchHTML(from: schoolURL)
                    }
                }
            } else {
                print("🚀 [DAYTYPE] No splash screen - fetching HTML immediately")
                fetchHTML(from: schoolURL)
            }
        }
        .onChange(of: dayType) { newDayType in
            // Auto-refresh if we get "Please Refresh" and haven't tried yet
            // But don't trigger refresh loading state during initial splash
            if newDayType == "Please Refresh" && !hasTriedAutoRefresh {
                hasTriedAutoRefresh = true
                // print("Auto-refreshing due to 'Please Refresh' state")
                
                // Wait a moment then try again (without triggering isRefreshing)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    fetchHTML(from: schoolURL)
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
                    fetchHTML(from: schoolURL)
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
    }

    private func openAppSettings() {
        if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
            if UIApplication.shared.canOpenURL(settingsUrl) {
                UIApplication.shared.open(settingsUrl)
            }
        }
    }
    
    private func retryNetworkRequest() {
        networkRetryCount = 0
        fetchHTML(from: schoolURL)
    }
    
    private func analyzeNetworkError(_ error: Error) -> NetworkErrorType {
        let nsError = error as NSError
        
        // Check for specific network permission/access errors
        switch nsError.code {
        case NSURLErrorNotConnectedToInternet:
            // This could be either no internet or permission denied
            // We'll treat multiple rapid failures as permission issues
            if networkRetryCount == 0 {
                return .permissionDenied
            } else {
                return .noInternet
            }
        case NSURLErrorTimedOut:
            return .timeout
        case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost:
            return .serverError
        case NSURLErrorUserCancelledAuthentication, NSURLErrorUserAuthenticationRequired:
            return .permissionDenied
        case NSURLErrorDataNotAllowed:
            return .permissionDenied
        default:
            if nsError.domain == NSURLErrorDomain {
                return .other("Network error: \(nsError.localizedDescription)")
            } else {
                return .other("Unknown error: \(nsError.localizedDescription)")
            }
        }
    }

    func fetchHTML(from urlString: String) {
        print("🌐 [DAYTYPE] Starting fetchHTML from: \(urlString)")
        guard let url = URL(string: urlString) else {
            print("❌ [DAYTYPE] Invalid URL: \(urlString)")
            self.htmlTitle = "Please Refresh"
            self.dayType = "Please Refresh"
            
            // Small delay to ensure UI state is updated
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                print("✅ [DAYTYPE] Calling onLoadingComplete() due to invalid URL")
                self.onLoadingComplete()
            }
            return
        }
        
        print("📡 [DAYTYPE] Starting URLSession request...")
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error = error {
                print("❌ [DAYTYPE] URLSession error: \(error)")
                DispatchQueue.main.async {
                    // Analyze the error to determine if it's a permission issue
                    let networkErrorType = self.analyzeNetworkError(error)
                    print("🔍 [DAYTYPE] Network error type: \(networkErrorType)")
                    
                    // Only show alert if we haven't exceeded retry count
                    if self.networkRetryCount < self.maxRetryCount {
                        print("⚠️ [DAYTYPE] Showing network error alert (retry \(self.networkRetryCount + 1)/\(self.maxRetryCount))")
                        self.currentNetworkError = networkErrorType
                        self.showNetworkErrorAlert = true
                        self.networkRetryCount += 1
                    } else {
                        print("🚫 [DAYTYPE] Max retries reached - setting Please Refresh")
                        // Max retries reached, set to "Please Refresh"
                        self.htmlTitle = "Please Refresh"
                        self.dayType = "Please Refresh"
                        self.dailyBulletinHTML = nil
                        self.dbDate = nil
                        self.predicted = "Please Refresh"
                    }
                    
                    // Small delay to ensure UI state is updated
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        print("✅ [DAYTYPE] Calling onLoadingComplete() due to network error")
                        self.onLoadingComplete()
                    }
                }
                return
            }
            
            if let data = data, let html = String(data: data, encoding: .utf8) {
                print("✅ [DAYTYPE] Successfully received HTML data (\(data.count) bytes)")
                DispatchQueue.main.async {
                    // Reset retry count on successful request
                    self.networkRetryCount = 0
                    
                    self.fullHTML = html
                    let trimmedHTML = self.extractDailyBulletinSection(from: html)
                    self.dailyBulletinHTML = trimmedHTML
                    self.htmlTitle = self.getTitleFromHTML(html: trimmedHTML ?? html)
                    self.dayType = self.getDayTypeFromHTML(html: trimmedHTML ?? html)
                    print("📅 [DAYTYPE] Parsed day type: '\(self.dayType)'")
                    self.dbDate = self.extractDBDate(from: trimmedHTML ?? html)
                    print("📆 [DAYTYPE] Extracted DB date: \(self.dbDate?.description ?? "nil")")
                    if let dbDate = self.dbDate {
                        let calendar = Calendar.current
                        let today = self.testDate ?? Date()
                        self.isDateToday = calendar.isDate(dbDate, inSameDayAs: today)
                        
                        let formatter = DateFormatter()
                        formatter.dateFormat = "yyyy-MM-dd"
                        print("🔍 [DAYTYPE] DB date: \(formatter.string(from: dbDate)), Today: \(formatter.string(from: today)), isToday: \(self.isDateToday ?? false)")
                        
                        // Update prediction if not today
                        if self.isDateToday == false {
                            print("🔮 [DAYTYPE] DB date is not today - generating prediction...")
                            Task {
                                do {
                                    // Load calculation steps and use them for prediction
                                    print("📊 [DAYTYPE] Calling Firebase generateCalculationSteps...")
                                    let steps = try await ScheduleTypeFetcher.generateCalculationSteps(
                                        dbDayType: self.dayType,
                                        dbDate: dbDate,
                                        testDate: self.testDate
                                    )
                                    
                                    DispatchQueue.main.async {
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
                                        
                                        // Only call loading complete after everything is processed
                                        // and we're sure the UI will show proper content
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                            print("✅ [DAYTYPE] Calling onLoadingComplete() after prediction success")
                                            self.onLoadingComplete()
                                        }
                                    }
                                } catch {
                                    print("❌ [DAYTYPE] Firebase generateCalculationSteps failed: \(error)")
                                    DispatchQueue.main.async {
                                        self.predicted = "Please Refresh"
                                        self.firebaseError = true
                                        
                                        // Small delay to ensure UI state is updated
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                            print("✅ [DAYTYPE] Calling onLoadingComplete() after prediction error")
                                            self.onLoadingComplete()
                                        }
                                    }
                                }
                            }
                        } else {
                            print("📅 [DAYTYPE] DB date is today - no prediction needed")
                            DispatchQueue.main.async {
                                self.firebaseError = false // Clear error for today's date
                                
                                // Small delay to ensure dayType UI is updated before splash screen hides
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                    print("✅ [DAYTYPE] Calling onLoadingComplete() for today's date")
                                    self.onLoadingComplete()
                                }
                            }
                        }
                    } else {
                        print("⚠️ [DAYTYPE] No DB date found in HTML")
                        self.isDateToday = nil
                        DispatchQueue.main.async {
                            self.predicted = "No DB date"
                            
                            // Small delay to ensure UI state is updated
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                print("✅ [DAYTYPE] Calling onLoadingComplete() - no DB date")
                                self.onLoadingComplete()
                            }
                        }
                    }
                }
            } else {
                print("❌ [DAYTYPE] Failed to parse HTML data or no data received")
                DispatchQueue.main.async {
                    self.htmlTitle = "Please Refresh"
                    self.dayType = "Please Refresh"
                    self.dailyBulletinHTML = nil
                    self.dbDate = nil
                    self.predicted = "Please Refresh"
                    
                    // Small delay to ensure UI state is updated
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        print("✅ [DAYTYPE] Calling onLoadingComplete() - HTML parse failed")
                        self.onLoadingComplete()
                    }
                }
            }
        }.resume()
    }

    func getTitleFromHTML(html: String) -> String {
        let shortHTML = html.prefix(500) + "..."
        return String(shortHTML)
    }
    
    func getDayTypeFromHTML(html: String) -> String {
        do {
            let doc: Document = try SwiftSoup.parse(html)
            let h4s = try doc.select("h4")
            for h4 in h4s {
                let spans = try h4.select("span")
                for span in spans {
                    let text = try span.text().trimmingCharacters(in: .whitespacesAndNewlines)
                    if text.localizedCaseInsensitiveContains("white day") {
                        return "White Day"
                    } else if text.localizedCaseInsensitiveContains("green day") {
                        return "Green Day"
                    }
                }
            }
            return "Day type not found"
        } catch {
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
    let onDismiss: () -> Void
    
    var body: some View {
        NavigationView {
            VStack {
                Spacer()
                
                if let dbDate = dbDate {
                    // Card with list
                    VStack(spacing: 0) {
                        if let predictions = calculationSteps {
                            VStack(spacing: 0) {
                                // Bulletin info as first row
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
                                    
                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(getBackgroundColor(for: dayType))
                                
                                // Divider
                                Divider()
                                    .padding(.horizontal, 16)
                                
                                // Prediction rows
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
                    .padding(.horizontal, 56) // space from the sides
                    
                } else {
                    Text("No bulletin date available for calculations")
                        .foregroundColor(.secondary)
                        .padding()
                }
                
                Spacer()
                Spacer()
            }

            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        onDismiss()
                    }
                }
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
        DayTypeView(testDate: nil, firebaseError: .constant(false), onLoadingComplete: {}, triggerRipple: .constant(false), showSplashScreen: .constant(false))
    }
}
