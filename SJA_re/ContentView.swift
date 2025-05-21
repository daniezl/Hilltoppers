//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {
    // Set this to a specific Date to test, or nil to use real time
    let testDate: Date? = DateComponents(
        calendar: .current,
        year: 2025,
        month: 5,
        day: 21,
        hour: 11,
        minute: 30
    ).date

    var body: some View {
        VStack(spacing: 0) {
            DayTypeView(testDate: nil)
            ScheduleView(testDate: nil)
        }
    }
}

#Preview {
    ContentView()
}
