# Anvaya (अन्वय)

**Anvaya** — a Sanskrit word meaning connection, relation, sequence, and logical continuity — is a premium, local-first **visual thinking** application that unifies **mind maps** and **flowcharts** on a single infinite canvas.

Every innovation begins with disconnected thoughts. Anvaya turns them into structured knowledge through mind maps, flowcharts, and AI-powered diagramming.

> **Status:** working MVP of the core loop — unified canvas, CRDT document, auto-save. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full product & technical design and roadmap.

---

## Run it

### Prerequisites

- **Node.js 18 or newer** (+ npm) — for the app build and the MCP server. macOS: `brew install node`.
- **Rust toolchain** — only needed to build the native desktop app (Tauri). One-time: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.
- **make** — thin wrappers over `npm` / `npx tauri`.

Run `make doctor` to check what's installed.

Everything is wrapped in a **Makefile** — run `make` (or `make help`) to see all targets:

```bash
make deps       # install JS deps + check the Rust toolchain
make dev        # run the native app with hot reload (tauri dev)
make web        # browser build only (vite dev server → http://localhost:5173)
make run        # debug-build the app and launch it (fast)
make app        # release-build Anvaya.app + .dmg
make install    # release-build and install into /Applications
make uninstall  # remove /Applications/Anvaya.app
make dist       # copy the release .dmg into dist-app/
make typecheck  # TypeScript check
make doctor     # show tool versions
make clean      # remove build artifacts
```

### Native desktop app (macOS)

The desktop shell is **Tauri v2** (Rust core + system WebView), so it needs the Rust toolchain once:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # one-time
make dev        # or: make install
```

(Under the hood these wrap `npm` and `npx tauri`; the equivalent `npm run dev` / `npm run tauri:dev` / `npm run tauri:build` scripts still work too.)

Under the desktop build, a **workspace is a real folder on disk** — `~/Documents/Anvaya` by default — and diagrams are written as normalized `.anvaya` JSON by the Rust core (`src-tauri/`). In the browser build the same document persists to IndexedDB. The CRDT and rendering code are identical across both.

**Switch workspaces** from the chip in the bottom-left status bar (or the *Open workspace folder…* command in ⌘K): pick any folder and Anvaya opens it, remembering recents. Leaving a workspace flushes it first, so switching is lossless.

Other scripts:

```bash
npm run build      # type-check + production bundle
npm run typecheck  # types only
```

---

## What works today

- **Unified infinite canvas** (PixiJS / WebGL) with camera pan/zoom, retina-crisp, GPU-rendered.
- **Drawing tools** — a toolbar palette: **Select**, **Pen** (freehand ink), **Box**, **Circle/oval**, **Diamond**, **Sticky note**, **Text**, and **Connect**. Drag to draw shapes at any size; the pen samples a smooth freehand stroke with color/width controls.
- **Sticky notes** — colored notes (6-color palette), Miro-style.
- **Board editing** — duplicate (⌘D), copy/paste (⌘C/⌘V), bring-to-front / send-to-back (⌘] / ⌘[).
- **Align & distribute** — for multi-selection, plus **lock/unlock**.
- **Snapping + alignment guides** — objects snap to each other's edges/centers while dragging, with live guide lines.
- **Images** — paste, drag-drop, or *Insert image…* to place pictures on the canvas.
- **Minimap** — a live board overview (bottom-right); click or drag to navigate large boards.
- **Real-time collaboration** — a **Share** toggle turns on live multiplayer: shared editing, presence avatars, and live cursors, over a Yjs relay. Run the relay with `make relay` (defaults to `ws://localhost:1234`).
- **Frames / sections** — titled containers (`F`) that render behind content and move their contents with them.
- **Groups** — group/ungroup (⌘G / ⇧⌘G); selecting one member selects the group.
- **Templates** — one-click Kanban, Retrospective, SWOT, and Mind-map boards.
- **Emoji / sticker** picker for quick visual markers.
- **Multiple diagrams per workspace** — a sidebar lists every `.anvaya` in the workspace; create, switch, rename (double-click), and delete. Each diagram persists independently; switching flushes first so nothing is lost.
- **Mind maps** — auto-layout tree with curved branches; keyboard-driven (**Tab** = child, **Enter** = sibling); live reflow.
- **Flowcharts** — boxes, ovals, decisions, notes with directed connectors.
  - **Connect boxes**: hover a box → drag from one of its blue connection dots to another box to draw an arrow. Drop on empty canvas to spawn a new connected box.
  - **Connectors are editable**: click one to select it, drag the dots to add smooth bends (waypoints), drag waypoints to reshape, double-click to remove; "Straighten" resets.
