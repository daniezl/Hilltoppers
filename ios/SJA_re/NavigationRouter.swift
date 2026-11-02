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
    /// Pages pushed inside the Settings tab.
    @Published var path: [AppRoute] = []
    /// A required update blocks every tab, not only the one that noticed it.
    @Published var isUpdateRequired = false

    func push(_ route: AppRoute) {
        path.append(route)
    }

    func pop() {
        _ = path.popLast()
    }

    func popToRoot() {
        path.removeAll()
    }

    func openSettings() {
        path.removeAll()
        selectedTab = .settings
    }
}
