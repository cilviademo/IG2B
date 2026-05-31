//  ShareViewController.swift
//  Indigold Share Extension
//
//  A no-UI share extension: it extracts the shared URL/text/title, builds
//  indigold://share?url=…&content=…&title=… and opens the host app, which routes
//  it into the PWA's /share auto-capture flow. Copy this file into the Share
//  Extension target you create in Xcode (replace the generated ShareViewController).

import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    private let appScheme = "indigold"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        handleShare()
    }

    private func handleShare() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let providers = item.attachments
        else { return complete() }

        let group = DispatchGroup()
        var sharedURL: String?
        var sharedText: String?

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                    if let u = data as? URL { sharedURL = u.absoluteString }
                    group.leave()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
                    if let s = data as? String { sharedText = s }
                    group.leave()
                }
            }
            // NOTE: image/PDF/audio binaries can't ride in a URL. For those, a
            // future version writes the file to a shared App Group container and
            // passes a reference; see README.
        }

        group.notify(queue: .main) {
            self.openHostApp(url: sharedURL, text: sharedText, title: item.attributedContentText?.string)
        }
    }

    private func openHostApp(url: String?, text: String?, title: String?) {
        var comps = URLComponents()
        comps.scheme = appScheme
        comps.host = "share"
        var q: [URLQueryItem] = []
        if let u = url { q.append(URLQueryItem(name: "url", value: u)) }
        if let t = text, !t.isEmpty { q.append(URLQueryItem(name: "content", value: t)) }
        if let ti = title, !ti.isEmpty { q.append(URLQueryItem(name: "title", value: ti)) }
        comps.queryItems = q.isEmpty ? [URLQueryItem(name: "content", value: "")] : q

        if let dest = comps.url { openURL(dest) }
        complete()
    }

    // Extensions can't call UIApplication.shared.open directly — walk the
    // responder chain to find the application and perform openURL:.
    @objc private func openURL(_ url: URL) {
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let r = responder {
            if r.responds(to: selector) && r != self {
                r.perform(selector, with: url)
                return
            }
            responder = r.next
        }
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
