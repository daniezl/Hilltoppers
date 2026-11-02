import SwiftUI
import UIKit.UIGestureRecognizerSubclass

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
    /// How one title gives way to the next when the title changes.
    var titleTransition: AnyTransition = .identity
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center) {
            ZStack(alignment: .leading) {
                Text(title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundColor(HT.green)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .id(title)
                    .transition(titleTransition)
            }
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

/// Today's day type, in the same pill the extension uses.
struct DayTypePill: View {
    let isGreen: Bool

    var body: some View {
        Text(isGreen ? "GREEN DAY" : "WHITE DAY")
            .font(.caption.weight(.medium))
            .tracking(1)
            .foregroundColor(isGreen ? HT.green : Color(red: 85/255, green: 95/255, blue: 106/255))
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(
                isGreen ? HT.brightGreen.opacity(0.12) : Color(red: 240/255, green: 242/255, blue: 245/255),
                in: Capsule()
            )
            .overlay(
                Capsule().stroke(isGreen ? HT.brightGreen.opacity(0.25) : Color.black.opacity(0.18), lineWidth: 1)
            )
    }
}

/// A card with a small tail on top, so it reads as coming out of what's above it.
private struct SpeechBubble: Shape {
    let tailFromTrailing: CGFloat
    let tailHeight: CGFloat
    var cornerRadius: CGFloat = 20
    var tailWidth: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        let top = rect.minY + tailHeight
        let tailCenter = rect.maxX - tailFromTrailing
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + cornerRadius, y: top))
        path.addLine(to: CGPoint(x: tailCenter - tailWidth / 2, y: top))
        path.addLine(to: CGPoint(x: tailCenter, y: rect.minY))
        path.addLine(to: CGPoint(x: tailCenter + tailWidth / 2, y: top))
        path.addArc(tangent1End: CGPoint(x: rect.maxX, y: top), tangent2End: CGPoint(x: rect.maxX, y: rect.maxY), radius: cornerRadius)
        path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.maxY), tangent2End: CGPoint(x: rect.minX, y: rect.maxY), radius: cornerRadius)
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.maxY), tangent2End: CGPoint(x: rect.minX, y: top), radius: cornerRadius)
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: top), tangent2End: CGPoint(x: rect.maxX, y: top), radius: cornerRadius)
        path.closeSubpath()
        return path
    }
}

/// Asks before leaving the app, from under the day type pill that opened it.
struct BulletinConfirmation: View {
    let onCancel: () -> Void
    let onOpen: () -> Void

    private static let width: CGFloat = 250
    private static let tailHeight: CGFloat = 8
    /// Lands under the pill's middle when this sits at the same margin as the cards.
    private static let tailFromTrailing: CGFloat = 65

    /// Grows out of the tail's tip, so it seems to come from the pill.
    static let transition = AnyTransition
        .scale(scale: 0.4, anchor: UnitPoint(x: 1 - tailFromTrailing / width, y: 0))
        .combined(with: .opacity)

