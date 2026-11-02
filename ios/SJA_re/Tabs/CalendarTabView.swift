import SwiftUI

struct CalendarTabView: View {
    @StateObject private var store = CalendarStore()
    @ObservedObject private var blockManager = BlockSettingsManager.shared
    @ObservedObject private var schedulePrefs = SchedulePreferencesManager.shared
    @EnvironmentObject private var router: NavigationRouter
    @Environment(\.scenePhase) private var scenePhase
    @State private var todayKey = SchoolTime.key(Date.currentEST)
    @State private var selectedKey = SchoolTime.key(Date.currentEST)
    @State private var scheduleOpen = false
    @State private var scrollToToday: (() -> Void)?
    @State private var dayPanelContentHeight: CGFloat = 120
    @State private var visibleYear = Calendar.sja.component(.year, from: Date.currentEST)

    private static let scrollSpace = "calendarScroll"
    /// Today sits a little above the middle, with the days before it still in view.
    private static let todayAnchor = UnitPoint(x: 0.5, y: 0.25)
    /// A January sets the year once it passes this share of the list's height, just
    /// below `todayAnchor`, so the title matches the month today is in.
    private static let yearChangeShare: CGFloat = 0.28

    private let weekdayLetters = ["S", "M", "T", "W", "T", "F", "S"]
    private var timeFormat: TimeFormat { schedulePrefs.preferences.timeFormat }

    /// A year either way, which covers the school year in any direction.
    private var months: [Date] {
        let calendar = Calendar.sja
        guard let today = SchoolTime.date(fromKey: todayKey),
              let thisMonth = calendar.dateInterval(of: .month, for: today)?.start else { return [] }
        return (-12...12).compactMap { calendar.date(byAdding: .month, value: $0, to: thisMonth) }
    }

    private func monthID(_ month: Date) -> String {
        SchoolTime.string(month, "yyyy-MM")
    }

