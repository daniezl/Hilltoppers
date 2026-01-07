//
//  BlockPreferencesManager.swift
//  SJA_re
//
//  Manages block preferences with cloud sync support
//  Format matches Chrome extension's blockPreferences.ts
//

import Foundation
import FirebaseFirestore
import FirebaseAuth
import Combine

typealias BlockKey = String // "A", "B", "C", "D", "E"

struct BlockPreference: Codable {
    var name: String = ""
    var alternating: Bool = false
    var nameGreen: String = ""
    var nameWhite: String = ""
    var freeGreen: Bool = false
    var freeWhite: Bool = false
    var free: Bool = false
    var nameBackup: String = ""
    var nameGreenBackup: String = ""
    var nameWhiteBackup: String = ""
    var migrated: Bool = true
    
    // Legacy fields for migration (not saved to cloud)
    var showOnGreen: Bool?
    var showOnWhite: Bool?
}

typealias BlockPreferenceRecord = [BlockKey: BlockPreference]

class BlockPreferencesManager: ObservableObject {
    static let shared = BlockPreferencesManager()
    
    @Published var preferences: BlockPreferenceRecord = [:]
    @Published var isLoading: Bool = false
    @Published var saveStatus: SaveStatus = .idle
    
    enum SaveStatus {
        case idle
        case saving
        case success
        case error(String)
    }
    
    private let db = Firestore.firestore()
    private let storageKey = "blockPreferences"
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
    
    private func loadFromLocalStorage() -> BlockPreferenceRecord {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(BlockPreferenceRecord.self, from: data) else {
            return createDefaultPreferences()
        }
        
        // Migrate old format if needed
        return migratePreferences(decoded)
    }
    
    private func loadFromRemote(userId: String) async -> BlockPreferenceRecord? {
        do {
            let docRef = db.collection(usersCollection).document(userId)
            let document = try await docRef.getDocument()
            
            guard document.exists,
                  let data = document.data(),
                  let prefsData = data["blockPreferences"] as? [String: Any] else {
                return nil
            }
            
            // Convert to BlockPreferenceRecord
            var prefs: BlockPreferenceRecord = [:]
            for (key, value) in prefsData {
                if let dict = value as? [String: Any],
                   let jsonData = try? JSONSerialization.data(withJSONObject: dict),
                   let pref = try? JSONDecoder().decode(BlockPreference.self, from: jsonData) {
                    prefs[key] = pref
                }
            }
            
            return prefs.isEmpty ? nil : prefs
        } catch {
            print("❌ [BlockPreferences] Failed to load from remote: \(error)")
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
            await MainActor.run {
                self.saveStatus = .saving
            }
            
            do {
                try await saveToRemote(userId: user.uid, preferences: prefsToSave)
                await MainActor.run {
                    self.saveStatus = .success
                    // Reset after 3 seconds
                    Task {
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        await MainActor.run {
                            if case .success = self.saveStatus {
                                self.saveStatus = .idle
                            }
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    self.saveStatus = .error(error.localizedDescription)
                }
            }
        } else {
            await MainActor.run {
                self.saveStatus = .idle
            }
        }
        
        // Notify that block settings changed
        NotificationCenter.default.post(name: Notification.Name("BlockSettingsChanged"), object: nil)
    }
    
    private func saveToLocalStorage(_ preferences: BlockPreferenceRecord) async {
        if let encoded = try? JSONEncoder().encode(preferences) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
            print("✅ [BlockPreferences] Saved to local storage")
        }
    }
    
    private func saveToRemote(userId: String, preferences: BlockPreferenceRecord) async throws {
        // Clean preferences (remove legacy fields)
        let cleaned = cleanPreferences(preferences)
        
        // Convert to Firestore-compatible format
        var prefsDict: [String: Any] = [:]
        for (key, pref) in cleaned {
            if let jsonData = try? JSONEncoder().encode(pref),
               let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                prefsDict[key] = dict
            }
        }
        
        let docRef = db.collection(usersCollection).document(userId)
        try await docRef.setData([
            "blockPreferences": prefsDict,
            "updatedAt": FieldValue.serverTimestamp()
        ], merge: true)
        
        print("✅ [BlockPreferences] Saved to cloud")
    }
    
    private func cleanPreferences(_ preferences: BlockPreferenceRecord) -> BlockPreferenceRecord {
        var cleaned: BlockPreferenceRecord = [:]
        for (key, pref) in preferences {
            cleaned[key] = BlockPreference(
                name: pref.name,
                alternating: pref.alternating,
                nameGreen: pref.nameGreen,
                nameWhite: pref.nameWhite,
                freeGreen: pref.freeGreen,
                freeWhite: pref.freeWhite,
                free: pref.free,
                nameBackup: pref.nameBackup,
                nameGreenBackup: pref.nameGreenBackup,
                nameWhiteBackup: pref.nameWhiteBackup,
                migrated: true
            )
        }
        return cleaned
    }
    
    // MARK: - Defaults
    
    private func createDefaultPreferences() -> BlockPreferenceRecord {
        return [
            "A": BlockPreference(),
            "B": BlockPreference(),
            "C": BlockPreference(),
            "D": BlockPreference(),
            "E": BlockPreference()
        ]
    }
    
    // MARK: - Migration
    
    private func migratePreferences(_ prefs: BlockPreferenceRecord) -> BlockPreferenceRecord {
        var migrated: BlockPreferenceRecord = [:]
        
        for (key, pref) in prefs {
            if pref.migrated {
                migrated[key] = pref
                continue
            }
            
            // Migrate from old format (showOnGreen/showOnWhite)
            let showOnGreen = pref.showOnGreen ?? true
            let showOnWhite = pref.showOnWhite ?? true
            let name = pref.name
            
            var newPref = BlockPreference()
            newPref.name = name
            
            if !showOnGreen && !showOnWhite {
                // Both unchecked -> free block
                newPref.free = true
                newPref.name = "Free Block"
                newPref.nameBackup = name.isEmpty || name == "Free Block" ? "" : name
                newPref.alternating = false
            } else if showOnGreen && !showOnWhite {
                // Only green -> alternating
                newPref.alternating = true
                newPref.nameGreen = name
                newPref.nameWhite = ""
                newPref.freeGreen = false
                newPref.freeWhite = true
            } else if !showOnGreen && showOnWhite {
                // Only white -> alternating
                newPref.alternating = true
                newPref.nameGreen = ""
                newPref.nameWhite = name
                newPref.freeGreen = true
                newPref.freeWhite = false
            } else {
                // Both checked -> normal
                newPref.alternating = false
                newPref.free = false
            }
            
            newPref.migrated = true
            migrated[key] = newPref
        }
        
        return migrated
    }
    
    // MARK: - Helper Methods
    
    func getPreference(for key: BlockKey) -> BlockPreference {
        return preferences[key] ?? BlockPreference()
    }
    
    func updatePreference(for key: BlockKey, preference: BlockPreference) {
        preferences[key] = preference
        Task {
            await savePreferences()
        }
    }
    
    func resetToDefaults() {
        preferences = createDefaultPreferences()
        Task {
            await savePreferences()
        }
    }
}

