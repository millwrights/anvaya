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
  appendToDiagram,
  createDiagram,
  listDiagrams,
  readDiagram,
  workspaceRoot,
} from "./anvaya.mjs";

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
  "Create a NEW diagram from a graph of nodes and edges. Shapes are auto-laid-out top-down and colored by the app. Returns the created file name.",
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

const transport = new StdioServerTransport();
await server.connect(transport);
// A friendly line on stderr (stdout is the MCP channel and must stay clean).
console.error(`[anvaya-mcp] ready — workspace: ${workspaceRoot()}`);
