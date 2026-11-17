#!/bin/bash
# External macOS installer helper. Never run until the app has backed up SQLite
# and explicitly approved the verified installer and destination.
set -euo pipefail
if [[ $# -ne 7 ]]; then echo "Usage: helper DMG TARGET VERSION EXPECTED_SHA APP_PID READY_FILE READY_TOKEN" >&2; exit 64; fi
DMG="$1"; TARGET="$2"; VERSION="$3"; EXPECTED_SHA="$4"; APP_PID="$5"; READY_FILE="$6"; READY_TOKEN="$7"
APP_NAME="Nizamia App-2A.app"
BUNDLE_ID="com.nizamia.app2a.desktop"
[[ "$TARGET" == */"$APP_NAME" && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$EXPECTED_SHA" =~ ^[a-f0-9]{64}$ && "$APP_PID" =~ ^[0-9]+$ && "$READY_TOKEN" =~ ^[a-f0-9]{40}$ ]] || exit 65
[[ -f "$DMG" && -d "$TARGET" && ! -L "$TARGET" ]] || exit 66
[[ "$TARGET" == /Applications/"$APP_NAME" || "$TARGET" == "$HOME"/Applications/"$APP_NAME" ]] || exit 67
# Never update through aliases/symlinked directories.
[[ "$(cd "$(/usr/bin/dirname "$TARGET")" && /bin/pwd -P)" == "$(/usr/bin/dirname "$TARGET")" ]] || exit 68
[[ "$(/usr/bin/shasum -a 256 "$DMG" | /usr/bin/awk '{print $1}')" == "$EXPECTED_SHA" ]] || exit 69
PARENT="$(/usr/bin/dirname "$TARGET")"
STAGING="$PARENT/.Nizamia-App-2A-staging-$$"
ROLLBACK="$PARENT/.Nizamia-App-2A-rollback-$VERSION-$$.app"
MOUNT="$(/usr/bin/mktemp -d /tmp/app2a-update.XXXXXX)"
MOUNTED=0
OLD_MOVED=0
NEW_INSTALLED=0
START_VERIFIED=0
cleanup() {
  if [[ "$MOUNTED" == 1 ]]; then /usr/bin/hdiutil detach "$MOUNT" -quiet || true; fi
  /bin/rmdir "$MOUNT" 2>/dev/null || true
  if [[ -d "$STAGING" ]]; then /bin/rm -rf -- "$STAGING"; fi
  if [[ -d "$STAGING.failed" ]]; then /bin/rm -rf -- "$STAGING.failed"; fi
}
restore() {
  if [[ "$OLD_MOVED" == 1 && "$START_VERIFIED" == 0 && -d "$ROLLBACK" ]]; then
    if [[ -e "$TARGET" ]]; then /bin/mv -- "$TARGET" "$STAGING.failed" || true; fi
    /bin/mv -- "$ROLLBACK" "$TARGET" || true
    /usr/bin/open "$TARGET" || true
  fi
}
trap 'restore; cleanup' EXIT
[[ ! -e "$ROLLBACK" && ! -e "$STAGING" && -w "$PARENT" ]] || exit 70
/usr/bin/hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT" "$DMG" -quiet
MOUNTED=1
SOURCE="$MOUNT/$APP_NAME"
[[ -d "$SOURCE" && ! -L "$SOURCE" ]] || exit 71
PLIST="$SOURCE/Contents/Info.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")" == "$BUNDLE_ID" ]] || exit 72
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")" == "$VERSION" ]] || exit 73
/usr/bin/ditto "$SOURCE" "$STAGING"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$STAGING/Contents/Info.plist")" == "$BUNDLE_ID" ]] || exit 74
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$STAGING/Contents/Info.plist")" == "$VERSION" ]] || exit 74
# Wait until the original Electron process has exited. Fail closed after 30s.
for ((i=0;i<60;i++)); do
  if ! /bin/kill -0 "$APP_PID" 2>/dev/null; then break; fi
  /bin/sleep 0.5
done
if /bin/kill -0 "$APP_PID" 2>/dev/null; then echo "Application did not close" >&2; exit 75; fi
/bin/mv -- "$TARGET" "$ROLLBACK"
OLD_MOVED=1
/bin/mv -- "$STAGING" "$TARGET"
NEW_INSTALLED=1
/usr/bin/open "$TARGET"
# The new app writes its launch token only after its local database is verified.
for ((i=0;i<90;i++)); do
  if [[ -f "$READY_FILE" && "$(/bin/cat "$READY_FILE")" == "$READY_TOKEN" ]]; then START_VERIFIED=1; break; fi
  /bin/sleep 1
done
if [[ "$START_VERIFIED" != 1 ]]; then echo "New app did not confirm startup; restoring previous version" >&2; exit 76; fi
# Preserve rollback for user recovery, but never overwrite an existing backup on a later update.
exit 0
