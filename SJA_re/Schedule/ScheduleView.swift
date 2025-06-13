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
    @ObservedObject var loader: ScheduleLoader
    let onLoadingComplete: () -> Void
    let onPullRefresh: () async -> Void
    @State private var expandedBlockID: UUID?
    @State private var now = Date()
    @State private var scheduleTitle: String = "Loading..."
    @State private var timeUpdateTimer: Timer?

    


    // Use this everywhere instead of 'now'
    var currentTime: Date {
        testDate ?? now
    }
    
    // Always show all blocks, control visibility with opacity/transform
    var displayBlocks: [Block] {
        loader.blocks
    }

    var body: some View {
        VStack(spacing: 0) {
            if noSchool {
                Text("No school")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
                    .padding()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Schedule card
                        VStack(spacing: 0) {
                            // Schedule title inside card
                            HStack {
                                Text(scheduleTitle.lowercased() == "abdec" ? scheduleTitle.uppercased() : scheduleTitle)
                                    .font(.headline)
                                    .fontWeight(.bold)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                            .padding(.bottom, 8)
                            
                            Divider()
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8) // between title and blocks
                            
                                                        ForEach(loader.blocks) { block in
                                VStack(spacing: 0) {
                                    // Time info above highlighted block (only if dropdown is closed)
                                    if expandedBlockID != block.id {
                                        if isCurrent(block: block) {
                                            if let (currentBlock, secondsLeft) = currentBlockInfo() {
                                                HStack {
                                                    Spacer()
                                                    Text("Ends in \(formatTime(secondsLeft))")
                                                        .font(.caption)
                                                        .foregroundColor(.green)
                                                }
                                                .padding(.horizontal, 32) // align with highlight edge
                                                .padding(.bottom, 4)
                                            }
                                        } else if isNextUpcomingBlock(block) {
                                            if let (nextBlock, seconds) = nextBlockInfo() {
                                                HStack {
                                                    Spacer()
                                                    Text("Starts in \(formatTime(seconds))")
                                                        .font(.caption)
                                                        .foregroundColor(.blue)
                                                }
                                                .padding(.horizontal, 32) // align with dashed line edge
                                                .padding(.bottom, 4)
                                            }
                                        }
                                    }
                                    
                                    // Main block row
                                    HStack {
                                        Text(block.name)
                                            .font((isCurrent(block: block) || isNextUpcomingBlock(block)) ? .title2.weight(.bold) : .callout.weight(.medium))
                                            .foregroundColor(isRegularClassBlock(block.name) ? .primary : .secondary)
                                        Spacer()
                                        Text("\(block.start)-\(block.end)")
                                            .font(.callout.weight(.regular))
                                            .monospacedDigit()
                                            .foregroundColor(isRegularClassBlock(block.name) ? .primary : .secondary)
                                        
                                        // Consistent chevron space for alignment
                                        if block.subBlocks != nil {
                                            Image(systemName: expandedBlockID == block.id ? "chevron.down" : "chevron.right")
                                                .font(.system(size: 12, weight: .semibold))
                                        } else {
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 12, weight: .semibold))
                                                .opacity(0) // invisible but takes up space
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8) // between blocks
                                    .background(
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(isCurrent(block: block) ? Color.green.opacity(0.15) : Color.clear)
                                            .padding(.horizontal, 8) // gap from card edges
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                                            .foregroundColor(isNextUpcomingBlock(block) ? Color.green : Color.clear)
                                            .padding(.horizontal, 8) // gap from card edges
                                    )
                                    .onTapGesture {
                                        if block.subBlocks != nil {
                                            withAnimation(.easeInOut(duration: 0.3)) {
                                                expandedBlockID = expandedBlockID == block.id ? nil : block.id
                                            }
                                        }
                                    }
                                    
                                    // Matching bottom padding for current blocks (to balance the timer above)
                                    if isCurrent(block: block) && expandedBlockID != block.id {
                                        Color.clear
                                            .frame(height: 8) // matches timer text height + padding
                                    }
                                    
                                    // SubBlocks dropdown
                                    if expandedBlockID == block.id, let subBlocks = block.subBlocks {
                                        VStack(spacing: 0) {
                                            ForEach(subBlocks) { sub in
                                                VStack(spacing: 0) {
                                                    // Time info above current subblock
                                                    if isCurrent(subBlock: sub) {
                                                        if let end = timeToday(sub.end) {
                                                            let secondsLeft = Int(end.timeIntervalSince(currentTime))
                                                            HStack {
                                                                Spacer()
                                                                Text("Ends in \(formatTime(secondsLeft))")
                                                                    .font(.caption)
                                                                    .foregroundColor(.green)
                                                            }
                                                            .padding(.leading, 32) // align with subblock content
                                                            .padding(.trailing, 34) // align with subblock times
                                                            .padding(.bottom, 4)
                                                        }
                                                    }
                                                    
                                                    // Subblock row
                                                HStack {
                                                    Text(sub.name)
                                                        .font(.caption)
                                                        .foregroundColor(.secondary)
                                                    Spacer()
                                                    Text("\(sub.start)-\(sub.end)")
                                                        .font(.caption)
                                                        .monospacedDigit()
                                                        .foregroundColor(.secondary)
                                                    
                                                    // Invisible chevron for alignment
                                                    Image(systemName: "chevron.right")
                                                        .font(.system(size: 12, weight: .semibold))
                                                        .opacity(0)
                                                }
                                                .padding(.leading, 32) // indent from left
                                                .padding(.trailing, 16) // same as main blocks
                                                .padding(.vertical, 6)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 6)
                                                        .fill(isCurrent(subBlock: sub) ? Color.green.opacity(0.1) : Color.clear)
                                                        .padding(.horizontal, 8)
                                                )
                                                }
                                            }
                                        }
                                        .background(Color.gray.opacity(0.05))
                                        .cornerRadius(8)
                                        .padding(.horizontal, 8)
                                        .transition(.opacity.combined(with: .move(edge: .top)))
                                    }
                                }
                            }
                        }
                        .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                        .cornerRadius(12)
                    }
                    .padding(.leading, 50) // more space on left
                    .padding(.trailing, 30) // less space on right
                    .padding(.top, 8)
                }
            }
        }
        .onAppear {
            loader.showBlocks = false
            startTimeUpdateTimer()
            Task {
                await refreshSchedule()
            }
        }
        .onDisappear {
            stopTimeUpdateTimer()
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
    
    func isNextUpcomingBlock(_ block: Block) -> Bool {
        // Don't show dashed border if currently in a block
        if loader.blocks.contains(where: { isCurrent(block: $0) }) {
            return false
        }
        
        // Find if this block is the next upcoming one
        if let nextInfo = nextBlockInfo() {
            return block.id == nextInfo.0.id
        }
        
        return false
    }
    
    func isRegularClassBlock(_ blockName: String) -> Bool {
        // Check if it's a regular class block (A Block, B Block, C Block, etc.)
        let pattern = "^[A-Z] Block$"
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(location: 0, length: blockName.utf16.count)
        return regex?.firstMatch(in: blockName, options: [], range: range) != nil
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
    
    // MARK: - Time Update Timer Functions
    
    func startTimeUpdateTimer() {
        // Stop any existing timer
        stopTimeUpdateTimer()
        
        // Create a timer that updates every second
        timeUpdateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            now = Date()
        }
    }
    
    func stopTimeUpdateTimer() {
        timeUpdateTimer?.invalidate()
        timeUpdateTimer = nil
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
    ScheduleView(testDate: nil, noSchool: .constant(false), isStale: .constant(true), loader: ScheduleLoader(), onLoadingComplete: {}, onPullRefresh: {})
}
