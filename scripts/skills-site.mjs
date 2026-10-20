// The Pages copy of the agent skills (owner decision, #1656: skills are served and pointed at, not packaged in core/dist, the npm package, the dist
// zip or the NuGet package). scripts/build-pages.mjs calls writeSkillsSite(<site>/skills) after scripts/build-skills.mjs has written dist-skills/:
//
//   skills/<skill>/SKILL.md, skills/<skill>/references/**   the bundle, byte for byte (CRLF as generated)
//   skills/manifest.json                                    version, every file with its size and SRI hash (sha256), sorted, no timestamps
//   skills/index.html                                       each skill, its files and one instruction an agent can follow
//
// The release asset plainkit-skills-<version>.zip (the skill folders at the top of the zip) is unchanged and does not carry these two extra files. Node only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SKILLS_DIR, SKILL_NAMES, root, parseFrontmatter } from './build-skills.mjs';

export const PAGES_URL = 'https://skulmunkie.github.io/plainkit/';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The skill files under dir as [{ path (forward slashes, from dir), data }], sorted. */
export function skillFiles(dir = SKILLS_DIR) {
    if (!fs.existsSync(dir)) throw new Error(`${path.relative(root, dir) || dir} is missing: run node scripts/bootstrap.mjs first`);
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
        .map(e => { const p = path.join(e.parentPath, e.name); return { path: path.relative(dir, p).replaceAll(String.fromCharCode(92), '/'), data: fs.readFileSync(p) }; })
        .sort((a, b) => (a.path < b.path ? -1 : 1));
}

export const skillsManifest = (files, version) => JSON.stringify({
    version,
    files: files.map(f => ({ path: f.path, bytes: f.data.length, integrity: 'sha256-' + crypto.createHash('sha256').update(f.data).digest('base64') })),
}, null, 1) + '\n';

export function skillsIndexHtml(files, version) {
    const sections = SKILL_NAMES.map(name => {
        const own = files.filter(f => f.path.startsWith(name + '/'));
        const fm = parseFrontmatter(own.find(f => f.path === `${name}/SKILL.md`).data.toString('utf8'));
        const items = own.map(f => `<li><a href="${esc(f.path)}">${esc(f.path.slice(name.length + 1))}</a></li>`).join('\n');
        return `<section>\n<h2>${esc(name)}</h2>\n<p>${esc(fm.description)}</p>\n<p>Instruction for an agent: <code>Read ${esc(PAGES_URL)}skills/${esc(name)}/SKILL.md, then open the files under references/ that it names, from the same folder.</code></p>\n<details><summary>${own.length} files</summary>\n<ul>\n${items}\n</ul>\n</details>\n</section>`;
    }).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plainkit agent skills ${esc(version)}</title>
<meta name="color-scheme" content="light dark">
</head>
<body>
<h1>Plainkit agent skills ${esc(version)}</h1>
<p>Plain markdown for a developer agent that builds an app on Plainkit. Nothing here is packaged with the toolkit: point your agent at this page. Claude Code reads a skill folder from <code>.claude/skills/</code>; any other agent can read the files directly, or read <a href="../dist/llms.txt">llms.txt</a>.</p>
<p>Instruction for an agent: <code>Read ${esc(PAGES_URL)}skills/index.html, choose the skill for the project (plainkit-sdk for plain HTML, plainkit-blazor for Blazor), open its SKILL.md and follow it.</code></p>
<p>Every file with its size and SHA-256 integrity hash is in <a href="manifest.json">manifest.json</a>. A zip of both skill folders, ready to unzip into <code>.claude/skills/</code>, is the release asset <code>plainkit-skills-${esc(version)}.zip</code>.</p>
${sections}
</body>
</html>
`;
}

export function writeSkillsSite(outDir, { dir = SKILLS_DIR } = {}) {
    const version = fs.readFileSync(path.join(root, 'core', 'VERSION'), 'utf8').trim();
    const files = skillFiles(dir);
    for (const f of files) { const p = path.join(outDir, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data); }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), skillsManifest(files, version));
    fs.writeFileSync(path.join(outDir, 'index.html'), skillsIndexHtml(files, version));
    return files.length + 2;
}
