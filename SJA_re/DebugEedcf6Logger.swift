import Foundation

/// Debug logger for Cursor session `eedcf6`.
/// Writes **NDJSON** lines into the **App Group** container so logs work on a physical device
/// (unlike writing into the repo’s `.cursor/` path on Mac).
enum DebugEedcf6Logger {
    private static let sessionId = "eedcf6"
    /// Must match `SJA_re.entitlements` / widget App Group.
    private static let appGroupIdentifier = "group.danielzhang.Hilltoppers2"
    /// Stored under the shared container (Files → On My iPhone → SJA → …, or Xcode container browser).
    private static let relativeLogPath = "debug/debug-eedcf6.ndjson"

    private static let queue = DispatchQueue(label: "com.sja.debugEedcf6Logger", qos: .utility)

    static func log(
        hypothesisId: String,
        location: String,
        message: String,
        data: [String: String]? = nil,
        runId: String = "pre"
    ) {
        let payload: [String: Any] = [
            "sessionId": sessionId,
            "id": UUID().uuidString,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "location": location,
            "message": message,
            "data": data as Any,
            "runId": runId,
            "hypothesisId": hypothesisId
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []) else { return }
        guard var line = String(data: jsonData, encoding: .utf8) else { return }
        line.append("\n")

        queue.async {
            guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
                return
            }
            let url = container.appendingPathComponent(relativeLogPath, isDirectory: false)
            let dir = url.deletingLastPathComponent()
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: url.path) {
                FileManager.default.createFile(atPath: url.path, contents: nil)
            }
            guard let handle = try? FileHandle(forWritingTo: url) else { return }
            defer { try? handle.close() }
            try? handle.seekToEnd()
            if let data = line.data(using: .utf8) {
                try? handle.write(contentsOf: data)
            }
        }
    }
}
