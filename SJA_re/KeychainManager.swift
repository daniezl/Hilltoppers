//
//  KeychainManager.swift
//  SJA_re
//
//  Keychain Manager for storing passwords securely
//

import Foundation
import Security

class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "com.sja.app"
    
    private init() {}
    
    // MARK: - Save Password
    
    func savePassword(email: String, password: String) -> Bool {
        // Delete existing password first
        deletePassword(email: email)
        
        guard let passwordData = password.data(using: .utf8) else {
            print("❌ [Keychain] Failed to convert password to data")
            return false
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: email,
            kSecValueData as String: passwordData,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        if status == errSecSuccess {
            print("✅ [Keychain] Password saved for: \(email)")
            return true
        } else {
            print("❌ [Keychain] Failed to save password: \(status)")
            return false
        }
    }
    
    // MARK: - Retrieve Password
    
    func getPassword(email: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: email,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess,
           let data = result as? Data,
           let password = String(data: data, encoding: .utf8) {
            print("✅ [Keychain] Password retrieved for: \(email)")
            return password
        } else {
            if status == errSecItemNotFound {
                print("ℹ️ [Keychain] No password found for: \(email)")
            } else {
                print("❌ [Keychain] Failed to retrieve password: \(status)")
            }
            return nil
        }
    }
    
    // MARK: - Delete Password
    
    func deletePassword(email: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: email
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status == errSecSuccess {
            print("✅ [Keychain] Password deleted for: \(email)")
        } else if status != errSecItemNotFound {
            print("❌ [Keychain] Failed to delete password: \(status)")
        }
    }
    
    // MARK: - Check if Password Exists
    
    func hasPassword(email: String) -> Bool {
        return getPassword(email: email) != nil
    }
    
    // MARK: - Debug: List all saved accounts
    
    func getAllSavedAccounts() -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let items = result as? [[String: Any]] else {
            return []
        }
        
        var accounts: [String] = []
        for item in items {
            if let account = item[kSecAttrAccount as String] as? String {
                accounts.append(account)
            }
        }
        return accounts
    }
}
