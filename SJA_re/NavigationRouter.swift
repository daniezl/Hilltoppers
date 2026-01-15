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
    
    func popToSettings() {
        // Remove all routes until we find .settings, or remove all if .settings not found
        if let settingsIndex = path.firstIndex(of: .settings) {
            path.removeSubrange((settingsIndex + 1)..<path.count)
        } else {
            // If .settings is not in the path, ensure it's at the root
            path.removeAll()
        }
    }
    
    func navigateToSettingsThen(_ route: AppRoute) {
        // Ensure we're at settings first, then navigate to the target route
        popToSettings()
        if !path.contains(.settings) {
            path.append(.settings)
        }
        path.append(route)
    }
}
