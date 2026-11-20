// Збирає один самодостатній HTML-файл (прототип) із демо-даними: стилі, код і дані — всередині.
// Запуск: node tools/make_prototype.mjs  ->  prototype/syto-prototype.html
// CoLaba Production
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../pipeline/build.mjs';
import { demoSources, demoFetch } from './demo_feeds.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(), 'syto-proto-'));
await writeFile(join(dir, 'sources.json'), JSON.stringify({ sources: demoSources }));
const now = Date.now();
const { data } = await build({ sourcesPath: join(dir, 'sources.json'), outPath: join(dir, 'news.json'), cachePath: join(dir, 'tr.json'),
  env: { ANTHROPIC_API_KEY: 'demo' }, fetchImpl: demoFetch(now), now, log: () => {} });
data.demo = true;

let html = await readFile(join(ROOT, 'site/index.html'), 'utf8');
const css = await readFile(join(ROOT, 'site/styles.css'), 'utf8');
const js = await readFile(join(ROOT, 'site/app.js'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
html = html
  .replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="icon"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script src="app.js"></script>', () => `<script>window.__SYTO_DATA__ = ${json};</script>\n<script>\n${js}</script>`)
  .replace('<title>Syto — новини без шуму</title>', '<title>Syto — прототип</title>');
await mkdir(join(ROOT, 'prototype'), { recursive: true });
await writeFile(join(ROOT, 'prototype/syto-prototype.html'), html);
console.log('prototype/syto-prototype.html', html.length, 'байт;', data.stories.length, 'демо-новин');
