import Foundation

class ScheduleLoader: ObservableObject {
    @Published var blocks: [Block] = []
    @Published var showBlocks: Bool = false // Start hidden for smooth animations

    func loadSchedule(from filename: String) {
        print("📂 [LOADER] Attempting to load: \(filename).json")
        guard let url = Bundle.main.url(forResource: filename, withExtension: "json") else {
            print("❌ [LOADER] JSON file not found: \(filename).json")
            self.blocks = []
            return
        }
        do {
            let data = try Data(contentsOf: url)
            print("📖 [LOADER] File found, data size: \(data.count) bytes")
            let decoder = JSONDecoder()
            let blocks = try decoder.decode([Block].self, from: data)
            self.blocks = blocks
            print("✅ [LOADER] Successfully decoded \(blocks.count) blocks from \(filename).json")
            for (index, block) in blocks.enumerated() {
                print("   Block \(index): \(block.name) (\(block.start)-\(block.end))")
            }
        } catch {
            print("❌ [LOADER] Failed to decode \(filename).json: \(error)")
            self.blocks = []
        }
    }
}