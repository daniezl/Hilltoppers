//
//  ClassCountdownWidget.swift
//  ClassCountdownWidget
//
//  Created by Daniel Zhang on 9/6/25.
//

import WidgetKit
import SwiftUI

struct ClassCountdownEntry: TimelineEntry {
    let date: Date
    let countdownText: String
}

struct ClassCountdownProvider: TimelineProvider {
    func placeholder(in context: Context) -> ClassCountdownEntry {
        ClassCountdownEntry(date: Date(), countdownText: "15:23")
    }
    
    func getSnapshot(in context: Context, completion: @escaping (ClassCountdownEntry) -> ()) {
        let entry = ClassCountdownEntry(date: Date(), countdownText: "15:23")
        completion(entry)
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<ClassCountdownEntry>) -> ()) {
        // Read saved data from UserDefaults (updated by main app)
        let countdownText = UserDefaults(suiteName: "group.danielzhang.Hilltoppers2")?.string(forKey: "widgetCountdown") ?? "--:--"
        
        let entry = ClassCountdownEntry(date: Date(), countdownText: countdownText)
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60))) // Update every minute
        completion(timeline)
    }
}

struct ClassCountdownWidgetEntryView: View {
    var entry: ClassCountdownProvider.Entry
    
    var body: some View {
        Text(entry.countdownText)
            .font(.system(size: 16, weight: .bold, design: .monospaced))
            .foregroundColor(.primary)
    }
}

struct ClassCountdownWidget: Widget {
    let kind: String = "ClassCountdownWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClassCountdownProvider()) { entry in
            ClassCountdownWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Class Countdown")
        .description("Shows time remaining in current class.")
        .supportedFamilies([.accessoryRectangular])
    }
}
