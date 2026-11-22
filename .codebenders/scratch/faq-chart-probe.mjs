import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:5173';
const profile = join(process.cwd(), '.codebenders', 'scratch', 'chrome-tester');
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { faq: [], chart: [], consoleErrors: [] };
let ws;
try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch { await sleep(250); }
  }
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      report.consoleErrors.push('exception: ' + JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      report.consoleErrors.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      report.consoleErrors.push('log ' + m.params.entry.level + ': ' + m.params.entry.text.slice(0, 300));
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  const waitFor = async (expr, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { try { if (await evaluate(expr)) return true; } catch {} await sleep(150); }
    throw new Error('timeout waiting for: ' + expr);
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // (a) FAQ
  await send('Page.navigate', { url: BASE + '/' });
  await waitFor(`document.querySelectorAll('details summary').length > 0`);
  await sleep(500);
  report.faq.push({ pageScrollWidth: await evaluate(`document.documentElement.scrollWidth`), innerWidth: await evaluate(`innerWidth`) });
  const n = await evaluate(`document.querySelectorAll('details').length`);
  const sampler = (i) => `new Promise((resolve) => {
    const d = document.querySelectorAll('details')[${i}];
    const grid = d.querySelector('summary').nextElementSibling;
    const hs = []; const t0 = performance.now();
    const tick = () => { hs.push(Math.round(grid.getBoundingClientRect().height * 10) / 10);
      if (performance.now() - t0 < 700) requestAnimationFrame(tick); else resolve({ open: d.open, heights: hs }); };
    tick();
  })`;
  for (let i = 0; i < n; i++) {
    const q = await evaluate(`(() => { const s = document.querySelectorAll('details summary')[${i}]; s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { text: s.textContent.trim().slice(0, 60), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await sleep(200);
    const q2 = await evaluate(`(() => { const r = document.querySelectorAll('details summary')[${i}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const openP = evaluate(sampler(i));
    await clickAt(q2.x, q2.y);
    const opened = await openP;
    const closeP = evaluate(sampler(i));
    await clickAt(q2.x, q2.y);
    const closed = await closeP;
    const uniq = (h) => new Set(h).size;
    report.faq.push({ item: q.text, opened: { open: opened.open, uniqueHeights: uniq(opened.heights), first: opened.heights[0], last: opened.heights.at(-1), samples: opened.heights.slice(0, 12) }, closed: { open: closed.open, uniqueHeights: uniq(closed.heights), first: closed.heights[0], last: closed.heights.at(-1), samples: closed.heights.slice(0, 12) } });
  }

  // (b) Chart
  await send('Page.navigate', { url: BASE + '/login' });
  await waitFor(`[...document.querySelectorAll('button')].some((b) => /launch studio sandbox/i.test(b.textContent))`);
  const btn = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => /launch studio sandbox/i.test(b.textContent)); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await sleep(200);
  const btn2 = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => /launch studio sandbox/i.test(b.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  report.chart.push({ clickedButton: btn.text });
  await clickAt(btn2.x, btn2.y);
  await waitFor(`location.pathname === '/dashboard'`);
  await waitFor(`!!document.querySelector('.recharts-wrapper')`);
  await sleep(1200);
  await evaluate("document.querySelector('.recharts-wrapper').scrollIntoView({ block: 'center' })"); await sleep(600);
  const geo = await evaluate(`(() => { const w = [...document.querySelectorAll('.recharts-wrapper')].find((el) => el.textContent.includes('Safe Buffer')) || document.querySelector('.recharts-wrapper'); const r = w.getBoundingClientRect(); const s = w.querySelector('.recharts-surface'); const sr = s ? s.getBoundingClientRect() : r; return { wrapper: [r.left, r.top, r.width, r.height].map((v) => Math.round(v)), surfaceRect: [sr.left, sr.top, sr.width, sr.height].map((v) => Math.round(v)), x: r.left + r.width * 0.5, y: r.top + r.height * 0.5, left: r.left, width: r.width }; })()`);
  report.chart.push({ wrapperCount: await evaluate(`document.querySelectorAll('.recharts-wrapper').length`), wrapper: geo.wrapper, surface: geo.surfaceRect, scrollWidth: await evaluate(`document.documentElement.scrollWidth`) });
  const measure = `(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const inter = (a, b) => a && b && !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
    const tipEl = document.querySelector('.recharts-tooltip-wrapper');
    const tipVis = tipEl ? getComputedStyle(tipEl).visibility : 'none';
    const tip = tipEl ? rect(tipEl) : null;
    const labels = [...document.querySelectorAll('.recharts-wrapper text')].filter((t) => /Safe Buffer|Danger Line/.test(t.textContent)).map((t) => ({ text: t.textContent, box: rect(t) }));
    const lines = [...document.querySelectorAll('.recharts-reference-line line, .recharts-reference-line-line')].map((l) => rect(l));
    const labelOverlap = labels.length === 2 ? inter(labels[0].box, labels[1].box) : 'n/a';
    const labelLine = labels.map((lb) => ({ text: lb.text, lineInsideLabelY: lines.some((ln) => ln.t >= lb.box.t && ln.t <= lb.box.b) }));
    const tipOverLabels = labels.filter((lb) => inter(tip, lb.box)).map((lb) => lb.text);
    const controls = [...document.querySelectorAll('button, a, input, select, [role=button]')].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && inter(tip, rect(c)); }).map((c) => (c.textContent || c.getAttribute('aria-label') || c.tagName).trim().slice(0, 40));
    return { tipVisibility: tipVis, tooltip: tip, tooltipText: tipEl ? tipEl.textContent.slice(0, 120) : null, labels, lineCount: lines.length, lines, labelOverlap, labelLine, tipOverLabels, tipOverControls: controls };
  })()`;
  const points = [0.2, 0.5, 0.8];
  for (const f of points) {
    const x = geo.left + geo.width * f;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: geo.y });
    await sleep(500);
    report.chart.push({ hoverAtFraction: f, at: [Math.round(x), Math.round(geo.y)], ...(await evaluate(measure)) });
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await sleep(400);
  report.chart.push({ afterMouseLeave: await evaluate(measure) });
  report.chart.push({ tooltipTimeline: 'see hover samples above' });
} catch (e) {
  report.error = String(e.message || e).slice(0, 500);
} finally {
  ws?.close();
  chrome.kill();
  console.log(JSON.stringify(report, null, 2));
}

