import SwiftUI
// ---
// To test the schedule at a specific time, set testTime below to a Date value.
// Example: let testTime = Calendar.current.date(bySettingHour: 8, minute: 30, second: 0, of: Date())
// If testTime is nil, the real current time is used.
// ---

struct ScheduleView: View {
    // Set this to a specific Date to test, or nil to use real time
    let testTime: Date? = Calendar.current.date(bySettingHour: 8, minute: 2, second: 0, of: Date()) // Example: Calendar.current.date(bySettingHour: 8, minute: 30, second: 0, of: Date())
    @ObservedObject var loader = ScheduleLoader()
    @State private var expandedBlockID: UUID?
    @State private var now = Date()
    
    // Timer to update 'now' every minute
    private let timer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    // Use this everywhere instead of 'now'
    var currentTime: Date {
        testTime ?? now
    }

    var body: some View {
        VStack(spacing: 0) {
            if let (currentBlock, minutesLeft) = currentBlockInfo() {
                VStack {
                    Text("Now: \(currentBlock.name)")
                        .font(.headline)
                    Text("Ends in \(minutesLeft) min")
                        .font(.subheadline)
                        .foregroundColor(.red)
                }
                .padding(.vertical, 8)
            } else if let (nextBlock, minutes) = nextBlockInfo(), minutes <= 60 {
                VStack {
                    Text("Next: \(nextBlock.name)")
                        .font(.headline)
                    Text("Starts in \(minutes) min")
                        .font(.subheadline)
                        .foregroundColor(.blue)
                }
                .padding(.vertical, 8)
            }
            List {
                ForEach(loader.blocks) { block in
                    Section(header: BlockHeader(block: block, isCurrent: isCurrent(block: block), expanded: expandedBlockID == block.id, onTap: {
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
            .onReceive(timer) { input in
                now = Date()
            }
        }
    }

    // Helper functions
    func isCurrent(block: Block) -> Bool {
        guard let start = timeToday(block.start), let end = timeToday(block.end) else { return false }
        return currentTime >= start && currentTime < end
    }

    func currentBlockInfo() -> (Block, Int)? {
        for block in loader.blocks {
            guard let start = timeToday(block.start), let end = timeToday(block.end) else { continue }
            if currentTime >= start && currentTime < end {
                let minutesLeft = Int(end.timeIntervalSince(currentTime) / 60)
                return (block, minutesLeft)
            }
        }
        return nil
    }

    func nextBlockInfo() -> (Block, Int)? {
        // Find the next block that hasn't started yet, and only if not currently in a block
        if loader.blocks.isEmpty { return nil }
        if loader.blocks.contains(where: isCurrent) { return nil }
        let futureBlocks = loader.blocks.compactMap { block -> (Block, Int)? in
            guard let start = timeToday(block.start) else { return nil }
            let diff = Int(start.timeIntervalSince(currentTime) / 60)
            return diff > 0 ? (block, diff) : nil
        }
        return futureBlocks.min(by: { $0.1 < $1.1 })
    }

    func timeToday(_ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let calendar = Calendar.current
        guard let t = formatter.date(from: time) else { return nil }
        let comps = calendar.dateComponents([.year, .month, .day], from: currentTime)
        return calendar.date(bySettingHour: calendar.component(.hour, from: t), minute: calendar.component(.minute, from: t), second: 0, of: calendar.date(from: comps)!)
    }
}

struct BlockHeader: View {
    let block: Block
    let isCurrent: Bool
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