import Foundation
import FirebaseFirestore

struct ScheduleTypeFetcher {
    static func fetchTypeFor(date: Date) async throws -> String? {
        let db = Firestore.firestore()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        print("Looking up Firestore for date: \(dateString)")
        let docRef = db.collection("special_days").document(dateString)
        let snapshot = try await docRef.getDocument()
        if let data = snapshot.data(), let type = data["type"] as? String {
            return type
        }
        return nil
    }
} 