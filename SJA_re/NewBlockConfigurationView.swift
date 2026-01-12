//
//  NewBlockConfigurationView.swift
//  SJA_re
//
//  New block configuration view matching Chrome extension's ClassSettings.tsx
//

import SwiftUI
import FirebaseAuth

// Feedback types matching LoginView
enum FeedbackType {
    case success
    case error
    case info
    case warning
    
    var color: Color {
        switch self {
        case .success: return .green
        case .error: return .red
        case .info: return .blue
        case .warning: return .orange
        }
    }
    
    var iconName: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.circle.fill"
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        }
    }
}

struct Feedback {
    let type: FeedbackType
    let message: String
}

struct NewBlockConfigurationView: View {
    @StateObject private var prefsManager = BlockPreferencesManager.shared
    @StateObject private var schedulePrefsManager = SchedulePreferencesManager.shared
    @StateObject private var authManager = AuthManager.shared
    @EnvironmentObject private var router: NavigationRouter
    
    let onDismissSettings: () -> Void
    
    @State private var feedback: Feedback?
    @State private var showResetAlert = false
    
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    private let blockKeys: [BlockKey] = ["A", "B", "C", "D", "E"]
    private let defaultBlockNames: [BlockKey: String] = [
        "A": "A Block",
        "B": "B Block",
        "C": "C Block",
        "D": "D Block",
        "E": "E Block"
    ]
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Content
            ScrollView {
                VStack(spacing: 24) {
                    // Login Card
                    VStack(alignment: .leading, spacing: 16) {
                        if authManager.isAuthenticated, let email = authManager.userEmail {
                            // Signed in state
                            HStack(spacing: 12) {
                                // User initial circle
                                Circle()
                                    .fill(accentGreen.opacity(0.12))
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Text(getUserInitial(from: email))
                                            .font(.system(size: 18, weight: .semibold))
                                            .foregroundColor(accentGreen)
                                    )
                                
                                // Email address
                                Text(email)
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                // Sign out button
                                Button(action: handleSignOut) {
                                    Text("Sign out")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color(UIColor.systemGray5))
                                        .cornerRadius(6)
                                }
                            }
                        } else {
                            // Not signed in state
                            HStack {
                                Text("Sign in to sync your schedule across devices.")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                // Sign in button
                                Button(action: {
                                    router.push(.coursesLogin)
                                }) {
                                    Text("Sign in")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color(UIColor.systemGray5))
                                        .cornerRadius(6)
                                }
                            }
                        }
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(8)
                    .padding(.horizontal)
                    .padding(.top)
                    
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Class & Schedule Settings")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                
                                Text("Rename blocks and control how classes appear on Green and White days. Changes save automatically.")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            // Auto-save indicator
                            if case .saving = prefsManager.saveStatus {
                                HStack(spacing: 4) {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Text("Saving…")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            } else if case .success = prefsManager.saveStatus {
                                HStack(spacing: 4) {
                                    Image(systemName: "checkmark")
                                        .font(.caption)
                                    Text("Saved")
                                        .font(.caption)
                                }
                                .foregroundColor(.green)
                            }
                            
                            // Reset Button
                            Button(action: { showResetAlert = true }) {
                                Text("Reset")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            .disabled(prefsManager.isLoading || prefsManager.saveStatus == .saving)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top)
                    
                    // Error Message
                    if case .error(let message) = prefsManager.saveStatus {
                        HStack {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(.red)
                            Text(message)
                                .font(.subheadline)
                                .foregroundColor(.red)
                            Spacer()
                        }
                        .padding()
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                        .padding(.horizontal)
                    }
                    
                    if prefsManager.isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        // Display Settings
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Display Settings")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 12) {
                                HStack {
                                    Text("Time format")
                                        .font(.subheadline)
                                    
                                    Spacer()
                                    
                                    Picker("Time format", selection: Binding(
                                        get: { schedulePrefsManager.preferences.timeFormat },
                                        set: { newValue in
                                            schedulePrefsManager.preferences.timeFormat = newValue
                                            Task {
                                                await schedulePrefsManager.savePreferences()
                                            }
                                        }
                                    )) {
                                        Text("12-hour").tag(TimeFormat.hour12)
                                        Text("24-hour").tag(TimeFormat.hour24)
                                    }
                                    .pickerStyle(.segmented)
                                    .frame(width: 150)
                                }
                                .padding()
                                .background(Color(UIColor.secondarySystemBackground))
                                .cornerRadius(8)
                            }
                            .padding(.horizontal)
                        }
                        
                        // Class Blocks
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Class Blocks")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            VStack(spacing: 0) {
                                // Table Header
                                HStack(spacing: 0) {
                                    Text("Block")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    
                                    Text("Course name")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    
                                    Text("Alternating")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .frame(width: 100)
                                }
                                .padding()
                                .background(Color(UIColor.secondarySystemBackground))
                                
                                Divider()
                                
                                // Table Rows
                                ForEach(blockKeys, id: \.self) { key in
                                    BlockPreferenceRow(
                                        blockKey: key,
                                        blockName: defaultBlockNames[key] ?? "\(key) Block",
                                        preference: Binding(
                                            get: { prefsManager.getPreference(for: key) },
                                            set: { newValue in
                                                prefsManager.updatePreference(for: key, preference: newValue)
                                            }
                                        )
                                    )
                                    
                                    if key != blockKeys.last {
                                        Divider()
                                    }
                                }
                            }
                            .background(Color(UIColor.systemBackground))
                            .cornerRadius(8)
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.bottom)
            }
        }
        .navigationTitle("Courses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarBackground(Color(.systemBackground), for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismissSettings()
                }
                .foregroundColor(Color(red: 20/255, green: 54/255, blue: 27/255))
            }
        }
        .alert("Reset to Defaults", isPresented: $showResetAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Reset", role: .destructive) {
                handleReset()
            }
        } message: {
            Text("Are you sure you want to reset all settings to defaults? This will erase all your custom block names and preferences.")
        }
        .onAppear {
            Task {
                await prefsManager.loadPreferences()
                await schedulePrefsManager.loadPreferences()
            }
        }
    }
    
    private func handleSignOut() {
        Task {
            do {
                try await authManager.signOut()
                feedback = Feedback(type: .info, message: "Signed out. Changes will now stay on this device only.")
            } catch {
                feedback = Feedback(type: .error, message: "Failed to sign out.")
            }
        }
    }
    
    private func handleReset() {
        prefsManager.resetToDefaults()
        schedulePrefsManager.preferences = SchedulePreferences()
        Task {
            await schedulePrefsManager.savePreferences()
        }
        feedback = Feedback(type: .info, message: "Preferences reset to defaults.")
    }
    
    // Get user's initial from email
    private func getUserInitial(from email: String) -> String {
        guard !email.isEmpty else { return "?" }
        let firstChar = email.prefix(1).uppercased()
        return firstChar
    }
}

