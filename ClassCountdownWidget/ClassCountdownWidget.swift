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
    let phase: ClassCountdownPhase
}

struct ClassCountdownProvider: TimelineProvider {
    private let suiteName = "group.danielzhang.Hilltoppers2"
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    func placeholder(in context: Context) -> ClassCountdownEntry {
        let sampleEvent = WidgetClassEvent(
            blockName: "A Block",
            displayName: "A Block",
            startDate: Date().addingTimeInterval(-600),
            endDate: Date().addingTimeInterval(1800)
        )
        return ClassCountdownEntry(date: Date(), phase: .blockEnds(sampleEvent))
    }

    func getSnapshot(in context: Context, completion: @escaping (ClassCountdownEntry) -> Void) {
        let now = Date()
        if let payload = loadPayload() {
            let entries = buildEntries(from: payload, referenceDate: now)
            completion(entries.first ?? ClassCountdownEntry(date: now, phase: .empty))
        } else {
            completion(placeholder(in: context))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClassCountdownEntry>) -> Void) {
        let now = Date()

        guard let payload = loadPayload() else {
            let entry = ClassCountdownEntry(date: now, phase: .empty)
            let timeline = Timeline(entries: [entry], policy: .after(now.addingTimeInterval(1800)))
            completion(timeline)
            return
        }

        var entries = buildEntries(from: payload, referenceDate: now)
        if entries.isEmpty {
            entries = [ClassCountdownEntry(date: now, phase: .empty)]
        }

        let policy: TimelineReloadPolicy
        if entries.count == 1 {
            policy = .after(now.addingTimeInterval(1800))
        } else {
            policy = .atEnd
        }

        completion(Timeline(entries: entries, policy: policy))
    }

    private func loadPayload() -> ClassCountdownWidgetPayload? {
        guard let data = UserDefaults(suiteName: suiteName)?.data(forKey: widgetPayloadKey) else { return nil }
        return try? decoder.decode(ClassCountdownWidgetPayload.self, from: data)
    }

    private func buildEntries(from payload: ClassCountdownWidgetPayload, referenceDate: Date) -> [ClassCountdownEntry] {
        if let reason = payload.noSchoolReason, !reason.isEmpty {
            return [ClassCountdownEntry(date: referenceDate, phase: .noSchool(reason))]
        }

        let calendar = Calendar.sja
        guard calendar.isDate(payload.scheduleDate, inSameDayAs: referenceDate) else {
            return [ClassCountdownEntry(date: referenceDate, phase: .stale)]
        }

        let events = payload.events.sorted { $0.startDate < $1.startDate }
        guard !events.isEmpty else {
            return [ClassCountdownEntry(date: referenceDate, phase: .finished)]
        }

        var timelinePoints: Set<Date> = [referenceDate]
        for event in events {
            if event.startDate >= referenceDate {
                timelinePoints.insert(event.startDate)
            }
            if event.endDate >= referenceDate {
                timelinePoints.insert(event.endDate)
            }
        }

        let sortedPoints = timelinePoints.sorted()
        return sortedPoints.map { point in
            ClassCountdownEntry(date: point, phase: phase(at: point, events: events))
        }
    }

    private func phase(at date: Date, events: [WidgetClassEvent]) -> ClassCountdownPhase {
        if let current = events.first(where: { date >= $0.startDate && date < $0.endDate }) {
            return .blockEnds(current)
        }
        if let next = events.first(where: { $0.startDate > date }) {
            return .blockStarts(next)
        }
        return .finished
    }
}

struct ClassCountdownWidgetEntryView: View {
    var entry: ClassCountdownProvider.Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                smallWidgetBody
            default:
                rectangularBody
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var rectangularBody: some View {
        contentView()
    }

    private var smallWidgetBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            contentView()
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func contentView() -> some View {
        switch entry.phase {
        case .blockStarts(let event):
            countdownView(title: event.displayName, verb: "Starts in", target: event.startDate)
        case .blockEnds(let event):
            countdownView(title: event.displayName, verb: "Ends in", target: event.endDate)
        case .finished:
            summaryView(title: "All done", subtitle: "No more classes")
        case .noSchool(let reason):
            summaryView(title: "No School", subtitle: reason)
        case .stale:
            summaryView(title: "Open App", subtitle: "Refresh schedule")
        case .empty:
            summaryView(title: "Schedule", subtitle: "Unavailable")
        }
    }

    private func countdownView(title: String, verb: String, target: Date) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
            Text(verb)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
            timerText(to: target)
        }
    }

    private func summaryView(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
            Text(subtitle)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }

    private func timerText(to target: Date) -> some View {
        let clampedTarget = target > entry.date ? target : entry.date
        let range = entry.date...clampedTarget
        return Text(timerInterval: range, countsDown: true)
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
        .description("Shows the remaining time for today's classes.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}
