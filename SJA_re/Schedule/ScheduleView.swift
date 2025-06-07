import SwiftUI
import Foundation
// If you see 'Cannot find type ... in scope', ensure ScheduleModels.swift, ScheduleLoader.swift, and ScheduleTypeFetcher.swift are in the same target/module as this file.
// import SJA_re // Uncomment if you have a module named SJA_re
// ---
// To test the schedule at a specific time, set testTime below to a Date value.
// Example: let testTime = Calendar.current.date(bySettingHour: 8, minute: 30, second: 0, of: Date())
// If testTime is nil, the real current time is used.
// ---

struct ScheduleView: View {
    let testDate: Date?
    @Binding var noSchool: Bool
    @Binding var isStale: Bool
    let onLoadingComplete: () -> Void
    @ObservedObject var loader = ScheduleLoader()
    @State private var expandedBlockID: UUID?
    @State private var now = Date()
    @State private var scheduleTitle: String = "Loading..."
    


    // Use this everywhere instead of 'now'
    var currentTime: Date {
        testDate ?? now
    }

    var body: some View {
        VStack(spacing: 0) {
            if noSchool {
                Text("No school")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
                    .padding()
            } else if let (parent, sub, secondsLeft) = currentSubBlockInfo() {
                VStack {
                    Text("Now: \(sub.name)")
                        .font(.headline)
                    Text("Ends in \(formatTime(secondsLeft))")
                        .font(.subheadline)
                        .foregroundColor(.red)
                }
                .padding(.vertical, 24)
            } else if let (currentBlock, secondsLeft) = currentBlockInfo() {
                VStack {
                    Text("Now: \(currentBlock.name)")
                        .font(.headline)
                    Text("Ends in \(formatTime(secondsLeft))")
                        .font(.subheadline)
                        .foregroundColor(.red)
                }
                .padding(.vertical, 24)
            } else if let (nextBlock, seconds) = nextBlockInfo(), seconds <= 3600 {
                VStack {
                    Text("Next: \(nextBlock.name)")
                        .font(.headline)
                    Text("Starts in \(formatTime(seconds))")
                        .font(.subheadline)
                        .foregroundColor(.blue)
                }
                .padding(.vertical, 24)
            } else {
                // Determine if before first block or after all blocks
                if let lastBlock = loader.blocks.last, let lastEnd = timeToday(lastBlock.end), currentTime >= lastEnd {
                    VStack(spacing: 0) {
                        Text("School has ended, have a good day!")
                            .font(.headline)
                            // .foregroundColor(.black)
                            // .padding()
                        Button(action: {}) {
                            Text("Schedule for tomorrow")
                                .font(.body)
                                .foregroundColor(.blue)
                                // .padding()
                        }
                        .padding(.top, 2)
                    }
                    .padding(.vertical, 23)
                } else {
                    // Always reserve the same space even if no message
                    Color.clear
                        .frame(height: 89) // Adjust to match your .padding(.vertical, 24)
                        // 24 + 41(text) + 24
                }
            }
            
            // Schedule title - only show when there's actually a schedule
            if !noSchool {
                Text(scheduleTitle)
                    .font(.headline)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 40)
                    .padding(.bottom, 8)
            }
            
            List {
                ForEach(Array(loader.blocks.enumerated()), id: \.element.id) { index, block in
                    Section(header: BlockHeader(
                        block: block,
                        isCurrent: isCurrent(block: block),
                        isNext: isNextBlock(index: index),
                        expanded: expandedBlockID == block.id,
                        onTap: {
                            withAnimation {
                                expandedBlockID = expandedBlockID == block.id ? nil : block.id
                            }
                        }
                    )) {
                        if let subBlocks = block.subBlocks, expandedBlockID == block.id {
                            ForEach(subBlocks) { sub in
                                HStack {
                                    Text(sub.name)
                                    Spacer()
                                    Text("\(sub.start) - \(sub.end)")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.vertical, 2)
                                .background(isCurrent(subBlock: sub) ? Color.green.opacity(0.2) : Color.clear)
                                .cornerRadius(8)
                            }
                        }
                    }
                }
            }
            .onAppear {
                Task {
                    await refreshSchedule()
                }
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
                let secondsLeft = Int(end.timeIntervalSince(currentTime))
                return (block, secondsLeft)
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
            let diff = Int(start.timeIntervalSince(currentTime))
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

    func isNextBlock(index: Int) -> Bool {
        guard !isCurrent(block: loader.blocks[index]) else { return false }
        let block = loader.blocks[index]
        let start = timeToday(block.start) ?? Date.distantFuture
        if index == 0 {
            // Before the first block
            return currentTime < start
        } else {
            let prevEnd = timeToday(loader.blocks[index - 1].end) ?? Date.distantPast
            return currentTime >= prevEnd && currentTime < start
        }
    }

    func isCurrent(subBlock: SubBlock) -> Bool {
        guard let start = timeToday(subBlock.start), let end = timeToday(subBlock.end) else { return false }
        return currentTime >= start && currentTime < end
    }

    func currentSubBlockInfo() -> (parent: Block, sub: SubBlock, Int)? {
        for block in loader.blocks {
            guard let subBlocks = block.subBlocks else { continue }
            for sub in subBlocks {
                guard let start = timeToday(sub.start), let end = timeToday(sub.end) else { continue }
                if currentTime >= start && currentTime < end {
                    let secondsLeft = Int(end.timeIntervalSince(currentTime))
                    return (block, sub, secondsLeft)
                }
            }
        }
        return nil
    }

    func formatTime(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }

    func loadWeekdaySchedule() {
        let weekday = Calendar.current.component(.weekday, from: currentTime)
        print("Weekday: \(weekday)")
        let scheduleFile: String?
        switch weekday {
        case 2: // Monday
            scheduleFile = "schedule_mon_thu"
        case 3: // Tuesday
            scheduleFile = "schedule_mon_thu"
        case 4: // Wednesday
            scheduleFile = "schedule_wed"
        case 5: // Thursday
            scheduleFile = "schedule_mon_thu"
        case 6: // Friday
            scheduleFile = "schedule_fri"
        default: // Saturday & Sunday
            scheduleFile = nil
        }
        if let file = scheduleFile {
            loader.loadSchedule(from: file)
            noSchool = false
        } else {
            loader.blocks = []
            noSchool = true
        }
    }

    // MARK: - Refresh and Staleness Functions
    
    @MainActor
    func refreshSchedule() async {
        
        var firebaseSucceeded = false
        
        do {
            // 1. Check if in break
            if try await ScheduleTypeFetcher.isInSpecialPeriod(date: currentTime) {
                noSchool = true
                loader.blocks = []
                print("In break")
                firebaseSucceeded = true
            }
            // 2. Try to find special_day and get type
            else if let type = try await ScheduleTypeFetcher.fetchTypeFor(date: currentTime) {
                if type == "no_school" {
                    noSchool = true
                    loader.blocks = []
                    print("No school")
                    firebaseSucceeded = true
                } else if type == "custom" {
                    // 3. If type is custom, read the custom schedule
                    if let blocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: currentTime) {
                        loader.blocks = blocks
                        noSchool = false
                        print("Custom schedule")
                        scheduleTitle = "Custom Schedule"
                        firebaseSucceeded = true
                    }
                } else {
                    // try to load (type).json
                    loader.loadSchedule(from: type)
                    if !loader.blocks.isEmpty {
                        noSchool = false
                        print("Schedule from \(type).json")
                        scheduleTitle = type.capitalized.replacingOccurrences(of: "_", with: " ")
                        firebaseSucceeded = true
                    }
                }
            }
            
            // If Firebase calls succeeded, clear stale flag
            if firebaseSucceeded {
                isStale = false
            } else {
                // Firebase responded but no data found, fall back to local
                print("No Firebase data found, using local schedule")
                loadWeekdaySchedule()
                scheduleTitle = getWeekdayTitle()
            }
            
        } catch {
            // Firebase calls failed (network issue, blocked, etc.)
            print("Error refreshing schedule (Firebase failed): \(error)")
            loadWeekdaySchedule() // Fallback to local data
            scheduleTitle = getWeekdayTitle()
            // Keep isStale = true since Firebase failed
        }
        
        // Signal that loading is complete
        print("Debug: ScheduleView calling onLoadingComplete")
        onLoadingComplete()
    }
    


    func getWeekdayTitle() -> String {
        let weekday = Calendar.current.component(.weekday, from: currentTime)
        switch weekday {
        case 2: return "Monday Schedule"
        case 3: return "Tuesday Schedule" 
        case 4: return "Wednesday Schedule"
        case 5: return "Thursday Schedule"
        case 6: return "Friday Schedule"
        default: return "Weekday Schedule"
        }
    }
}

struct BlockHeader: View {
    let block: Block
    let isCurrent: Bool
    let isNext: Bool
    let expanded: Bool
    let onTap: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(block.name)
                    .font(.headline)
                    .foregroundColor(isCurrent ? .green : (isNext ? .green : .primary))
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
        .padding(.vertical, 0)
        .background(isCurrent ? Color.green.opacity(0.2) : Color.clear)
        .overlay(
            isNext ?
                RoundedRectangle(cornerRadius: 8)
                    .stroke(style: StrokeStyle(lineWidth: 3, dash: [6]))
                    .foregroundColor(Color.green.opacity(0.7))
                : nil
        )
        .cornerRadius(8)
    }
}

#Preview {
    ScheduleView(testDate: nil, noSchool: .constant(false), isStale: .constant(true), onLoadingComplete: {})
}
