//
//  SJA_reApp.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import FirebaseCore
import FirebaseAnalytics
import UserNotifications
import BackgroundTasks

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    FirebaseApp.configure()
    Analytics.setAnalyticsCollectionEnabled(true)
    BackgroundRefreshManager.shared.register()
    BackgroundRefreshManager.shared.scheduleAppRefresh()
    
    // Set notification delegate
    UNUserNotificationCenter.current().delegate = self
    
    return true
  }
  
  // Handle notification when app is in foreground
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    handleNotification(notification)
    
    // Check if this is a removal notification (silent)
    if let type = notification.request.content.userInfo["type"] as? String, type == "remove_notification" {
      // Don't present removal notifications
      completionHandler([])
    } else {
      // Present regular notifications
      completionHandler([.banner, .sound])
    }
  }
  
  // Handle notification tap
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    handleNotification(response.notification)
    completionHandler()
  }
  
  private func handleNotification(_ notification: UNNotification) {
    let userInfo = notification.request.content.userInfo
    let identifier = notification.request.identifier
    
    // Check if this is a removal notification
    if let type = userInfo["type"] as? String, type == "remove_notification" {
      // Handle different types of removal notifications
      if identifier.hasPrefix("remove-lunch-start-") {
        // Remove lunch start notification
        let subBlockId = String(identifier.dropFirst("remove-lunch-start-".count))
        let targetId = "lunch-start-\(subBlockId)"
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [targetId])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [targetId])
        print("🗑️ Removed lunch start notification: \(targetId)")
      } else if identifier.hasPrefix("remove-lunch-end-") {
        // Remove lunch end notification
        let subBlockId = String(identifier.dropFirst("remove-lunch-end-".count))
        let targetId = "lunch-end-\(subBlockId)"
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [targetId])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [targetId])
        print("🗑️ Removed lunch end notification: \(targetId)")
      } else if identifier.hasPrefix("remove-5th-lunch-") {
        // Remove 5th lunch notification when lunch block ends
        let subBlockId = String(identifier.dropFirst("remove-5th-lunch-".count))
        let targetId = "lunch-start-\(subBlockId)"
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [targetId])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [targetId])
        print("🗑️ Removed 5th lunch notification: \(targetId)")
      } else if let targetId = userInfo["target"] as? String {
        // Handle regular block removal notifications (existing logic)
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [targetId])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [targetId])
        print("🗑️ Removed notification: \(targetId)")
      }
    }
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    BackgroundRefreshManager.shared.scheduleAppRefresh()
  }
}

@main
struct SJA_reApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var router = NavigationRouter()
    @StateObject private var timeSettings = TimeSettingsModel()

    init() {
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = UIColor.systemBackground
        navAppearance.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor.systemBackground
        tabAppearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $router.path) {
                ContentView()
                    .environmentObject(router)
                    .environmentObject(timeSettings)
                    .navigationDestination(for: AppRoute.self) { route in
                        switch route {
                        case .settings:
                            SettingsView()
                                .environmentObject(router)
                                .environmentObject(timeSettings)
                        case .settingsFeatureShowcase:
                            FeatureShowcaseView()
                        case .settingsCourses:
                            BlockConfigurationView(
                                blockManager: BlockSettingsManager.shared,
                                onDismissSettings: { router.pop() }
                            )
                        case .settingsNotifications:
                            NotificationSettingsView(onDismissSettings: { router.pop() })
                        case .settingsTime:
                            TimeSettingsView(onDismissRoot: { router.pop() })
                                .environmentObject(timeSettings)
                        case .settingsMore:
                            MoreInfoView(onDismiss: { router.pop() })
                        }
                    }
                    .toolbarBackground(.visible, for: .navigationBar)
                    .toolbarBackground(Color(.systemBackground), for: .navigationBar)
                    .toolbarBackground(.visible, for: .tabBar)
                    .toolbarBackground(Color(.systemBackground), for: .tabBar)
            }
        }
    }
}
