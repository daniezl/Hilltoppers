//
//  SharedWebCredentialsManager.swift
//  SJA_re
//
//  Manager for saving passwords to iOS Passwords app using Shared Web Credentials
//

import Foundation
import Security

class SharedWebCredentialsManager {
    static let shared = SharedWebCredentialsManager()
    
    // Domain for Shared Web Credentials
    private let domain = "hilltoppers.pages.dev"
    
    private init() {}
    
    // MARK: - Save Password to System Passwords
    
    /// Saves password to iOS Passwords app using Shared Web Credentials
    /// This will trigger the system's native "Save Password" prompt
    /// Note: Requires Associated Domains to be configured in the app
    func savePassword(account: String, password: String, completion: @escaping (Bool, Error?) -> Void) {
        // Use SecAddSharedWebCredential to save to system Passwords
        // IMPORTANT: This API requires Associated Domains to be configured in the app
        // Without Associated Domains, the API will fail silently or return an error
        print("🔐 [SharedWebCredentials] Calling SecAddSharedWebCredential for \(account) on \(domain)")
        SecAddSharedWebCredential(
            domain as CFString,
            account as CFString,
            password as CFString
        ) { (error: CFError?) in
            DispatchQueue.main.async {
                if let error = error {
                    let nsError = error as Error as NSError
                    print("❌ [SharedWebCredentials] Failed to save password:")
                    print("   Domain: \(self.domain)")
                    print("   Account: \(account)")
                    print("   Error: \(nsError.localizedDescription)")
                    print("   Error domain: \(nsError.domain), code: \(nsError.code)")
                    print("   UserInfo: \(nsError.userInfo)")
                    print("   ⚠️  This likely means Associated Domains is not configured")
                    completion(false, nsError)
                } else {
                    print("✅ [SharedWebCredentials] SecAddSharedWebCredential succeeded")
                    print("   Domain: \(self.domain), Account: \(account)")
                    print("   System should now prompt user to save password")
                    completion(true, nil)
                }
            }
        }
    }
    
    // MARK: - Request Password from System Passwords
    
    /// Requests password from iOS Passwords app
    /// This can be used for AutoFill functionality
    func requestPassword(account: String, completion: @escaping (String?) -> Void) {
        SecRequestSharedWebCredential(
            domain as CFString,
            account as CFString
        ) { (credentials: CFArray?, error: CFError?) in
            DispatchQueue.main.async {
                if let error = error {
                    let nsError = error as Error as NSError
                    print("❌ [SharedWebCredentials] Failed to request password: \(nsError.localizedDescription)")
                    completion(nil)
                    return
                }
                
                guard let credentials = credentials as? [[String: String]],
                      let firstCredential = credentials.first,
                      let password = firstCredential[kSecSharedPassword as String] else {
                    print("ℹ️ [SharedWebCredentials] No password found for \(account)")
                    completion(nil)
                    return
                }
                
                print("✅ [SharedWebCredentials] Password retrieved for \(account)")
                completion(password)
            }
        }
    }
    
    // MARK: - Delete Password from System Passwords
    
    /// Deletes password from iOS Passwords app
    func deletePassword(account: String, completion: @escaping (Bool, Error?) -> Void) {
        SecAddSharedWebCredential(
            domain as CFString,
            account as CFString,
            nil // Passing nil deletes the credential
        ) { (error: CFError?) in
            DispatchQueue.main.async {
                if let error = error {
                    let nsError = error as Error as NSError
                    print("❌ [SharedWebCredentials] Failed to delete password: \(nsError.localizedDescription)")
                    completion(false, nsError)
                } else {
                    print("✅ [SharedWebCredentials] Password deleted for \(account)")
                    completion(true, nil)
                }
            }
        }
    }
}
