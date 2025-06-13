//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct PredictionStep {
    let date: Date
    let prediction: String
    let isToday: Bool
}

struct DayTypeView: View {
    let testDate: Date?
    @Binding var firebaseError: Bool
    let onLoadingComplete: () -> Void
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
                            RoundedRectangle(cornerRadius: 16)
                                .fill(predicted == "Green Day" ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color(red: 245/255, green: 246/255, blue: 245/255))
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
                        RoundedRectangle(cornerRadius: 16)
                            .fill(isGreenDay
                                ? Color(red: 20/255, green: 54/255, blue: 27/255) // Green Day
                                : Color(red: 245/255, green: 246/255, blue: 245/255) // White Day: same as schedule card
                            )
                    )
            }
        }
        .onAppear {
            self.htmlTitle = "Loading..."
            self.dayType = "Loading..."
            self.isDateToday = nil
            fetchHTML(from: schoolURL)
        }
    }

    func fetchHTML(from urlString: String) {
        guard let url = URL(string: urlString) else {
            self.htmlTitle = "Invalid URL"
            self.dayType = "Invalid URL"
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
                                        self.predicted = "Error"
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
                    self.htmlTitle = "Failed to load HTML"
                    self.dayType = "Failed to load HTML"
                    self.dailyBulletinHTML = nil
                    self.dbDate = nil
                    self.predicted = "Failed to load"
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
            VStack(alignment: .leading, spacing: 20) {
                
                VStack(alignment: .leading, spacing: 16) {
                    if let dbDate = dbDate {
                        VStack(alignment: .leading, spacing: 8) {
                                Text("Latest bulletin: \(formatLongDate(dbDate)) - \(dayType)")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                            .padding(.bottom, 8)
                            
                            if let predictions = calculationSteps {
                                VStack(alignment: .leading, spacing: 4) {
                                    ForEach(Array(predictions.enumerated()), id: \.offset) { index, step in
                                        HStack {
                                            Text("\(formatShortDate(step.date))")
                                                .font(.caption)
                                                .fontWeight(.medium)
                                                .frame(width: 40, alignment: .leading)
                                            
                                            Image(systemName: "arrow.right")
                                                .font(.caption2)
                                                .foregroundColor(.gray)
                                            
                                            Text(step.prediction)
                                                .font(.caption)
                                                .fontWeight(step.isToday ? .bold : .regular)
                                                .foregroundColor(step.isToday ? .primary : .secondary)
                                            
                                            if step.isToday {
                                                Text("(Today)")
                                                    .font(.caption2)
                                                    .foregroundColor(.blue)
                                                    .fontWeight(.medium)
                                            }
                                            
                                            Spacer()
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 4)
                                        .background(step.isToday ? Color.blue.opacity(0.1) : Color.clear)
                                        .cornerRadius(6)
                                    }
                                }
                            }
                        }
                        
                        Divider()
                        
                        // Disclaimer
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Important Notes")
                                .font(.headline)
                                .foregroundColor(.orange)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("• Calculations are based on the latest bulletin")
                                Text("• Please confirm that the days listed above are correct")
                            }
                            .font(.caption)
                            .foregroundColor(.secondary)
                        }
                    } else {
                        Text("No bulletin date available for calculations")
                            .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Calculation Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        onDismiss()
                    }
                }
            }
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
        DayTypeView(testDate: nil, firebaseError: .constant(false), onLoadingComplete: {})
    }
}
