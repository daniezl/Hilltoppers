import Foundation
import SwiftSoup

/// 从 Daily Bulletin 网页抓取并解析 day type 与日期，供 DayTypeCache 刷新与 DayTypeView 复用。
enum DayTypeBulletinParser {
    private static let schoolURL = "https://stjacademy.org/a-culture-of-caring-and-respect/sja-news/daily-bulletin/"

    /// 从 HTML 中解析出 day type（Green Day / White Day）和 bulletin 日期；解析失败返回 nil。
    static func parse(html: String) -> (dayType: String, date: Date)? {
        do {
            let doc = try SwiftSoup.parse(html)
            let h4s = try doc.select("h4")
            var foundDayType: String?
            for h4 in h4s {
                let text = try h4.text()
                if text.lowercased().contains("green day") && !text.lowercased().contains("white") {
                    foundDayType = "Green Day"
                    break
                }
                if text.lowercased().contains("white day") && !text.lowercased().contains("green") {
                    foundDayType = "White Day"
                    break
                }
            }
            guard let dayType = foundDayType else { return nil }

            let formatter = DateFormatter()
            formatter.dateFormat = "MMMM d, yyyy"
            formatter.timeZone = Date.estTimeZone
            formatter.locale = Locale(identifier: "en_US_POSIX")
            guard let dateDiv = try doc.select("div.date").first() else {
                return (dayType, Date())
            }
            let dateText = try dateDiv.text().trimmingCharacters(in: .whitespacesAndNewlines)
            guard let date = formatter.date(from: dateText) else {
                return (dayType, Date())
            }
            return (dayType, date)
        } catch {
            return nil
        }
    }

    /// 请求 bulletin 页面并解析 day type 与日期；失败返回 nil。
    static func fetchAndParse() async -> (dayType: String, date: Date)? {
        guard let url = URL(string: schoolURL) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8", forHTTPHeaderField: "Accept")
        request.setValue("gzip, deflate, br", forHTTPHeaderField: "Accept-Encoding")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        request.setValue("1", forHTTPHeaderField: "Upgrade-Insecure-Requests")
        request.setValue("navigate", forHTTPHeaderField: "Sec-Fetch-Mode")
        request.setValue("document", forHTTPHeaderField: "Sec-Fetch-Dest")
        request.setValue("none", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("?1", forHTTPHeaderField: "Sec-Ch-Ua-Mobile")

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let html = String(data: data, encoding: .utf8) else { return nil }
            return parse(html: html)
        } catch {
            return nil
        }
    }
}
