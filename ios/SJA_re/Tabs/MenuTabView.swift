import SwiftUI

enum DiningPeriod: String, CaseIterable, Identifiable {
    case breakfast = "Breakfast"
    case lunch = "Lunch"
    case dinner = "Dinner"

    var id: String { rawValue }
}

struct DiningMenu: Equatable {
    /// Left column. Columns match where students pick up food in the dining hall,
    /// so a station must never move to the other side to balance the layout.
    let globalFare: [String]
    /// Right column.
    let classicKitchen: [String]
}

enum DiningMenuOutcome: Equatable {
    case menu(DiningMenu)
    case notPublished
    case notServed
}

/// Reads `menu.json`, the same file the Chrome extension uses.
struct DiningMenuFile {
    private struct Entry: Decodable {
        let globalFare: [String]?
        let classicKitchen: [String]?
    }

    private struct Raw: Decodable {
        let menuDate: String?
        let menus: [String: Entry]?
        let days: [String: [String: Entry]]?
    }

    private let raw: Raw

    init(data: Data) throws {
        raw = try JSONDecoder().decode(Raw.self, from: data)
    }

    func outcome(for period: DiningPeriod, dateKey: String) -> DiningMenuOutcome {
        let menus = raw.days?[dateKey] ?? (raw.menuDate == dateKey ? raw.menus : nil)
        guard let menus else { return .notPublished }
        let entry = menus[period.rawValue.lowercased()]
        let menu = DiningMenu(
            globalFare: Self.normalized(entry?.globalFare),
            classicKitchen: Self.normalized(entry?.classicKitchen)
        )
        return menu.globalFare.isEmpty && menu.classicKitchen.isEmpty ? .notServed : .menu(menu)
    }

    private static func normalized(_ items: [String]?) -> [String] {
        var seen = Set<String>()
        return (items ?? []).compactMap { item in
            let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, seen.insert(trimmed.lowercased()).inserted else { return nil }
            return trimmed
        }
    }
}

@MainActor
final class DiningMenuStore: ObservableObject {
    @Published private(set) var file: DiningMenuFile?
    @Published private(set) var isLoading = false
    @Published private(set) var failed = false

    private static let cacheKey = "CachedDiningMenuData"

    init() {
        if let cached = UserDefaults.standard.data(forKey: Self.cacheKey) {
            file = try? DiningMenuFile(data: cached)
        }
    }

    func refresh() async {
        guard let url = URL(string: "\(ScheduleConfig.cloudflareBaseURL)/menu.json") else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, _) = try await URLSession.shared.data(for: request)
            file = try DiningMenuFile(data: data)
            failed = false
            UserDefaults.standard.set(data, forKey: Self.cacheKey)
        } catch {
            // A stale menu is still useful; only complain when there is nothing to show.
            failed = file == nil
        }
    }
}

struct MenuTabView: View {
    @StateObject private var store = DiningMenuStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var period: DiningPeriod = .lunch
    /// nil follows today; set once the arrows move.
    @State private var selectedKey: String?
    @State private var choseManually = false
    @State private var todayKey = SchoolTime.key(Date.currentEST)

    private var shownKey: String { selectedKey ?? todayKey }

    /// "Today's Menu" names the page; once stepping, only the day needs saying.
    private var title: String {
        shownKey == todayKey ? "Today's Menu" : SchoolTime.relativeLabel(shownKey)
    }

    /// Today plus a week on each side, the same window as the extension. Not tied
    /// to what the file contains, so a failed load can still step to another day.
    private var dayKeys: [String] {
        guard let today = SchoolTime.date(fromKey: todayKey) else { return [todayKey] }
        let keys = (-7...7).compactMap { Calendar.sja.date(byAdding: .day, value: $0, to: today) }.map(SchoolTime.key)
        return Array(Set(keys + [shownKey])).sorted()
    }

    private var dayIndex: Int { dayKeys.firstIndex(of: shownKey) ?? 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TabHeader(title: title) {
                    HStack(spacing: 8) {
                        StepButton(systemName: "chevron.left", label: "Previous day's menu", enabled: dayIndex > 0) { step(-1) }
                        StepButton(systemName: "chevron.right", label: "Next day's menu", enabled: dayIndex < dayKeys.count - 1) { step(1) }
                    }
                }

                Picker("Meal", selection: Binding(
                    get: { period },
                    set: { period = $0; choseManually = true }
                )) {
                    ForEach(DiningPeriod.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                content
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .background(HT.page.ignoresSafeArea())
        .refreshable { await store.refresh() }
        .task {
            applyAutomaticPeriod()
            await store.refresh()
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            todayKey = SchoolTime.key(Date.currentEST)
            applyAutomaticPeriod()
            Task { await store.refresh() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let file = store.file {
            switch file.outcome(for: period, dateKey: shownKey) {
            case .menu(let menu):
                HStack(alignment: .top, spacing: 10) {
                    MenuColumn(items: menu.globalFare)
                    MenuColumn(items: menu.classicKitchen)
                }
                // Sizes the row to the taller column so both cards can fill it.
                .fixedSize(horizontal: false, vertical: true)
            case .notPublished:
                StatusMessage(systemImage: "calendar.badge.exclamationmark", text: "Menu not published for this day")
            case .notServed:
                StatusMessage(systemImage: "fork.knife", text: "No \(period.rawValue.lowercased()) served this day")
            }
        } else if store.failed {
            StatusMessage(systemImage: "wifi.slash", text: "Menu unavailable")
        } else {
            StatusMessage(systemImage: "", text: "Loading menu…", isLoading: true)
        }
    }

    private func step(_ delta: Int) {
        let next = dayIndex + delta
        guard dayKeys.indices.contains(next) else { return }
        selectedKey = dayKeys[next]
        choseManually = true
    }

    /// Picks the meal coming up next until the user chooses one themselves.
    private func applyAutomaticPeriod() {
        guard !choseManually else { return }
        let now = Date.currentEST
        let blocks = ContentView.loadCachedBlocks()

        func time(_ hhmm: String) -> Date? {
            let parts = hhmm.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2 else { return nil }
            return Calendar.sja.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: now)
        }

        if let first = blocks.first, let start = time(first.start), now < start {
            period = .breakfast
            return
        }
        let lunchBlock = blocks.first { $0.name.lowercased().contains("lunch") } ?? blocks.first { $0.subBlocks?.isEmpty == false }
        // Weekends and schedules without lunch still switch to dinner at 2 PM.
        let lunchEnd = time(lunchBlock?.end ?? "14:00") ?? now
        period = now >= lunchEnd ? .dinner : .lunch
    }
}

private struct MenuColumn: View {
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if items.isEmpty {
                Text("No item found")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            // Listing order says nothing about which dish is the main one, so none stands out.
            ForEach(items, id: \.self) { item in
                if item != items.first {
                    Divider()
                }
                Text(item)
                    .font(.subheadline)
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .card(padding: 14)
    }
}
