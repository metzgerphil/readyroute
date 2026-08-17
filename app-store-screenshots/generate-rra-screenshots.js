const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../backend/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'rra-public-release');
const ICON = path.join(ROOT, 'driver-app/assets/readyroute-app-icon.png');
const SIZE = { width: 1242, height: 2688 };

async function dataUri(filePath) {
  return `data:image/png;base64,${(await fs.readFile(filePath)).toString('base64')}`;
}

function phone(content) {
  return `<div class="phone"><div class="screen"><div class="island"></div><div class="status"><span>9:41</span><span>5G&nbsp;&nbsp;100%</span></div><div class="app">${content}</div></div></div>`;
}

function shell(icon, title, subtitle, content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden}
    body{font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;color:#173042;background:radial-gradient(circle at 0 0,rgba(255,98,0,.16),transparent 30%),linear-gradient(160deg,#fffaf5,#f2f7fa 58%,#e9f4ef)}
    .canvas{width:100%;height:100%;padding:78px 78px 64px;position:relative}.brand{display:flex;align-items:center;gap:17px}.brand img{width:70px;height:70px;border-radius:16px;box-shadow:0 12px 30px rgba(23,48,66,.15)}.brand b{font-size:38px;letter-spacing:-2px}.brand em{color:#ff6200;font-style:normal;font-weight:600}
    h1{font-size:73px;line-height:.98;letter-spacing:-4px;margin:42px 0 18px;max-width:1000px}h1 em{color:#e85a00;font-style:normal}.sub{font-size:31px;line-height:1.25;color:#536673;font-weight:700;max-width:970px;margin:0}
    .stage{position:absolute;left:70px;right:70px;top:650px;bottom:52px;display:grid;place-items:center}.phone{width:700px;height:1940px;background:#111820;border-radius:88px;padding:18px;box-shadow:0 38px 90px rgba(23,48,66,.28)}.screen{height:100%;border-radius:71px;overflow:hidden;background:#f5f7f8;position:relative}.island{position:absolute;z-index:3;top:18px;left:50%;transform:translateX(-50%);width:190px;height:54px;border-radius:30px;background:#050505}.status{height:94px;padding:0 52px;display:flex;align-items:center;justify-content:space-between;font-size:25px;font-weight:850}.app{padding:35px 34px 42px}.wordmark{text-align:center;font-size:39px;font-weight:950;letter-spacing:-2px}.wordmark span{color:#ff6200;font-weight:550}.app-title{font-size:45px;line-height:1.1;text-align:center;margin:74px 0 0;font-weight:950}.mic{width:222px;height:222px;margin:48px auto 22px;border:8px solid #fff;border-radius:50%;background:#ff6200;display:grid;place-items:center;box-shadow:0 18px 44px rgba(212,84,0,.26)}.mic svg{width:92px;height:92px}.tap{text-align:center;font-size:28px;font-weight:850}.composer{margin-top:50px;border:2px solid #d8e1e7;background:#fff;border-radius:28px;min-height:98px;padding:16px 16px 16px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 10px 24px rgba(23,48,66,.06)}.placeholder{font-size:27px;color:#7d8b95}.send{width:68px;height:68px;border-radius:50%;background:#ff6200;color:#fff;display:grid;place-items:center;font-size:34px;font-weight:950}.tip{margin:40px auto 0;max-width:520px;color:#71808b;font-size:23px;text-align:center;line-height:1.45}
    .toprow{display:flex;align-items:center;justify-content:center;position:relative}.back{position:absolute;left:0;font-size:26px;font-weight:850}.question{margin-top:42px;border:2px solid #d8e1e7;border-radius:23px;background:#fff;padding:22px;display:flex;gap:17px;align-items:center;font-size:26px;font-weight:800;line-height:1.28}.accent{width:7px;height:48px;border-radius:4px;background:#ff6200;flex:0 0 auto}.card{margin-top:22px;border:2px solid #d8e1e7;border-radius:31px;background:#fff;padding:28px;box-shadow:0 12px 28px rgba(23,48,66,.07)}.code{background:#173042;color:#fff;border-radius:20px;padding:20px;text-align:center;font-size:29px;font-weight:950;letter-spacing:1px}.answer{font-size:31px;line-height:1.28;font-weight:950;margin:25px 0}.eyebrow{font-size:18px;color:#71808b;font-weight:950;letter-spacing:1.6px;text-transform:uppercase;margin-top:25px}.steps{display:grid;gap:17px;margin-top:18px}.step{display:grid;grid-template-columns:40px 1fr;gap:15px;font-size:24px;line-height:1.35;font-weight:650}.num{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:#ff6200;color:#fff;font-weight:950}.warning{margin-top:24px;border:2px solid #eab65f;border-radius:21px;background:#fff6df;padding:20px;font-size:22px;line-height:1.4}.more{margin-top:22px;border:2px solid #173042;border-radius:20px;padding:18px;text-align:center;font-size:24px;font-weight:900}.clarify-head{display:flex;gap:13px;align-items:center;color:#e85a00;font-size:21px;font-weight:950;letter-spacing:1px;text-transform:uppercase}.qmark{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#ff6200;color:#fff}.prompt{font-size:34px;line-height:1.28;font-weight:950;margin:26px 0}.options{display:grid;gap:17px}.option{border:2px solid #cad6dd;border-radius:21px;padding:23px;font-size:24px;line-height:1.3;font-weight:850;background:#f9fbfc}.option small{display:block;margin-top:6px;color:#6f7e88;font-size:20px;font-weight:650}.privacy-overlay{position:absolute;inset:0;background:rgba(7,29,43,.52);display:flex;align-items:flex-end}.sheet{background:#fff;border-radius:35px 35px 0 0;padding:20px 30px 35px;width:100%}.handle{width:62px;height:7px;border-radius:5px;background:#d7e0e8;margin:0 auto 27px}.sheet h2{font-size:37px;margin:0 0 18px}.sheet p{font-size:22px;line-height:1.45;color:#425563;margin:0 0 16px}.links{color:#e85a00;font-size:21px;font-weight:850;margin:18px 0 24px}.button{border-radius:18px;padding:20px;text-align:center;font-size:22px;font-weight:950;margin-top:13px}.button.primary{background:#ff6200;color:#fff}.button.secondary{border:2px solid #cbd6de;color:#173042}
  </style></head><body><div class="canvas"><div class="brand"><img src="${icon}"><b>ready<em>Route</em></b></div><h1>${title}</h1><p class="sub">${subtitle}</p><div class="stage">${content}</div></div></body></html>`;
}

async function render(browser, filename, markup) {
  const page = await browser.newPage({ viewport: SIZE });
  await page.setContent(markup, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, filename) });
  await page.close();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const icon = await dataUri(ICON);
  const chromePath = '/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });

  await render(browser, 'iphone-01-ask.png', shell(icon, 'Ask by voice or text. <em>Get to the point.</em>', 'A focused operational reference for authorized, trained drivers.', phone(`
    <div class="wordmark">ready<span>Route</span></div><div class="app-title">What do you need help with?</div>
    <div class="mic"><svg viewBox="0 0 64 64" fill="none"><rect x="22" y="8" width="20" height="34" rx="10" fill="white"/><path d="M14 31c0 11 7 19 18 19s18-8 18-19M32 50v8M22 58h20" stroke="white" stroke-width="5" stroke-linecap="round"/></svg></div><div class="tap">Tap to ask</div>
    <div class="composer"><span class="placeholder">Type your question</span><span class="send">↑</span></div><p class="tip">Ask about one operational situation at a time. Ready Route will ask for a missing detail when it matters.</p>`)));

  await render(browser, 'iphone-02-answer.png', shell(icon, 'Verified guidance with <em>clear next steps.</em>', 'The concise answer comes first, followed by the conditions that matter.', phone(`
    <div class="toprow"><span class="back">‹ Back</span><div class="wordmark">ready<span>Route</span></div></div>
    <div class="question"><span class="accent"></span><span>The pickup customer is here and confirms there are no packages.</span></div>
    <div class="card"><div class="code">USE CODE 20</div><div class="answer">Use Code 20 because the customer confirmed no package after the pickup attempt.</div><div class="eyebrow">What to do</div><div class="steps">
      <div class="step"><span class="num">1</span><span>Open the correct listed pickup and choose Close (Zero Pkg).</span></div><div class="step"><span class="num">2</span><span>Confirm the package count is 0.</span></div><div class="step"><span class="num">3</span><span>Select Code 20 and tap DONE.</span></div>
    </div><div class="warning"><b>Watch for</b><br>Do not use Code 20 for a closed location or a cancellation before an attempt.</div><div class="more">More Info</div></div>`)));

  await render(browser, 'iphone-03-clarify.png', shell(icon, 'When one detail changes the answer, <em>RRA asks.</em>', 'No guessing: the driver confirms the condition before receiving the procedure.', phone(`
    <div class="toprow"><span class="back">‹ Back</span><div class="wordmark">ready<span>Route</span></div></div>
    <div class="question"><span class="accent"></span><span>The listed pickup was canceled. Which code?</span></div>
    <div class="card"><div class="clarify-head"><span class="qmark">?</span><span>One detail first</span></div><div class="prompt">Was an attempt made at the pickup location?</div><div class="options"><div class="option">No attempt was made<small>The pickup was canceled before I went there.</small></div><div class="option">I attempted it and the location was closed<small>No packages were obtained.</small></div><div class="option">I attempted it and spoke with the customer<small>The customer confirmed there were no packages.</small></div><div class="option">Not sure</div></div></div>`)));

  await render(browser, 'iphone-04-privacy.png', shell(icon, 'You choose how AI language processing is used.', 'Questions are filtered for common identifiers, and the operational procedure still comes from approved ReadyRoute knowledge.', phone(`
    <div class="wordmark">ready<span>Route</span></div><div class="app-title">What do you need help with?</div><div class="mic" style="opacity:.35"></div>
    <div class="privacy-overlay"><div class="sheet"><div class="handle"></div><h2>Privacy and AI processing</h2><p>Ready Route Answers checks approved ReadyRoute procedures. When needed to understand how you phrased a question, ReadyRoute may send the question and recent conversation context to OpenAI for language processing.</p><p>OpenAI does not decide the procedure and does not receive your password. ReadyRoute removes common contact, address, link, and package identifiers before AI processing.</p><p>If you decline, you can still use answers that ReadyRoute can match without new AI processing.</p><div class="links">Privacy Policy&nbsp;&nbsp;&nbsp; Terms</div><div class="button primary">Allow AI processing</div><div class="button secondary">Continue without AI processing</div></div></div>`)));

  await browser.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