    var body: some View {
        let bubble = SpeechBubble(tailFromTrailing: Self.tailFromTrailing, tailHeight: Self.tailHeight)

        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Open Daily Bulletin?")
                    .font(.subheadline.weight(.semibold))
                Text("You'll leave the app and go to the school's website.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                choice("Cancel", foreground: HT.green, background: Color.black.opacity(0.06), action: onCancel)
                choice("Open", foreground: HT.green, background: HT.brightGreen.opacity(0.12), action: onOpen)
            }
        }
        .padding(14)
        .padding(.top, Self.tailHeight)
        .frame(width: Self.width)
        .background(bubble.fill(Color.white))
        .overlay(bubble.stroke(HT.hairline, lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 18, y: 6)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private func choice(_ title: String, foreground: Color, background: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(foreground)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(background, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// A short text action in a capsule, floating over the page.
struct CapsuleButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        let label = Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(HT.green)

        if #available(iOS 26.0, *) {
            Button(action: action) { label }
                .buttonStyle(.glass)
        } else {
            Button(action: action) {
                label
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(HT.hairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
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

/// How far the current or latest touch has moved. SwiftUI's tap still fires after about
/// 10pt of movement, which turns the start of a short swipe into a tap. This watches
/// without taking part: it never recognizes, and it leaves every other gesture alone.
final class TouchMovementTracker: UIGestureRecognizer, UIGestureRecognizerDelegate {
    static let shared = TouchMovementTracker()

    /// A steady finger still moves a little during a real tap.
    private static let tapTolerance: CGFloat = 5

    private var start: CGPoint = .zero
    private var farthest: CGFloat = 0

    /// For a tap handler to check, so that only a finger that stayed put counts.
    var wasTap: Bool { farthest <= Self.tapTolerance }

    private init() {
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
        delegate = self
    }

    private func record(_ touches: Set<UITouch>) {
        guard let point = touches.first?.location(in: nil) else { return }
        farthest = max(farthest, hypot(point.x - start.x, point.y - start.y))
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        start = touches.first?.location(in: nil) ?? .zero
        farthest = 0
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        record(touches)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        record(touches)
        state = .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        state = .failed
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        true
    }
}

/// Puts the tracker on the window, so it sees touches anywhere in the app.
struct TouchMovementTrackerInstaller: UIViewRepresentable {
    final class Host: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let window, TouchMovementTracker.shared.view !== window else { return }
            window.addGestureRecognizer(TouchMovementTracker.shared)
        }
    }

    func makeUIView(context: Context) -> Host {
        let host = Host()
        host.isUserInteractionEnabled = false
        return host
    }

    func updateUIView(_ uiView: Host, context: Context) {}
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

/// The new content slides in from the side the finger is moving away from.
func slideTransition(direction: Int) -> AnyTransition {
    .asymmetric(
        insertion: .move(edge: direction > 0 ? .trailing : .leading).combined(with: .opacity),
        removal: .move(edge: direction > 0 ? .leading : .trailing).combined(with: .opacity)
    )
}

/// Horizontal swipe that shows the finger's movement. A drag commits to one direction
/// when it starts: `isSwiping` turns on for a sideways one, so the page can stop
/// scrolling, and a vertical one never counts as a swipe however it moves later.
/// A step of +1 means the next item, -1 the previous.
struct HorizontalSwipe: ViewModifier {
    @Binding var offset: CGFloat
    @Binding var isSwiping: Bool
    let onStep: (Int) -> Void
    @State private var lockedAxis: Axis?
    @GestureState private var isDragging = false

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(
                DragGesture(minimumDistance: 10)
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        if lockedAxis == nil {
                            let isSideways = abs(value.translation.width) > abs(value.translation.height)
                            lockedAxis = isSideways ? .horizontal : .vertical
                            isSwiping = isSideways
                        }
                        if lockedAxis == .horizontal {
                            offset = value.translation.width * 0.6
                        }
                    }
                    .onEnded { value in
                        let width = value.translation.width
                        if lockedAxis == .horizontal, abs(width) > 60 || abs(value.predictedEndTranslation.width) > 140 {
                            onStep(width < 0 ? 1 : -1)
                        }
                    }
            )
            // Here rather than in onEnded, which a cancelled drag never reaches.
            .onChange(of: isDragging) { dragging in
                guard !dragging else { return }
                lockedAxis = nil
                isSwiping = false
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { offset = 0 }
            }
    }
}

/// A drag's offset kept outside the view that starts it, so following a finger
/// redraws only what observes this and not the whole screen around it.
final class SwipeOffset: ObservableObject {
    @Published var value: CGFloat = 0
}

/// Redraws just its content as a `SwipeOffset` changes.
struct SwipeOffsetReader<Content: View>: View {
    @ObservedObject var offset: SwipeOffset
    @ViewBuilder let content: (CGFloat) -> Content

    var body: some View {
        content(offset.value)
    }
}

extension View {
    func readHeight(into height: Binding<CGFloat>) -> some View {
        background(
            GeometryReader { geometry in
                Color.clear
                    .onAppear { height.wrappedValue = geometry.size.height }
                    .onChange(of: geometry.size.height) { height.wrappedValue = $0 }
            }
        )
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
