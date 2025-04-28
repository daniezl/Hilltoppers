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
    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

    var isWhiteDay: Bool {
        dayType.lowercased().contains("white day")
    }
    var isGreenDay: Bool {
        // dayType.lowercased().contains("green day")
        true // Hardcoded for testing
    }

    var body: some View {
        ZStack {
            // Main background always white
            Color.white.ignoresSafeArea()
            VStack {
                Text(dayType)
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
                getTitle(from: schoolURL) { title in
                    htmlTitle = title
                }
                getDayType(from: schoolURL) { dayType in
                    self.dayType = dayType
                }
            }
        }
    }

    func getTitle(from urlString: String, completion: @escaping (String) -> Void) {
        guard let url = URL(string: urlString) else {
            completion("Invalid URL")
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, error in
            if let data = data, let html = String(data: data, encoding: .utf8) {
                let shortHTML = html.prefix(500) + "..."
                completion(String(shortHTML))
            } else {
                completion("Failed to load HTML")
            }
        }.resume()
    }

    func getDayType(from urlString: String, completion: @escaping (String) -> Void) {
        guard let url = URL(string: urlString) else {
            completion("Invalid URL")
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, error in
            if let data = data, let html = String(data: data, encoding: .utf8) {
                do {
                    let doc: Document = try SwiftSoup.parse(html)
                    if let span = try doc.select("span[style*=#939598]").first() {
                        let dayType = try span.text().trimmingCharacters(in: .whitespacesAndNewlines)
                        completion(dayType)
                    } else {
                        completion("Day type not found")
                    }
                } catch {
                    completion("Parse error: \(error)")
                }
            } else {
                completion("Failed to load HTML")
            }
        }.resume()
    }
}

#Preview {
    ContentView()
}
