// Built-in icon library — clean monochrome line icons that recolor cleanly
// (they draw in `currentColor`, which the renderer swaps for the node's tint).
// Icon path data is adapted from Feather Icons (https://feathericons.com, MIT).

export interface IconDef {
  key: string;
  name: string;
  cat: string;
  /** Inner SVG markup (paths/shapes) on a 0 0 24 24 viewBox. */
  body: string;
}

/** Wrap an icon body in a standalone SVG document (128px so it rasterizes crisp). */
export function iconSvg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    body +
    `</svg>`
  );
}

import lineIcons from "./line-icons.json";

export const ICONS: IconDef[] = lineIcons as IconDef[];

// ── unified library: line icons + brand logos + cloud-architecture icons ──────
import { BRAND_ICONS } from "./brand-icons";
import { ARCH_ICONS } from "./arch-icons";

export interface LibIcon {
  key: string;
  name: string;
  cat: string;
  /** Full standalone SVG markup, ready to drop / preview. */
  svg: string;
  /** Default tint when dropped (brand color for logos, light for line icons). */
  tint: string;
  /** Monochrome icons recolor via the inspector; full-color icons keep their palette. */
  mono: boolean;
}

/** Wrap a single filled brand path (simple-icons) so it recolors via currentColor. */
function brandSvg(path: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24">` +
    `<path fill="currentColor" d="${path}"/></svg>`
  );
}

export const ALL_ICONS: LibIcon[] = [
  ...ICONS.map((i) => ({ key: i.key, name: i.name, cat: i.cat, svg: iconSvg(i.body), tint: "#e8ebf0", mono: true })),
  ...BRAND_ICONS.map((b) => ({ key: b.key, name: b.name, cat: b.cat, svg: brandSvg(b.path), tint: `#${b.hex}`, mono: true })),
  ...ARCH_ICONS.map((a) => ({ key: a.key, name: a.name, cat: a.cat, svg: a.svg, tint: a.mono ? "#e8ebf0" : "", mono: a.mono })),
];

export const ICON_CATEGORIES = [...new Set(ALL_ICONS.map((i) => i.cat))];

/** Fast key → icon lookup (used by the AI diagram builder). */
export const ICON_BY_KEY = new Map<string, LibIcon>(ALL_ICONS.map((i) => [i.key, i]));

// ── icon-node geometry (shared by the renderer, commands, and the AI builder) ──
// An icon node is a square glyph with an optional caption beneath it. These
// constants keep the layout, the renderer, and the exporter in agreement.
export const ICON_GLYPH = 72; // glyph square side (px)
export const ICON_CAP_W = 132; // caption wrap width / node width when captioned
export const ICON_CAP_LH = 18; // caption line height
export const ICON_CAP_GAP = 6; // gap between glyph and caption

/** Box size for an icon node with the given caption (square if unlabeled). */
export function iconNodeSize(label?: string): { w: number; h: number } {
  const t = (label ?? "").trim();
  if (!t) return { w: ICON_GLYPH, h: ICON_GLYPH };
  const perLine = Math.max(6, Math.floor(ICON_CAP_W / 7));
  const lines = Math.min(3, Math.max(1, Math.ceil(t.length / perLine)));
  return { w: ICON_CAP_W, h: ICON_GLYPH + lines * ICON_CAP_LH + ICON_CAP_GAP };
}

/**
 * A compact, curated icon vocabulary for the one-shot AI prompt — the keys the
 * model may put on a node's `icon` field. (The full library is larger; the MCP
 * server exposes all of it through a searchable `list_icons` tool instead.)
 */
export const ICON_PROMPT_CATALOG = `Generic: server, database, cloud, cpu, harddrive, network, balancer, box, layers, wifi, monitor, browser, phone, globe, terminal, code, user, users, bot, lock, key, shield, mail, send, bell, folder, file, barchart, check, x, alert, clock, search, settings, link, gitbranch, zap
Languages: javascript, typescript, python, go, rust, openjdk, c, cplusplus, php, ruby, swift, kotlin, scala, elixir, dart, html5, css3
Frameworks: react, vuedotjs, angular, svelte, nextdotjs, nodedotjs, express, deno, bun, django, flask, fastapi, spring, rubyonrails, laravel, dotnet, flutter, tailwindcss, graphql, grpc
Databases/brands: postgresql, mysql, mongodb, redis, sqlite, mariadb, elasticsearch, apachecassandra, neo4j, supabase, firebase, prisma, snowflake, apachekafka, rabbitmq, nginx, docker, kubernetes, terraform, ansible, jenkins, githubactions, gitlab, prometheus, grafana, git, github, stripe, linux, ubuntu, debian
AWS (full-color): logos-aws-ec2, logos-aws-lambda, logos-aws-ecs, logos-aws-eks, logos-aws-s3, logos-aws-rds, logos-aws-aurora, logos-aws-dynamodb, logos-aws-elasticache, logos-aws-redshift, logos-aws-vpc, logos-aws-route53, logos-aws-cloudfront, logos-aws-elb, logos-aws-api-gateway, logos-aws-sqs, logos-aws-sns, logos-aws-eventbridge, logos-aws-kinesis, logos-aws-step-functions, logos-aws-iam, logos-aws-cognito, logos-aws-kms, logos-aws-cloudwatch, logos-aws-cloudformation
Azure/GCP: logos-microsoft-azure, devicon-azuresqldatabase, devicon-azuredatafactory, logos-google-cloud, logos-google-cloud-run, logos-google-cloud-functions
On-prem/network: carbon-bare-metal-server, carbon-data-center, carbon-router, carbon-switch-layer-3, carbon-firewall, carbon-gateway, carbon-gateway-vpn, carbon-load-balancer-classic, carbon-content-delivery-network, carbon-network-3, carbon-block-storage, carbon-object-storage, carbon-data-base
Architecture: carbon-cloud, carbon-virtual-machine, carbon-container-services, carbon-kubernetes, carbon-function, carbon-microservices-1, carbon-api, carbon-gateway-api, carbon-message-queue, carbon-event, carbon-security, carbon-user, carbon-group, carbon-laptop, carbon-mobile`;
