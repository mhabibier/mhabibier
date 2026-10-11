// Native text art: the portrait is stored as ASCII, not as an embedded photo.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const cols = 39;
const rows = 26;
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const frameCount = 8;
const frameSeconds = 0.05;
const cycleSeconds = frameCount * frameSeconds;
const transitionSeconds = 8;
const glyphKeyframes = Array.from({ length: frameCount }, (_, i) =>
  `@keyframes glyph-frame-${i}{0%{opacity:${i === 0 ? 1 : 0}}${i * 100 / frameCount}%{opacity:1}${(i + 1) * 100 / frameCount}%,100%{opacity:0}}`
).join('\n');
const animationCss = `
.ascii-frame,.binary-frame{opacity:0;animation-duration:${cycleSeconds}s;animation-timing-function:steps(1,end);animation-iteration-count:infinite}
.ascii-frame:first-child,.binary-frame:first-child{opacity:1}
.portrait-ascii{opacity:1;animation:ascii-morph ${transitionSeconds}s ease-in-out infinite}
.portrait-binary{opacity:0;animation:binary-morph ${transitionSeconds}s ease-in-out infinite}
${glyphKeyframes}
@keyframes ascii-morph{0%,25%,90%,100%{opacity:1}40%,75%{opacity:0}}
@keyframes binary-morph{0%,25%,90%,100%{opacity:0}40%,75%{opacity:1}}
@media(prefers-reduced-motion:reduce){
 .ascii-frame,.binary-frame{animation:none;opacity:0}
 .ascii-frame:first-child,.binary-frame:first-child{opacity:1}
 .portrait-ascii{animation:none;opacity:1}
 .portrait-binary{animation:none;opacity:0}
}
`;
const typingCss = `
.type-reveal,.typing-cursor{font-family:Consolas,'Liberation Mono','DejaVu Sans Mono',monospace;font-size:16px}
.type-reveal{animation-name:terminal-type;animation-iteration-count:1;animation-fill-mode:both}
.terminal-line{animation-name:terminal-unclip;animation-iteration-count:1;animation-fill-mode:forwards;animation-timing-function:steps(1,end)}
.typing-cursor{opacity:0;animation-name:terminal-cursor,terminal-cursor-visible;animation-iteration-count:1;animation-fill-mode:both,forwards}
@keyframes terminal-type{from{width:0}to{width:var(--line-width)}}
@keyframes terminal-unclip{from{clip-path:var(--typing-clip)}to{clip-path:none}}
@keyframes terminal-cursor{from{transform:translateX(0)}to{transform:translateX(var(--line-width))}}
@keyframes terminal-cursor-visible{0%,99.99%{opacity:1}100%{opacity:0}}
@media(prefers-reduced-motion:reduce){.type-reveal{animation:none;width:var(--line-width)}.terminal-line{animation:none;clip-path:none}.typing-cursor{animation:none;opacity:0}}
`;

function frameLines(lines, frame) {
  if (frame === 0) return lines;
  // Substitute only characters with similar visual weight. Spaces, positions,
  // and the silhouette stay fixed; all profile information stays still.
  const weights = ['@%MW', '#g', 'kj', 'i|!', ';:', '.,'];
  return lines.map((line, y) => [...line].map((char, x) => {
    const group = weights.find((choices) => choices.includes(char));
    if (!group) return char;
    const hash = ((x + 1) * 73856093 ^ (y + 1) * 19349663 ^ frame * 83492791) >>> 0;
    if (hash % 100 >= 28) return char;
    const alternatives = [...group].filter((candidate) => candidate !== char);
    return alternatives[Math.floor(hash / 100) % alternatives.length];
  }).join(''));
}

