//
//  SchedulePreferencesManager.swift
//  SJA_re
//
//  Manages schedule preferences with cloud sync support
//  Format matches Chrome extension's schedulePreferences.ts
//

import Foundation
import FirebaseFirestore
import FirebaseAuth
import Combine

enum TimeFormat: String, Codable {
    case hour12 = "12h"
    case hour24 = "24h"
}

struct SchedulePreferences: Codable {
    var lunchPeriod: Int = 1
    var timeFormat: TimeFormat = .hour12
}

class SchedulePreferencesManager: ObservableObject {
    static let shared = SchedulePreferencesManager()
    
    @Published var preferences: SchedulePreferences = SchedulePreferences()
    @Published var isLoading: Bool = false
    
    private let db = Firestore.firestore()
    private let storageKey = "schedulePreferences"
    private let usersCollection = "users"
    private var authStateListener: AuthStateDidChangeListenerHandle?
    
    private init() {
        setupAuthListener()
        loadPreferences()
    }
    
    deinit {
        if let listener = authStateListener {
            Auth.auth().removeStateDidChangeListener(listener)
        }
    }
    
    private func setupAuthListener() {
        authStateListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                await self?.loadPreferences()
            }
        }
    }
    
    // MARK: - Load Preferences
    
    func loadPreferences() async {
        await MainActor.run {
            isLoading = true
        }
        
        // Try to load from cloud first if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            if let remote = await loadFromRemote(userId: user.uid) {
                await MainActor.run {
                    self.preferences = remote
                    self.isLoading = false
                }
                // Cache locally
                await saveToLocalStorage(remote)
                return
            }
        }
        
        // Fall back to local storage
        let local = loadFromLocalStorage()
        await MainActor.run {
            self.preferences = local
            self.isLoading = false
        }
    }
    
    private func loadPreferences() {
        Task {
            await loadPreferences()
        }
    }
    
    private func loadFromLocalStorage() -> SchedulePreferences {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(SchedulePreferences.self, from: data) else {
            return SchedulePreferences()
        }
        return decoded
    }
    
    private func loadFromRemote(userId: String) async -> SchedulePreferences? {
        do {
            let docRef = db.collection(usersCollection).document(userId)
            let document = try await docRef.getDocument()
            
            guard document.exists,
                  let data = document.data(),
                  let prefsData = data["schedulePreferences"] as? [String: Any] else {
                return nil
            }
            
            // Convert to SchedulePreferences
            if let jsonData = try? JSONSerialization.data(withJSONObject: prefsData),
               let prefs = try? JSONDecoder().decode(SchedulePreferences.self, from: jsonData) {
                return prefs
            }
            
            return nil
        } catch {
            print("❌ [SchedulePreferences] Failed to load from remote: \(error)")
            return nil
        }
    }
    
    // MARK: - Save Preferences
    
    func savePreferences() async {
        let prefsToSave = await MainActor.run {
            self.preferences
        }
        
        // Save locally first
        await saveToLocalStorage(prefsToSave)
        
        // Save to cloud if authenticated
        if let user = Auth.auth().currentUser, user.isEmailVerified {
            do {
                try await saveToRemote(userId: user.uid, preferences: prefsToSave)
                print("✅ [SchedulePreferences] Saved to cloud")
            } catch {
                print("❌ [SchedulePreferences] Failed to save to cloud: \(error)")
            }
        }
    }
    
    private func saveToLocalStorage(_ preferences: SchedulePreferences) async {
        if let encoded = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
            print("✅ [SchedulePreferences] Saved to local storage")
        }
    }
    
    private func saveToRemote(userId: String, preferences: SchedulePreferences) async throws {
        let docRef = db.collection(usersCollection).document(userId)
        
        if let jsonData = try? JSONEncoder().encode(preferences),
           let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
            try await docRef.setData([
                "schedulePreferences": dict,
                "updatedAt": FieldValue.serverTimestamp()
            ], merge: true)
        }
    }
}

