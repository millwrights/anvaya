# Anvaya MCP server

Lets any MCP-capable AI agent — Claude Desktop, Cursor, or your own client — build
diagrams in your Anvaya workspace. The agent describes a diagram as a graph of
nodes and edges; the server writes a native `.anvaya` file, auto-laid-out and
colored by the app. The running app picks the changes up automatically.

## Tools

| Tool | What it does |
|------|--------------|
| `list_diagrams` | List diagrams in the workspace (name, title, folder, tags, counts). |
| `read_diagram` | Read one diagram's shapes and connections. |
| `create_diagram` | Create a new diagram from `{title, nodes, edges}`. |
| `append_to_diagram` | Add nodes/edges to an existing diagram (placed below current content). |

Node shapes: `rounded` (step), `diamond` (decision), `ellipse` (start/end),
`note`, `sticky`, `topic` (mind-map), `rect`.

## Install

```sh
cd mcp
npm install
```

## Point it at your workspace

The server reads/writes the `diagrams/` folder of an Anvaya workspace. It defaults
to `~/Documents/Anvaya`; override with the `ANVAYA_WORKSPACE` environment variable
(set it to the folder you opened in Anvaya — the one that contains `diagrams/`).

## Connect Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "anvaya": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/anvaya/mcp/server.mjs"],
      "env": { "ANVAYA_WORKSPACE": "/Users/you/Documents/Anvaya" }
    }
  }
}
```

Restart Claude Desktop. You can then ask, e.g.:

> "Create an Anvaya diagram of a user login flow with 2FA and error handling."

Claude calls `create_diagram`, the file lands in your workspace, and Anvaya shows
it within a couple of seconds — new diagrams appear in the sidebar automatically,
and the open diagram reloads when it changes on disk (while you're not editing).
You can also force a refresh with **Reload from disk** in the workspace menu.

## Notes

- Works whether or not Anvaya is running — it just writes files.
- Quit-safe: the app never overwrites an external change made while you were idle.
- Other MCP clients: run `node server.mjs` over stdio with `ANVAYA_WORKSPACE` set.
