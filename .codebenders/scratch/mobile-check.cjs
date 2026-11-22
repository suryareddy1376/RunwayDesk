const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:5173';
const PORT = 9333;
const CHROME = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = { browser: CHROME, console: [] };

const MEASURE = `(()=>{
const R=e=>{if(!e)return null;const b=e.getBoundingClientRect();return{x:Math.round(b.left),y:Math.round(b.top),r:Math.round(b.right),b:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height)}};
const I=(a,b)=>!!(a&&b)&&!(a.r<=b.x||b.r<=a.x||a.b<=b.y||b.b<=a.y);
const wrap=document.querySelector('.recharts-wrapper');
const groups=[...document.querySelectorAll('.recharts-reference-line')].map(g=>({line:R(g.querySelector('line')||g.querySelector('path')),labels:[...g.querySelectorAll('text')].filter(t=>t.textContent.trim()).map(t=>({t:t.textContent.trim(),r:R(t)}))}));
const labels=groups.flatMap(g=>g.labels);
const labelLabelOverlaps=[];
for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(I(labels[i].r,labels[j].r))labelLabelOverlaps.push([labels[i].t,labels[j].t]);
const labelLineHits=[];
for(const g of groups)for(const l of g.labels){if(l.r&&g.line){const cy=g.line.y+g.line.h/2;if(!(l.r.b<cy||l.r.y>cy))labelLineHits.push(l.t);}}
const labelsOutsideChart=labels.filter(l=>l.r&&wrap&&(l.r.x<R(wrap).x||l.r.r>R(wrap).r)).map(l=>l.t);
const tt=document.querySelector('.recharts-tooltip-wrapper');
const box=tt?(tt.querySelector('.recharts-default-tooltip')||tt):null;
const vis=tt?getComputedStyle(tt).visibility:null;
const tr=box&&vis==='visible'?R(box):null;
const ctrls=[...document.querySelectorAll('button,a[href],input,select,textarea,[role=button]')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0}).map(e=>({label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,40),r:R(e)}));
return{
  viewport:[innerWidth,innerHeight],
  chart:R(wrap),
  referenceGroups:groups.map(g=>({line:g.line,labels:g.labels.map(l=>({t:l.t,r:l.r}))})),
  labelLabelOverlaps,
  labelLineHits,
  labelsOutsideChart,
  tooltip:{visibility:vis,rect:tr,text:box?box.textContent.trim().slice(0,120):null,insideChartX:!!(tr&&wrap&&tr.x>=R(wrap).x&&tr.r<=R(wrap).r),insideViewportX:!!(tr&&tr.x>=0&&tr.r<=innerWidth)},
  controlsUnderTooltip:tr?ctrls.filter(c=>I(tr,c.r)).map(c=>c.label):[],
  labelsUnderTooltip:tr?labels.filter(l=>I(tr,l.r)).map(l=>l.t):[]
};
})()`;

async function main() {
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(OUT, 'chrome-profile')}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  try {
    let version;
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
      catch { await sleep(250); }
    }
    if (!version) throw new Error('DevTools port did not open');
    const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id); pend.delete(m.id);
        m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        report.console.push('EXCEPTION: ' + (d.exception?.description || d.text));
      }
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
        report.console.push(m.params.type.toUpperCase() + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
        report.console.push('LOG ' + m.params.entry.level + ': ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const waitFor = async (expr, label, ms = 20000) => {
      const t = Date.now();
      while (Date.now() - t < ms) {
        try { if (await ev(expr)) return true; } catch {}
        await sleep(200);
      }
      throw new Error('timeout waiting for ' + label);
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const go = async url => { await send('Page.navigate', { url: BASE + url }); await sleep(1000); };

    // ---------- (b) FAQ accordion on landing page ----------
    await go('/');
    await waitFor("document.querySelectorAll('#faq details').length>0", 'FAQ details');
    report.faq = { reducedMotion: await ev("matchMedia('(prefers-reduced-motion: reduce)').matches"),
                   viewport: await ev("[innerWidth, innerHeight, document.documentElement.scrollWidth]") };
    const n = await ev("document.querySelectorAll('#faq details').length");
    const sampler = idx => `(async()=>{
      const d=document.querySelectorAll('#faq details')[${idx}];
      const w=d.querySelector(':scope > div');
      const s=d.querySelector('summary');
      const h=()=>Math.round(w.getBoundingClientRect().height);
      const before={open:d.open,rendered:w.getClientRects().length,h:h()};
      const t0=performance.now(); const samples=[];
      s.click();
      await new Promise(res=>{const f=()=>{const t=performance.now()-t0;samples.push([Math.round(t),h()]);if(t<900)requestAnimationFrame(f);else res();};f();});
      return {before,after:{open:d.open,h:h()},samples};
    })()`;
    report.faq.items = [];
    for (let i = 0; i < n; i++) {
      const summarize = o => {
        const fin = o.after.h;
        const mid = o.samples.filter(([t, v]) => v > 0 && v < fin).length;
        return { before: o.before, after: o.after, framesTotal: o.samples.length, midFrames: mid,
                 first: o.samples.slice(0, 10) };
      };
      const o = await ev(sampler(i)); await sleep(900);
      const c = await ev(sampler(i)); await sleep(900);
      report.faq.items.push({ item: i, open: summarize(o), close: summarize(c) });
    }

    // ---------- (a) Overview chart at 390px ----------
    await go('/login');
    await waitFor("[...document.querySelectorAll('button')].some(b=>/Launch Demo Studio/.test(b.textContent))", 'Launch Demo Studio button');
    await ev("[...document.querySelectorAll('button')].find(b=>/Launch Demo Studio/.test(b.textContent)).click()");
    await waitFor("location.pathname==='/dashboard' && !!document.querySelector('.recharts-wrapper')", 'dashboard chart', 30000);
    report.dashboardPath = await ev("location.pathname");
    await ev("document.querySelector('.recharts-wrapper').scrollIntoView({block:'center'})");
    await sleep(400);
    const pt = async (fx, fy) => ev(`(()=>{const b=document.querySelector('.recharts-surface').getBoundingClientRect();return [b.left+b.width*${fx}, b.top+b.height*${fy}];})()`);
    report.hover = [];
    for (const fx of [0.5, 0.15, 0.85]) {
      const [x, y] = await pt(fx, 0.5);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sleep(400);
      const m = await ev(MEASURE);
      report.hover.push({ fx, pointer: [Math.round(x), Math.round(y)], m });
      if (fx === 0.5) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, 'overview-390-hover.png'), Buffer.from(shot.data, 'base64'));
      }
    }
    report.tap = [];
    const [tx, ty] = await pt(0.5, 0.5);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    await sleep(400);
    report.tap.push({ phase: 'touchStart', m: await ev(MEASURE) });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
    report.tap.push({ phase: 'touchEnd', m: await ev(MEASURE) });

    ws.close();
  } catch (e) {
    report.error = e.message;
    process.exitCode = 1;
  } finally {
    proc.kill();
    fs.writeFileSync(path.join(OUT, 'mobile-check-report.json'), JSON.stringify(report, null, 2));
    console.log(report.error ? 'FAILED: ' + report.error : 'DONE');
    console.log('report: ' + path.join(OUT, 'mobile-check-report.json'));
  }
}
main();

