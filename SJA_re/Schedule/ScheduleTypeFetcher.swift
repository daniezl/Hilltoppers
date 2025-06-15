import Foundation
import FirebaseFirestore

struct ScheduleTypeFetcher {
    static func fetchTypeFor(date: Date) async throws -> String? {
        // print("FIREBASE CALL: fetchTypeFor")
        let db = Firestore.firestore()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        // print("Looking up Firestore for date: \(dateString)")
        
        do {
            let docRef = db.collection("special_days").document(dateString)
            let snapshot = try await docRef.getDocument()
            if let data = snapshot.data(), let type = data["type"] as? String {
                return type
            }
            return nil
        } catch {
            // print("Firebase error in fetchTypeFor: \(error)")
            throw error
        }
    }

    static func isInSpecialPeriod(date: Date) async throws -> Bool {
        // print("FIREBASE CALL: isInSpecialPeriod")
        let db = Firestore.firestore()
        
        do {
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
        } catch {
            // print("Firebase error in isInSpecialPeriod: \(error)")
            throw error
        }
    }

    static func loadCustomSchedule(for date: Date) async throws -> [Block]? {
        // print("FIREBASE CALL: loadCustomSchedule")
        let db = Firestore.firestore()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        
        do {
            let docRef = db.collection("special_days").document(dateString)
            let snapshot = try await docRef.getDocument()
            guard let data = snapshot.data() else { return nil }

            // Always try to read and decode the 'schedule' array
            if let scheduleArray = data["schedule"] as? [[String: Any]] {
                let jsonData = try JSONSerialization.data(withJSONObject: scheduleArray)
                let blocks = try JSONDecoder().decode([Block].self, from: jsonData)
                return blocks
            }

            // If no schedule array, return nil
            return nil
        } catch {
            // print("Firebase error in loadCustomSchedule: \(error)")
            throw error
        }
    }

    // Batch fetch all special days in a date range
    static func fetchSpecialDaysDict(start: Date, end: Date) async throws -> [String: String] {
        // print("FIREBASE CALL: fetchSpecialDaysDict")
        let db = Firestore.firestore()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let startString = formatter.string(from: start)
        let endString = formatter.string(from: end)
        
        do {
            let query = db.collection("special_days")
                .whereField(FieldPath.documentID(), isGreaterThanOrEqualTo: startString)
                .whereField(FieldPath.documentID(), isLessThanOrEqualTo: endString)
            let snapshot = try await query.getDocuments()
            var dict: [String: String] = [:]
            for doc in snapshot.documents {
                if let type = doc.data()["type"] as? String {
                    dict[doc.documentID] = type
                }
            }
            return dict
        } catch {
            // print("Firebase error in fetchSpecialDaysDict: \(error)")
            throw error
        }
    }

    // Batch fetch all special periods overlapping a date range
    static func fetchSpecialPeriods(start: Date, end: Date) async throws -> [(start: Date, end: Date)] {
        // print("FIREBASE CALL: fetchSpecialPeriods")
        let db = Firestore.firestore()
        
        do {
            let snapshot = try await db.collection("special_periods").getDocuments()
            var periods: [(Date, Date)] = []
            for doc in snapshot.documents {
                let data = doc.data()
                if let startTS = data["start"] as? Timestamp,
                   let endTS = data["end"] as? Timestamp {
                    let s = startTS.dateValue()
                    let e = endTS.dateValue()
                    // Only include periods that overlap our range
                    if e >= start && s <= end {
                        periods.append((s, e))
                    }
                }
            }
            return periods
        } catch {
            // print("Firebase error in fetchSpecialPeriods: \(error)")
            throw error
        }
    }

