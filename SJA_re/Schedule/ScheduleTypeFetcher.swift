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

    static func loadSpecialDaySchedule(for date: Date) async throws -> [Block]? {
        let db = Firestore.firestore()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        let docRef = db.collection("special_days").document(dateString)
        let snapshot = try await docRef.getDocument()
        guard let data = snapshot.data() else { return nil }

        // Check for type "custom" and a "schedule" array
        if let type = data["type"] as? String, type == "custom",
           let scheduleArray = data["schedule"] as? [[String: Any]] {
            let jsonData = try JSONSerialization.data(withJSONObject: scheduleArray)
            let blocks = try JSONDecoder().decode([Block].self, from: jsonData)
            return blocks
        }

        // If not custom, return nil (or handle other types as needed)
        return nil
    }
} 