function asciiArt(lines, animate) {
  const renderText = (frame) => `<text xml:space="preserve">${frame.map((line, i) => `<tspan x="15" y="${30 + i * 19}">${escape(line)}</tspan>`).join('\n')}</text>`;
  if (!animate) return renderText(lines);
  const asciiFrames = Array.from({ length: frameCount }, (_, i) =>
    `<g class="ascii-frame" style="animation-name:glyph-frame-${i}">${renderText(frameLines(lines, i))}</g>`
  ).join('\n');
  const binaryFrames = Array.from({ length: frameCount }, (_, i) =>
    `<g class="binary-frame" style="animation-name:glyph-frame-${i}">${binaryText(lines, i)}</g>`
  ).join('\n');
  return `<g aria-hidden="true"><g class="portrait-ascii">${asciiFrames}</g><g class="portrait-binary">${binaryFrames}</g></g>`;
}

function binaryText(lines, frame) {
  // Keep the same grid and spaces. Digit opacity carries the original ASCII
  // weight so the binary portrait retains its hair, eyes, and facial contours.
  const weights = [['@%MW', 1], ['#g', .86], ['kj', .72], ['i|!', .55], [';:', .4], ['.,', .28]];
  const body = lines.map((line, y) => {
    const runs = [];
    [...line].forEach((char, x) => {
      const opacity = char === ' ' ? 1 : weights.find(([group]) => group.includes(char))?.[1] ?? .55;
      const hash = ((x + 1) * 73856093 ^ (y + 1) * 19349663 ^ frame * 83492791) >>> 0;
      const digit = char === ' ' ? ' ' : String(Math.floor(hash / 100) % 2);
      const previous = runs[runs.length - 1];
      if (previous?.opacity === opacity) previous.text += digit;
      else runs.push({ opacity, text: digit });
    });
    return `<tspan x="15" y="${30 + y * 19}">${runs.map((run) => `<tspan opacity="${run.opacity}">${run.text}</tspan>`).join('')}</tspan>`;
  }).join('\n');
  return `<text xml:space="preserve">${body}</text>`;
}

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

