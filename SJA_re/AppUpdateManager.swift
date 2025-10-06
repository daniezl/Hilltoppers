import Foundation
import FirebaseFirestore

struct AppUpdatePrompt: Identifiable {
    enum Importance {
        case required
        case recommended
    }

    let id = UUID()
    let title: String
    let message: String
    let importance: Importance
    let updateURL: URL?
}

final class AppUpdateManager {
    static let shared = AppUpdateManager()

    private init() {}

    /// Firestore document that holds the iOS app version metadata.
    private let collectionName = "app_meta"
    private let documentName = "ios"

    struct RemoteConfig {
        let minimumVersion: String?
        let latestVersion: String?
        let updateMessage: String?
        let updateLink: URL?
    }

    func checkForUpdate(currentVersion: String) async -> AppUpdatePrompt? {
        do {
            let remote = try await fetchRemoteConfig()

            if let minimum = remote.minimumVersion,
               Self.isVersion(currentVersion, lessThan: minimum) {
                let message = remote.updateMessage ?? "A newer version of the app is required to continue."
                return AppUpdatePrompt(
                    title: "Update Required",
                    message: messageWithLatestVersion(message, latest: remote.latestVersion),
                    importance: .required,
                    updateURL: remote.updateLink
                )
            }

            if let latest = remote.latestVersion,
               Self.isVersion(currentVersion, lessThan: latest) {
                let baseMessage = remote.updateMessage ?? "Version \(latest) is now available with the latest improvements."
                return AppUpdatePrompt(
                    title: "Update Available",
                    message: messageWithLatestVersion(baseMessage, latest: remote.latestVersion),
                    importance: .recommended,
                    updateURL: remote.updateLink
                )
            }
        } catch {
            print("⚠️ [UPDATE] Failed to fetch update info: \(error)")
        }

        return nil
    }

    private func fetchRemoteConfig() async throws -> RemoteConfig {
        let snapshot = try await Firestore.firestore()
            .collection(collectionName)
            .document(documentName)
            .getDocument()

        guard snapshot.exists, let data = snapshot.data() else {
            return RemoteConfig(minimumVersion: nil, latestVersion: nil, updateMessage: nil, updateLink: nil)
        }

        let minimum = data["minimum_version"] as? String
        let latest = data["latest_version"] as? String
        let message = data["update_message"] as? String

        let linkString = data["update_link"] as? String
        let linkURL: URL?
        if let linkString, let url = URL(string: linkString) {
            linkURL = url
        } else {
            linkURL = nil
        }

        return RemoteConfig(
            minimumVersion: minimum,
            latestVersion: latest,
            updateMessage: message,
            updateLink: linkURL
        )
    }

    private func messageWithLatestVersion(_ message: String, latest: String?) -> String {
        guard let latest, !message.contains(latest) else { return message }
        return "\(message)\n\nLatest version: \(latest)"
    }

    static func isVersion(_ current: String, lessThan other: String) -> Bool {
        let currentComponents = current.split(separator: ".").map { Int($0) ?? 0 }
        let otherComponents = other.split(separator: ".").map { Int($0) ?? 0 }
        let count = max(currentComponents.count, otherComponents.count)

        for index in 0..<count {
            let lhs = index < currentComponents.count ? currentComponents[index] : 0
            let rhs = index < otherComponents.count ? otherComponents[index] : 0
            if lhs == rhs { continue }
            return lhs < rhs
        }

        return false
    }
}
