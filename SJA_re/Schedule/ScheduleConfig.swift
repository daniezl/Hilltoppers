import Foundation

struct ScheduleConfig {
    // Worker URL - 从 Info.plist 读取，如果没有则使用默认值
    static var workerBaseURL: String {
        if let url = Bundle.main.object(forInfoDictionaryKey: "CloudflareWorkerURL") as? String,
           !url.isEmpty {
            return url
        }
        // 默认值（Worker API）
        return "https://schedule-admin-api.danielzhang089.workers.dev"
    }
    
    // Cloudflare Pages URL - 从 Info.plist 读取，如果没有则使用默认值（作为后备）
    static var cloudflareBaseURL: String {
        if let url = Bundle.main.object(forInfoDictionaryKey: "CloudflareBaseURL") as? String,
           !url.isEmpty {
            return url
        }
        // 默认值（用于开发或作为后备）
        return "https://hilltoppers.pages.dev"
    }
    
    /// 获取 special_days 数据的 URL（优先从 Worker 读取）
    static var specialDaysURL: URL? {
        return URL(string: "\(workerBaseURL)/api/special_days.json")
    }
    
    /// 获取 special_periods 数据的 URL（从 Pages 读取，因为 Worker 暂不支持）
    static var specialPeriodsURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_periods.json")
    }
}

