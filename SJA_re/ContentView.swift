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
    
//    let testDate: Date? = nil
    
    let testDate: Date? = DateComponents(
        calendar: .current,
        year: 2025,
        month: 6,
        day: 7,
        hour: 11,
        minute: 02
    ).date

    var body: some View {
        VStack(spacing: 0) {
            DayTypeView(testDate: testDate)
            ScheduleView(testDate: testDate)
        }
        .preferredColorScheme(.light)
    }
}

#Preview {
    ContentView()
}
