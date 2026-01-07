import SwiftUI

enum AppRoute: Hashable {
    case settings
    case settingsFeatureShowcase
    case settingsCourses
    case settingsNotifications
    case settingsTime
    case settingsMore
    case settingsAuth
    case coursesLogin
}

@MainActor
final class NavigationRouter: ObservableObject {
    @Published var path: [AppRoute] = []

    func push(_ route: AppRoute) {
        path.append(route)
    }

    func pop() {
        _ = path.popLast()
    }

    func popToRoot() {
        path.removeAll()
    }
}