- **One canvas for both** — a relationship edge can link a mind-map topic to a flowchart node.
- **Editing** — click-select, shift multi-select, drag-move, corner-resize, inline text editing, delete.
- **Command palette** (**⌘K**), inspector panel, toolbar, status bar.
- **Themes** — pick from the **◐** button: **Dark** (solid near-black, default), **Midnight** (deep blue-gray), and **Light**. Switches instantly (canvas + UI) and is remembered.
- **Local-first auto-save** — every change persists to IndexedDB (crash recovery); survives reload.
- **Undo / redo** — via the CRDT history (**⌘Z** / **⇧⌘Z**).
- **Portable file format** — export/import a normalized, git-diff-friendly `.anvaya` JSON.
- **AI diagram generation** — describe a diagram (or paste **Mermaid**) and get native, editable shapes; bring-your-own-key (any OpenAI-compatible endpoint or Anthropic). Plus an **MCP server** so coding agents build diagrams in your workspace — see [Connect an AI agent (MCP)](#connect-an-ai-agent-mcp).
- **Excalidraw interop** — import and export `.excalidraw` files from the Export menu.

### Keyboard

| Key | Action |
|-----|--------|
| `V` `P` `R` `O` `D` `S` `T` `C` | Tools: Select · Pen · Box · Circle · Diamond · Sticky · Text · Connect |
| `⌘D` · `⌘C`/`⌘V` · `⌘]`/`⌘[` | Duplicate · Copy/Paste · Front/Back |
| `Tab` | Add child topic (mind map) |
| `Enter` | Add sibling topic |
| `N` | New node at center |
| `C` | Connect tool (click source → target) |
| `⌘K` | Command palette |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⇧1` | Zoom to fit |
| `Delete` | Delete selection |
| `Esc` | Deselect / cancel |
| double-click | Create node / edit text |
| `⌘`+scroll | Zoom · scroll/trackpad · pan |

---

## Make diagrams with AI

Two ways to turn ideas into diagrams:

- **In the app** — click **✨ AI** in the toolbar, describe a diagram (or paste **Mermaid** flowchart text), and Anvaya builds real, editable shapes. Bring your own key; works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Ollama, LM Studio) or Anthropic. Pasted Mermaid needs no key.
- **From your coding tools** — connect an MCP server so agents like **Claude Code**, **Claude Desktop**, or **Cursor** build diagrams directly in your workspace (see below).

## Connect an AI agent (MCP)

The MCP server lets any MCP-capable AI tool create and edit diagrams in an Anvaya
workspace. It reads and writes `.anvaya` files on disk, so it works whether or not
the app is running; the app picks up changes automatically (or via **Reload from disk**).

### Prerequisite

Just **Node.js 18+**. The server ships as a **self-contained bundle**
(`mcp/anvaya-mcp.bundle.mjs`) with all dependencies inlined — **no `npm install`**.

> The bundle matters: a GitHub "Download ZIP" has no `node_modules`, so pointing a
> client at `mcp/server.mjs` fails with *"Cannot find package
> '@modelcontextprotocol/sdk'"*. Use the bundle path and it just works.

### Claude Code

```bash
claude mcp add anvaya -s user \
  -e ANVAYA_WORKSPACE="$HOME/Documents/Anvaya" \
  -- "$(which node)" /ABSOLUTE/PATH/TO/anvaya/mcp/anvaya-mcp.bundle.mjs
```

Then restart Claude Code (or `/mcp` → reconnect) and ask, e.g. *"Use anvaya to
create a diagram of a login flow with 2FA."* Check status with `claude mcp list`.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "anvaya": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/ABSOLUTE/PATH/TO/anvaya/mcp/anvaya-mcp.bundle.mjs"],
      "env": { "ANVAYA_WORKSPACE": "/Users/you/Documents/Anvaya" }
    }
  }
}
```

Restart Claude Desktop. Use the **absolute** path to `node` — these clients run
with a minimal `PATH` and can't find a bare `node`.

### Notes

- Point `ANVAYA_WORKSPACE` at the folder you opened in Anvaya (default `~/Documents/Anvaya`).
- Tools: `list_diagrams`, `read_diagram`, `create_diagram`, `create_from_mermaid`,
  `append_to_diagram`, `update_node`, `delete_node`, `add_edge`, `set_node_color`, `describe_diagram`.
- Developing the server? `cd mcp && npm install`, edit `server.mjs`, then
  `npm run bundle` to rebuild. Full details in [`mcp/README.md`](mcp/README.md).

## Architecture at a glance

The spine is a **Command bus → CRDT document → scene graph → renderer** pipeline. Every mutation (tool, keyboard, palette, and later AI/plugins) goes through one path, so undo, history, and collaboration all work uniformly.

```
src/
├── document/     # Yjs CRDT store + domain types + theme (source of truth)
├── commands/     # Command layer — the only way to mutate the document
├── layout/       # Layout engines as pure functions (mind-map trees)
├── render/       # Camera transform (infinite canvas math)
├── canvas/       # CanvasEngine — PixiJS/WebGL renderer + interaction
├── workspace/    # Normalized .anvaya (de)serialization + seed diagram
├── app/          # Session bootstrap, store, command registry
└── ui/           # React chrome: toolbar, inspector, palette, editor overlay
```

Key decisions (full rationale in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **CRDT (Yjs) from day one** — undo, crash recovery, offline, and future real-time collab from one mechanism.
- **WebGL retained-mode canvas** with DOM overlays only for editing — the approach behind Figma / tldraw.
- **Layout-as-behavior** — a mind map is just a subtree with a layout engine attached; a flowchart node is a free node. Same scene graph.
- **JSON on disk, CRDT at runtime** — git-diff-friendly now, collaboration-ready later.

---

## Roadmap (short)

- **Now → v1:** Tauri desktop shell (`.dmg`), real workspace-folder persistence, WebGL scaling (spatial index, culling, LOD, SDF text), more layouts, shape libraries, text-to-diagram (Mermaid) for sequence/ER, AI (natural-language → diagram, bring-your-own-key).
- **v2:** real-time collaboration (Yjs relay), comments/presence, plugin SDK, Windows/Linux builds.
- **Enterprise:** self-hosted sync, SSO, team libraries, plugin marketplace.

See the full phased plan, data model, rendering architecture, AI architecture, plugin design, and risk analysis in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Signing & notarization (macOS distribution)

Release builds are currently **un-notarized**, so a downloaded `Anvaya.app` opens
after a one-time step:

```bash
xattr -dr com.apple.quarantine /Applications/Anvaya.app   # or right-click → Open
```

The infrastructure for a proper, warning-free release is in place for when an
**Apple Developer ID** is available — see [`scripts/sign-and-notarize.sh`](scripts/sign-and-notarize.sh)
and [`scripts/entitlements.plist`](scripts/entitlements.plist):

```bash
# one-time: store notary credentials in the keychain
xcrun notarytool store-credentials millwrights-notary \
    --apple-id "you@example.com" --team-id "TEAMID" --password "app-specific-pw"

# build → sign (hardened runtime) → notarize → staple → release-ready zip in dist-app/
make notarize SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
              NOTARY_PROFILE=millwrights-notary
```

`make sign` signs without notarizing. `SIGN_IDENTITY` can also be persisted in a
(git-ignored) `.signing-identity` file.

---

## License

Anvaya is dual-licensed under either of

- Apache License, Version 2.0 ([`LICENSE-APACHE`](LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([`LICENSE-MIT`](LICENSE-MIT) or <http://opensource.org/licenses/MIT>)

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license, shall
be dual-licensed as above, without any additional terms or conditions.
