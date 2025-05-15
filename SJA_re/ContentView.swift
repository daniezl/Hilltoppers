//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {
    @State private var htmlTitle = "Loading..."
    @State private var dayType = "Loading..."
    @State private var fullHTML: String? = nil
    @State private var dailyBulletinHTML: String? = nil
    @State private var isDateToday: Bool? = nil
    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"
    // Test date for debugging (set to nil to use real date)
    let testDate: Date? = nil // Example: DateComponents(calendar: .current, year: 2025, month: 5, day: 13).date

    var isWhiteDay: Bool {
        dayType.lowercased().contains("white day")
    }
    var isGreenDay: Bool {
         dayType.lowercased().contains("green day")
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
        ZStack {
            // Main background always white
            Color.white.ignoresSafeArea()
            ScrollView {
                GeometryReader { geometry in
                    VStack {
                        if isDateToday == false {
                            Text("The daily bulletin is not up to date. Please check back later.")
                                .foregroundColor(.red)
                                .font(.headline)
                                .padding()
                        } else {
                            Text(displayDayType)
                                .font(.system(size: 36, weight: .bold))
                                .foregroundColor(isGreenDay ? .white : .black)
                                .padding()
                                .background(
                                    RoundedRectangle(cornerRadius: 16)
                                        .fill(isGreenDay ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color.gray.opacity(0.1))
                                )
                                .padding()
                        }
                    }
                    .padding(.top, 300)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .frame(height: UIScreen.main.bounds.height) // Ensures GeometryReader fills the screen
            }
            .refreshable {
                self.htmlTitle = "Loading..."
                self.dayType = "Loading..."
                self.isDateToday = nil
                fetchHTML(from: schoolURL)
            }
            .onAppear {
                self.htmlTitle = "Loading..."
                self.dayType = "Loading..."
                self.isDateToday = nil
                fetchHTML(from: schoolURL)
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
                    self.isDateToday = self.isBulletinDateToday(html: trimmedHTML ?? html)
                }
            } else {
                DispatchQueue.main.async {
                    self.htmlTitle = "Failed to load HTML"
                    self.dayType = "Failed to load HTML"
                    self.dailyBulletinHTML = nil
                    self.isDateToday = nil
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
            if let span = try doc.select("span[style*=#939598]").first() {
                let dayType = try span.text().trimmingCharacters(in: .whitespacesAndNewlines)
                return dayType
            } else {
                return "Day type not found"
            }
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

    func isBulletinDateToday(html: String) -> Bool? {
        do {
            let doc: Document = try SwiftSoup.parse(html)
            if let dateDiv = try doc.select("div.date").first() {
                let dateText = try dateDiv.text().trimmingCharacters(in: .whitespacesAndNewlines)
                // Parse the date string (e.g., "May 13, 2025")
                let formatter = DateFormatter()
                formatter.dateFormat = "MMMM d, yyyy"
                if let bulletinDate = formatter.date(from: dateText) {
                    let calendar = Calendar.current
                    let today = testDate ?? Date()
                    return calendar.isDate(bulletinDate, inSameDayAs: today)
                }
            }
        } catch {
            print("Error extracting or parsing date: \(error)")
        }
        return nil
    }
}

#Preview {
    ContentView()
}
