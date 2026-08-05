// Core domain types for the Anvaya scene graph.
// These are plain data shapes; the authoritative store is the Yjs document
// (see doc.ts). Everything here is CRDT-friendly: flat records, stable string
// IDs, no positional identity.

export type NodeId = string;
export type EdgeId = string;

/** A visual shape kind. Extensible — plugins can register more later. */
export type NodeShape =
  | "topic" // mind-map topic (auto-laid-out)
  | "rect"
  | "rounded"
  | "ellipse"
  | "diamond" // flowchart decision
  | "note"
  | "sticky" // colored sticky note
  | "frame" // titled section/container drawn behind content
  | "image" // embedded image (uses `src`)
  | "text" // label only, no box
  | "draw"; // freehand pen stroke (uses `points`)

export interface NodeStyle {
  fill: string;
  stroke: string;
  textColor: string;
  fontSize: number;
  strokeWidth: number;
  /** Rich-text formatting for the node's label (block-level, applies to all text). */
  fontFamily?: string; // key into FONT_FAMILIES (see theme.ts); absent → default sans
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: "left" | "center" | "right";
}

export interface SceneNode {
  id: NodeId;
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** For mind-map trees: the parent topic. `null` for free/flowchart nodes. */
  parentId: NodeId | null;
  /** Which layout (if any) owns this node's position. */
  layoutId: string | null;
  collapsed: boolean;
  locked?: boolean;
  /** Drop shadow (on by default; set false to disable per node). */
  shadow?: boolean;
  /** Group membership — selecting one member selects the whole group. */
  groupId?: string;
  style: Partial<NodeStyle>;
  z: number;
  /** Freehand path for shape "draw": flat [x0,y0,x1,y1,…] relative to x,y. */
  points?: number[];
  /** Data URL for shape "image". */
  src?: string;
}

export type EdgeKind =
  | "relation" // mind-map cross links / generic association
  | "flow"; // directed flowchart connector

export type EdgeRouting = "straight" | "curved" | "step";

export interface SceneEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  kind: EdgeKind;
  routing: EdgeRouting;
  label: string;
  style: Partial<{ stroke: string; width: number }>;
  /** Arrowheads at the start (tail) and end (head). */
  arrowStart?: boolean;
  arrowEnd?: boolean;
  /** Arrowhead shape used for whichever ends are shown. Default "triangle". */
  arrowHead?: "triangle" | "open" | "thin" | "diamond" | "circle";
  /** Draggable bend points (world coords) the connector routes through. */
  waypoints?: { x: number; y: number }[];
  /**
   * Free attachment points, as fractions [0..1] of the node's box. When set, the
   * endpoint stays glued to that exact spot on the object instead of auto-routing
   * to the side facing the other node. Absent → automatic border routing.
   */
  sourceAnchor?: { fx: number; fy: number };
  targetAnchor?: { fx: number; fy: number };
  /**
   * Open-ended endpoints: a free-floating point in world coords, not tied to any
   * object. When set, the matching `source`/`target` id is "" (unattached) and the
   * arrow simply ends in empty space. Absent → the endpoint follows its node.
   */
  sourcePoint?: { x: number; y: number };
  targetPoint?: { x: number; y: number };
  /** Paint order shared with nodes. Absent → renders below objects (the default). */
  z?: number;
}

export type LayoutAlgorithm = "mindmap-right" | "mindmap-radial";

export interface LayoutRecord {
  id: string;
  rootId: NodeId;
  algorithm: LayoutAlgorithm;
  params: Record<string, number>;
}

/** The normalized, human-readable on-disk document (`.anvaya` file). */
export interface AnvayaDocument {
  schema: "anvaya/diagram@1";
  id: string;
  title: string;
  /** Optional folder path for organizing many diagrams (e.g. "Work/Auth"). */
  folder?: string;
  /** Free-form tags for searching/filtering. */
  tags?: string[];
  nodes: SceneNode[];
  edges: SceneEdge[];
  layouts: LayoutRecord[];
}
