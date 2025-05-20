import Foundation

struct SubBlock: Codable, Identifiable {
    let id = UUID()
    let name: String
    let start: String
    let end: String
}

struct Block: Codable, Identifiable {
    let id = UUID()
    let name: String
    let start: String
    let end: String
    let subBlocks: [SubBlock]?
}