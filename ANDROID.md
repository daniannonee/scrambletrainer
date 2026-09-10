# Building the Android app

The web app is wrapped with [Capacitor](https://capacitorjs.com). No Mac is
needed for Android — everything below runs on Windows.

**Nothing here has been run on a real machine yet.** The container this was set
up in cannot reach Google's Android repositories, Maven Central or Gradle's
distribution server, so the Gradle build has never executed. The project is
configured and the web assets are verified; the build itself is unproven. Start
with the preflight.

## 1. Preflight

From the project folder. **Already in PowerShell?** Use either of these — the
`powershell` at the front matters, because `-ExecutionPolicy` is an argument to
the executable, not a command of its own:

```
powershell -ExecutionPolicy Bypass -File tools\preflight.ps1
```

```
Set-ExecutionPolicy -Scope Process Bypass -Force
.\tools\preflight.ps1
```

`-Scope Process` applies to that window only and resets when you close it.

From a plain `cmd` prompt, the first form works as-is.

It reads only — nothing is installed or changed. It reports what is present,
what is missing, and what to do about each gap.

What you need:

| | Why |
|---|---|
| Node 20+ | Capacitor 8's CLI |
| A JDK 17 or newer | Gradle 8.14 / AGP 8.13 require it. Android Studio bundles one |
| Android SDK, platform **API 36** | Google Play will not accept less — see below |
| Android SDK build-tools | To assemble the APK |

Installing **Android Studio** gets you the SDK and a JDK in one step, and is the
shortest path from nothing to a build.

## 2. Build

```
npm install          # once
npm run apk          # -> android\app\build\outputs\apk\debug\app-debug.apk
```

`npm run apk` rebuilds `docs/`, syncs it into the Android project, then runs
Gradle. The first Gradle run downloads a few hundred MB and takes several
minutes; later runs are fast.

To work in the IDE instead: `npm run android` opens the project in Android
Studio, where Run installs straight to a connected phone.

## 3. Install on a phone

Either connect the phone over USB with developer mode on and hit Run in Android
Studio, or copy `app-debug.apk` to the phone and open it (Android will ask you
to allow installing from that source).

## The API 36 requirement

Google Play requires **new apps and updates to target Android 16 (API level 36)**
as of 31 August 2026 — that date has already passed, so an app targeting
anything lower will be rejected at submission.

Capacitor 8 targets API 36 by default, which is why the project is on Capacitor 8
rather than 6. `android/variables.gradle` holds the numbers:

```
minSdkVersion    = 24     # Android 7.0
compileSdkVersion = 36
targetSdkVersion  = 36
```

`minSdkVersion 24` is Capacitor 8's default and covers effectively every phone
still in use. Lowering it is possible but untested here.

Source: [Target API level requirements for Google Play apps](https://support.google.com/googleplay/android-developer/answer/11926878).

## What is generated and what is checked in

`docs/`, `android/` and `node_modules/` are all generated — they are in
`.gitignore`. `npx cap add android` recreates the Android project from
`capacitor.config.json`.

That means **hand edits inside `android/` are not durable**. Anything that must
survive belongs in `capacitor.config.json`, `resources/`, or a note here.

## Icons and splash screens

`resources/icon.png` is a 1024px placeholder — a serif W on the app's green.
It is a stand-in, not a designed icon. To regenerate every density after
replacing it:

```
npx @capacitor/assets generate --android ^
  --iconBackgroundColor #2f6b4f --iconBackgroundColorDark #14171a ^
  --splashBackgroundColor #eef0ea --splashBackgroundColorDark #14171a
```

Google Play also wants a 512x512 icon for the store listing;
`resources/icon-512.png` is the same placeholder at that size.

## Things to check on a real device, which nothing here can tell you

- **Cold start.** 1.56MB of JavaScript data parses in ~150ms on a desktop
  browser. A mid-range phone will be slower. If it drags, the fix is to defer
  `data/defs_auto.js` (370KB) until a definition is first needed.
- **Whether progress survives a reinstall.** It will not — `localStorage` is
  scoped to the WebView origin and cleared with the app. Fine for now; worth
  knowing before anyone has real progress to lose.
- **The `androidScheme` setting.** It is `https` in `capacitor.config.json`.
  Changing it later changes the WebView's origin and silently wipes everyone's
  saved progress, so treat it as fixed.
- **Tap targets and the keyboard.** The drill accepts typed input; on a phone
  that means the soft keyboard. The tile buttons are the primary input and
  should not need it, but this is untested on a touchscreen.
