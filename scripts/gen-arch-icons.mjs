// Generate src/document/arch-icons.ts — cloud-architecture, on-prem device,
// and network icons for software/infrastructure diagrams.
//
//   • AWS service icons  — from @iconify-json/logos  (SVG Logos, CC0), full colour
//   • Azure / GCP        — from logos + @iconify-json/devicon (MIT), full colour
//   • On-prem / network  — from @iconify-json/carbon (IBM Carbon, Apache-2.0), monochrome (tintable)
//   • Architecture       — vendor-neutral compute/integration from Carbon, monochrome
//
// Brand names/logos are trademarks of their respective owners; the icon artwork
// is provided under the licenses above. Monochrome icons recolour via the icon
// renderer (currentColor → fill); colour icons keep their own palette.
//
// Run: node scripts/gen-arch-icons.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);

const SETS = {
  logos: require("@iconify-json/logos/icons.json"),
  devicon: require("@iconify-json/devicon/icons.json"),
  carbon: require("@iconify-json/carbon/icons.json"),
};

function svgFor(setKey, name, mono) {
  const data = SETS[setKey];
  const ic = data.icons[name];
  if (!ic) return null;
  const w = ic.width || data.width || 24;
  const h = ic.height || data.height || 24;
  const left = ic.left || 0;
  const top = ic.top || 0;
  const vb = `${left} ${top} ${w} ${h}`;
  // Explicit pixel size is required: an SVG used as an <img>/texture with only a
  // viewBox rasterises at 0×0 (renders black). Scale the long side to 256 for a
  // crisp texture while preserving aspect ratio.
  const scale = 256 / Math.max(w, h);
  const pw = Math.round(w * scale);
  const ph = Math.round(h * scale);
  // Monochrome (carbon): set fill=currentColor on the root so the renderer can recolour it.
  const fillAttr = mono ? ` fill="currentColor"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${vb}"${fillAttr}>${ic.body}</svg>`;
}

