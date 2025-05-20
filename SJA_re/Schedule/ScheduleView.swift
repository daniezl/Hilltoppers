import SwiftUI

struct ScheduleView: View {
    @ObservedObject var loader = ScheduleLoader()
    @State private var expandedBlockID: UUID?

    var body: some View {
        List {
            ForEach(loader.blocks) { block in
                Section(header: BlockHeader(block: block, isCurrent: isCurrent(block: block), timeInfo: timeInfo(for: block), expanded: expandedBlockID == block.id, onTap: {
                    withAnimation {
                        expandedBlockID = expandedBlockID == block.id ? nil : block.id
                    }
                })) {
                    if let subBlocks = block.subBlocks, expandedBlockID == block.id {
                        ForEach(subBlocks) { sub in
                            HStack {
                                Text(sub.name)
                                Spacer()
                                Text("\(sub.start) - \(sub.end)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            loader.loadSchedule(from: "schedule") // schedule.json
        }
    }

    // Helper functions
    func isCurrent(block: Block) -> Bool {
        let now = Date()
        guard let start = timeToday(block.start), let end = timeToday(block.end) else { return false }
        return now >= start && now < end
    }

    func timeInfo(for block: Block) -> String {
        let now = Date()
        guard let start = timeToday(block.start), let end = timeToday(block.end) else { return "" }
        if now < start {
            let diff = Int(start.timeIntervalSince(now) / 60)
            return "Starts in \(diff) min"
        } else if now < end {
            let diff = Int(end.timeIntervalSince(now) / 60)
            return "\(diff) min left"
        }
        return ""
    }

    func timeToday(_ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let calendar = Calendar.current
        guard let t = formatter.date(from: time) else { return nil }
        let comps = calendar.dateComponents([.year, .month, .day], from: Date())
        return calendar.date(bySettingHour: calendar.component(.hour, from: t), minute: calendar.component(.minute, from: t), second: 0, of: calendar.date(from: comps)!)
    }
}

struct BlockHeader: View {
    let block: Block
    let isCurrent: Bool
    let timeInfo: String
    let expanded: Bool
    let onTap: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(block.name)
                    .font(.headline)
                    .foregroundColor(isCurrent ? .green : .primary)
                Text("\(block.start) - \(block.end)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            if !timeInfo.isEmpty {
                Text(timeInfo)
                    .font(.caption)
                    .foregroundColor(.blue)
            }
            if block.subBlocks != nil {
                Button(action: onTap) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .foregroundColor(.gray)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(.vertical, 4)
        .background(isCurrent ? Color.green.opacity(0.2) : Color.clear)
        .cornerRadius(8)
    }
}