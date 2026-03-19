import SwiftUI

struct MoreInfoView: View {
    let onDismiss: () -> Void
    @Environment(\.openURL) private var openURL

    private var versionString: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return version.map { "Version \($0)" } ?? "Version unavailable"
    }

    private var supportURL: URL? {
        URL(string: "https://ko-fi.com/daniezl")
    }

    private var feedbackURL: URL? {
        URL(string: "mailto:yaoyu.zhang@student.stjacademy.org")
    }

    private var accentGreen: Color {
        Color(red: 20/255, green: 54/255, blue: 27/255)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("About This App")
                .font(.title3.weight(.semibold))

            VStack(alignment: .leading, spacing: 8) {
                Text(versionString)
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.primary)
                Text("Thank you for using the Hilltoppers schedule app!")
                    .font(.callout)
                    .foregroundColor(.secondary)
            }

            Divider()

            NavigationLink {
                DebugRefreshTimelineView()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "clock.arrow.2.circlepath")
                    Text("Debug Refresh Timeline")
                        .font(.callout.weight(.semibold))
                }
                .foregroundColor(.primary)
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(accentGreen.opacity(0.12))
                .cornerRadius(12)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Developer")
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.primary)
                Text("Daniel Zhang")
                    .font(.callout)
                    .foregroundColor(.primary)
                Text("Questions or feedback?")
                    .font(.callout)
                    .foregroundColor(.secondary)

                if let feedbackURL {
                    Button {
                        openURL(feedbackURL)
                    } label: {
                        HStack {
                            Image(systemName: "envelope.fill")
                            Text("Email Me")
                        }
                        .font(.callout.weight(.semibold))
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(accentGreen.opacity(0.12))
                        .foregroundColor(accentGreen)
                        .cornerRadius(12)
                    }
                    .buttonStyle(.plain)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                Text("Support")
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.primary)

                Text("If the app helped you out, you can buy me a Fresca on Ko-fi. Your support keeps the project going!")
                    .font(.callout)
                    .foregroundColor(.secondary)

                if let supportURL {
                    Button {
                        openURL(supportURL)
                    } label: {
                        HStack {
                            Image(systemName: "cup.and.saucer.fill")
                            Text("Buy me a Fresca")
                        }
                        .font(.callout.weight(.semibold))
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(accentGreen.opacity(0.12))
                        .foregroundColor(accentGreen)
                        .cornerRadius(12)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismiss()
                }
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
}
