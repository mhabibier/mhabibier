// Native text art: the portrait is stored as ASCII, not as an embedded photo.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const cols = 39;
const rows = 26;
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function photoToText(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const luminance = new Float32Array(width * height);
  for (let p = 0; p < luminance.length; p++) {
    luminance[p] = .2126 * data[p * channels] + .7152 * data[p * channels + 1] + .0722 * data[p * channels + 2];
  }
  // Clear only dark pixels connected to the photo's outer edge (avatar corners).
  const background = new Uint8Array(width * height);
  const queue = [];
  const visit = (p) => { if (!background[p] && luminance[p] < 75) { background[p] = 1; queue.push(p); } };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], x = p % width, y = Math.floor(p / width);
    if (x > 0) visit(p - 1); if (x < width - 1) visit(p + 1);
    if (y > 0) visit(p - width); if (y < height - 1) visit(p + width);
  }
  const glyphs = ['@@%', '%M%', 'MWM', 'W#g', '#kg', 'kij', 'j|i', '|!j', '!;i', ';:,', ':,.', '., ', '   '];
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      let total = 0, count = 0;
      for (let sy = Math.floor(y * height / rows); sy < Math.floor((y + 1) * height / rows); sy++) {
        for (let sx = Math.floor(x * width / cols); sx < Math.floor((x + 1) * width / cols); sx++) {
          const p = sy * width + sx;
          total += background[p] ? 255 : luminance[p]; count++;
        }
      }
      const brightness = total / count;
      const bucket = Math.min(glyphs.length - 1, Math.floor(brightness / 256 * glyphs.length));
      const choices = glyphs[bucket];
      line += choices[(x * 17 + y * 31) % choices.length];
    }
    lines.push(line.replace(/ +$/, ''));
  }
  return lines.join('\n') + '\n';
}

function svgFor(lines, theme) {
  const c = theme === 'dark' ? {
    bg: '#161b22', fg: '#c9d1d9', key: '#ffa657', value: '#a5d6ff', muted: '#616e7f', green: '#3fb950'
  } : {
    bg: '#f6f8fa', fg: '#24292f', key: '#953800', value: '#0a3069', muted: '#8c959f', green: '#1a7f37'
  };
  const text = (x, y, value, color = c.fg, extra = '') => `<text x="${x}" y="${y}" fill="${color}" ${extra}>${escape(value)}</text>`;
  const field = (y, label, value) => `<text x="405" y="${y}" fill="${c.fg}"><tspan fill="${c.muted}">. </tspan><tspan fill="${c.key}">${escape(label)}</tspan>:<tspan fill="${c.muted}"> ${'.'.repeat(Math.max(2, 14 - label.length))} </tspan><tspan fill="${c.value}">${escape(value)}</tspan></text>`;
  const heading = (y, label) => text(405, y, label + ' ' + '-'.repeat(Math.max(3, 53 - label.length)));
  const art = lines.map((line, i) => `<tspan x="15" y="${30 + i * 19}">${escape(line)}</tspan>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="985" height="530" viewBox="0 0 985 530" role="img" aria-labelledby="title desc" xml:space="preserve">
<title id="title">Habibie — ASCII terminal GitHub profile</title>
<desc id="desc">A coarse portrait formed entirely from 39 columns and 26 rows of text characters, beside Habibie's cybersecurity interests and contact information.</desc>
<style>text{font-family:Consolas,'Liberation Mono','DejaVu Sans Mono',monospace;font-size:16px;white-space:pre}text,tspan{white-space:pre}</style>
<rect width="985" height="530" fill="${c.bg}" rx="15"/>
<text fill="${c.fg}" xml:space="preserve">${art}</text>
${heading(30, 'habibie@ciphernet')}
${field(68, 'Focus', 'Cybersecurity & networking')}
${field(94, 'Status', 'Learning & exploring')}
${text(405, 132, '. ', c.muted)}
${heading(170, '- Interests')}
${field(208, 'Network', 'Security & ethical hacking')}
${field(234, 'Analysis', 'Vulnerability analysis')}
${field(260, 'Defense', 'Network defense')}
${field(286, 'Cloud', 'Infrastructure & DevSecOps')}
${text(405, 324, '. ', c.muted)}
${heading(362, '- Contact')}
${field(400, 'Instagram', '@mhabibierabbani')}
${field(426, 'Email', 'mhabibierabbani@gmail.com')}
${text(405, 478, '$ learn; share; connect', c.green)}
${text(405, 506, '// Curiosity. Security. Connection.', c.muted)}
</svg>\n`;
}

async function main() {
  const textPath = path.join(root, 'assets', 'habibie-ascii.txt');
  if (process.argv[2]) await fs.writeFile(textPath, await photoToText(process.argv[2]));
  const lines = (await fs.readFile(textPath, 'utf8')).trimEnd().split('\n');
  const portraitSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="530" viewBox="0 0 400 530" xml:space="preserve">
<title>Habibie — native ASCII portrait</title>
<rect width="400" height="530" fill="#161b22" rx="15"/>
<text fill="#c9d1d9" font-family="Consolas,Liberation Mono,DejaVu Sans Mono,monospace" font-size="16" style="white-space:pre">${lines.map((line, i) => `<tspan x="15" y="${30 + i * 19}">${escape(line)}</tspan>`).join('\n')}</text>
</svg>\n`;
  await fs.writeFile(path.join(root, 'assets', 'habibie-ascii.svg'), portraitSvg);
  await sharp(Buffer.from(portraitSvg), { density: 144 }).png().toFile(path.join(root, 'assets', 'habibie-ascii.png'));
  for (const theme of ['dark', 'light']) {
    const svg = svgFor(lines, theme);
    const stem = path.join(root, 'assets', `profile-ascii-${theme}`);
    await fs.writeFile(`${stem}.svg`, svg);
    await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`${stem}.png`);
    console.log(`Built profile-ascii-${theme}: native SVG text and PNG`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
