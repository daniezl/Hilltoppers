import Foundation
import SwiftUI

struct DebugRefreshTimelineView: View {
    @State private var timestamps: [Date] = []
    @State private var isLoading: Bool = false

    private var dateFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateFormat = "MM-dd HH:mm:ss"
        f.timeZone = Date.estTimeZone
        return f
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
                    Text(dateFormatter.string(from: ts))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.primary)
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