function svgFor(lines, theme, animate = false) {
  const c = theme === 'dark' ? {
    bg: '#161b22', fg: '#c9d1d9', key: '#ffa657', value: '#a5d6ff', muted: '#616e7f', green: '#3fb950'
  } : {
    bg: '#f6f8fa', fg: '#24292f', key: '#953800', value: '#0a3069', muted: '#8c959f', green: '#1a7f37'
  };
  const typingDefs = [];
  let typingOffset = .18;
  const typeLine = (html, y, value) => {
    if (!animate) return html;
    const chars = Math.max(1, value.length);
    const duration = Math.max(.06, chars * .012);
    const delay = typingOffset;
    const id = `terminal-type-${typingDefs.length}`;
    const timing = `--line-width:${chars}ch;animation-duration:${duration.toFixed(3)}s;animation-delay:${delay.toFixed(3)}s;animation-timing-function:steps(${chars},end)`;
    typingDefs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect class="type-reveal" x="405" y="${y - 18}" width="570" height="24" style="${timing}"/></clipPath>`);
    typingOffset += duration + .07;
    // Remove the clip when typing finishes. Font metrics can differ between
    // browsers; completed lines must never lose the final email character.
    const completion = `--typing-clip:url(#${id});animation-duration:${duration.toFixed(3)}s;animation-delay:${delay.toFixed(3)}s`;
    return `<g class="terminal-line" clip-path="url(#${id})" style="${completion}">${html}</g><rect class="typing-cursor" x="405" y="${y - 14}" width="8" height="16" fill="${c.green}" style="${timing}"/>`;
  };
  const text = (x, y, value, color = c.fg, extra = '') => typeLine(`<text x="${x}" y="${y}" fill="${color}" ${extra}>${escape(value)}</text>`, y, value);
  const field = (y, label, value) => {
    const dots = '.'.repeat(Math.max(2, 14 - label.length));
    const html = `<text x="405" y="${y}" fill="${c.fg}"><tspan fill="${c.muted}">. </tspan><tspan fill="${c.key}">${escape(label)}</tspan>:<tspan fill="${c.muted}"> ${dots} </tspan><tspan fill="${c.value}">${escape(value)}</tspan></text>`;
    return typeLine(html, y, `. ${label}: ${dots} ${value}`);
  };
  const heading = (y, label) => text(405, y, label + ' ' + '-'.repeat(Math.max(3, 53 - label.length)));
  const terminal = [
    heading(30, 'habibie@ciphernet'),
    field(68, 'Focus', 'Cybersecurity & networking'),
    field(94, 'Status', 'Learning & exploring'),
    text(405, 132, '. ', c.muted),
    heading(170, '- Interests'),
    field(208, 'Network', 'Security & ethical hacking'),
    field(234, 'Analysis', 'Vulnerability analysis'),
    field(260, 'Defense', 'Network defense'),
    field(286, 'Cloud', 'Infrastructure & DevSecOps'),
    text(405, 324, '. ', c.muted),
    heading(362, '- Contact'),
    field(400, 'Instagram', '@mhabibierabbani'),
    field(426, 'Email', 'mhabibierabbani@gmail.com'),
    text(405, 478, '$ learn; share; connect', c.green),
    text(405, 506, '// Curiosity. Security. Connection.', c.muted)
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="985" height="530" viewBox="0 0 985 530" role="img" aria-labelledby="title desc" xml:space="preserve">
<title id="title">Habibie — ASCII terminal GitHub profile</title>
<desc id="desc">A coarse portrait formed entirely from 39 columns and 26 rows of text characters${animate ? ', with changing glyphs and a smooth transition between ASCII and binary digits' : ''}, beside Habibie's cybersecurity interests and contact information${animate ? ', typed line by line once on load' : ''}.</desc>
<style>text{font-family:Consolas,'Liberation Mono','DejaVu Sans Mono',monospace;font-size:16px;white-space:pre}text,tspan{white-space:pre}${animate ? animationCss + typingCss : ''}</style>
${animate ? `<defs>${typingDefs.join('\n')}</defs>` : ''}
<rect width="985" height="530" fill="${c.bg}" rx="15"/>
<g fill="${c.fg}">${asciiArt(lines, animate)}</g>
${terminal}
</svg>\n`;
}

async function main() {
  const textPath = path.join(root, 'assets', 'habibie-ascii.txt');
  if (process.argv[2]) await fs.writeFile(textPath, await photoToText(process.argv[2]));
  const lines = (await fs.readFile(textPath, 'utf8')).trimEnd().split('\n');
  const portraitSvgFor = (animate) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="530" viewBox="0 0 400 530" xml:space="preserve">
<title>Habibie — native ASCII portrait</title>
<desc>A coarse ASCII portrait${animate ? ' with changing glyphs and a smooth transition to binary digits; reduced motion displays a still ASCII portrait' : ''}.</desc>
<style>text{font-family:Consolas,'Liberation Mono','DejaVu Sans Mono',monospace;font-size:16px;white-space:pre}${animate ? animationCss : ''}</style>
<rect width="400" height="530" fill="#161b22" rx="15"/>
<g fill="#c9d1d9">${asciiArt(lines, animate)}</g>
</svg>\n`;
  await fs.writeFile(path.join(root, 'assets', 'habibie-ascii.svg'), portraitSvgFor(true));
  await sharp(Buffer.from(portraitSvgFor(false)), { density: 144 }).png().toFile(path.join(root, 'assets', 'habibie-ascii.png'));
  for (const theme of ['dark', 'light']) {
    const stem = path.join(root, 'assets', `profile-ascii-${theme}`);
    await fs.writeFile(`${stem}.svg`, svgFor(lines, theme, true));
    await sharp(Buffer.from(svgFor(lines, theme)), { density: 144 }).png().toFile(`${stem}.png`);
    console.log(`Built profile-ascii-${theme}: animated native SVG text and static PNG`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
