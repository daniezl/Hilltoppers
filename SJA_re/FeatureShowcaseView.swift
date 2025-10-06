import SwiftUI

struct FeatureShowcaseView: View {
    @Environment(\.colorScheme) private var colorScheme
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                featureHighlights
                setupTips
                Spacer(minLength: 0)
            }
            .padding(.vertical, 32)
            .padding(.horizontal, 24)
        }
        .background(backgroundColor.ignoresSafeArea())
        .navigationTitle("What's New")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text("Widget")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundColor(accentGreen)

                Text("BETA")
                    .font(.system(size: 15, weight: .bold))
                    .padding(.vertical, 5)
                    .padding(.horizontal, 14)
                    .background(
                        Capsule()
                            .fill(accentGreen.opacity(colorScheme == .dark ? 0.5 : 0.12))
                    )
                    .overlay(
                        Capsule()
                            .stroke(accentGreen.opacity(colorScheme == .dark ? 0.8 : 0.4), lineWidth: 1)
                    )
                    .foregroundColor(accentGreen)
            }

            Text("Keep an eye on your next class without opening the app. The new Class Countdown widget brings your schedule to the Home Screen and Lock Screen.")
                .font(.body)
                .foregroundColor(.secondary)
        }
    }

    private var featureHighlights: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("What you get")
                .font(.title2.bold())
                .foregroundColor(colorScheme == .dark ? .white : .primary)

            VStack(alignment: .leading, spacing: 16) {
                FeatureHighlightRow(symbol: "timer", title: "Live countdown", description: "See how much time is left in the current block at a glance.")
                FeatureHighlightRow(symbol: "rectangle.and.text.magnifyingglass", title: "Up next", description: "Know which block is coming next so you can plan ahead.")
                FeatureHighlightRow(symbol: "bell.badge", title: "Stays in sync", description: "Updates automatically with schedule changes from the app.")
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(cardColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(accentGreen.opacity(colorScheme == .dark ? 0.35 : 0.2), lineWidth: 1)
            )
        }
    }

    private var setupTips: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("How to try it")
                .font(.title3.bold())
            VStack(alignment: .leading, spacing: 12) {
                TipRow(step: "1", text: "Touch and hold an empty area on your Home Screen until your apps jiggle.")
                TipRow(step: "2", text: "Tap the + button, search for \"Class Countdown\", then choose the small widget.")
                TipRow(step: "3", text: "Place it where you like. The widget switches between light and dark looks automatically.")
            }
        }
    }

    private var backgroundColor: Color {
        colorScheme == .dark ? Color.black : Color(red: 245/255, green: 246/255, blue: 245/255)
    }

    private var cardColor: Color {
        colorScheme == .dark ? Color(red: 24/255, green: 24/255, blue: 24/255) : Color.white
    }
}

private struct FeatureHighlightRow: View {
    let symbol: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .frame(width: 32, height: 32)
                .foregroundColor(Color(red: 20/255, green: 54/255, blue: 27/255))
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(red: 236/255, green: 242/255, blue: 236/255))
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
    }
}

private struct TipRow: View {
    let step: String
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(step)
                .font(.system(size: 16, weight: .bold))
                .frame(width: 24, height: 24)
                .foregroundColor(.white)
                .background(
                    Circle()
                        .fill(Color(red: 20/255, green: 54/255, blue: 27/255))
                )
            Text(text)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    NavigationView {
        FeatureShowcaseView()
    }
}
