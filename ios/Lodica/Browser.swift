import SwiftUI
import WebKit

let searchURL = "https://duckduckgo.com/?q="

/// Turns what the user typed into a loadable URL: a host-like string becomes https, anything else a search.
func resolve(_ input: String) -> URL? {
    let t = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return nil }
    if let u = URL(string: t), let s = u.scheme, s == "http" || s == "https" { return u }
    if !t.contains(" "), t.contains("."), let u = URL(string: "https://" + t) { return u }
    let q = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
    return URL(string: searchURL + q)
}

final class Tab: NSObject, ObservableObject, Identifiable, WKNavigationDelegate, WKUIDelegate {
    let id = UUID()
    let web: WKWebView
    @Published var title = "New tab"
    @Published var url = ""
    @Published var progress = 0.0
    @Published var canBack = false
    @Published var canForward = false
    private var obs: [NSKeyValueObservation] = []
    var onNewTab: ((URLRequest) -> Void)?

    init(isPrivate priv: Bool) {
        let cfg = WKWebViewConfiguration()
        if priv { cfg.websiteDataStore = .nonPersistent() }
        cfg.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        web.allowsBackForwardNavigationGestures = true
        web.navigationDelegate = self
        web.uiDelegate = self
        obs = [
            web.observe(\.title) { [weak self] w, _ in self?.title = w.title?.isEmpty == false ? w.title! : "New tab" },
            web.observe(\.url) { [weak self] w, _ in self?.url = w.url?.absoluteString ?? "" },
            web.observe(\.estimatedProgress) { [weak self] w, _ in self?.progress = w.estimatedProgress },
            web.observe(\.canGoBack) { [weak self] w, _ in self?.canBack = w.canGoBack },
            web.observe(\.canGoForward) { [weak self] w, _ in self?.canForward = w.canGoForward },
        ]
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        onNewTab?(action.request)
        return nil
    }
}

final class Browser: ObservableObject {
    @Published var tabs: [Tab] = []
    @Published var current: Tab?
    @Published var priv = false

    init() { newTab() }

    func newTab(_ request: URLRequest? = nil) {
        let t = Tab(isPrivate: priv)
        t.onNewTab = { [weak self] r in self?.newTab(r) }
        tabs.append(t)
        current = t
        if let r = request { t.web.load(r) }
    }

    func close(_ t: Tab) {
        tabs.removeAll { $0.id == t.id }
        if tabs.isEmpty { newTab() }
        else if current?.id == t.id { current = tabs.last }
    }
}

struct WebHost: UIViewRepresentable {
    let web: WKWebView
    func makeUIView(context: Context) -> WKWebView { web }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

struct BrowserView: View {
    @StateObject private var browser = Browser()
    @State private var text = ""
    @State private var showTabs = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            if let t = browser.current {
                if t.url.isEmpty { StartPage(open: go) }
                else { WebHost(web: t.web).id(t.id) }
                if t.progress > 0 && t.progress < 1 { ProgressView(value: t.progress).tint(Color(red: 0.96, green: 0.62, blue: 0.04)) }
            }
            bar
        }
        .background(Color(red: 0.07, green: 0.09, blue: 0.15))
        .sheet(isPresented: $showTabs) { TabSheet(browser: browser, dismiss: { showTabs = false }) }
        .onChange(of: browser.current?.id) { _ in text = browser.current?.url ?? "" }
        .onChange(of: browser.current?.url) { u in if !focused { text = u ?? "" } }
        .preferredColorScheme(.dark)
    }

    private var bar: some View {
        HStack(spacing: 8) {
            Button { browser.current?.web.goBack() } label: { Image(systemName: "chevron.left") }
                .disabled(!(browser.current?.canBack ?? false))
            Button { browser.current?.web.goForward() } label: { Image(systemName: "chevron.right") }
                .disabled(!(browser.current?.canForward ?? false))
            TextField("Search or type address", text: $text)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .onSubmit { go(text) }
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(Color(red: 0.12, green: 0.16, blue: 0.22))
                .clipShape(Capsule())
            Button { showTabs = true } label: {
                Text("\(browser.tabs.count)").font(.system(size: 13, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(lineWidth: 1.8))
            }
        }
        .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color(red: 0.07, green: 0.09, blue: 0.15))
    }

    private func go(_ input: String) {
        guard let u = resolve(input) else { return }
        focused = false
        browser.current?.web.load(URLRequest(url: u))
    }
}

struct StartPage: View {
    let open: (String) -> Void
    private let sites = ["wikipedia.org", "youtube.com", "github.com", "openstreetmap.org"]
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("Lodica").font(.system(size: 26, weight: .bold)).foregroundColor(Color(red: 0.9, green: 0.91, blue: 0.92))
            HStack(spacing: 12) {
                ForEach(sites, id: \.self) { s in
                    Button(s.split(separator: ".")[0].capitalized) { open(s) }
                        .font(.system(size: 13))
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Color(red: 0.12, green: 0.16, blue: 0.22))
                        .clipShape(Capsule())
                        .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.07, green: 0.09, blue: 0.15))
    }
}

struct TabSheet: View {
    @ObservedObject var browser: Browser
    let dismiss: () -> Void
    var body: some View {
        NavigationView {
            List {
                ForEach(browser.tabs) { t in
                    Button { browser.current = t; dismiss() } label: {
                        VStack(alignment: .leading) {
                            Text(t.title).font(.system(size: 15)).lineLimit(1)
                            Text(t.url.isEmpty ? "Start page" : t.url).font(.system(size: 12)).foregroundColor(.secondary).lineLimit(1)
                        }
                    }
                    .swipeActions { Button("Close", role: .destructive) { browser.close(t) } }
                }
            }
            .navigationTitle("\(browser.tabs.count) tabs")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Toggle("Private", isOn: $browser.priv).toggleStyle(.button) }
                ToolbarItem(placement: .navigationBarTrailing) { Button("New") { browser.newTab(); dismiss() } }
            }
        }
    }
}
