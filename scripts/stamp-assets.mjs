import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

// Version the entire browser module graph, including generated data. A new
// entry script alone does not invalidate its cached ES-module dependencies.
const dist = new URL('../dist/', import.meta.url);
const files = (await readdir(dist)).filter(name => name.endsWith('.js')).sort();
const revisions = Object.fromEntries(await Promise.all(files.map(async name => {
  const bytes = await readFile(new URL(name, dist));
  return [name, createHash('sha256').update(bytes).digest('hex').slice(0, 12)];
})));
const imports = Object.fromEntries(files.map(name => [`./${name}`, `./${name}?v=${revisions[name]}`]));
const css = await readFile(new URL('style.css', dist));
const cssRevision = createHash('sha256').update(css).digest('hex').slice(0, 12);
const path = new URL('index.html', dist);
const original = await readFile(path, 'utf8');
const block = `  <!-- asset-import-map:start -->\n  <script type="importmap" id="asset-import-map">\n${JSON.stringify({ imports }, null, 2)}\n  </script>\n  <!-- asset-import-map:end -->`;
const marker = /  <!-- asset-import-map:start -->[\s\S]*?  <!-- asset-import-map:end -->/;
let html = marker.test(original) ? original.replace(marker, block) : original.replace('</head>', `${block}\n</head>`);
html = html.replace(/href="\.\/style\.css(?:\?[^\"]*)?"/, `href="./style.css?v=${cssRevision}"`);
html = html.replace(/src="\.\/app\.js(?:\?[^\"]*)?"/, `src="./app.js?v=${revisions['app.js']}"`);

if (process.argv.includes('--check')) {
  if (html !== original) {
    console.error('浏览器资源版本已过期，请运行 npm run build。');
    process.exitCode = 1;
  } else console.log('浏览器入口、样式和全部模块的内容版本一致。');
} else {
  if (html !== original) await writeFile(path, html);
  console.log(`已更新 ${files.length} 个浏览器模块及样式的内容版本。`);
}
