#!/bin/bash
# External macOS installer helper. Never run until the app has backed up SQLite
# and explicitly approved the verified installer and destination.
set -euo pipefail
if [[ $# -ne 5 ]]; then echo "Usage: helper DMG TARGET VERSION EXPECTED_SHA APP_PID" >&2; exit 64; fi
DMG="$1"; TARGET="$2"; VERSION="$3"; EXPECTED_SHA="$4"; APP_PID="$5"
APP_NAME="Nizamia App-2A.app"
BUNDLE_ID="com.nizamia.app2a.desktop"
[[ "$TARGET" == */"$APP_NAME" && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$EXPECTED_SHA" =~ ^[a-f0-9]{64}$ && "$APP_PID" =~ ^[0-9]+$ ]] || exit 65
[[ -f "$DMG" && -d "$TARGET" && ! -L "$TARGET" ]] || exit 66
[[ "$TARGET" == /Applications/"$APP_NAME" || "$TARGET" == "$HOME"/Applications/"$APP_NAME" ]] || exit 67
# Never update through aliases/symlinked directories.
[[ "$(/usr/bin/realpath "$TARGET")" == "$TARGET" ]] || exit 68
[[ "$(/usr/bin/shasum -a 256 "$DMG" | /usr/bin/awk '{print $1}')" == "$EXPECTED_SHA" ]] || exit 69
PARENT="$(/usr/bin/dirname "$TARGET")"
STAGING="$PARENT/.Nizamia-App-2A-staging-$$"
ROLLBACK="$PARENT/.Nizamia-App-2A-rollback.app"
MOUNT="$(/usr/bin/mktemp -d /tmp/app2a-update.XXXXXX)"
MOUNTED=0
OLD_MOVED=0
NEW_INSTALLED=0
cleanup() {
  if [[ "$MOUNTED" == 1 ]]; then /usr/bin/hdiutil detach "$MOUNT" -quiet || true; fi
  /bin/rmdir "$MOUNT" 2>/dev/null || true
  if [[ -d "$STAGING" ]]; then /bin/rm -rf -- "$STAGING"; fi
}
restore() {
  if [[ "$OLD_MOVED" == 1 && "$NEW_INSTALLED" == 0 && ! -e "$TARGET" && -d "$ROLLBACK" ]]; then
    /bin/mv -- "$ROLLBACK" "$TARGET" || true
  fi
}
trap 'restore; cleanup' EXIT
[[ ! -e "$ROLLBACK" && ! -e "$STAGING" ]] || exit 70
/usr/bin/hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT" "$DMG" -quiet
MOUNTED=1
SOURCE="$MOUNT/$APP_NAME"
[[ -d "$SOURCE" && ! -L "$SOURCE" ]] || exit 71
PLIST="$SOURCE/Contents/Info.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")" == "$BUNDLE_ID" ]] || exit 72
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")" == "$VERSION" ]] || exit 73
/usr/bin/ditto "$SOURCE" "$STAGING"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$STAGING/Contents/Info.plist")" == "$BUNDLE_ID" ]] || exit 74
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
# Keep rollback until a future successful-start verification explicitly clears it.
exit 0
