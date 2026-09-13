const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
if (path.dirname(dist) !== root || path.basename(dist) !== "dist") throw new Error("Unsafe output path");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "data"), { recursive: true });

const pages = ["index.html", "teams.html", "guide.html", "studio.html", "about.html"];
const assets = ["site.css", "site.js", "teams.js", "studio.js"];
const plain = ["icon.svg", "manifest.webmanifest", "robots.txt", "sitemap.xml"];
const replacements = new Map();

for (const name of assets) {
  const content = fs.readFileSync(path.join(root, name));
  const extension = path.extname(name);
  const stem = path.basename(name, extension);
  const digest = crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
  const outputName = `${stem}.${digest}${extension}`;
  fs.writeFileSync(path.join(dist, outputName), content);
  replacements.set(`/${name}`, `/${outputName}`);
}
for (const name of pages) {
  let content = fs.readFileSync(path.join(root, name), "utf8");
  for (const [from, to] of replacements) content = content.replaceAll(from, to);
  fs.writeFileSync(path.join(dist, name), content, "utf8");
}
for (const name of plain) fs.copyFileSync(path.join(root, name), path.join(dist, name));
fs.copyFileSync(path.join(root, "data", "map-snapshot.json"), path.join(dist, "data", "map-snapshot.json"));

const forbiddenNames = new Set(["api", "lib", "test", "research", "scripts", "node_modules"]);
for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
  if (forbiddenNames.has(entry.name) || entry.name.endsWith(".py") || entry.name === "package.json") {
    throw new Error(`Forbidden production artifact: ${entry.name}`);
  }
}
console.log(`Built ${fs.readdirSync(dist).length} top-level public artifacts in dist/`);
