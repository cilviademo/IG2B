# Indigold — Native iOS Shell (Capacitor) + Share Extension

This is the path to a **true iOS Share Sheet entry** — Indigold appears in the
share sheet as an app target (not via a Shortcut). It's a thin Capacitor shell
that loads the live PWA, plus a **Share Extension** that forwards shared content
into the PWA's `/share` auto-capture flow.

> ⚠️ **Must be built on macOS with Xcode** (and an Apple Developer account to run
> on a device / TestFlight). It can't be built in this cloud sandbox. The files
> here are a ready-to-assemble scaffold.

## How it fits together
```
Any app → Share → Indigold (Share Extension)
   → opens indigold://share?url=…&content=…&title=…
   → host app (Capacitor) loads the PWA, which has an appUrlOpen bridge
   → routes to /share → auto-classify → Universal Intake Queue (local-first + API sync)
```
The bridge already lives in the PWA (`apps/pwa/src/main.tsx`, no-op in browsers).

## One-time setup (on a Mac)
```sh
cd apps/ios-shell
npm install
npx cap add ios          # generates ios/ (Xcode project) — macOS only
npx cap sync ios
npx cap open ios         # opens Xcode
```
`capacitor.config.ts` points `server.url` at `https://indigold-pwa.onrender.com`,
so the app always loads your deployed PWA (update the host if yours differs).

## Add the Share Extension (in Xcode)
1. **File → New → Target… → Share Extension**. Name it `ShareExtension`.
   Uncheck "Activate scheme" if prompted.
2. Replace the generated `ShareViewController.swift` with
   [`ios-share-extension/ShareViewController.swift`](ios-share-extension/ShareViewController.swift).
3. Replace the extension's `Info.plist` activation rules with
   [`ios-share-extension/Info.plist`](ios-share-extension/Info.plist) (or merge the
   `NSExtension` dict). This is what makes Indigold accept URLs, text, images,
   PDFs, movies, and files.
4. Delete the extension's `MainInterface.storyboard` (the extension has no UI) and
   remove its `NSExtensionMainStoryboard` key if present (the provided Info.plist
   uses `NSExtensionPrincipalClass` instead).

## Register the `indigold://` URL scheme (main app target)
In the **App** target's `Info.plist`, add:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key><string>com.indigold.app</string>
    <key>CFBundleURLSchemes</key><array><string>indigold</string></array>
  </dict>
</array>
```
Capacitor's `@capacitor/app` plugin then delivers `appUrlOpen`, which the PWA
bridge turns into a `/share?…` navigation.

## Run
- Select the **App** scheme → run on a device (extensions don't work in some
  simulators). First launch loads the live PWA.
- In Safari/Instagram/Notes → **Share → Indigold** → it opens and the item is
  captured (auto-classified). For zero UI, it lands straight in the queue.

## Known limits / next steps
- **Files (image/PDF/audio):** URLs and text forward cleanly today. Binary files
  can't ride in a `indigold://` URL, so to capture the actual bytes you'd write
  them to a shared **App Group** container in the extension and read them in the
  app (and POST to the API). The Web Share Target POST path (`/share-target`)
  already handles file bytes on Android; iOS would use the App Group bridge.
- **App Store / TestFlight:** distributing requires an Apple Developer account and
  the usual signing/provisioning.
- Keep `server.url` in sync with your Render PWA host.
