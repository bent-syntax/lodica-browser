import SwiftUI

/// Checks the latest GitHub release and offers a one-tap update through AltStore or SideStore.
@MainActor
final class Updater: ObservableObject {
    @Published var version: String?
    private var ipa: URL?
    private let page = URL(string: "https://github.com/bent-syntax/lodica-browser/releases/latest")!

    private var current: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    func check() async {
        guard let api = URL(string: "https://api.github.com/repos/bent-syntax/lodica-browser/releases/latest"),
              let (data, _) = try? await URLSession.shared.data(from: api),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag = json["tag_name"] as? String else { return }
        let latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        guard latest.compare(current, options: .numeric) == .orderedDescending else { return }
        let assets = json["assets"] as? [[String: Any]] ?? []
        let url = assets.compactMap { $0["browser_download_url"] as? String }.first { $0.hasSuffix(".ipa") }
        ipa = url.flatMap(URL.init(string:))
        version = latest
    }

    func install() {
        guard let ipa, let enc = ipa.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let alt = URL(string: "altstore://install?url=\(enc)"),
              let side = URL(string: "sidestore://install?url=\(enc)") else {
            UIApplication.shared.open(page)
            return
        }
        UIApplication.shared.open(alt) { ok in
            if ok { return }
            UIApplication.shared.open(side) { ok in
                if !ok { UIApplication.shared.open(self.page) }
            }
        }
    }
}

struct UpdateBanner: View {
    @ObservedObject var updater: Updater
    var body: some View {
        if let v = updater.version {
            Button { updater.install() } label: {
                Text("Update to \(v)").font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .background(Color(red: 0.96, green: 0.62, blue: 0.04))
                    .foregroundColor(Color(red: 0.07, green: 0.09, blue: 0.15))
            }
        }
    }
}
