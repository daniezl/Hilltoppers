//
//  SJA_reApp.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI
import FirebaseCore
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    FirebaseApp.configure()
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

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
