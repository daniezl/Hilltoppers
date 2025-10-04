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
    let dayType: String?
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
        return ClassCountdownEntry(date: Date(), phase: .blockEnds(sampleEvent), dayType: "Green Day")
    }

    func getSnapshot(in context: Context, completion: @escaping (ClassCountdownEntry) -> Void) {
        let now = Date()
        if let payload = loadPayload() {
            let entries = buildEntries(from: payload, referenceDate: now)
            completion(entries.first ?? ClassCountdownEntry(date: now, phase: .empty, dayType: payload.dayTypeDisplay))
        } else {
            completion(placeholder(in: context))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClassCountdownEntry>) -> Void) {
        let now = Date()

        guard let payload = loadPayload() else {
            let entry = ClassCountdownEntry(date: now, phase: .empty, dayType: nil)
            let timeline = Timeline(entries: [entry], policy: .after(now.addingTimeInterval(1800)))
            completion(timeline)
            return
        }

        var entries = buildEntries(from: payload, referenceDate: now)
        if entries.isEmpty {
            entries = [ClassCountdownEntry(date: now, phase: .empty, dayType: payload.dayTypeDisplay)]
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
        let dayType = payload.dayTypeDisplay

        if let reason = payload.noSchoolReason, !reason.isEmpty {
            return [ClassCountdownEntry(date: referenceDate, phase: .noSchool(reason), dayType: dayType)]
        }

        let calendar = Calendar.sja
        guard calendar.isDate(payload.scheduleDate, inSameDayAs: referenceDate) else {
            return [ClassCountdownEntry(date: referenceDate, phase: .stale, dayType: dayType)]
        }

        let events = payload.events.sorted { $0.startDate < $1.startDate }
        guard !events.isEmpty else {
            return [ClassCountdownEntry(date: referenceDate, phase: .finished, dayType: dayType)]
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
            ClassCountdownEntry(date: point, phase: phase(at: point, events: events), dayType: dayType)
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
    @Environment(\.colorScheme) private var colorScheme

    @ViewBuilder
    var body: some View {
        let base = Group {
            switch family {
            case .systemSmall:
                smallWidgetBody
            default:
                rectangularBody
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        if #available(iOSApplicationExtension 17.0, *) {
            if family == .systemSmall {
                base.containerBackground(widgetBackgroundColor, for: .widget)
            } else {
                base.containerBackground(.fill, for: .widget)
            }
        } else {
            if family == .systemSmall {
                base.background(widgetBackgroundColor)
            } else {
                base
            }
        }
    }

    private var rectangularBody: some View {
        contentView()
    }

    private var smallWidgetBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            contentView()
            if let dayType = entry.dayType?.trimmingCharacters(in: .whitespacesAndNewlines), !dayType.isEmpty {
                Text(dayType)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(secondaryTextColor)
                    .lineLimit(1)
                    .padding(.top, 4)
            }
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
                .foregroundColor(primaryTextColor)
            Text(verb)
                .font(.system(size: 10))
                .foregroundColor(secondaryTextColor)
            timerText(to: target)
        }
    }

    private func summaryView(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .foregroundColor(primaryTextColor)
            Text(subtitle)
                .font(.system(size: 10))
                .foregroundColor(secondaryTextColor)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
    }

    private func timerText(to target: Date) -> some View {
        let clampedTarget = target > entry.date ? target : entry.date
        let range = entry.date...clampedTarget
        let fontSize: CGFloat = family == .systemSmall ? 32 : 18
        return Text(timerInterval: range, countsDown: true)
            .font(.system(size: fontSize, weight: .bold, design: .monospaced))
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

private extension ClassCountdownWidgetEntryView {
    var usesCustomPalette: Bool { family == .systemSmall }

    var accentGreen: Color {
        Color(red: 20/255, green: 54/255, blue: 27/255)
    }

    var widgetBackgroundColor: Color {
        guard usesCustomPalette else { return Color(.systemBackground) }
        return colorScheme == .dark ? accentGreen : .white
    }

    var primaryTextColor: Color {
        guard usesCustomPalette else { return .primary }
        return colorScheme == .dark ? .white : accentGreen
    }

    var secondaryTextColor: Color {
        guard usesCustomPalette else { return .secondary }
        let base = colorScheme == .dark ? Color.white : accentGreen
        let opacity: Double = colorScheme == .dark ? 0.85 : 0.75
        return base.opacity(opacity)
    }
}

#if DEBUG
struct ClassCountdownWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ClassCountdownWidgetEntryView(entry: previewEntryEnding)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small – Ending")

            ClassCountdownWidgetEntryView(entry: previewEntryStarting)
                .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                .previewDisplayName("Accessory – Starting")
        }
    }

    private static var previewEntryEnding: ClassCountdownEntry {
        let event = WidgetClassEvent(
            blockName: "A Block",
            displayName: "A Block",
            startDate: Date().addingTimeInterval(-20 * 60),
            endDate: Date().addingTimeInterval(10 * 60)
        )
        return ClassCountdownEntry(date: Date(), phase: .blockEnds(event), dayType: "Green Day")
    }

    private static var previewEntryStarting: ClassCountdownEntry {
        let event = WidgetClassEvent(
            blockName: "B Block",
            displayName: "B Block",
            startDate: Date().addingTimeInterval(15 * 60),
            endDate: Date().addingTimeInterval(75 * 60)
        )
        return ClassCountdownEntry(date: Date(), phase: .blockStarts(event), dayType: "White Day")
    }
}
#endif
