//
//  AuthView.swift
//  SJA_re
//
//  Email Authentication View
//

import SwiftUI
import FirebaseAuth

enum AuthMode {
    case signIn
    case register
    
    var title: String {
        switch self {
        case .signIn: return "Sign In"
        case .register: return "Create Account"
        }
    }
    
    var submitButtonTitle: String {
        switch self {
        case .signIn: return "Sign in with email"
        case .register: return "Create account"
        }
    }
    
    var togglePrompt: String {
        switch self {
        case .signIn: return "Need an account? Register"
        case .register: return "Have an account? Sign in"
        }
    }
}

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
}

struct Feedback {
    let type: FeedbackType
    let message: String
}

struct AuthView: View {
    @StateObject private var authManager = AuthManager.shared
    @State private var authMode: AuthMode = .signIn
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var showPassword: Bool = false
    @State private var isBusy: Bool = false
    @State private var feedback: Feedback?
    @State private var resendCooldown: Int = 0
    @State private var verificationCheckTimer: Timer?
    
    let onDismiss: () -> Void
    
    private let accentGreen = Color(red: 20/255, green: 54/255, blue: 27/255)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 8) {
                    Text("Sign in to Hilltoppers")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    Text("Sync your schedule and class preferences across every device.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.top, 20)
                
                // Feedback Message
                if let feedback = feedback {
                    FeedbackView(feedback: feedback)
                }
                
                // Email Verification Notice
                if authManager.needsEmailVerification {
                    EmailVerificationNotice(
                        isBusy: $isBusy,
                        resendCooldown: $resendCooldown,
                        onResend: handleResendVerification,
                        onRefresh: handleRefreshVerification
                    )
                }
                
                // Authenticated User Notice
                if authManager.isAuthenticated && !authManager.needsEmailVerification {
                    AuthenticatedNotice(identity: authManager.userIdentity)
                }
                
                // Login Form (hide when email needs verification)
                if !authManager.needsEmailVerification {
                    VStack(spacing: 16) {
                        // Email Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            TextField("your@email.com", text: $email)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                                .disabled(isBusy)
                        }
                        
                        // Password Field
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password")
                                .font(.headline)
                                .foregroundColor(.primary)
                            
                            HStack {
                                if showPassword {
                                    TextField("Enter password", text: $password)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                        .disabled(isBusy)
                                } else {
                                    SecureField("Enter password", text: $password)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                        .disabled(isBusy)
                                }
                                
                                Button(action: { showPassword.toggle() }) {
                                    Text(showPassword ? "Hide" : "Show")
                                        .font(.caption)
                                        .foregroundColor(accentGreen)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(12)
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(8)
                        }
                        
                        // Submit Button
                        Button(action: handleEmailSubmit) {
                            HStack {
                                if isBusy {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Text(authMode.submitButtonTitle)
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(accentGreen)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(isBusy)
                        
                        // Toggle Mode Button
                        Button(action: toggleAuthMode) {
                            Text(authMode.togglePrompt)
                                .font(.subheadline)
                                .foregroundColor(accentGreen)
                        }
                        .disabled(isBusy)
                    }
                    .padding(.horizontal)
                }
                
                Spacer(minLength: 40)
                
                // Sign Out Button (if authenticated)
                if authManager.isAuthenticated {
                    Button(action: handleSignOut) {
                        Text("Sign Out")
                            .font(.subheadline)
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .disabled(isBusy)
                }
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") {
                    onDismiss()
                }
                .foregroundColor(.blue)
            }
        }
        .onAppear {
            // Start automatic verification check if needed
            if authManager.needsEmailVerification {
                startVerificationCheck()
            }
        }
        .onDisappear {
            stopVerificationCheck()
        }
        .onChange(of: authManager.needsEmailVerification) { needsVerification in
            if needsVerification {
                startVerificationCheck()
            } else {
                stopVerificationCheck()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            // Check verification status when app returns to foreground
            if authManager.needsEmailVerification {
                Task {
                    await checkVerificationStatus()
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func handleEmailSubmit() {
        guard !isBusy else { return }
        
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        let trimmedPassword = password.trimmingCharacters(in: .whitespaces)
        
        guard !trimmedEmail.isEmpty, !trimmedPassword.isEmpty else {
            feedback = Feedback(type: .error, message: "Email and password are required.")
            return
        }
        
        isBusy = true
        feedback = nil
        
        Task {
            do {
                if authMode == .register {
                    try await authManager.register(email: trimmedEmail, password: trimmedPassword)
                    feedback = Feedback(
                        type: .info,
                        message: "Account created. We just sent a verification email — please check your inbox (including spam or junk folders)."
                    )
                    
                    // Send verification email
                    do {
                        try await authManager.sendVerificationEmail()
                        resendCooldown = 60
                        startCooldownTimer()
                    } catch {
                        feedback = Feedback(
                            type: .error,
                            message: "Account created, but the verification email could not be sent. Please try resending in a moment."
                        )
                    }
                } else {
                    try await authManager.signIn(email: trimmedEmail, password: trimmedPassword)
                    
                    if authManager.needsEmailVerification {
                        feedback = Feedback(
                            type: .warning,
                            message: "Signed in. Please verify your email to finish setting up syncing."
                        )
                    } else {
                        feedback = Feedback(type: .success, message: "Signed in successfully.")
                    }
                }
                password = ""
            } catch let error as AuthError {
                feedback = Feedback(type: .error, message: error.localizedDescription)
            } catch {
                feedback = Feedback(type: .error, message: error.localizedDescription)
            }
            
            isBusy = false
        }
    }
    
    private func handleResendVerification() {
        guard !isBusy, resendCooldown == 0 else {
            if resendCooldown > 0 {
                feedback = Feedback(
                    type: .info,
                    message: "Please wait \(resendCooldown) seconds before sending another verification email."
                )
            }
            return
        }
        
        isBusy = true
        feedback = nil
        
        Task {
            do {
                try await authManager.sendVerificationEmail()
                feedback = Feedback(
                    type: .info,
                    message: "Verification email sent. Please check your inbox (including spam or junk folders)."
                )
                resendCooldown = 60
                startCooldownTimer()
            } catch let error as AuthError {
                if case .tooManyRequests = error {
                    feedback = Feedback(
                        type: .error,
                        message: "Too many attempts. Please wait one minute before trying again."
                    )
                    resendCooldown = 60
                    startCooldownTimer()
                } else {
                    feedback = Feedback(type: .error, message: error.localizedDescription)
                }
            } catch {
                feedback = Feedback(type: .error, message: error.localizedDescription)
            }
            
            isBusy = false
        }
    }
    
    private func handleRefreshVerification() {
        guard !isBusy else { return }
        
        isBusy = true
        feedback = nil
        
        Task {
            await checkVerificationStatus()
            isBusy = false
        }
    }
    
    private func checkVerificationStatus() async {
        do {
            let isVerified = try await authManager.reloadUser()
            
            if isVerified {
                await MainActor.run {
                    feedback = Feedback(type: .success, message: "Email verified! You're all set.")
                }
            } else {
                await MainActor.run {
                    feedback = Feedback(
                        type: .warning,
                        message: "We still cannot confirm the verification. Click the link in your email, then try again."
                    )
                }
            }
        } catch {
            await MainActor.run {
                feedback = Feedback(type: .error, message: "Failed to check verification status.")
            }
        }
    }
    
    private func handleSignOut() {
        guard !isBusy else { return }
        
        isBusy = true
        feedback = nil
        
        Task {
            do {
                try await authManager.signOut()
                feedback = Feedback(type: .info, message: "Signed out. You can still browse settings locally.")
                email = ""
                password = ""
            } catch {
                feedback = Feedback(type: .error, message: "Failed to sign out.")
            }
            
            isBusy = false
        }
    }
    
    private func toggleAuthMode() {
        authMode = authMode == .signIn ? .register : .signIn
        feedback = nil
    }
    
    // MARK: - Verification Check Timer
    
    private func startVerificationCheck() {
        // Check verification status every 5 seconds when on this screen
        verificationCheckTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            Task {
                await checkVerificationStatus()
            }
        }
    }
    
    private func stopVerificationCheck() {
        verificationCheckTimer?.invalidate()
        verificationCheckTimer = nil
    }
    
    // MARK: - Cooldown Timer
    
    private func startCooldownTimer() {
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
            if resendCooldown > 0 {
                resendCooldown -= 1
            } else {
                timer.invalidate()
            }
        }
    }
}

// MARK: - Supporting Views

struct FeedbackView: View {
    let feedback: Feedback
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: iconName)
                .foregroundColor(feedback.type.color)
                .font(.title3)
            
            Text(feedback.message)
                .font(.subheadline)
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
            
            Spacer()
        }
        .padding()
        .background(feedback.type.color.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
    
    private var iconName: String {
        switch feedback.type {
        case .success: return "checkmark.circle.fill"
        case .error: return "exclamationmark.circle.fill"
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        }
    }
}

struct EmailVerificationNotice: View {
    @Binding var isBusy: Bool
    @Binding var resendCooldown: Int
    let onResend: () -> Void
    let onRefresh: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "envelope.badge")
                    .foregroundColor(.orange)
                    .font(.title3)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text("Verify your email")
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text("Check your inbox (including spam or junk folders) and click the verification link.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            
            HStack(spacing: 12) {
                Button(action: onResend) {
                    HStack {
                        if isBusy {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Text(resendCooldown > 0 ? "Resend (\(resendCooldown)s)" : "Resend email")
                        }
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(UIColor.systemGray5))
                    .foregroundColor(.primary)
                    .cornerRadius(8)
                }
                .disabled(isBusy || resendCooldown > 0)
                
                Button(action: onRefresh) {
                    Text("I've verified")
                        .font(.subheadline)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(red: 20/255, green: 54/255, blue: 27/255))
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
                .disabled(isBusy)
            }
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

struct AuthenticatedNotice: View {
    let identity: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.title3)
            
            VStack(alignment: .leading, spacing: 4) {
                Text("You're signed in")
                    .font(.headline)
                    .foregroundColor(.primary)
                
                Text("as \(identity)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

#Preview {
    NavigationStack {
        AuthView(onDismiss: {})
    }
}

