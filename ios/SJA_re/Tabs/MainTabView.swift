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
                // Today leaves room for the bar in its own padding, so it stays centered
                // in the space above it.
                TodayTab()
                    .toolbar(.hidden, for: .tabBar)
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

}

/// Settings opens from a button on Today rather than taking a tab of its own. The
/// gear is on the left, so Settings comes from the left and leaves the same way.
private struct TodayTab: View {
    @EnvironmentObject private var router: NavigationRouter
    /// How far a swipe has pulled Settings back toward the left, as a negative number.
    @State private var dragOffset: CGFloat = 0
    @State private var lockedAxis: Axis?
    @GestureState private var isDragging = false

    /// Today shifts this far aside, as a page under a pushed one does.
    private static let todayShift: CGFloat = 80

    var body: some View {
        GeometryReader { geometry in
            let width = max(geometry.size.width, 1)

            ZStack {
                ContentView()
                    .offset(x: router.isSettingsOpen ? Self.todayShift * (1 + dragOffset / width) : 0)
                    .accessibilityHidden(router.isSettingsOpen)

                if router.isSettingsOpen {
                    settings(width: width)
                        .offset(x: dragOffset)
                        .shadow(color: .black.opacity(0.14), radius: 14)
                        .transition(.move(edge: .leading))
                        // Without this a page on its way out drops behind Today.
                        .zIndex(1)
                        .onDisappear { dragOffset = 0 }
                }
            }
            // Here rather than in onEnded, which a cancelled drag never reaches.
            .onChange(of: isDragging) { dragging in
                guard !dragging else { return }
                lockedAxis = nil
                if router.isSettingsOpen {
                    withAnimation(.spring(response: 0.3, dampingFraction: 1)) { dragOffset = 0 }
                }
            }
        }
    }

    private func settings(width: CGFloat) -> some View {
        NavigationStack(path: $router.path) {
            SettingsView()
                // Only this page: subpages keep the usual swipe back from the left edge.
                .simultaneousGesture(closeSwipe(width: width))
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            router.closeSettings()
                        } label: {
                            Image(systemName: "chevron.left")
                                .fontWeight(.medium)
                        }
                        .accessibilityLabel("Back")
                    }
                }
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
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

    /// Swiping left sends Settings back where it came from. Global coordinates,
    /// because the page being dragged moves along with the finger.
    private func closeSwipe(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10, coordinateSpace: .global)
            .updating($isDragging) { _, state, _ in state = true }
            .onChanged { value in
                if lockedAxis == nil {
                    lockedAxis = abs(value.translation.width) > abs(value.translation.height) ? .horizontal : .vertical
                }
                if lockedAxis == .horizontal {
                    dragOffset = min(value.translation.width, 0)
                }
            }
            .onEnded { value in
                guard lockedAxis == .horizontal else { return }
                if value.translation.width < -width * 0.3 || value.predictedEndTranslation.width < -width * 0.5 {
                    router.closeSettings()
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
