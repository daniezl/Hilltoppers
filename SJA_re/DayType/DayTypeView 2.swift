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
        .onAppear {
            self.htmlTitle = "Loading..."
            self.dayType = "Loading..."
            self.isDateToday = nil
            self.hasTriedAutoRefresh = false
            self.showColorRipple = false
            fetchHTML(from: schoolURL)
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
            }
        }
    }

    func fetchHTML(from urlString: String) {
        guard let url = URL(string: urlString) else {
            self.htmlTitle = "Please Refresh"
            self.dayType = "Please Refresh"
            onLoadingComplete()
            return
        }
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let data = data, let html = String(data: data, encoding: .utf8) {
                DispatchQueue.main.async {
                    self.fullHTML = html
                    let trimmedHTML = self.extractDailyBulletinSection(from: html)
                    self.dailyBulletinHTML = trimmedHTML
                    self.htmlTitle = self.getTitleFromHTML(html: trimmedHTML ?? html)
                    self.dayType = self.getDayTypeFromHTML(html: trimmedHTML ?? html)
                    self.dbDate = self.extractDBDate(from: trimmedHTML ?? html)
                    if let dbDate = self.dbDate {
                        let calendar = Calendar.current
                        let today = self.testDate ?? Date()
                        self.isDateToday = calendar.isDate(dbDate, inSameDayAs: today)
                        
                        // Update prediction if not today
                        if self.isDateToday == false {
                            Task {
                                do {
                                    // Load calculation steps and use them for prediction
                                    let steps = try await ScheduleTypeFetcher.generateCalculationSteps(
                                        dbDayType: self.dayType,
                                        dbDate: dbDate,
                                        testDate: self.testDate
                                    )
                                    
                                    DispatchQueue.main.async {
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
                                        self.firebaseError = false
                                        self.onLoadingComplete()
                                    }
                                } catch {
                                    DispatchQueue.main.async {
                                        self.predicted = "Please Refresh"
                                        self.firebaseError = true
                                        self.onLoadingComplete()
                                    }
                                }
                            }
                        } else {
                            DispatchQueue.main.async {
                                self.firebaseError = false // Clear error for today's date
                                self.onLoadingComplete()
                            }
                        }
                    } else {
                        self.isDateToday = nil
                        DispatchQueue.main.async {
                            self.predicted = "No DB date"
                            self.onLoadingComplete()
                        }
                    }
                }
            } else {
                DispatchQueue.main.async {
                    self.htmlTitle = "Please Refresh"
                    self.dayType = "Please Refresh"
                    self.dailyBulletinHTML = nil
                    self.dbDate = nil
                    self.predicted = "Please Refresh"
                    self.onLoadingComplete()
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
