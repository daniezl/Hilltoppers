import SwiftUI

enum AppRoute: Hashable {
    case settingsFeatureShowcase
    case settingsCourses
    case settingsNotifications
    case settingsTime
    case settingsMore
    case coursesLogin
}

@MainActor
final class NavigationRouter: ObservableObject {
    @Published var selectedTab: AppTab = .today
    /// Goes up each time the Calendar icon is tapped while Calendar is already showing.
    @Published var calendarRetapCount = 0
    /// Goes up each time the Menu icon is tapped while Menu is already showing.
    @Published var menuRetapCount = 0
    /// Settings isn't a pushed page: it slides in from the left, on the gear's side.
    @Published var isSettingsOpen = false
    /// Pages pushed on top of Settings.
    @Published var path: [AppRoute] = []
    /// A required update blocks every tab, not only the one that noticed it.
    @Published var isUpdateRequired = false

    /// A tap on the tab bar. Each tab goes back to its default state when left,
    /// so it opens the same way every time.
    func tabTapped(_ tab: AppTab) {
        guard tab != selectedTab else {
            if tab == .calendar { calendarRetapCount += 1 }
            if tab == .menu { menuRetapCount += 1 }
            if tab == .today { closeSettingsAndSubpages() }
            return
        }
        UISelectionFeedbackGenerator().selectionChanged()
        if selectedTab == .today {
            isSettingsOpen = false
            path.removeAll()
        }
        selectedTab = tab
    }

    func openSettings() {
        withAnimation(Self.settingsAnimation) { isSettingsOpen = true }
    }

    func closeSettings() {
        withAnimation(Self.settingsAnimation) { isSettingsOpen = false }
    }

    private func closeSettingsAndSubpages() {
        closeSettings()
        path.removeAll()
    }

    /// No bounce, so it moves like a pushed page does.
    private static let settingsAnimation = Animation.spring(response: 0.38, dampingFraction: 1)

    func push(_ route: AppRoute) {
        path.append(route)
    }

    func pop() {
        _ = path.popLast()
    }

    func popToRoot() {
        path.removeAll()
    }

    func popToSettings() {
        path.removeAll()
    }
}
