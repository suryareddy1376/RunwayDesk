import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const OUT = path.join(os.tmpdir(), 'mobile-390-shots');
const routes = ['/', '/login', '/dashboard'];
const browser = await chromium.launch();
for (const r of routes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => errors.push('goto: ' + e.message));
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const vw = window.innerWidth;
    const sw = document.documentElement.scrollWidth;
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > 390.5) {
        const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,3).join('.') : '');
        over.push({ tag, right: Math.round(rect.right), overBy: Math.round(rect.right - 390) });
      }
    }
    over.sort((a, b) => b.overBy - a.overBy);
    return { url: location.pathname, vw, sw, overflowPx: sw - vw, top5: over.slice(0, 5), overCount: over.length };
  });
  const shot = path.join(OUT, 'route' + r.replace(/\//g, '_').replace(/^_$/, 'root') + '.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log(JSON.stringify({ route: r, ...info, screenshot: shot, consoleErrors: errors }, null, 2));
  await ctx.close();
}
await browser.close();
