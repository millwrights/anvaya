#!/usr/bin/env bash
# Anvaya — sign, notarize, and staple Anvaya.app for hassle-free distribution.
# SPDX-License-Identifier: MIT OR Apache-2.0
#
# This is scaffolding for when a paid Apple Developer account is available.
# Until then, releases ship un-notarized and open after a one-time
# `xattr -dr com.apple.quarantine /Applications/Anvaya.app` (see README).
#
# Requires a "Developer ID Application" certificate in your login keychain.
#
# Configuration (via environment variables):
#   SIGN_IDENTITY   "Developer ID Application: Your Name (TEAMID)"   (required)
#   NOTARY_PROFILE  name of a stored notarytool keychain profile     (recommended)
#     — or —
#   APPLE_ID        your Apple ID email
#   TEAM_ID         your 10-char team id
#   APP_PASSWORD    an app-specific password (appleid.apple.com)
#
# One-time notarytool profile setup (so credentials aren't passed each run):
#   xcrun notarytool store-credentials millwrights-notary \
#       --apple-id "you@example.com" --team-id "TEAMID" --password "app-specific-pw"
#   export NOTARY_PROFILE=millwrights-notary
#
# Usage:
#   SIGN_IDENTITY="Developer ID Application: ... (TEAMID)" \
#   NOTARY_PROFILE=millwrights-notary \
#   scripts/sign-and-notarize.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP="src-tauri/target/release/bundle/macos/Anvaya.app"
ZIP="dist-app/Anvaya-notarized.zip"
ENTITLEMENTS="scripts/entitlements.plist"
IDENTIFIER="app.anvaya.desktop"

if [[ -z "${SIGN_IDENTITY:-}" || "${SIGN_IDENTITY}" == "-" ]]; then
  echo "error: set SIGN_IDENTITY to your 'Developer ID Application' identity." >&2
  echo "       list yours with:  security find-identity -v -p codesigning" >&2
  exit 1
fi

# Notarization can ONLY succeed with a real "Developer ID Application" cert
# (a paid Apple Developer account). Fail fast — before the ~30s build — if the
# identity is self-signed, rather than getting rejected by Apple at the end.
if [[ "$SIGN_IDENTITY" != "Developer ID Application:"* ]]; then
  cat >&2 <<MSG
error: notarization needs a real "Developer ID Application" certificate, but
       SIGN_IDENTITY is "$SIGN_IDENTITY" — a self-signed / non-Developer-ID cert.

Apple's notary service only accepts apps signed with a Developer ID, which
requires enrolling in the Apple Developer Program (\$99/yr). No Developer ID
exists yet for this org (reyank/captr are in the same state).

  • To just build + sign locally (no notarization):  make sign
  • Distributing now? Ship the un-notarized build; users open it once with:
        xattr -dr com.apple.quarantine /Applications/Anvaya.app

Once the org has a Developer ID:
  1. Install the "Developer ID Application" cert in your login keychain.
  2. echo "Developer ID Application: Millwrights (TEAMID)" > .signing-identity
  3. xcrun notarytool store-credentials millwrights-notary \\
         --apple-id "you@example.com" --team-id "TEAMID" --password "app-specific-pw"
  4. make notarize
MSG
  exit 1
fi

echo "==> Building release app bundle (app-only; skips the flaky .dmg step)"
npx tauri build --bundles app

echo "==> Signing with hardened runtime + entitlements"
codesign --force --deep --timestamp --options runtime \
  --entitlements "$ENTITLEMENTS" \
  --identifier "$IDENTIFIER" \
  --sign "$SIGN_IDENTITY" "$APP"
codesign --verify --strict --verbose=2 "$APP"

echo "==> Zipping for notarization"
mkdir -p dist-app
rm -f "$ZIP"
/usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"

echo "==> Submitting to Apple notary service (this waits for the result)"
if [[ -n "${NOTARY_PROFILE:-}" ]]; then
  xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
elif [[ -n "${APPLE_ID:-}" && -n "${TEAM_ID:-}" && -n "${APP_PASSWORD:-}" ]]; then
  xcrun notarytool submit "$ZIP" \
    --apple-id "$APPLE_ID" --team-id "$TEAM_ID" --password "$APP_PASSWORD" --wait
else
  cat >&2 <<MSG
error: no Apple notary credentials — cannot submit for notarization.

The app is built and signed at:
  $APP
…but it is NOT notarized. Set up credentials one time, then re-run 'make notarize':

  xcrun notarytool store-credentials millwrights-notary \\
      --apple-id "you@example.com" --team-id "TEAMID" --password "app-specific-pw"
  export NOTARY_PROFILE=millwrights-notary      # (or persist in your shell profile)

Or pass them inline: APPLE_ID=… TEAM_ID=… APP_PASSWORD=… make notarize
MSG
  exit 1
fi

echo "==> Stapling the notarization ticket onto the app"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

echo "==> Re-zipping the stapled app for release upload"
rm -f "$ZIP"
/usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"

echo "==> Gatekeeper assessment (should say: accepted)"
spctl --assess --type execute --verbose=4 "$APP" || true

echo "✓ Done. Notarized, stapled app:  $APP"
echo "  Upload this to the release:     $ZIP"
