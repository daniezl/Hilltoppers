import Foundation
import SwiftUI

@MainActor
final class TimeSettingsModel: ObservableObject {
    @Published var useTestDate: Bool {
        didSet {
            UserDefaults.standard.set(useTestDate, forKey: "UseTestDateOverride")
        }
    }

    @Published var testDateOverride: Date {
        didSet {
            UserDefaults.standard.set(testDateOverride, forKey: "TestDateOverride")
        }
    }

    init() {
        let storedUseTestDate = UserDefaults.standard.object(forKey: "UseTestDateOverride") as? Bool
        let storedTestDate = UserDefaults.standard.object(forKey: "TestDateOverride") as? Date

        self.useTestDate = storedUseTestDate ?? false
        self.testDateOverride = storedTestDate ?? Date.currentEST
    }
}
