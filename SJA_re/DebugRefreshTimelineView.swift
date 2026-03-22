import Foundation
import SwiftUI

struct DebugRefreshTimelineView: View {
    @State private var timestamps: [Date] = []
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
    private func timelineRowParts(for date: Date) -> (prefix: String, time: String) {
        let cal = Calendar.sja
        let eventDay = cal.startOfDay(for: date)
        let today = cal.startOfDay(for: Date())
        let timePart = timeOnlyFormatter.string(from: date)
        guard let yesterday = cal.date(byAdding: .day, value: -1, to: today) else {
            return (monthDayFormatter.string(from: date), timePart)
        }
        if eventDay == today {
            return ("Today", timePart)
        }
        if eventDay == yesterday {
            return ("Yesterday", timePart)
        }
        return (monthDayFormatter.string(from: date), timePart)
    }

    var body: some View {
        List {
            if isLoading {
                Text("Loading...")
                    .foregroundColor(.secondary)
            } else if timestamps.isEmpty {
                Text("No background refresh records.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(timestamps, id: \.self) { ts in
                    let parts = timelineRowParts(for: ts)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(parts.prefix)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.primary)
                        Spacer(minLength: 8)
                        Text(parts.time)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.primary)
                            .monospacedDigit()
                            .multilineTextAlignment(.trailing)
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
        timestamps = loaded
            .filter { event in
                // 只保留后台刷新开始时间（含 6 小时 app-refresh task 与每日 midnight task）
                switch event.kind {
                case .widgetBackgroundRefreshStart, .widgetDailyRefreshStart:
                    return true
                default:
                    return false
                }
            }
            .map(\.timestamp)
            .sorted(by: >)
        isLoading = false
    }
}

