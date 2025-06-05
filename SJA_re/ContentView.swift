//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {
    @State private var noSchool: Bool = false
    @State private var firebaseError: Bool = false
    @State private var isStale: Bool = false
    // Set this to a specific Date to test, or nil to use real time
    
//   let testDate: Date? = nil
    
     let testDate: Date? = DateComponents(
         calendar: .current,
         year: 2025,
         month: 5,
         day: 23,
         hour: 9,
         minute: 02
     ).date

    var body: some View {
        VStack(spacing: 0) {
            // Staleness warning banner - at the very top
//            if isStale {
//                HStack {
//                    Image(systemName: "clock.arrow.circlepath")
//                        .foregroundColor(.orange)
//                    Text("Schedule may be outdated")
//                        .font(.caption)
//                        .foregroundColor(.secondary)
//                    Spacer()
//                    Button("Refresh") {
//                        // Trigger refresh in child views
//                    }
//                    .font(.caption2)
//                    .foregroundColor(.blue)
//                }
//                .padding(.horizontal, 16)
//                .padding(.vertical, 8)
//                .background(Color.orange.opacity(0.1))
//            }
            
            // Firebase error warning banner
//            if firebaseError {
//                HStack {
//                    Image(systemName: "exclamationmark.triangle.fill")
//                        .foregroundColor(.orange)
//                    Text("Unable to connect to schedule server")
//                        .font(.caption)
//                        .foregroundColor(.secondary)
//                    Spacer()
//                    Button("Dismiss") {
//                        firebaseError = false
//                    }
//                    .font(.caption2)
//                    .foregroundColor(.blue)
//                }
//                .padding(.horizontal, 16)
//                .padding(.vertical, 8)
//                .background(Color.orange.opacity(0.1))
//            }
            
            if noSchool {
                Text("No school")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
                    .padding()
            } else {
                DayTypeView(testDate: testDate, firebaseError: $firebaseError)
                ScheduleView(testDate: testDate, noSchool: $noSchool, isStale: $isStale)
            }
        }
        .preferredColorScheme(.light)
    }
}

#Preview {
    ContentView()
}
