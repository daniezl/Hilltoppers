import SwiftUI

enum AppRoute: Hashable {
    case settings
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
    /// Pages pushed on top of Today, starting with Settings.
    @Published var path: [AppRoute] = []
    /// A required update blocks every tab, not only the one that noticed it.
    @Published var isUpdateRequired = false

    /// A tap on the tab bar. Each tab goes back to its default state when left,
    /// so it opens the same way every time.
    func tabTapped(_ tab: AppTab) {
        guard tab != selectedTab else {
            if tab == .calendar { calendarRetapCount += 1 }
            if tab == .menu { menuRetapCount += 1 }
            if tab == .today { path.removeAll() }
            return
        }
        UISelectionFeedbackGenerator().selectionChanged()
        if selectedTab == .today { path.removeAll() }
        selectedTab = tab
    }

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
        path = [.settings]
    }
}
