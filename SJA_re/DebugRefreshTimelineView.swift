import Foundation
import SwiftUI

struct DebugRefreshTimelineView: View {
    private struct TimelineRow: Identifiable {
        let day: Date
        let refreshTimestamp: Date?
        let openStatusText: String?

        var id: Date { day }
    }

    @State private var rows: [TimelineRow] = []
    @State private var isLoading: Bool = false

    private var timeOnlyFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        f.timeZone = Date.estTimeZone
        return f
    }

    private var monthDayFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "MM-dd"
        f.timeZone = Date.estTimeZone
        return f
    }

    /// 与课表一致用 EST 日历日；今天/昨天显示为 Today / Yesterday；时间右对齐。
    private func timelineRowParts(for day: Date, refreshTimestamp: Date?) -> (prefix: String, time: String, hasRefresh: Bool) {
        let cal = Calendar.sja
        let eventDay = cal.startOfDay(for: day)
        let today = cal.startOfDay(for: Date())
        let hasRefresh = refreshTimestamp != nil
        let timePart = refreshTimestamp.map { timeOnlyFormatter.string(from: $0) } ?? "not refreshed"
        guard let yesterday = cal.date(byAdding: .day, value: -1, to: today) else {
            return (monthDayFormatter.string(from: day), timePart, hasRefresh)
        }
        if eventDay == today {
            return ("Today", timePart, hasRefresh)
        }
        if eventDay == yesterday {
            return ("Yesterday", timePart, hasRefresh)
        }
        return (monthDayFormatter.string(from: day), timePart, hasRefresh)
    }

    var body: some View {
        List {
            if isLoading {
                Text("Loading...")
                    .foregroundColor(.secondary)
            } else if rows.isEmpty {
                Text("No background refresh records.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(rows) { row in
                    let parts = timelineRowParts(for: row.day, refreshTimestamp: row.refreshTimestamp)
                    ZStack {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(parts.prefix)
                                .font(.footnote.weight(.semibold))
                                .foregroundColor(.primary)
                            Spacer(minLength: 8)
                            Text(parts.time)
                                .font(.footnote.weight(.semibold))
                                .foregroundColor(parts.hasRefresh ? .primary : .secondary)
                                .monospacedDigit()
                                .multilineTextAlignment(.trailing)
                                .lineLimit(1)
                        }
                        Text(row.openStatusText ?? "")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle("Refresh Timeline")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            reload()
        }
    }

    private func reload() {
        isLoading = true
        let loaded = RefreshTimelineStore.loadRecent()
        let cal = Calendar.sja
        let today = cal.startOfDay(for: Date())
        let daysToShow = 7

        let openedDays = Set(
            loaded
                .filter { $0.kind == .appActiveStart }
                .map { cal.startOfDay(for: $0.timestamp) }
        )

        let refreshEvents = loaded.filter { event in
            // 只保留后台刷新开始时间（含 6 小时 app-refresh task 与每日 midnight task）
            switch event.kind {
            case .widgetBackgroundRefreshStart, .widgetDailyRefreshStart:
                return true
            default:
                return false
            }
        }

        let latestRefreshByDay = Dictionary(
            grouping: refreshEvents,
            by: { cal.startOfDay(for: $0.timestamp) }
        ).mapValues { events in
            events.map(\.timestamp).max()
        }

        let knownRefreshDays = Set(
            latestRefreshByDay.keys
        )

        rows = (0..<daysToShow).compactMap { offset in
            guard let day = cal.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let refreshTimestamp = latestRefreshByDay[day] ?? nil
            let status: String?
            if openedDays.contains(day) {
                status = "opened"
            } else if knownRefreshDays.contains(day) {
                status = "not opened"
            } else {
                status = nil
            }
            return TimelineRow(
                day: day,
                refreshTimestamp: refreshTimestamp,
                openStatusText: status
            )
        }
            .sorted(by: { $0.day > $1.day })
        isLoading = false
    }
}

