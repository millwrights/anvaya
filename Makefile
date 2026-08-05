# Anvaya — one entrypoint to build, run, and package the desktop app.
# Stack: Tauri v2 (Rust core) + Vite/React/TypeScript frontend.
# Modeled on the reyank Makefile: `make run`, `make install`, `make dist`, …

APP         := Anvaya
VERSION     := $(shell node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)

# The Tauri toolchain lives in ~/.cargo; make it visible to every recipe so
# `make` works even when cargo isn't already on the interactive PATH.
export PATH := $(HOME)/.cargo/bin:$(PATH)

TAURI       := npx tauri
BUNDLE_REL  := src-tauri/target/release/bundle
BUNDLE_DBG  := src-tauri/target/debug/bundle
APP_REL     := $(BUNDLE_REL)/macos/$(APP).app
APP_DBG     := $(BUNDLE_DBG)/macos/$(APP).app

DIST_DIR    := dist-app
INSTALL_DIR := /Applications
INSTALLED   := $(INSTALL_DIR)/$(APP).app

# Code-signing identity for a signed/notarized release, e.g.
#   "Developer ID Application: Your Name (TEAMID)".
# Set it inline (make notarize SIGN_IDENTITY="Developer ID ...") or persist it:
#   echo "Developer ID Application: ... (TEAMID)" > .signing-identity   (gitignored)
SIGN_IDENTITY ?= $(shell cat .signing-identity 2>/dev/null || echo -)

.DEFAULT_GOAL := help
.PHONY: help deps dev web build typecheck app app-debug run install uninstall dist sign notarize clean distclean doctor

help:
	@echo "$(APP) $(VERSION) — make targets:"
	@echo "  make deps       Install JS deps (npm) + check the Rust toolchain"
	@echo "  make dev        Run the native app with hot reload (tauri dev)"
	@echo "  make web        Run the browser build only (vite dev server)"
	@echo "  make build      Type-check + bundle the frontend into dist/"
	@echo "  make run        Debug-build the app and launch it (fast)"
	@echo "  make app        Release-build $(APP).app + .dmg"
	@echo "  make install    Release-build and install into $(INSTALL_DIR)"
	@echo "  make uninstall  Remove $(INSTALLED)"
	@echo "  make dist       Copy the release .dmg into $(DIST_DIR)/"
	@echo "  make sign       Code-sign $(APP).app (needs SIGN_IDENTITY)"
	@echo "  make notarize   Sign + notarize + staple for distribution (Apple Developer ID)"
	@echo "  make typecheck  TypeScript check only"
	@echo "  make doctor     Show tool versions / environment"
	@echo "  make clean      Remove build artifacts (dist, bundles, $(DIST_DIR))"
	@echo "  make distclean  clean + remove node_modules"

# Install JS deps whenever package.json is newer than node_modules.
node_modules: package.json
	npm install
	@touch node_modules

deps: node_modules
	@command -v cargo >/dev/null 2>&1 \
		&& echo "✓ Rust: $$(cargo -V)" \
		|| echo "⚠ Rust/cargo not found — install with:\n    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"

dev: node_modules
	$(TAURI) dev

web: node_modules
	npm run dev

# Real-time collaboration relay (Yjs y-websocket) on ws://localhost:1234.
relay: node_modules
	@echo "Anvaya collab relay → ws://localhost:1234 (Ctrl-C to stop)"
	@HOST=0.0.0.0 PORT=1234 node node_modules/y-websocket/bin/server.cjs

build: node_modules
	npm run build

typecheck: node_modules
	npm run typecheck

app: node_modules
	$(TAURI) build
	@echo "✓ Built $(APP_REL)"

app-debug: node_modules
	$(TAURI) build --debug
	@echo "✓ Built $(APP_DBG)"

# Fast iteration: debug bundle, then launch it.
run: app-debug
	@echo "Launching $(APP)…"
	@open "$(APP_DBG)"

# Build the release app (app bundle only — the flaky .dmg step isn't needed to
# install), quit any running copy, install into /Applications, re-sign, launch.
install: node_modules
	@echo "Building release app…"
	@$(TAURI) build --bundles app
	@echo "Quitting any running $(APP)…"
	@pkill -f "$(APP).app/Contents/MacOS" 2>/dev/null || true
	@sleep 1
	@echo "Installing to $(INSTALLED)…"
	@rm -rf "$(INSTALLED)"
	@cp -R "$(APP_REL)" "$(INSTALLED)"
	@codesign --force --deep -s - "$(INSTALLED)" 2>/dev/null || true
	@codesign --verify --strict "$(INSTALLED)" 2>/dev/null \
		&& echo "  signature OK" \
		|| echo "  (ad-hoc build — Gatekeeper may warn on first open)"
	@open "$(INSTALLED)"
	@echo "✓ Installed and launched $(INSTALLED)"

uninstall:
	@pkill -f "$(APP).app/Contents/MacOS" 2>/dev/null || true
	@rm -rf "$(INSTALLED)"
	@echo "✓ Removed $(INSTALLED)"

# Package: collect the release .dmg into dist-app/.
# Detach any stale temp images first — a leftover attached rw.*.dmg makes
# Tauri's bundle_dmg.sh fail.
dist:
	@hdiutil info 2>/dev/null | awk '/image-path.*[Aa]nvaya/{f=1} f&&/\/dev\/disk[0-9]+ /{print $$1; f=0}' \
		| while read d; do hdiutil detach "$$d" -force >/dev/null 2>&1 || true; done
	@rm -f $(BUNDLE_REL)/macos/rw.*.dmg 2>/dev/null || true
	@$(MAKE) app
	@mkdir -p $(DIST_DIR)
	@cp -f $(BUNDLE_REL)/dmg/*.dmg $(DIST_DIR)/ 2>/dev/null \
		&& echo "✓ Copied .dmg to $(DIST_DIR)/" \
		|| echo "⚠ no .dmg found in $(BUNDLE_REL)/dmg/"
	@ls -lh $(DIST_DIR)/*.dmg 2>/dev/null || true

# ── code signing / notarization (Apple Developer ID) ─────────────────────────
# Just sign the app bundle with the hardened runtime (no notarization).
sign: app
	codesign --force --deep --options runtime \
		--entitlements scripts/entitlements.plist \
		--identifier app.anvaya.desktop \
		--sign "$(SIGN_IDENTITY)" "$(APP_REL)"
	@codesign --verify --verbose "$(APP_REL)"

# Full distribution flow: build → sign (hardened runtime) → notarize → staple.
# Needs a "Developer ID Application" cert + notary credentials. The stapled,
# release-ready zip lands in $(DIST_DIR)/. See scripts/sign-and-notarize.sh.
#   make notarize SIGN_IDENTITY="Developer ID Application: ... (TEAMID)" \
#                 NOTARY_PROFILE=anvaya-notary
notarize:
	@SIGN_IDENTITY="$(SIGN_IDENTITY)" scripts/sign-and-notarize.sh

doctor:
	@echo "node:  $$(node -v 2>/dev/null || echo missing)"
	@echo "npm:   $$(npm -v 2>/dev/null || echo missing)"
	@echo "cargo: $$(cargo -V 2>/dev/null || echo 'missing — see make deps')"
	@echo "tauri: $$($(TAURI) -V 2>/dev/null || echo 'missing — run make deps')"

clean:
	rm -rf dist $(DIST_DIR) $(BUNDLE_REL) $(BUNDLE_DBG)
	@echo "✓ Cleaned build artifacts"

distclean: clean
	rm -rf node_modules
	@echo "✓ Removed node_modules"