// MARK: - Account Status Header

struct AccountStatusHeader: View {
    @ObservedObject var authManager: AuthManager
    let onSignOut: () -> Void
    let onOpenLogin: () -> Void
    
    @State private var signOutPending = false
    
    var body: some View {
        VStack(spacing: 0) {
            if authManager.currentUser == nil {
                // Not initialized or checking
                HStack {
                    Text("Checking sign-in status…")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            } else if let user = authManager.currentUser {
                // Signed in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Signed in as")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(authManager.userIdentity)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        
                        if authManager.needsEmailVerification {
                            Text("Email not verified")
                                .font(.caption)
                                .foregroundColor(.orange)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.2))
                                .cornerRadius(4)
                        }
                    }
                    
                    Spacer()
                    
                    Button(action: {
                        signOutPending = true
                        onSignOut()
                        signOutPending = false
                    }) {
                        Text(signOutPending ? "Signing out…" : "Sign out")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color(UIColor.systemGray5))
                            .cornerRadius(6)
                    }
                    .disabled(signOutPending)
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            } else {
                // Not signed in
                VStack(spacing: 12) {
                    Text("Sign in to sync your schedule and class preferences across devices.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                    
                    Button(action: onOpenLogin) {
                        Text("Go to Sign In")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color(red: 20/255, green: 54/255, blue: 27/255))
                            .cornerRadius(8)
                    }
                }
                .padding()
                .background(Color(UIColor.secondarySystemBackground))
            }
        }
    }
}

// MARK: - Feedback Banner

struct FeedbackBanner: View {
    let feedback: Feedback
    
    var body: some View {
        HStack {
            Image(systemName: feedback.type.iconName)
                .foregroundColor(feedback.type.color)
            Text(feedback.message)
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer()
        }
        .padding()
        .background(feedback.type.color.opacity(0.1))
    }
}


// MARK: - Email Verification Banner

struct EmailVerificationBanner: View {
    let onOpenLogin: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your email is not verified. Open the sign-in page to resend the verification email or confirm the link in your inbox.")
                .font(.subheadline)
                .foregroundColor(.primary)
            
