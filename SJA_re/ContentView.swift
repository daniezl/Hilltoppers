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
    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

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
            VStack {
                Text(displayDayType)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(isGreenDay ? .white : .primary)
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(isGreenDay ? Color(red: 20/255, green: 54/255, blue: 27/255) : Color.gray.opacity(0.1))
                    )
                    .padding()
            }
            .onAppear {
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
                    self.htmlTitle = self.getTitleFromHTML(html: html)
                    self.dayType = self.getDayTypeFromHTML(html: html)
                }
            } else {
                DispatchQueue.main.async {
                    self.htmlTitle = "Failed to load HTML"
                    self.dayType = "Failed to load HTML"
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
}

#Preview {
    ContentView()
}
