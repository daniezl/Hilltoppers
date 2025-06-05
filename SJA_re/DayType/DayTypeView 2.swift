//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct DayTypeView: View {
    let testDate: Date?
    @Binding var firebaseError: Bool
    @State private var htmlTitle = "Loading..."
    @State private var dayType = "Loading..."
    @State private var fullHTML: String? = nil
    @State private var dailyBulletinHTML: String? = nil
    @State private var isDateToday: Bool? = nil
    @State private var showBulletinInfo = false
    @State private var dbDate: Date? = nil
    @State private var predicted: String = "Loading..."
    @State private var lastRefreshDate = Calendar.current.startOfDay(for: Date())
    @State private var timer: Timer? = nil

    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

    @Environment(\.scenePhase) private var scenePhase

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
                                .fill(predicted == "Green Day" ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color.gray.opacity(0.2))
                        )
                    VStack(spacing: 0) {
                        HStack(spacing: 0) {
                            Text("This is a prediction based on the ")
                            Text("last posted day")
                                .foregroundColor(.blue)
                                .underline()
                                .onTapGesture { showBulletinInfo = true }
                            Text(".")
                        }
                        Text("It may not be accurate.")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
                }
                .padding([.top, .leading, .trailing], 16).padding(.bottom, 0)
                .alert(isPresented: $showBulletinInfo) {
                    Alert(
                        title: Text("\(dayType)"),
                        message: Text("Date: \(bulletinDateString())\n\(daysAwayFromBulletin())"),
                        dismissButton: .default(Text("OK"))
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
                                : Color(red: 248/255, green: 244/255, blue: 244/255) // White Day: #f8f4f4
                            )
                    )
            }
        }
        .onAppear {
            self.htmlTitle = "Loading..."
            self.dayType = "Loading..."
            self.isDateToday = nil
            fetchHTML(from: schoolURL)
            startDayChangeTimer()
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .active {
                print("DayTypeView scenePhase .active!")
                self.htmlTitle = "Loading..."
                self.dayType = "Loading..."
                self.isDateToday = nil
                fetchHTML(from: schoolURL)
                startDayChangeTimer()
                let today = Calendar.current.startOfDay(for: self.testDate ?? Date())
                lastRefreshDate = today
            }
        }
    }

    func fetchHTML(from urlString: String) {
        guard let url = URL(string: urlString) else {
            self.htmlTitle = "Invalid URL"
            self.dayType = "Invalid URL"
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
                                    let predictedType = try await ScheduleTypeFetcher.predictDayType(
                                        dbDayType: self.dayType,
                                        dbDate: dbDate,
                                        testDate: self.testDate
                                    )
                                    DispatchQueue.main.async {
                                        self.predicted = predictedType
                                        self.firebaseError = false
                                    }
                                } catch {
                                    DispatchQueue.main.async {
                                        self.predicted = "Error"
                                        self.firebaseError = true
                                    }
                                }
                            }
                        } else {
                            DispatchQueue.main.async {
                                self.firebaseError = false // Clear error for today's date
                            }
                        }
                    } else {
                        self.isDateToday = nil
                        DispatchQueue.main.async {
                            self.predicted = "No DB date"
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

    func startDayChangeTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            let today = Calendar.current.startOfDay(for: self.testDate ?? Date())
            if today != lastRefreshDate {
                self.htmlTitle = "Loading..."
                self.dayType = "Loading..."
                self.isDateToday = nil
                fetchHTML(from: schoolURL)
                lastRefreshDate = today
            }
        }
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

#Preview {
    VStack(spacing: 0) {
        DayTypeView(testDate: nil, firebaseError: .constant(false))
        Text("Hello, World!") // This will be right below the banner
    }
}
