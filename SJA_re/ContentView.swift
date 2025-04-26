//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {
    @State private var htmlContent: String = "Loading..."
    let googleURL: String = "https://www.google.com/"
    let schoolURL: String = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"
    
    var body: some View {
        VStack {
            Text(htmlContent)
                .padding(.all, 26.0)
                
        }
        .padding()
        .onAppear {
            getHTML(googleURL) { html in
                htmlContent = html
            }
        }
    }
}

func getHTML(_ urlString: String, completion: @escaping (String) -> Void) {
    guard let url = URL(string: urlString) else {
        print("Invalid URL")
        completion("")
        return
    }

    URLSession.shared.dataTask(with: url) { data, _, _ in
        let htmlString = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        completion(htmlString)
    }.resume()
}

#Preview {
    ContentView()
}
