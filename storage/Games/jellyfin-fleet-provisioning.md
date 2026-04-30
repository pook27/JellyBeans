# Jellyfin Android TV: Fleet Provisioning via ADB

Pre-configure the Jellyfin Android TV app with your server URL across a fleet of boxes using ADB.
No APK modification, no decompilation, no re-signing required.

---

## How Jellyfin Stores Its Configuration

> ⚠️ **Important:** Jellyfin Android TV does NOT use a simple `server_url` key in SharedPreferences.
> It uses Android's **AccountManager** for credentials and a custom **ServerRepository** backed storage layer.
> Do not try to write a hand-crafted XML file — you will likely end up with a file the app ignores entirely.
>
> The correct approach is the **Golden Config** method: configure one real box, pull the exact files the app created, and push that snapshot to all other boxes.

---

## Prerequisites

### What is the "deployment machine"?

Your **deployment machine is your regular PC** (Windows, Mac, or Linux) — not the Jellyfin server and not the TV boxes themselves. You run ADB from your PC, and it connects to each Android TV box over your local network (or via USB). Your Jellyfin backend server plays no role in this process; it just needs to be running so the app can log into it during the golden config step.

```
[ Your PC ]  ──── ADB over LAN / USB ────►  [ Android TV Box ]
                                                      │
                                         connects to  ▼
                                        [ Jellyfin Server ]   (already running, untouched)
```

### Requirements

- **Your PC:** ADB installed. Download from [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools).
- **Your Android TV boxes:** Developer Options enabled, and Network Debugging (ADB over Wi-Fi) turned on.
- **Network:** Your PC and the TV boxes must be on the same local network.

### Check whether your boxes support root ADB

From your PC, run:

```bash
adb connect <BOX_IP>
adb root
```

| Response | Meaning |
|---|---|
| `restarting adbd as root` | ✅ Root supported — use **Option A** |
| `adbd is already running as root` | ✅ Already root — use **Option A** |
| `adbd cannot run as root in production builds` | ❌ No root — use **Option B** |

---

## Phase 1: Capture the Golden Config

> 🖥️ **Run all commands in this phase from your PC.**

Do this **once** on a test box that you configure manually.

```bash
# Run from your PC:

# Connect to the test box
adb connect <TEST_BOX_IP>

# Elevate to root
adb root
adb connect <TEST_BOX_IP>   # reconnect after root

# On the TV box: open Jellyfin, type in your server URL, and log in with the default user.
# Then, back on your PC, pull the entire app data directory to your PC:
adb pull /data/data/org.jellyfin.androidtv/ ./jellyfin_golden/
```

Inspect the `jellyfin_golden/` folder on your machine. You will find:
- `shared_prefs/` — app preferences
- `databases/` — may contain a SQLite database with server/account data
- `files/` — may contain additional state

The exact files that matter will depend on the app version. Identify which files are non-empty and contain your server URL — these are the files you will push to every new box.

---

## Phase 2: Deployment Script

> 🖥️ **Run all commands in this phase from your PC.** The script connects to each TV box remotely — you do not need physical access or to log into the Jellyfin server.

Use this script for every new box you provision. Replace the variables at the top.

### Option A: Root ADB (Recommended)

```bash
#!/bin/bash

BOX_IP="192.168.1.XXX"           # IP address of the target box
APK_PATH="./jellyfin-androidtv.apk"
GOLDEN_DIR="./jellyfin_golden"
APP_ID="org.jellyfin.androidtv"
APP_DATA="/data/data/${APP_ID}"

# 1. Connect and gain root
adb connect ${BOX_IP}
adb root
adb connect ${BOX_IP}

# 2. Install the official unmodified APK
adb install -r ${APK_PATH}

# 3. Stop the app before writing config
adb shell am force-stop ${APP_ID}

# 4. Push golden config files
#    Push each subdirectory that you identified in Phase 1.
#    Example for shared_prefs and databases:
adb shell mkdir -p ${APP_DATA}/shared_prefs
adb shell mkdir -p ${APP_DATA}/databases

adb push ${GOLDEN_DIR}/shared_prefs/ ${APP_DATA}/shared_prefs/
adb push ${GOLDEN_DIR}/databases/    ${APP_DATA}/databases/

# 5. Fix file ownership
#    IMPORTANT: App data must be owned by the app's own UID, NOT "system".
#    Get the correct UID dynamically:
APP_UID=$(adb shell stat -c '%u' ${APP_DATA} | tr -d '\r')
adb shell chown -R ${APP_UID}:${APP_UID} ${APP_DATA}/shared_prefs/
adb shell chown -R ${APP_UID}:${APP_UID} ${APP_DATA}/databases/

# 6. Fix file permissions
adb shell chmod 660 ${APP_DATA}/shared_prefs/*
adb shell chmod 660 ${APP_DATA}/databases/*

# 7. Launch Jellyfin
adb shell monkey -p ${APP_ID} -c android.intent.category.LEANBACK_LAUNCHER 1

echo "Done: ${BOX_IP}"
```

> **Why dynamic UID resolution?** Android assigns each app a unique user ID (like `u0_a112`).
> Hardcoding `system:system` as the owner — as some guides suggest — is **incorrect** and will
> cause the app to either crash or silently ignore the injected files because it lacks read permission.

---

### Option B: Non-Root (Debuggable APK)

If `adb root` is unavailable, you need a debuggable build of the APK so that `run-as` is permitted.
You only need to compile this **once** on your PC and reuse it across your entire fleet.

```bash
# Run from your PC:

# Clone the repo
git clone https://github.com/jellyfin/jellyfin-androidtv
cd jellyfin-androidtv

# Build a debug APK (sets android:debuggable="true" automatically)
./gradlew assembleDebug

# Output: app/build/outputs/apk/debug/app-debug.apk
```

Then use `run-as` to write files as the app's own user — no root needed:

```bash
# Run from your PC:

APP_ID="org.jellyfin.androidtv"

adb connect ${BOX_IP}
adb install -r app-debug.apk
adb shell am force-stop ${APP_ID}

# Push golden files via run-as
# Note: You must push to a temp location first, then move via run-as
adb push jellyfin_golden/shared_prefs/some_prefs.xml /data/local/tmp/prefs.xml

adb shell run-as ${APP_ID} sh -c "
  mkdir -p shared_prefs &&
  cp /data/local/tmp/prefs.xml shared_prefs/some_prefs.xml
"

adb shell monkey -p ${APP_ID} -c android.intent.category.LEANBACK_LAUNCHER 1
```

> Repeat for each file identified in Phase 1.

---

## Updating the App

When a new Jellyfin version releases:

1. Download the new APK.
2. Re-run your deployment script with the new APK path.
3. Re-capture a Golden Config if a major update changes the storage format (rare, but possible).

You do **not** need to recompile or re-patch anything — the official unmodified APK is always used in Option A.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| App shows setup screen despite injection | Wrong file ownership | Re-run the `chown` step with dynamic UID |
| App crashes on launch | Malformed database file | Re-capture golden config from a fresh login |
| `adb root` returns "adbd is already running as root" | Already root | Skip the second `adb connect`, proceed normally |
| `run-as` returns "Package is not debuggable" | Using release APK | Build with `assembleDebug` or use Option A |
