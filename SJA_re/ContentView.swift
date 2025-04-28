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
    let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

    var body: some View {
        Text(htmlTitle)
            .padding()
            .onAppear {
                getTitle(from: schoolURL) { title in
                    htmlTitle = title
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
}


#Preview {
    ContentView()
}
