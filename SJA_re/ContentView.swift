//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {

    var body: some View {
        VStack(spacing: 0) {
            DayTypeView()
            ScheduleView()
        }
    }
}

#Preview {
    ContentView()
}
