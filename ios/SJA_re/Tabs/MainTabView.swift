import SwiftUI

enum AppTab: Hashable {
    case today, calendar, menu
}

/// The app's root. Each tab keeps its own state while another one is showing,
/// so switching tabs never reloads what is already on screen.
struct MainTabView: View {
    @ObservedObject var router: NavigationRouter
    @ObservedObject var timeSettings: TimeSettingsModel

    var body: some View {
        GeometryReader { geometry in
            TabView(selection: Binding(
                get: { router.selectedTab },
                set: { router.tabTapped($0) }
            )) {
                todayTab
                    .modifier(RoomForTabBar(height: barInset(geometry)))
                    .tag(AppTab.today)

                CalendarTabView()
                    .modifier(RoomForTabBar(height: barInset(geometry)))
                    .tag(AppTab.calendar)

                MenuTabView()
                    .modifier(RoomForTabBar(height: barInset(geometry)))
                    .tag(AppTab.menu)
            }
            .overlay(alignment: .bottom) {
                // The glass bar only answers on its icons. Everything from the Calendar
                // card down to the screen's edge must not reach the days scrolling behind.
                if router.selectedTab == .calendar {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {}
                        .frame(height: barInset(geometry) + geometry.safeAreaInsets.bottom + 8)
                        .offset(y: geometry.safeAreaInsets.bottom)
                }
            }
            .overlay(alignment: .bottom) {
                FloatingTabBar(router: router)
                    // Sits partly in the home indicator's area, as the system's bar does.
                    .offset(y: geometry.safeAreaInsets.bottom > 0 ? 13 : -8)
            }
            .ignoresSafeArea(.keyboard, edges: .bottom)
        }
        .background(TouchMovementTrackerInstaller())
        .tint(.black)
        .environmentObject(router)
        .environmentObject(timeSettings)
        .disabled(router.isUpdateRequired)
        .preferredColorScheme(.light)
    }

    /// How much of each page the bar covers, above the bottom safe area.
    private func barInset(_ geometry: GeometryProxy) -> CGFloat {
        geometry.safeAreaInsets.bottom > 0 ? FloatingTabBar.height - 13 : FloatingTabBar.height + 8
    }

    /// Settings opens from a button on Today rather than taking a tab of its own.
    private var todayTab: some View {
        NavigationStack(path: $router.path) {
            ContentView()
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .settings:
                        SettingsView()
                    case .settingsFeatureShowcase:
                        FeatureShowcaseView()
                    case .settingsCourses:
                        NewBlockConfigurationView(onDismissSettings: { router.popToSettings() })
                    case .coursesLogin:
                        LoginView(onDismiss: { router.popToSettings() })
                    case .settingsNotifications:
                        NotificationSettingsView(onDismissSettings: { router.popToSettings() })
                    case .settingsTime:
                        TimeSettingsView(onDismissRoot: { router.popToSettings() })
                    case .settingsMore:
                        MoreInfoView(onDismiss: { router.popToSettings() })
                    }
                }
        }
    }
}

/// Drawn here because the system's bar shrinks to fit its items, and three items
/// would leave it narrower than the floating card on Calendar.
/// A TabView doesn't pass a safe area set on it down to its pages, so each page asks
/// for the room itself.
private struct RoomForTabBar: ViewModifier {
    let height: CGFloat

    func body(content: Content) -> some View {
        content
            .toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Color.clear.frame(height: height).allowsHitTesting(false)
            }
    }
}

private struct FloatingTabBar: View {
    static let height: CGFloat = 62

    @ObservedObject var router: NavigationRouter
    @Namespace private var selection

    private let items: [(tab: AppTab, icon: String, name: String)] = [
        (.today, "house.fill", "Today"),
        (.calendar, "calendar", "Calendar"),
        (.menu, "fork.knife", "Menu")
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.tab) { item in
                let isSelected = router.selectedTab == item.tab
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        router.tabTapped(item.tab)
                    }
                } label: {
                    Image(systemName: item.icon)
                        .font(.system(size: 22))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(Color.black.opacity(0.08))
                                    .matchedGeometryEffect(id: "selectedTab", in: selection)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.name)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(4)
        .frame(height: Self.height)
        .barBackground()
        // Same side margins as the floating card on Calendar.
        .padding(.horizontal, 21)
    }
}

private extension View {
    /// Liquid Glass on iOS 26; the closest material on older systems.
    @ViewBuilder
    func barBackground() -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: Capsule())
        } else {
            background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(HT.hairline, lineWidth: 1))
        }
    }
}