// [set, name, display, category, mono]
const CURATED = [
  // ---- AWS (full colour) ----
  ...[
    ["aws-ec2", "EC2"], ["aws-lambda", "Lambda"], ["aws-fargate", "Fargate"],
    ["aws-ecs", "ECS"], ["aws-eks", "EKS"], ["aws-elastic-beanstalk", "Elastic Beanstalk"],
    ["aws-lightsail", "Lightsail"], ["aws-batch", "Batch"],
    ["aws-s3", "S3"], ["aws-glacier", "S3 Glacier"], ["aws-backup", "Backup"],
    ["aws-rds", "RDS"], ["aws-aurora", "Aurora"], ["aws-dynamodb", "DynamoDB"],
    ["aws-elasticache", "ElastiCache"], ["aws-redshift", "Redshift"],
    ["aws-neptune", "Neptune"], ["aws-documentdb", "DocumentDB"], ["aws-timestream", "Timestream"],
    ["aws-vpc", "VPC"], ["aws-route53", "Route 53"], ["aws-cloudfront", "CloudFront"],
    ["aws-elb", "Elastic Load Balancing"], ["aws-api-gateway", "API Gateway"],
    ["aws-app-mesh", "App Mesh"], ["aws-appsync", "AppSync"],
    ["aws-sqs", "SQS"], ["aws-sns", "SNS"], ["aws-eventbridge", "EventBridge"],
    ["aws-kinesis", "Kinesis"], ["aws-msk", "MSK"], ["aws-mq", "MQ"],
    ["aws-step-functions", "Step Functions"], ["aws-appflow", "AppFlow"],
    ["aws-glue", "Glue"], ["aws-athena", "Athena"], ["aws-quicksight", "QuickSight"],
    ["aws-open-search", "OpenSearch"], ["aws-cloudsearch", "CloudSearch"],
    ["aws-iam", "IAM"], ["aws-cognito", "Cognito"], ["aws-kms", "KMS"],
    ["aws-secrets-manager", "Secrets Manager"], ["aws-certificate-manager", "Certificate Manager"],
    ["aws-shield", "Shield"], ["aws-waf", "WAF"],
    ["aws-cloudformation", "CloudFormation"], ["aws-cloudwatch", "CloudWatch"],
    ["aws-cloudtrail", "CloudTrail"], ["aws-config", "Config"],
    ["aws-systems-manager", "Systems Manager"], ["aws-opsworks", "OpsWorks"], ["aws-xray", "X-Ray"],
    ["aws-codebuild", "CodeBuild"], ["aws-codecommit", "CodeCommit"],
    ["aws-codedeploy", "CodeDeploy"], ["aws-codepipeline", "CodePipeline"],
    ["aws-amplify", "Amplify"], ["aws-ses", "SES"],
  ].map(([n, d]) => ["logos", n, d, "AWS", false]),

  // ---- Azure (full colour) ----
  ...[
    ["logos", "microsoft-azure", "Azure", false],
    ["devicon", "azuresqldatabase", "Azure SQL Database", false],
    ["devicon", "azuredatafactory", "Azure Data Factory", false],
    ["devicon", "azurelogicapps", "Azure Logic Apps", false],
    ["devicon", "azuredevops", "Azure DevOps", false],
  ].map(([s, n, d]) => [s, n, d, "Azure", false]),

  // ---- Google Cloud (full colour) ----
  ...[
    ["logos", "google-cloud", "Google Cloud"],
    ["logos", "google-cloud-platform", "Google Cloud Platform"],
    ["logos", "google-cloud-functions", "Cloud Functions"],
    ["logos", "google-cloud-run", "Cloud Run"],
  ].map(([s, n, d]) => [s, n, d, "Google Cloud", false]),

  // ---- On-prem & network (monochrome, tintable) ----
  ...[
    ["bare-metal-server", "Server"], ["bare-metal-server-02", "Server (rack)"],
    ["server-dns", "DNS server"], ["server-proxy", "Proxy server"],
    ["data-center", "Data center"],
    ["router", "Router"], ["router-wifi", "Wi-Fi router"],
    ["switch-layer-3", "Switch (L3)"], ["switch-layer-2", "Switch (L2)"],
    ["firewall", "Firewall"], ["gateway", "Gateway"], ["gateway-vpn", "VPN gateway"],
    ["load-balancer-classic", "Load balancer"], ["load-balancer-global", "Global load balancer"],
    ["load-balancer-network", "Network LB"], ["load-balancer-application", "Application LB"],
    ["vpn-connection", "VPN connection"], ["content-delivery-network", "CDN"],
    ["network-3", "Network"], ["private-network", "Private network"],
    ["subnet-acl-rules", "Subnet / ACL"], ["vlan", "VLAN"], ["dns-services", "DNS"],
    ["block-storage", "Block storage"], ["object-storage", "Object storage"],
    ["file-storage", "File storage"], ["volume-block-storage", "Storage volume"],
    ["data-base", "Database"], ["data-base-alt", "Database (alt)"],
  ].map(([n, d]) => ["carbon", n, d, "On-Prem", true]),

  // ---- Architecture (vendor-neutral, monochrome) ----
  ...[
    ["cloud", "Cloud"], ["cloud-services", "Cloud services"], ["cloud-app", "Cloud app"],
    ["virtual-machine", "Virtual machine"], ["container-services", "Containers"],
    ["container-registry", "Container registry"], ["kubernetes", "Kubernetes"],
    ["kubernetes-pod", "Pod"], ["function", "Function"], ["serverless-fleet", "Serverless"],
    ["microservices-1", "Microservices"], ["api", "API"], ["api-key", "API key"],
    ["gateway-api", "API gateway"], ["message-queue", "Message queue"],
    ["event", "Event"], ["flow-stream", "Stream"], ["flow-data", "Data flow"],
    ["webhook", "Webhook"], ["security", "Security"], ["encryption", "Encryption"],
    ["certificate", "Certificate"], ["digital-identity", "Identity"],
    ["laptop", "Laptop"], ["mobile", "Mobile"], ["devices", "Devices"],
    ["user", "User"], ["group", "Group"], ["bot", "Bot"], ["cloud-monitoring", "Monitoring"],
  ].map(([n, d]) => ["carbon", n, d, "Architecture", true]),
];

const out = [];
const seen = new Set();
const missing = [];
for (const [set, name, display, cat, mono] of CURATED) {
  const svg = svgFor(set, name, mono);
  if (!svg) { missing.push(`${set}:${name}`); continue; }
  const key = `${set}-${name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ key, name: display, cat, svg, mono });
}

const file =
  `// AUTO-GENERATED by scripts/gen-arch-icons.mjs.\n` +
  `// Sources: SVG Logos (CC0), IBM Carbon (Apache-2.0), Devicon (MIT).\n` +
  `// Brand names/logos are trademarks of their respective owners.\n` +
  `// Do not edit by hand — re-run the generator instead.\n\n` +
  `export interface ArchIcon {\n  key: string;\n  name: string;\n  cat: string;\n  svg: string;\n  mono: boolean;\n}\n\n` +
  `export const ARCH_ICONS: ArchIcon[] = ${JSON.stringify(out)};\n`;

writeFileSync(new URL("../src/document/arch-icons.ts", import.meta.url), file);
console.error(`wrote ${out.length} arch icons`);
if (missing.length) console.error(`skipped (not found): ${missing.join(", ")}`);
