//
//  GradeLevel.swift
//  SJA_re
//
//  Mirror of chrome-extension/src/types/schedule.ts (GradeLevel + helpers).
//  Used to filter grade-specific blocks in special-day schedules.
//

import Foundation

enum GradeLevel: Int, Codable, CaseIterable, Identifiable {
    case freshman = 9
    case sophomore = 10
    case junior = 11
    case senior = 12

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .freshman:  return "Freshman"
        case .sophomore: return "Sophomore"
        case .junior:    return "Junior"
        case .senior:    return "Senior"
        }
    }

    var labelPlural: String {
        switch self {
        case .freshman:  return "Freshmen"
        case .sophomore: return "Sophomores"
        case .junior:    return "Juniors"
        case .senior:    return "Seniors"
        }
    }
}

/// EST-zoned "school year" — months Jul..Dec belong to the next calendar year.
func currentSchoolYear() -> Int {
    let calendar = Calendar.sja
    let now = Date.currentEST
    let year = calendar.component(.year, from: now)
    let month = calendar.component(.month, from: now)
    return month >= 7 ? year + 1 : year
}

func gradeFromGraduationYear(_ gradYear: Int) -> GradeLevel {
    let raw = max(9, min(12, 12 - (gradYear - currentSchoolYear())))
    return GradeLevel(rawValue: raw) ?? .freshman
}

func graduationYear(from grade: GradeLevel) -> Int {
    currentSchoolYear() + (12 - grade.rawValue)
}