    // Predict day type using batch-fetched data
    static func predictDayType(
        dbDayType: String,
        dbDate: Date,
        testDate: Date?
    ) async throws -> String {
        // print("FIREBASE CALL: predictDayType")
        let today = testDate ?? Date()
        
        do {
            // print("Fetching special days from \(dbDate) to \(today)")
            let specialDays = try await fetchSpecialDaysDict(start: dbDate, end: today)
            // print("Fetching special periods from \(dbDate) to \(today)")
            let specialPeriods = try await fetchSpecialPeriods(start: dbDate, end: today)
            
            var predictIsGreen = dbDayType.lowercased().contains("green")
            var date = Calendar.current.date(byAdding: .day, value: 1, to: dbDate) ?? dbDate
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            
            while date <= today {
                let dateString = formatter.string(from: date)
                let isSchoolDay: Bool = {
                    if let type = specialDays[dateString] {
                        // print("Checked \(dateString): special day type = \(type)")
                        return type != "no_school"
                    }
                    for period in specialPeriods {
                        if date >= period.0 && date <= period.1 {
                            // print("Checked \(dateString): in special period")
                            return false
                        }
                    }
                    let weekday = Calendar.current.component(.weekday, from: date)
                    if weekday == 1 || weekday == 7 {
                        // print("Checked \(dateString): weekend")
                        return false
                    }
                    // print("Checked \(dateString): regular school day")
                    return true
                }()
                
                if isSchoolDay {
                    // print("Toggled isGreen for \(dateString)")
                    predictIsGreen.toggle()
                }
                date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
            }
            
            // print("Final prediction: \(predictIsGreen ? "Green Day" : "White Day")")
            return predictIsGreen ? "Green Day" : "White Day"
        } catch {
            // print("Firebase error in predictDayType: \(error)")
            throw error
        }
    }
    
    // Generate detailed calculation steps showing day-by-day breakdown
    static func generateCalculationSteps(
        dbDayType: String,
        dbDate: Date,
        testDate: Date?
    ) async throws -> [(date: Date, prediction: String, isToday: Bool)] {
                 // print("FIREBASE CALL: generateCalculationSteps")
        let today = testDate ?? Date()
        
        do {
            // print("Fetching special days from \(dbDate) to \(today)")
            let specialDays = try await fetchSpecialDaysDict(start: dbDate, end: today)
            // print("Fetching special periods from \(dbDate) to \(today)")
            let specialPeriods = try await fetchSpecialPeriods(start: dbDate, end: today)
            
            var steps: [(date: Date, prediction: String, isToday: Bool)] = []
            var predictIsGreen = dbDayType.lowercased().contains("green")
            var date = Calendar.current.date(byAdding: .day, value: 1, to: dbDate) ?? dbDate
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            
            // Limit to 30 days for safety
            var dayCount = 0
            while date <= today && dayCount < 30 {
                let dateString = formatter.string(from: date)
                let isToday = Calendar.current.isDate(date, inSameDayAs: today)
                
                let (isSchoolDay, dayDescription): (Bool, String) = {
                    // Check special days first
                    if let type = specialDays[dateString] {
                        // print("Checked \(dateString): special day type = \(type)")
                        if type == "no_school" {
                            return (false, "No school (special day)")
                        } else {
                            return (true, type.capitalized.replacingOccurrences(of: "_", with: " "))
                        }
                    }
                    
                    // Check special periods
                    for period in specialPeriods {
                        if date >= period.0 && date <= period.1 {
                            // print("Checked \(dateString): in special period")
                            return (false, "No school (break)")
                        }
                    }
                    
                    // Check if weekend
                    let weekday = Calendar.current.component(.weekday, from: date)
                    if weekday == 1 || weekday == 7 {
                        // print("Checked \(dateString): weekend")
                        return (false, "No school (weekend)")
                    }
                    
                    // Regular school day
                    // print("Checked \(dateString): regular school day")
                    return (true, "Regular school day")
                }()
                
                let prediction: String
                if isSchoolDay {
                    // print("Toggled isGreen for \(dateString)")
                    predictIsGreen.toggle()
                    prediction = predictIsGreen ? "Green Day" : "White Day"
                } else {
                    prediction = dayDescription
                }
                
                steps.append((date: date, prediction: prediction, isToday: isToday))
                
                // Stop if we've reached today
                if isToday { break }
                
                date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
                dayCount += 1
            }
            
            return steps
        } catch {
            // print("Firebase error in generateCalculationSteps: \(error)")
            throw error
        }
    }
} 