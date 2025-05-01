//
//  ContentView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import SwiftSoup

struct ContentView: View {//
    @State private var htmlTitle = "Loading..."
    @State private var dayType = "Loading..."
    @State private var testTime: (hour: Int, minute: Int)? = nil  // Test time
    @State private var scheduleConfig: ScheduleConfiguration?
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

    var isMonThurs: Bool {
        let weekday = Calendar.current.component(.weekday, from: Date())
        // Sunday = 1, Monday = 2, ..., Saturday = 7
        return (2...5).contains(weekday)
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
                if isMonThurs {
                    MonThursScheduleView(testTime: testTime, config: scheduleConfig)
                }
            }
            .onAppear {
                // Load schedule configuration
                scheduleConfig = ScheduleConfiguration.load()
                
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

struct MonThursScheduleView: View {
    let testTime: (hour: Int, minute: Int)?
    let config: ScheduleConfiguration?
    @State private var isLunchExpanded = false
    
    // Define schedule periods and times
    struct Period: Identifiable {
        let id = UUID()
        let name: String
        let start: String
        let end: String
        let startMinutes: Int
        let endMinutes: Int
    }
    
    var isWednesday: Bool {
        let weekday = Calendar.current.component(.weekday, from: Date())
        return weekday == 4  // 4 is Wednesday (1 is Sunday)
    }
    
    // Get current schedule based on the day
    var currentSchedule: ScheduleConfiguration.DaySchedule? {
        guard let config = config else { return nil }
        let weekday = Calendar.current.component(.weekday, from: Date())
        return config.scheduleForWeekday(weekday)
    }

    // Convert schedule to periods for display
    var periods: [Period] {
        guard let schedule = currentSchedule else { 
            // Fallback to hardcoded schedule if config is not available
            let firstPeriodName = isWednesday ? "Advisory" : "Chapel"
            return [
                Period(name: firstPeriodName, start: "8:00", end: "8:15", startMinutes: 8*60, endMinutes: 8*60+15),
                Period(name: "A Block", start: "8:25", end: "9:30", startMinutes: 8*60+25, endMinutes: 9*60+30),
                Period(name: "B Block", start: "9:35", end: "10:40", startMinutes: 9*60+35, endMinutes: 10*60+40),
                Period(name: "C Block", start: "10:45", end: "12:20", startMinutes: 10*60+45, endMinutes: 12*60+20),
                Period(name: "1st Lunch", start: "10:45", end: "11:05", startMinutes: 10*60+45, endMinutes: 11*60+5),
                Period(name: "2nd Lunch", start: "11:05", end: "11:25", startMinutes: 11*60+5, endMinutes: 11*60+25),
                Period(name: "3rd Lunch", start: "11:25", end: "11:45", startMinutes: 11*60+25, endMinutes: 11*60+45),
                Period(name: "4th Lunch", start: "11:45", end: "12:05", startMinutes: 11*60+45, endMinutes: 12*60+5),
                Period(name: "5th Lunch", start: "12:00", end: "12:20", startMinutes: 12*60, endMinutes: 12*60+20),
                Period(name: "D Block", start: "12:25", end: "13:30", startMinutes: 12*60+25, endMinutes: 13*60+30),
                Period(name: "E Block", start: "13:35", end: "14:40", startMinutes: 13*60+35, endMinutes: 14*60+40),
                Period(name: "CP", start: "14:45", end: "15:05", startMinutes: 14*60+45, endMinutes: 15*60+5)
            ]
        }
        
        var result: [Period] = []
        
        // Add first period
        result.append(Period(
            name: schedule.firstPeriod.name,
            start: schedule.firstPeriod.start,
            end: schedule.firstPeriod.end,
            startMinutes: schedule.firstPeriod.startMinutes,
            endMinutes: schedule.firstPeriod.endMinutes
        ))
        
        // Add regular blocks
        for block in schedule.regularBlocks {
            if let block = block {
                result.append(Period(
                    name: block.name,
                    start: block.start,
                    end: block.end,
                    startMinutes: TimeBlock.timeStringToMinutes(block.start),
                    endMinutes: TimeBlock.timeStringToMinutes(block.end)
                ))
                
                // Add lunch periods if present
                if !block.lunches.isEmpty {
                    for lunch in block.lunches {
                        result.append(Period(
                            name: lunch.name,
                            start: lunch.start,
                            end: lunch.end,
                            startMinutes: lunch.startMinutes,
                            endMinutes: lunch.endMinutes
                        ))
                    }
                }
            }
        }
        
        return result
    }

    // Modify currentMinutes to use test time
    func currentMinutes() -> Int {
        if let test = testTime {
            return test.hour * 60 + test.minute
        }
        let now = Date()
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: now)
        let minute = calendar.component(.minute, from: now)
        return hour * 60 + minute
    }

    // Find the current or next period index
    func highlightedPeriodIndex() -> Int? {
        let now = currentMinutes()
        let currentPeriods = periods.enumerated().filter { !$1.name.contains("Lunch") }
        
        for (idx, period) in currentPeriods {
            if now >= period.startMinutes && now < period.endMinutes {
                return idx
            }
            // If we're between this period and the next one
            if let nextPeriod = currentPeriods.first(where: { $0.0 > idx }) {
                if now >= period.endMinutes && now < nextPeriod.1.startMinutes {
                    return nextPeriod.0
                }
            }
        }
        return nil
    }

    // Add function to determine current lunch period
    func currentLunchPeriod() -> Int? {
        let now = currentMinutes()
        let lunchPeriods = periods.enumerated().filter { $1.name.contains("Lunch") }
        
        for (idx, period) in lunchPeriods {
            if now >= period.startMinutes && now < period.endMinutes {
                return idx
            }
        }
        return nil
    }

    var body: some View {
        let highlightIdx = highlightedPeriodIndex()
        let currentLunch = currentLunchPeriod()
        
        VStack(alignment: .leading, spacing: 6) {
            Text("Mon - Thurs Schedule")
                .font(.headline)
                .padding(.bottom, 4)
            
            // Show blocks before C Block
            ForEach(Array(periods.prefix(3).enumerated()), id: \.1.id) { idx, period in
                if !period.name.contains("Lunch") {
                    ScheduleRow(period: period, isHighlighted: idx == highlightIdx)
                }
            }
            
            // C Block with lunches
            DisclosureGroup(
                isExpanded: $isLunchExpanded,
                content: {
                    ForEach(Array(periods.enumerated().filter { $1.name.contains("Lunch") }), 
                           id: \.1.id) { idx, period in
                        ScheduleRow(period: period, isHighlighted: idx == currentLunch)
                            .padding(.leading)
                    }
                },
                label: {
                    HStack {
                        Text("C Block")
                        Spacer()
                        Text("10:45-12:20")
                            .frame(width: 100, alignment: .trailing)
                            .monospacedDigit()
                    }
                    .padding(6)
                    .background(highlightIdx == 3 ? Color(red: 39/255, green: 92/255, blue: 48/255).opacity(0.25) : Color.clear)
                    .cornerRadius(8)
                }
            )
            .accentColor(.primary)
            
            // Show blocks after C Block
            ForEach(Array(periods.suffix(3).enumerated()), id: \.1.id) { idx, period in
                if !period.name.contains("Lunch") && period.name != "C Block" {
                    ScheduleRow(period: period, isHighlighted: idx + (periods.count - 3) == highlightIdx)
                }
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(white: 0.95)))
        .padding(.horizontal)
    }
}

// Add this helper view for consistent row styling
struct ScheduleRow: View {
    let period: MonThursScheduleView.Period
    let isHighlighted: Bool
    
    var body: some View {
        HStack {
            Text(period.name)
                .italic(period.name.contains("Lunch"))
            Spacer()
            Text("\(period.start)-\(period.end)")
                .frame(width: 100, alignment: .trailing)
                .monospacedDigit()
        }
        .padding(6)
        .background(isHighlighted ? Color(red: 39/255, green: 92/255, blue: 48/255).opacity(0.25) : Color.clear)
        .cornerRadius(8)
    }
}

#Preview {
    ContentView()
}
