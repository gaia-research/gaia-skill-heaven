// Pi's native loader has a global skill-name namespace. These committed copies
// change ONLY metadata names; portable skills remain the sole semantic source.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SURFACES = ["summon", "skill-zero", "skill-heaven", "skill-hell", "skill-ultra"];
const PLUGIN = fileURLToPath(new URL("../plugins/skill-heaven/", import.meta.url));

export function buildPiSkills({ pluginRoot = PLUGIN, check = false } = {}) {
  const output = join(pluginRoot, "dev.skill-heaven.pi", "skills");
  const copies = SURFACES.map(surface => {
    const source = readFileSync(join(pluginRoot, "skills", surface, "SKILL.md"), "utf8");
    const header = `---\nname: ${surface}\n`;
    if (!source.startsWith(header)) throw new Error(`unexpected canonical frontmatter for ${surface}`);
    return { surface, text: `---\nname: skill-heaven-runtime-${surface}\n${source.slice(header.length)}` };
  });
  if (check) {
    const drift = [];
    if (!existsSync(output) || JSON.stringify(readdirSync(output).sort()) !== JSON.stringify([...SURFACES].sort())) drift.push(output);
    for (const { surface, text } of copies) {
      const dir = join(output, surface), file = join(dir, "SKILL.md");
      if (!existsSync(file) || readFileSync(file, "utf8") !== text || JSON.stringify(readdirSync(dir)) !== JSON.stringify(["SKILL.md"])) drift.push(file);
    }
    if (drift.length) throw new Error(`generated Pi skills drift: ${drift.join(", ")}; run node scripts/build-pi-skills.mjs`);
    return;
  }
  // Read and validate every source before replacing only this generated subtree.
  rmSync(output, { recursive: true, force: true });
  for (const { surface, text } of copies) {
    const file = join(output, surface, "SKILL.md");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--check")) throw new Error("usage: node scripts/build-pi-skills.mjs [--check]");
    buildPiSkills({ check: args.includes("--check") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Pi skills build failed");
    process.exitCode = 1;
  }
}
