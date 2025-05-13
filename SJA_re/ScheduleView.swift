import SwiftUI
import Foundation // Needed for Schedule and Period

struct ScheduleView: View {
    let schedule: Schedule

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(schedule.dayType)
                .font(.largeTitle)
                .bold()
                .padding(.bottom, 8)

            ForEach(schedule.periods) { period in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(period.name)
                            .font(.headline)
                        Spacer()
                        Text("\(period.startTime) - \(period.endTime)")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    if let subPeriods = period.subPeriods {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(subPeriods) { sub in
                                HStack {
                                    Text("• \(sub.name)")
                                        .font(.subheadline)
                                    Spacer()
                                    Text("\(sub.startTime) - \(sub.endTime)")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(.leading, 16)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding()
    }
} 