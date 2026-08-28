import Foundation

/// 排程数据的读取地址。
///
/// 唯一数据源是 git 里的 `hilltoppers-pages/data/special_days.json`，手工编辑后由
/// Cloudflare Pages 以静态文件提供。`admin/` 面板和 `worker/` 那套 draft→publish
/// 流程从未启用过，它们写的是 Worker KV，没有任何客户端读，将来会归档。
struct ScheduleConfig {
    // Worker URL - 从 Info.plist 读取，如果没有则使用默认值
    // 未被引用：保留仅为配置对称性，App 的排程数据一律走下面的 Pages 地址
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
    
    /// 获取 special_days 数据的 URL（从 Hilltoppers Pages 读取，与 Chrome extension 保持一致）
    static var specialDaysURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_days.json")
    }
    
    /// 获取 special_periods 数据的 URL（从 Pages 读取，因为 Worker 暂不支持）
    static var specialPeriodsURL: URL? {
        return URL(string: "\(cloudflareBaseURL)/special_periods.json")
    }
}

