#!/usr/bin/env node
// Anvaya MCP server — lets any MCP-capable AI agent (Claude Desktop, etc.) build
// diagrams in an Anvaya workspace by reading and writing `.anvaya` files. The
// running app surfaces changes via "Reload from disk" (auto-reload when idle).
//
// Configure the workspace with the ANVAYA_WORKSPACE env var; defaults to
// ~/Documents/Anvaya.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addEdge,
  appendToDiagram,
  createDiagram,
  deleteNode,
  describeDiagram,
  listDiagrams,
  readDiagram,
  setNodeColor,
  updateNode,
  workspaceRoot,
} from "./anvaya.mjs";
import { parseMermaid } from "./mermaid.mjs";

const server = new McpServer({ name: "anvaya", version: "0.1.0" });

const SHAPES = ["rounded", "rect", "ellipse", "diamond", "note", "sticky", "topic"];

const nodeSchema = z.object({
  id: z.string().describe("Unique slug you invent; edges reference it."),
  label: z.string().describe("Short text shown in the shape."),
  shape: z
    .enum(SHAPES)
    .optional()
    .describe(
      "start/end -> ellipse; step/process -> rounded; decision -> diamond; note/data -> note; mind-map idea -> topic; default rounded.",
    ),
});
const edgeSchema = z.object({
  from: z.string().describe("Source node id."),
  to: z.string().describe("Target node id."),
  label: z.string().optional().describe("Optional edge label, e.g. Yes/No."),
});

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({
  isError: true,
  content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
});

server.tool(
  "list_diagrams",
  "List the diagrams in the Anvaya workspace (file name, title, folder, tags, counts).",
  {},
  async () => {
    try {
      return ok({ workspace: workspaceRoot(), diagrams: await listDiagrams() });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "read_diagram",
  "Read one diagram's shapes and connections (by file name from list_diagrams).",
  { name: z.string().describe("The .anvaya file name, e.g. auth-flow.anvaya") },
  async ({ name }) => {
    try {
      return ok(await readDiagram(name));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "create_diagram",
  "Create a NEW diagram from a graph of nodes and edges. Shapes are auto-sized to their text, auto-laid-out top-down, and colored by the app. Keep flow-node labels concise; to add detail, attach a few 'note' shapes with a short one-line description to the important steps (mind-map style) instead of writing long labels. Returns the created file name.",
  {
    title: z.string().describe("Diagram title."),
    nodes: z.array(nodeSchema).min(1).describe("The shapes."),
    edges: z.array(edgeSchema).default([]).describe("The connections between node ids."),
    folder: z.string().optional().describe("Optional folder path, e.g. Work/Auth."),
    tags: z.array(z.string()).optional().describe("Optional tags for search."),
  },
  async (args) => {
    try {
      const r = await createDiagram(args);
      return ok({ ...r, note: 'Open or "Reload from disk" in Anvaya to see it.' });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "append_to_diagram",
  "Add nodes and edges to an EXISTING diagram (placed below current content).",
  {
    name: z.string().describe("The .anvaya file name to add to."),
    nodes: z.array(nodeSchema).min(1),
    edges: z.array(edgeSchema).default([]),
  },
  async (args) => {
    try {
      return ok(await appendToDiagram(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "create_from_mermaid",
  "Create a NEW diagram from Mermaid flowchart text (graph/flowchart TD|LR with the usual node shapes and --> / -.-> / ==> edges). Shapes are mapped to native ones, auto-sized, laid out, and colored.",
  {
    title: z.string().describe("Diagram title."),
    mermaid: z.string().describe("Mermaid flowchart source."),
  },
  async ({ title, mermaid }) => {
    try {
      const spec = parseMermaid(mermaid);
      if (!spec.nodes.length) throw new Error("No nodes parsed from the Mermaid source.");
      const r = await createDiagram({ title: title || spec.title || "Diagram", nodes: spec.nodes, edges: spec.edges });
      return ok({ ...r, note: 'Open or "Reload from disk" in Anvaya to see it.' });
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "describe_diagram",
  "Inspect a diagram's geometry and flag any overlapping boxes, so you can check and fix layout after editing.",
  { name: z.string().describe("The .anvaya file name.") },
  async ({ name }) => {
    try {
      return ok(await describeDiagram(name));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "update_node",
  "Relabel and/or reshape one node by id (from read_diagram). The box auto-refits to the new text.",
  {
    name: z.string(),
    id: z.string().describe("Node id from read_diagram."),
    label: z.string().optional(),
    shape: z.enum(SHAPES).optional(),
  },
  async (args) => {
    try {
      return ok(await updateNode(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "delete_node",
  "Delete a node by id, along with any connectors touching it.",
  { name: z.string(), id: z.string() },
  async (args) => {
    try {
      return ok(await deleteNode(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "set_node_color",
  "Set a node's fill color (hex like #2b6cff), or pass an empty string to reset to the theme default.",
  { name: z.string(), id: z.string(), color: z.string().describe("Hex color, or '' to reset.") },
  async (args) => {
    try {
      return ok(await setNodeColor(args));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "add_edge",
  "Connect two existing nodes (by id) with a directed arrow.",
  { name: z.string(), from: z.string(), to: z.string(), label: z.string().optional() },
  async (args) => {
    try {
      return ok(await addEdge(args));
    } catch (e) {
      return fail(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// A friendly line on stderr (stdout is the MCP channel and must stay clean).
console.error(`[anvaya-mcp] ready — workspace: ${workspaceRoot()}`);
