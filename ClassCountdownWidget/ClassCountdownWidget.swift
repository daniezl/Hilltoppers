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

        var entries: [ClassCountdownEntry] = []
        var visited: Set<Date> = []
        var cursor = referenceDate

        // Step through upcoming events, adding minute-level entries when the countdown spans an hour so
        // the custom hour/minute display keeps updating smoothly.
        while !visited.contains(cursor) {
            visited.insert(cursor)

            let phase = phase(at: cursor, events: events)
            entries.append(ClassCountdownEntry(date: cursor, phase: phase, dayType: dayType))

            guard let nextDate = nextTimelineDate(after: cursor, phase: phase, events: events) else {
                break
            }

            if nextDate <= cursor {
                break
            }

            cursor = nextDate
        }

        return entries
    }


    private func nextTimelineDate(after date: Date, phase: ClassCountdownPhase, events: [WidgetClassEvent]) -> Date? {
        switch phase {
        case .blockStarts(let event):
            return nextCountdownStep(from: date, to: event.startDate, events: events)
        case .blockEnds(let event):
            return nextCountdownStep(from: date, to: event.endDate, events: events)
        case .finished, .noSchool(_), .stale, .empty:
            return nextSignificantEventDate(after: date, events: events)
        }
    }

    private func nextCountdownStep(from currentDate: Date, to target: Date, events: [WidgetClassEvent]) -> Date? {
        guard target > currentDate else {
            return nextSignificantEventDate(after: currentDate, events: events)
        }

        if target.timeIntervalSince(currentDate) >= 3600 {
            return min(target, currentDate.addingTimeInterval(60))
        }

        return target
    }

    private func nextSignificantEventDate(after date: Date, events: [WidgetClassEvent]) -> Date? {
        var candidate: Date?

        for event in events {
            if event.startDate > date {
                candidate = min(candidate ?? event.startDate, event.startDate)
            }
            if event.endDate > date {
                candidate = min(candidate ?? event.endDate, event.endDate)
            }
        }

        return candidate
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

        if family == .systemSmall {
            if #available(iOSApplicationExtension 17.0, *) {
                base.containerBackground(widgetBackgroundColor, for: .widget)
            } else {
                base.background(widgetBackgroundColor)
            }
        } else {
            if #available(iOSApplicationExtension 17.0, *) {
                base.containerBackground(.fill, for: .widget)
            } else {
                base
            }
        }
    }

    private var rectangularBody: some View {
        contentView()
    }

    private var smallWidgetBody: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(alignment: isCountdownPhase ? .leading : .center, spacing: 4) {
                contentView()
                if shouldShowDayType, let dayType = entry.dayType?.trimmingCharacters(in: .whitespacesAndNewlines), !dayType.isEmpty {
                    Text(dayType)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(secondaryTextColor)
                        .lineLimit(1)
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: isCountdownPhase ? .leading : .center)
            Spacer(minLength: 0)
        }
        .padding(12)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var shouldShowDayType: Bool {
        isCountdownPhase
    }

    @ViewBuilder
    private func contentView() -> some View {
        switch entry.phase {
        case .blockStarts(let event):
            countdownView(title: event.displayName, verb: "Starts in", target: event.startDate)
        case .blockEnds(let event):
            countdownView(title: event.displayName, verb: "Ends in", target: event.endDate)
        case .finished:
            summaryView(title: "School Ended", subtitle: "Have a good day", centered: shouldCenterSummaryContent)
        case .noSchool(let reason):
            summaryView(title: "No School", subtitle: reason, centered: shouldCenterSummaryContent)
        case .stale:
            summaryView(title: "Open App", subtitle: "Refresh schedule", centered: shouldCenterSummaryContent)
        case .empty:
            summaryView(title: "Schedule", subtitle: "Unavailable", centered: shouldCenterSummaryContent)
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

    private func summaryView(title: String, subtitle: String, centered: Bool) -> some View {
        let titleFontSize: CGFloat = centered ? 24 : 12
        let subtitleFontSize: CGFloat = centered ? 12 : 10
        let titleWeight: Font.Weight = centered ? .bold : .semibold
        let subtitleWeight: Font.Weight = centered ? .semibold : .regular
        return VStack(alignment: centered ? .center : .leading, spacing: 2) {
            Text(title)
                .font(.system(size: titleFontSize, weight: titleWeight))
                .lineLimit(centered ? 2 : 1)
                .multilineTextAlignment(centered ? .center : .leading)
                .foregroundColor(primaryTextColor)
                .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
            Text(subtitle)
                .font(.system(size: subtitleFontSize, weight: subtitleWeight))
                .foregroundColor(secondaryTextColor)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(centered ? .center : .leading)
                .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
        }
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }

    @ViewBuilder
    private func timerText(to target: Date) -> some View {
        let clampedTarget = target > entry.date ? target : entry.date
        let range = entry.date...clampedTarget
        let fontSize: CGFloat = family == .systemSmall ? 32 : 18
        let remaining = max(clampedTarget.timeIntervalSince(entry.date), 0)

        if family == .systemSmall, remaining >= 3600 {
            Text(hourMinuteString(for: remaining))
                .font(.system(size: fontSize, weight: .bold, design: .monospaced))
                .foregroundColor(primaryTextColor)
        } else {
            Text(timerInterval: range, countsDown: true)
                .font(.system(size: fontSize, weight: .bold, design: .monospaced))
                .foregroundColor(family == .systemSmall ? primaryTextColor : .primary)
        }
    }

    private func hourMinuteString(for interval: TimeInterval) -> String {
        let totalMinutes = max(Int(interval / 60), 0)
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60

        if hours <= 0 {
            return "\(minutes)m"
        }

        if minutes == 0 {
            return "\(hours)h"
        }

        return "\(hours)h\(minutes)m"
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
    var isCountdownPhase: Bool {
        switch entry.phase {
        case .blockStarts(_), .blockEnds(_):
            return true
        case .finished, .noSchool(_), .stale, .empty:
            return false
        }
    }

    var shouldCenterSummaryContent: Bool {
        family == .systemSmall && !isCountdownPhase
    }

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
