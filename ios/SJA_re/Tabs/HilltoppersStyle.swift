import SwiftUI

/// The look shared by every tab. Light mode only: the app sets
/// `.preferredColorScheme(.light)` at the root, so colors here are literal.
enum HT {
    static let green = Color(red: 20/255, green: 54/255, blue: 27/255)
    static let brightGreen = Color(red: 26/255, green: 127/255, blue: 55/255)
    static let softGreen = Color(red: 228/255, green: 243/255, blue: 232/255)
    static let page = Color(red: 244/255, green: 246/255, blue: 244/255)
    static let hairline = Color.black.opacity(0.06)
}

struct CardStyle: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(HT.hairline, lineWidth: 1)
            )
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View {
        modifier(CardStyle(padding: padding))
    }

    /// Liquid Glass on iOS 26; the closest material on older systems.
    @ViewBuilder
    func glassCard() -> some View {
        let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
        if #available(iOS 26.0, *) {
            glassEffect(.regular, in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(HT.hairline, lineWidth: 1))
        }
    }
}

/// Large screen title with optional trailing controls, used instead of a
/// navigation bar so every tab starts at the same height.
struct TabHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(HT.green)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 8)
            trailing()
        }
    }
}

struct StepButton: View {
    let systemName: String
    let label: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(enabled ? HT.green : Color.gray.opacity(0.4))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white))
                .overlay(Circle().stroke(HT.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

/// Centered message for empty, loading and failed states.
struct StatusMessage: View {
    let systemImage: String
    let text: String
    var isLoading = false

    var body: some View {
        VStack(spacing: 10) {
            if isLoading {
                ProgressView()
            } else {
                Image(systemName: systemImage)
                    .font(.system(size: 28))
                    .foregroundColor(.secondary.opacity(0.7))
            }
            Text(text)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 180)
    }
}

/// One line of a settings card: a title, and whatever belongs on the right.
struct SettingsRowLabel<Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }
}

/// A settings row that opens a menu of choices, showing the current one in gray.
struct SettingsPickerRow<Value: Hashable, Options: View>: View {
    let title: String
    let value: String
    @Binding var selection: Value
    @ViewBuilder let options: () -> Options

    var body: some View {
        Menu {
            Picker(title, selection: $selection, content: options)
        } label: {
            SettingsRowLabel(title: title) {
                HStack(spacing: 5) {
                    Text(value)
                        .font(.subheadline)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundColor(.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

/// A settings row that leads somewhere else, marked with a chevron.
struct SettingsActionRow: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            SettingsRowLabel(title: title) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary.opacity(0.6))
            }
        }
        .buttonStyle(.plain)
    }
}

/// Divider between rows, starting where their titles start.
struct SettingsRowDivider: View {
    var body: some View {
        Divider().padding(.leading, 16)
    }
}

/// Date and clock formatting in the school's timezone, whatever the phone is set to.
enum SchoolTime {
    private static var formatters: [String: DateFormatter] = [:]

    private static func formatter(_ format: String) -> DateFormatter {
        if let cached = formatters[format] { return cached }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Date.estTimeZone
        formatter.dateFormat = format
        formatters[format] = formatter
        return formatter
    }

    static func key(_ date: Date) -> String {
        formatter("yyyy-MM-dd").string(from: date)
    }

    static func date(fromKey key: String) -> Date? {
        formatter("yyyy-MM-dd").date(from: key)
    }

    static func string(_ date: Date, _ format: String) -> String {
        formatter(format).string(from: date)
    }

    /// "13:30" becomes "1:30", or stays "13:30" in 24-hour mode.
    static func clock(_ hhmm: String, _ timeFormat: TimeFormat) -> String {
        guard let parsed = formatter("H:mm").date(from: hhmm) else { return hhmm }
        return formatter(timeFormat == .hour24 ? "HH:mm" : "h:mm").string(from: parsed)
    }

    static func range(_ start: String, _ end: String, _ timeFormat: TimeFormat) -> String {
        "\(clock(start, timeFormat)) – \(clock(end, timeFormat))"
    }

    /// Nearby days read conversationally; the rest carry the date so two
    /// Tuesdays cannot be confused.
    static func relativeLabel(_ key: String, now: Date = Date.currentEST) -> String {
        guard let day = date(fromKey: key) else { return key }
        let today = Calendar.sja.startOfDay(for: now)
        let diff = Calendar.sja.dateComponents([.day], from: today, to: Calendar.sja.startOfDay(for: day)).day ?? 0
        switch diff {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case -1: return "Yesterday"
        default: return string(day, "EEE, MMM d")
        }
    }

    /// "1h9m" from an hour up, like the widget; "02:23" below that.
    static func countdown(_ seconds: Int) -> String {
        let total = max(0, seconds)
        if total >= 3600 {
            let minutes = (total % 3600) / 60
            return minutes == 0 ? "\(total / 3600)h" : "\(total / 3600)h\(minutes)m"
        }
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

/// Lunch sub-blocks are named "1st Lunch" … "5th Lunch".
func lunchWave(fromName name: String) -> Int? {
    guard let digit = name.first?.wholeNumberValue, (1...5).contains(digit) else { return nil }
    return digit
}

func lunchWaveLabel(_ wave: Int) -> String {
    ["1st", "2nd", "3rd", "4th", "5th"][max(1, min(5, wave)) - 1] + " Lunch"
}
