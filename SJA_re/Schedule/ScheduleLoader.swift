import Foundation

class ScheduleLoader: ObservableObject {
    @Published var blocks: [Block] = []

    func loadSchedule(from filename: String) {
        guard let url = Bundle.main.url(forResource: filename, withExtension: "json") else {
            print("JSON file not found: \(filename)")
            return
        }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            let blocks = try decoder.decode([Block].self, from: data)
            self.blocks = blocks
        } catch {
            print("Failed to decode JSON: \(error)")
        }
    }
}