//
//  AuthManager.swift
//  SJA_re
//
//  Firebase Authentication Manager
//

import Foundation
import FirebaseAuth
import Combine

enum AuthError: Error {
    case invalidEmail
    case wrongPassword
    case userDisabled
    case userNotFound
    case emailAlreadyInUse
    case weakPassword
    case networkError
    case tooManyRequests
    case operationNotAllowed
    case unknown(String)
    
    var localizedDescription: String {
        switch self {
        case .invalidEmail:
            return "The email address is not valid. Please check and try again."
        case .wrongPassword:
            return "Incorrect email or password. Please try again."
        case .userDisabled:
            return "This account has been disabled. Contact support if you believe this is a mistake."
        case .userNotFound:
            return "No account exists with that email. Create a new account or try another email address."
        case .emailAlreadyInUse:
            return "An account already exists with that email. Try signing in instead."
        case .weakPassword:
            return "Your password must be at least 6 characters long."
        case .networkError:
            return "Network error. Check your connection and try again."
        case .tooManyRequests:
            return "Too many attempts. Please wait a moment before trying again."
        case .operationNotAllowed:
            return "This sign-in method is not available. Contact support for assistance."
        case .unknown(let message):
            return message
        }
    }
}

class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var currentUser: User?
    @Published var isAuthenticated: Bool = false
    
    private var authStateHandler: AuthStateDidChangeListenerHandle?
    
    private init() {
        // Listen to auth state changes
        authStateHandler = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.currentUser = user
            self?.isAuthenticated = user != nil
        }
    }
    
    deinit {
        if let handler = authStateHandler {
            Auth.auth().removeStateDidChangeListener(handler)
        }
    }
    
    // MARK: - Email Authentication
    
    /// Sign in with email and password
    func signIn(email: String, password: String) async throws {
        do {
            let result = try await Auth.auth().signIn(withEmail: email, password: password)
            print("✅ [AUTH] Signed in: \(result.user.email ?? "unknown")")
        } catch let error as NSError {
            print("❌ [AUTH] Sign in failed: \(error.localizedDescription)")
            throw mapAuthError(error)
        }
    }
    
    /// Register with email and password
    func register(email: String, password: String, displayName: String? = nil) async throws {
        do {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)
            
            // Update display name if provided
            if let displayName = displayName {
                let changeRequest = result.user.createProfileChangeRequest()
                changeRequest.displayName = displayName
                try await changeRequest.commitChanges()
            }
            
            print("✅ [AUTH] Account created: \(result.user.email ?? "unknown")")
        } catch let error as NSError {
            print("❌ [AUTH] Registration failed: \(error.localizedDescription)")
            throw mapAuthError(error)
        }
    }
    
    /// Send email verification
    func sendVerificationEmail() async throws {
        guard let user = Auth.auth().currentUser else {
            throw AuthError.userNotFound
        }
        
        if user.isEmailVerified {
            print("ℹ️ [AUTH] Email already verified")
            return
        }
        
        do {
            try await user.sendEmailVerification()
            print("✅ [AUTH] Verification email sent to: \(user.email ?? "unknown")")
        } catch let error as NSError {
            print("❌ [AUTH] Failed to send verification email: \(error.localizedDescription)")
            throw mapAuthError(error)
        }
    }
    
    /// Reload current user to get updated email verification status
    func reloadUser() async throws -> Bool {
        guard let user = Auth.auth().currentUser else {
            return false
        }
        
        do {
            try await user.reload()
            
            // Refresh ID token
            _ = try await user.getIDToken(forcingRefresh: true)
            
            // Update published property
            await MainActor.run {
                self.currentUser = Auth.auth().currentUser
            }
            
            print("✅ [AUTH] User reloaded, emailVerified: \(user.isEmailVerified)")
            return user.isEmailVerified
        } catch let error as NSError {
            print("❌ [AUTH] Failed to reload user: \(error.localizedDescription)")
            throw mapAuthError(error)
        }
    }
    
    /// Sign out
    func signOut() async throws {
        do {
            try Auth.auth().signOut()
            print("✅ [AUTH] Signed out")
        } catch let error as NSError {
            print("❌ [AUTH] Sign out failed: \(error.localizedDescription)")
            throw mapAuthError(error)
        }
    }
    
    // MARK: - User Properties
    
    var userEmail: String? {
        currentUser?.email
    }
    
    var userDisplayName: String? {
        currentUser?.displayName
    }
    
    var isEmailVerified: Bool {
        currentUser?.isEmailVerified ?? false
    }
    
    var needsEmailVerification: Bool {
        guard let user = currentUser else { return false }
        
        // Check if user signed in with email/password
        let providers = user.providerData.map { $0.providerID }
        let hasPasswordProvider = providers.contains("password")
        
        return hasPasswordProvider && !user.isEmailVerified
    }
    
    var userIdentity: String {
        if let displayName = userDisplayName, !displayName.isEmpty {
            return displayName
        }
        if let email = userEmail {
            return email
        }
        return currentUser?.uid ?? "Unknown"
    }
    
    // MARK: - Error Mapping
    
    private func mapAuthError(_ error: NSError) -> AuthError {
        guard let errorCode = AuthErrorCode(_bridgedNSError: error) else {
            return .unknown(error.localizedDescription)
        }
        
        switch errorCode.code {
        case .invalidEmail:
            return .invalidEmail
        case .wrongPassword, .invalidCredential:
            return .wrongPassword
        case .userDisabled:
            return .userDisabled
        case .userNotFound:
            return .userNotFound
        case .emailAlreadyInUse:
            return .emailAlreadyInUse
        case .weakPassword:
            return .weakPassword
        case .networkError:
            return .networkError
        case .tooManyRequests:
            return .tooManyRequests
        case .operationNotAllowed:
            return .operationNotAllowed
        default:
            return .unknown("Unable to sign in right now. Please try again.")
        }
    }
}

