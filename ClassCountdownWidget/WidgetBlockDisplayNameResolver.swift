//
//  WidgetBlockDisplayNameResolver.swift
//  ClassCountdownWidget
//
//  从 App Group 里的 BlockPreferences 按 day type 解析 block 显示名，供用缓存建课表时使用。
//

import Foundation

enum WidgetBlockDisplayNameResolver {
    private static let suiteName = "group.danielzhang.Hilltoppers2"
    private static let blockPreferencesKey = "BlockPreferences"

    /// 与主 app BlockPreference 兼容的简化结构，只解码显示名相关字段。
    private struct BlockPreferenceMinimal: Codable {
        var name: String = ""
        var alternating: Bool = false
        var nameGreen: String = ""
        var nameWhite: String = ""
        var freeGreen: Bool = false
        var freeWhite: Bool = false
        var free: Bool = false
    }

    /// 根据缓存的 BlockPreferences 和 day type 返回该 block 的显示名；无缓存或非 A–E block 则返回 blockName。
    static func displayName(for blockName: String, dayType: String?) -> String {
        guard let def = UserDefaults(suiteName: suiteName),
              let data = def.data(forKey: blockPreferencesKey),
              let prefs = try? JSONDecoder().decode([String: BlockPreferenceMinimal].self, from: data),
              let key = blockKey(from: blockName),
              let pref = prefs[key] else {
            return blockName
        }
        let isGreenDay = (dayType ?? "").lowercased().contains("green") && !(dayType ?? "").lowercased().contains("white")
        if pref.alternating {
            let isFree = isGreenDay ? pref.freeGreen : pref.freeWhite
            if isFree { return "Free Block" }
            let custom = isGreenDay ? pref.nameGreen : pref.nameWhite
            return custom.isEmpty ? blockName : custom
        }
        if pref.free { return "Free Block" }
        return pref.name.isEmpty ? blockName : pref.name
    }

    private static func blockKey(from blockName: String) -> String? {
        let n = blockName.lowercased().trimmingCharacters(in: .whitespaces)
        if n.hasPrefix("a") && n.contains("block") { return "A" }
        if n.hasPrefix("b") && n.contains("block") { return "B" }
        if n.hasPrefix("c") && n.contains("block") { return "C" }
        if n.hasPrefix("d") && n.contains("block") { return "D" }
        if n.hasPrefix("e") && n.contains("block") { return "E" }
        return nil
    }
}
