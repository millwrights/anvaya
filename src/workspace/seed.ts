import type { AnvayaDoc } from "@/document/doc";
import type { Commands } from "@/commands/commands";

// A first-run diagram that demonstrates the unified canvas: a mind map on the
// left, a small flowchart on the right, and a relationship edge linking them.
export function seedWelcome(doc: AnvayaDoc, cmd: Commands) {
  if (doc.allNodes().length > 0) return;
  doc.setTitle("Welcome to Anvaya");

  // ── Mind map ──
  const root = cmd.createNode({ shape: "topic", x: -260, y: 0, text: "Anvaya" });
  cmd.makeMindmapRoot(root.id);
  const ideas = cmd.addChildTopic(root.id)!;
  cmd.setText(ideas.id, "Ideas");
  const structure = cmd.addChildTopic(root.id)!;
  cmd.setText(structure.id, "Structure");
  const ship = cmd.addChildTopic(root.id)!;
  cmd.setText(ship.id, "Ship");

  const a = cmd.addChildTopic(ideas.id)!;
  cmd.setText(a.id, "Mind maps");
  const b = cmd.addChildTopic(ideas.id)!;
  cmd.setText(b.id, "Flowcharts");
  const c = cmd.addChildTopic(structure.id)!;
  cmd.setText(c.id, "One canvas");

  cmd.reflowLayout(root.layoutId ?? doc.getNode(root.id)!.layoutId!);

  // ── Flowchart ──
  const start = cmd.createNode({ shape: "ellipse", x: 360, y: -60, text: "Start" });
  const decide = cmd.createNode({ shape: "diamond", x: 360, y: 60, text: "Idea clear?" });
  const draw = cmd.createNode({ shape: "rounded", x: 360, y: 200, text: "Draw it" });
  const done = cmd.createNode({ shape: "ellipse", x: 600, y: 200, text: "Done" });
  cmd.connect(start.id, decide.id, "flow");
  cmd.connect(decide.id, draw.id, "flow");
  cmd.connect(draw.id, done.id, "flow");

  // ── The unifying link: mind map ↔ flowchart on the same canvas ──
  cmd.connect(b.id, start.id, "relation");
}