            Button(action: onOpenLogin) {
                Text("Manage verification")
                    .font(.subheadline)
                    .foregroundColor(Color(red: 20/255, green: 54/255, blue: 27/255))
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
    }
}

// MARK: - Not Signed In Banner

struct NotSignedInBanner: View {
    var body: some View {
        HStack {
            Image(systemName: "info.circle.fill")
                .foregroundColor(.blue)
            Text("Not signed in. Changes are saved to this device only.")
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer()
        }
        .padding()
        .background(Color.blue.opacity(0.1))
    }
}

// MARK: - Block Preference Row

struct BlockPreferenceRow: View {
    let blockKey: BlockKey
    let blockName: String
    @Binding var preference: BlockPreference
    
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 0) {
                // Block Label
                Text(blockName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                // Course Name Input
                VStack(alignment: .leading, spacing: 8) {
                    if preference.alternating {
                        // Alternating mode: show Green and White inputs
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("🟩 Green")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Spacer()
                            }
                            
                            HStack {
                                TextField("\(blockName) (Green day)", text: Binding(
                                    get: { preference.nameGreen },
                                    set: { newValue in
                                        preference.nameGreen = newValue
                                        savePreference()
                                    }
                                ))
                                .textFieldStyle(.roundedBorder)
                                .disabled(preference.freeGreen)
                                
                                Toggle("", isOn: Binding(
                                    get: { preference.freeGreen },
                                    set: { newValue in
                                        preference.freeGreen = newValue
                                        if newValue {
                                            preference.nameGreenBackup = preference.nameGreen
                                            preference.nameGreen = "Free Block"
                                        } else {
                                            preference.nameGreen = preference.nameGreenBackup.isEmpty ? "" : preference.nameGreenBackup
                                        }
                                        savePreference()
                                    }
                                ))
                                .labelsHidden()
                                Text("Free")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            HStack {
                                Text("⬜️ White")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Spacer()
                            }
                            
                            HStack {
                                TextField("\(blockName) (White day)", text: Binding(
                                    get: { preference.nameWhite },
                                    set: { newValue in
                                        preference.nameWhite = newValue
                                        savePreference()
                                    }
                                ))
                                .textFieldStyle(.roundedBorder)
                                .disabled(preference.freeWhite)
                                
                                Toggle("", isOn: Binding(
                                    get: { preference.freeWhite },
                                    set: { newValue in
                                        preference.freeWhite = newValue
                                        if newValue {
                                            preference.nameWhiteBackup = preference.nameWhite
                                            preference.nameWhite = "Free Block"
                                        } else {
                                            preference.nameWhite = preference.nameWhiteBackup.isEmpty ? "" : preference.nameWhiteBackup
                                        }
                                        savePreference()
                                    }
                                ))
                                .labelsHidden()
                                Text("Free")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    } else {
                        // Non-alternating mode: single input
                        HStack {
                            TextField(blockName, text: Binding(
                                get: { preference.name },
                                set: { newValue in
                                    preference.name = newValue
                                    savePreference()
                                }
                            ))
                            .textFieldStyle(.roundedBorder)
                            .disabled(preference.free)
                            
                            Toggle("", isOn: Binding(
                                get: { preference.free },
                                set: { newValue in
                                    preference.free = newValue
                                    if newValue {
                                        preference.nameBackup = preference.name
                                        preference.name = "Free Block"
                                    } else {
                                        preference.name = preference.nameBackup.isEmpty ? "" : preference.nameBackup
                                    }
                                    savePreference()
                                }
                            ))
                            .labelsHidden()
                            Text("Free")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // Alternating Toggle
                Toggle("", isOn: Binding(
                    get: { preference.alternating },
                    set: { newValue in
                        preference.alternating = newValue
                        if newValue {
                            // When enabling alternating, copy current name to both fields if they're empty
                            if preference.nameGreen.isEmpty {
                                preference.nameGreen = preference.free ? "" : preference.name
                            }
                            if preference.nameWhite.isEmpty {
                                preference.nameWhite = preference.free ? "" : preference.name
                            }
                            if preference.free {
                                preference.freeGreen = true
                                preference.freeWhite = true
                            }
                        }
                        savePreference()
                    }
                ))
                .labelsHidden()
                .frame(width: 100)
            }
        }
        .padding()
    }
    
    private func savePreference() {
        BlockPreferencesManager.shared.updatePreference(for: blockKey, preference: preference)
    }
}

