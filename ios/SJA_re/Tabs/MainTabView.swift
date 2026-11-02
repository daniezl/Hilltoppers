import SwiftUI

enum AppTab: Hashable {
    case today, calendar, menu, settings
}

/// The app's root. Each tab keeps its own state while another one is showing,
/// so switching tabs never reloads what is already on screen.
struct MainTabView: View {
    @ObservedObject var router: NavigationRouter
    @ObservedObject var timeSettings: TimeSettingsModel

    var body: some View {
        TabView(selection: Binding(
            get: { router.selectedTab },
            set: { tab in
                if tab == .calendar, router.selectedTab == .calendar {
                    router.calendarRetapCount += 1
                }
                router.selectedTab = tab
            }
        )) {
            ContentView()
                .tabItem { tabIcon("house.fill", "Today") }
                .tag(AppTab.today)

            CalendarTabView()
                .tabItem { tabIcon("calendar", "Calendar") }
                .tag(AppTab.calendar)

            MenuTabView()
                .tabItem { tabIcon("fork.knife", "Menu") }
                .tag(AppTab.menu)

            settingsTab
                .tabItem { tabIcon("gearshape.fill", "Settings") }
                .tag(AppTab.settings)
        }
        .tint(.black)
        .environmentObject(router)
        .environmentObject(timeSettings)
        .disabled(router.isUpdateRequired)
        .preferredColorScheme(.light)
    }

    /// Icons only; the name stays for VoiceOver. All solid, so the set reads as one style.
    private func tabIcon(_ systemName: String, _ name: String) -> some View {
        Image(systemName: systemName)
            .accessibilityLabel(name)
    }

    private var settingsTab: some View {
        NavigationStack(path: $router.path) {
            SettingsView()
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .settingsFeatureShowcase:
                        FeatureShowcaseView()
                    case .settingsCourses:
                        NewBlockConfigurationView(onDismissSettings: { router.popToRoot() })
                    case .coursesLogin:
                        LoginView(onDismiss: { router.popToRoot() })
                    case .settingsNotifications:
                        NotificationSettingsView(onDismissSettings: { router.popToRoot() })
                    case .settingsTime:
                        TimeSettingsView(onDismissRoot: { router.popToRoot() })
                    case .settingsMore:
                        MoreInfoView(onDismiss: { router.popToRoot() })
                    }
                }
        }
    }
}
