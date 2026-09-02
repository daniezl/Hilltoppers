import Foundation

/// 排程数据的读取地址。
///
/// 唯一数据源是 git 里的 `hilltoppers-pages/data/special_days.json`，手工编辑后由
/// Cloudflare Pages 以静态文件提供。
struct ScheduleConfig {
    // Cloudflare Pages URL - 从 Info.plist 读取，如果没有则使用默认值（作为后备）
    static var cloudflareBaseURL: String {
        if let url = Bundle.main.object(forInfoDictionaryKey: "CloudflareBaseURL") as? String,
           !url.isEmpty {
            return url
        }
        // 默认值（用于开发或作为后备）
        return "https://hilltoppers.pages.dev"
    }
    
    /// 获取 special_days 数据的 URL（从 Hilltoppers Pages 读取，与 Chrome extension 保持一致）
    static var specialDaysURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_days.json")
    }
    
    /// 获取 special_periods 数据的 URL（从 Pages 读取，因为 Worker 暂不支持）
    static var specialPeriodsURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_periods.json")
    }
}