    var body: some View {
            GeometryReader { geometry in
                ScrollViewReader { proxy in
                    ScrollView {
                        // Not lazy: jumping to a month far down a lazy stack lands in the wrong place.
                        VStack(alignment: .leading, spacing: 18) {
                            ForEach(months, id: \.self) { month in
                                monthSection(month)
                                    .id(monthID(month))
                            }
                        }
                        .modifier(ScrollTargetRows())
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                    }
                    .modifier(StartsAtMonth(id: String(todayKey.prefix(7))))
                    .background(ScrollsToTopDisabler())
                    .coordinateSpace(name: Self.scrollSpace)
                    .onPreferenceChange(JanuaryOffsetsKey.self) { offsets in
                        // Above the first January in reach, the earliest year is showing.
                        let reached = offsets.filter { $0.value <= geometry.size.height * Self.yearChangeShare }.keys.max()
                        let year = reached ?? (offsets.keys.min() ?? visibleYear + 1) - 1
                        if year != visibleYear { visibleYear = year }
                    }
                    .modifier(TopBar(bar: calendarHeader))
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        dayPanel(maxHeight: geometry.size.height * 0.5)
                            // Same side margins as the floating tab bar below it.
                            .padding(.horizontal, 21)
                            .padding(.bottom, 8)
                    }
                    .refreshable { await store.refresh() }
                    .onChange(of: router.calendarRetapCount) { _ in
                        scrollToToday?()
                    }
                    .onAppear {
                        // Switching back to this tab fires onAppear again; keep the user's place.
                        guard scrollToToday == nil else { return }
                        let jump = {
                            selectedKey = todayKey
                            withAnimation { proxy.scrollTo(todayKey, anchor: Self.todayAnchor) }
                        }
                        scrollToToday = jump
                        // Twice, since the first can land before a long calendar finishes layout.
                        for delay in [0.1, 0.5] {
                            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                                proxy.scrollTo(todayKey, anchor: Self.todayAnchor)
                            }
                        }
                    }
                }
            }
        .background(HT.page.ignoresSafeArea())
        .task { await store.refresh() }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            todayKey = SchoolTime.key(Date.currentEST)
            Task { await store.refresh() }
        }
    }

    /// Edge to edge with no shape of its own, like Apple's Calendar: the blur is the
    /// system's scroll edge effect, ending on a hairline. Only the button is glass.
    private var calendarHeader: some View {
        VStack(spacing: 8) {
            TabHeader(title: String(visibleYear)) {
                if let scrollToToday {
                    TodayButton(action: scrollToToday)
                }
            }
            // Lines up with the text inside the day card: its 21 margin plus 16 padding.
            .padding(.horizontal, 37)
            .padding(.top, 8)

            weekdayRow
                .padding(.horizontal, 20)
                .padding(.top, 8)

            Rectangle()
                .fill(Color.black.opacity(0.12))
                .frame(height: 0.5)
        }
    }

    // MARK: - Months

    private var weekdayRow: some View {
        HStack(spacing: 4) {
            ForEach(Array(weekdayLetters.enumerated()), id: \.offset) { _, letter in
                Text(letter)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func monthSection(_ month: Date) -> some View {
        let calendar = Calendar.sja
        let days = calendar.range(of: .day, in: .month, for: month) ?? 1..<1
        let keys = days.compactMap { calendar.date(byAdding: .day, value: $0 - 1, to: month) }.map(SchoolTime.key)
        // Blank cells before the 1st, so the grid starts on Sunday.
        let leadingBlanks = calendar.component(.weekday, from: month) - 1
        let cells: [String?] = Array(repeating: nil, count: leadingBlanks) + keys.map(Optional.some)

        return VStack(alignment: .leading, spacing: 4) {
            // The month's name sits over its 1st, so it reads as part of the grid.
            HStack(spacing: 4) {
                ForEach(0..<7, id: \.self) { column in
                    Text(column == leadingBlanks ? SchoolTime.string(month, "MMM") : "")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundColor(HT.green)
                        .frame(maxWidth: .infinity)
                }
            }

            // Plain rows, not a lazy grid: jumping to a month needs every month's real height.
            ForEach(0..<(cells.count + 6) / 7, id: \.self) { row in
                HStack(spacing: 4) {
                    ForEach(0..<7, id: \.self) { column in
                        let index = row * 7 + column
                        if index < cells.count, let key = cells[index] {
                            dayCell(key)
                        } else {
                            Color.clear.frame(maxWidth: .infinity, minHeight: 40)
                        }
                    }
                }
            }
        }
        .background {
            // Only a January can change the year in the title, so only those report in.
            if calendar.component(.month, from: month) == 1 {
                GeometryReader { section in
                    Color.clear.preference(
                        key: JanuaryOffsetsKey.self,
                        value: [calendar.component(.year, from: month): section.frame(in: .named(Self.scrollSpace)).minY]
                    )
                }
            }
        }
    }

    private func dayCell(_ key: String) -> some View {
        let info = store.describe(key)
        let isSelected = key == selectedKey
        let isToday = key == todayKey
        let number = SchoolTime.date(fromKey: key).map { Calendar.sja.component(.day, from: $0) } ?? 0

        return Button {
            selectedKey = key
        } label: {
            Text("\(number)")
                .font(.system(size: 15, weight: isToday ? .bold : .medium, design: .rounded))
            .foregroundColor(info.family.ink)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(info.family.fill))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(
                        isSelected ? HT.brightGreen : isToday ? info.family.ink.opacity(0.55) : Color.clear,
                        lineWidth: isSelected ? 2 : 1
                    )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id(key)
        .accessibilityLabel("\(key), \(info.family.label)\(info.events.isEmpty ? "" : ", has events")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Selected day

    private func dayPanel(maxHeight: CGFloat) -> some View {
        let info = store.describe(selectedKey)
        let content = VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(SchoolTime.date(fromKey: selectedKey).map { SchoolTime.string($0, "EEE, MMM d") } ?? selectedKey)
                    .font(.headline)
                Spacer()
                if let label = info.label {
                    Text(label)
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                }
            }

            eventList(info)

            if !info.noSchool {
                scheduleSection(info)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        // A long schedule scrolls inside the card rather than covering the month.
        let height = min(dayPanelContentHeight, maxHeight)
        return ScrollView {
            // A new id per day lets one day's details fade into the next.
            ZStack(alignment: .topLeading) {
                content
                    .id(selectedKey)
                    .transition(.opacity)
            }
            .background(
                GeometryReader { measured in
                    Color.clear.preference(key: DayPanelContentHeightKey.self, value: measured.size.height)
                }
            )
        }
        .animation(.easeInOut(duration: 0.2), value: selectedKey)
        .scrollDisabled(dayPanelContentHeight <= maxHeight)
        .frame(height: height)
        .onPreferenceChange(DayPanelContentHeightKey.self) { measured in
            // Explicit: the card's height feeds the scroll view's inset, and an
            // implicit animation on the frame alone lets the inset jump instead.
            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                dayPanelContentHeight = measured
            }
        }
        .padding(16)
        .glassCard()
    }

    @ViewBuilder
    private func eventList(_ info: CalendarDayInfo) -> some View {
        if store.events == nil {
            Text("Loading…").font(.subheadline).foregroundColor(.secondary)
        } else if info.events.isEmpty {
            if store.eventsFailed {
                Text("Calendar unavailable").font(.subheadline.weight(.medium))
            } else if let note = info.note {
                Text(note).font(.subheadline)
            }
        } else {
            ForEach(info.events) { event in
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.primary)
                    if let time = event.time(timeFormat) {
                        Text(time).font(.caption).foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func scheduleSection(_ info: CalendarDayInfo) -> some View {
        VStack(spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { scheduleOpen.toggle() }
            } label: {
                HStack {
                    Text(info.scheduleLabel).font(.footnote.weight(.semibold))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption2.weight(.bold))
                        .rotationEffect(.degrees(scheduleOpen ? 180 : 0))
                }
                .foregroundColor(info.family.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(info.family.fill))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if scheduleOpen {
                dayBlocks(info)
                    .transition(.opacity)
            }
        }
    }

    @ViewBuilder
    private func dayBlocks(_ info: CalendarDayInfo) -> some View {
        let blocks = gradeFiltered(store.blocks(for: selectedKey))
        if blocks.isEmpty {
            Text(info.note ?? "No blocks").font(.subheadline).foregroundColor(.secondary)
        } else {
            VStack(spacing: 0) {
                ForEach(blocks) { block in
                    VStack(spacing: 2) {
                        HStack {
                            Text(displayName(block, dayType: info.label))
                                .font(.subheadline)
                            Spacer()
                            Text(SchoolTime.range(block.start, block.end, timeFormat))
                                .font(.footnote)
                                .monospacedDigit()
                                .foregroundColor(.secondary)
                        }
                        if let lunch = myLunch(in: block) {
                            HStack {
                                Text(lunch.name).font(.caption.weight(.medium)).foregroundColor(HT.brightGreen)
                                Spacer()
                                Text(SchoolTime.range(lunch.start, lunch.end, timeFormat))
                                    .font(.caption)
                                    .monospacedDigit()
                                    .foregroundColor(HT.brightGreen)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private func myLunch(in block: Block) -> SubBlock? {
        guard let wave = schedulePrefs.preferences.lunchWave else { return nil }
        return block.subBlocks?.first { lunchWave(fromName: $0.name) == wave }
    }

    private func gradeFiltered(_ blocks: [Block]) -> [Block] {
        guard let year = schedulePrefs.preferences.graduationYear else { return blocks }
        let grade = gradeFromGraduationYear(year).rawValue
        return blocks.filter { $0.grades?.isEmpty != false || $0.grades?.contains(grade) == true }
    }

    private func displayName(_ block: Block, dayType: String?) -> String {
        let isGreen = dayType == "Green Day"
        guard blockManager.shouldShow(block: block.name, onGreenDay: isGreen) else { return "Free Block" }
        return blockManager.getDisplayName(for: block.name, isGreenDay: isGreen)
    }
}

private struct DayPanelContentHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Each January's distance from the top of the scroll view, keyed by year.
private struct JanuaryOffsetsKey: PreferenceKey {
    static var defaultValue: [Int: CGFloat] = [:]
    static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// iOS 17 can start a scroll view on a given row. Scrolling there afterwards
/// does nothing while a long calendar is still being laid out on first show.
private struct StartsAtMonth: ViewModifier {
    let id: String
    @State private var position: String?

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .scrollPosition(id: $position, anchor: .top)
                .onAppear { if position == nil { position = id } }
        } else {
            content
        }
    }
}

private struct ScrollTargetRows: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.scrollTargetLayout()
        } else {
            content
        }
    }
}

/// Tapping the selected tab's icon would otherwise scroll to the top of the
/// list, a year ago; here it goes to today instead.
private struct ScrollsToTopDisabler: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        DispatchQueue.main.async {
            var ancestor = view.superview
            while let current = ancestor {
                if let scroll = current.subviews.compactMap({ $0 as? UIScrollView }).first {
                    scroll.scrollsToTop = false
                    return
                }
                ancestor = current.superview
            }
        }
    }
}

private struct TopBar<Bar: View>: ViewModifier {
    let bar: Bar

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .safeAreaBar(edge: .top, spacing: 0) { bar }
                .scrollEdgeEffectStyle(.hard, for: .top)
        } else {
            content.safeAreaInset(edge: .top, spacing: 0) {
                bar.background(.ultraThinMaterial)
            }
        }
    }
}

private struct TodayButton: View {
    let action: () -> Void

    var body: some View {
        let title = Text("Today")
            .font(.subheadline.weight(.semibold))
            .foregroundColor(HT.green)

        if #available(iOS 26.0, *) {
            Button(action: action) { title }
                .buttonStyle(.glass)
        } else {
            Button(action: action) {
                title
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(HT.hairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}
