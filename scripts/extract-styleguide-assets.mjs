import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const original = readFileSync(
  'docs/wireframe/Style Guide Restaurante Popular.html',
  'utf8',
);
const outer = JSON.parse(
  original.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1],
);
const decode = (item) => {
  const data = Buffer.from(item.data, 'base64');
  return item.compressed ? gunzipSync(data) : data;
};
const page = decode(outer['df09813c-ac68-49a9-aa79-b23471db2ddc']).toString(
  'utf8',
);
const resources = JSON.parse(
  page.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/)[1],
);
mkdirSync('apps/web/public/fonts', { recursive: true });
mkdirSync('apps/web/public/brand', { recursive: true });
for (const [id, path] of [
  [
    '42db12b2-68b8-4a22-acd0-2897ef9a9710',
    'apps/web/public/fonts/dm-sans.woff2',
  ],
  [
    '23329b40-d3eb-438f-a5b4-a296ac14a7b3',
    'apps/web/public/fonts/manrope.woff2',
  ],
  [
    '0ca35922-a8ca-4f03-9e24-e00779639258',
    'apps/web/public/brand/programa.png',
  ],
]) {
  if (!resources[id]) throw Error(`Resource not found: ${id}`);
  writeFileSync(path, decode(resources[id]));
  console.log(path, resources[id].mime, decode(resources[id]).length);
}
writeFileSync(
  'apps/web/public/fonts/OFL-notices.txt',
  original.match(/<!--([\s\S]*?)-->/)[1].trim() + '\n',
);
