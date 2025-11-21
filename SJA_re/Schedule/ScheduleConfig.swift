import Foundation

struct ScheduleConfig {
    // Cloudflare Pages URL - 从 Info.plist 读取，如果没有则使用默认值
    static var cloudflareBaseURL: String {
        if let url = Bundle.main.object(forInfoDictionaryKey: "CloudflareBaseURL") as? String,
           !url.isEmpty {
            return url
        }
        // 默认值（用于开发或作为后备）
        return "https://hilltoppers.pages.dev"
    }
    
    /// 获取 special_days 数据的 URL
    static var specialDaysURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_days.json")
    }
    
    /// 获取 special_periods 数据的 URL
    static var specialPeriodsURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_periods.json")
    }
}

