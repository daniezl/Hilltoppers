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

    static func isInSpecialPeriod(date: Date) async throws -> Bool {
        let db = Firestore.firestore()
        let snapshot = try await db.collection("special_periods").getDocuments()
        for doc in snapshot.documents {
            let data = doc.data()
            guard let start = data["start"] as? Timestamp,
                  let end = data["end"] as? Timestamp else { continue }
            let startDate = start.dateValue()
            let endDate = end.dateValue()
            if date >= startDate && date <= endDate {
                return true
            }
        }
        return false
    }
} 