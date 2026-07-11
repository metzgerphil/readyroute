const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../backend/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'app-store-screenshots');
const fleetMapPath = path.join(ROOT, 'landing-page/assets/mvp-fleet-map-source.png');
const mobilePath = path.join(ROOT, 'landing-page/assets/mvp-mobile-app-source.png');
const logoPath = path.join(ROOT, 'driver-app/assets/readyroute-app-icon.png');

async function dataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
  const data = await fs.readFile(filePath);
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data.toString('base64')}`;
}

function html({ width, height, title, subtitle, theme = 'light', body }) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
        body {
          font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
          color: #102233;
          background:
            radial-gradient(circle at 10% 0%, rgba(255, 104, 24, 0.16), transparent 33%),
            linear-gradient(145deg, #fffaf6 0%, #f7fbff 52%, #eef7f3 100%);
        }
        .canvas { width: ${width}px; height: ${height}px; padding: ${width < 1500 ? 82 : 122}px; position: relative; }
        .brand-row { display: flex; align-items: center; gap: 18px; margin-bottom: ${width < 1500 ? 42 : 64}px; }
        .brand-icon { width: ${width < 1500 ? 72 : 92}px; height: ${width < 1500 ? 72 : 92}px; border-radius: 21%; box-shadow: 0 16px 42px rgba(17, 34, 51, 0.14); }
        .brand-name { font-weight: 950; font-size: ${width < 1500 ? 39 : 55}px; letter-spacing: 0; }
        .brand-name span { color: #f45a18; }
        .headline { max-width: ${width < 1500 ? 980 : 1600}px; font-size: ${width < 1500 ? 78 : 102}px; line-height: 0.96; letter-spacing: 0; font-weight: 950; margin: 0; }
        .headline em { color: #f45a18; font-style: normal; }
        .subhead { max-width: ${width < 1500 ? 900 : 1540}px; color: #526475; font-size: ${width < 1500 ? 35 : 47}px; line-height: 1.18; font-weight: 760; margin: ${width < 1500 ? 24 : 34}px 0 ${width < 1500 ? 54 : 78}px; }
        .stage { position: absolute; left: ${width < 1500 ? 70 : 110}px; right: ${width < 1500 ? 70 : 110}px; bottom: ${width < 1500 ? 70 : 104}px; top: ${width < 1500 ? 760 : 760}px; display: flex; align-items: center; justify-content: center; }
        .phone-frame {
          width: ${width < 1500 ? 664 : 710}px; height: ${width < 1500 ? 1358 : 1430}px; border-radius: 86px;
          background: #101820; padding: 18px; box-shadow: 0 34px 88px rgba(16, 34, 51, 0.24);
        }
        .phone-screen { width: 100%; height: 100%; border-radius: 70px; background: #f8fafc; overflow: hidden; position: relative; }
        .phone-notch { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); width: 182px; height: 50px; background: #000; border-radius: 28px; z-index: 2; }
        .phone-status { height: 88px; display: flex; justify-content: space-between; align-items: center; padding: 0 52px; font-size: 26px; font-weight: 850; }
        .phone-content { padding: 22px 44px 44px; }
        .pill { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 14px 22px; background: #eef3f8; color: #102233; font-size: 24px; font-weight: 850; }
        .orange { color: #f45a18; }
        .dark-panel { background: #122938; color: white; border-radius: 46px; padding: 42px; }
        .card { background: white; border: 2px solid #dbe5ee; border-radius: 28px; padding: 26px; box-shadow: 0 12px 28px rgba(16, 34, 51, 0.06); }
        .mini-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .mini-card { border: 2px solid #dbe5ee; border-radius: 24px; padding: 22px; background: white; }
        .mini-label { color: #657484; text-transform: uppercase; font-weight: 950; font-size: 18px; letter-spacing: 3px; }
        .mini-value { font-weight: 950; font-size: 42px; margin-top: 10px; }
        .mock-table { width: 100%; border-collapse: collapse; font-size: 28px; font-weight: 800; }
        .mock-table th { text-align: left; color: #657484; text-transform: uppercase; letter-spacing: 4px; font-size: 22px; padding: 22px 24px; background: #f3f6f9; }
        .mock-table td { padding: 25px 24px; border-top: 2px solid #dbe5ee; }
        .badge { display: inline-flex; border-radius: 999px; padding: 9px 16px; background: #e9fbef; color: #1f7a43; font-weight: 950; font-size: 22px; }
        .portal-shell {
          width: 100%; height: 100%; border-radius: 38px; background: white; overflow: hidden;
          box-shadow: 0 26px 68px rgba(16, 34, 51, 0.16); border: 2px solid #dbe5ee;
        }
        .portal-crop { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }
        .floating-note {
          position: absolute; right: ${width < 1500 ? 68 : 108}px; bottom: ${width < 1500 ? 80 : 118}px;
          background: #122938; color: white; border-radius: 28px; padding: ${width < 1500 ? 24 : 34}px ${width < 1500 ? 28 : 42}px;
          font-size: ${width < 1500 ? 28 : 38}px; font-weight: 900; box-shadow: 0 24px 60px rgba(16, 34, 51, 0.22);
        }
      </style>
    </head>
    <body class="${theme}">
      <div class="canvas">
        <div class="brand-row">
          <img class="brand-icon" src="${logoUri}">
          <div class="brand-name">Ready<span>Route</span></div>
        </div>
        <h1 class="headline">${title}</h1>
        <p class="subhead">${subtitle}</p>
        ${body}
      </div>
    </body>
  </html>`;
}

function phoneChrome(content) {
  return `<div class="phone-frame"><div class="phone-screen"><div class="phone-notch"></div><div class="phone-status"><span>9:41</span><span>5G 100%</span></div><div class="phone-content">${content}</div></div></div>`;
}

let logoUri;
let fleetUri;
let mobileUri;

async function render(browser, name, width, height, markup) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(markup, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, name), type: 'png' });
  await page.close();
}

async function main() {
  logoUri = await dataUri(logoPath);
  fleetUri = await dataUri(fleetMapPath);
  mobileUri = await dataUri(mobilePath);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const iphone = { width: 1242, height: 2688 };
  const ipad = { width: 2048, height: 2732 };

  await render(browser, 'iphone-01-dispatch-command.png', iphone.width, iphone.height, html({
    ...iphone,
    title: 'Run dispatch with <em>less guesswork.</em>',
    subtitle: 'See route readiness, pickups, deliveries, and the day’s work from one manager view.',
    body: `<div class="stage">${phoneChrome(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;"><span class="pill">Manager Mode</span><span style="font-weight:950;color:#f45a18;font-size:26px;">Bridge CSA</span></div>
      <h2 style="font-size:54px;line-height:1;margin:0 0 8px;font-weight:950;">Dashboard</h2>
      <p style="font-size:25px;color:#657484;font-weight:850;margin:0 0 26px;">Monday, June 1</p>
      <div class="card" style="border-color:#b7ebc9;background:#f1fff6;margin-bottom:22px;"><div style="font-size:29px;font-weight:950;">All 13 routes dispatch-ready</div><div style="font-size:24px;color:#4f6f5d;font-weight:800;margin-top:6px;">0 drivers missing route info</div></div>
      <div class="mini-grid" style="grid-template-columns:1fr 1fr;margin-bottom:22px;">
        <div class="mini-card"><div class="mini-label">Deliveries</div><div class="mini-value">1,142</div></div>
        <div class="mini-card"><div class="mini-label">Pickups</div><div class="mini-value">42</div></div>
        <div class="mini-card"><div class="mini-label">Completed</div><div class="mini-value">187</div></div>
        <div class="mini-card"><div class="mini-label">Exceptions</div><div class="mini-value orange">3</div></div>
      </div>
      <div class="card">
        <div style="font-size:29px;font-weight:950;margin-bottom:18px;">Route readiness</div>
        <div style="display:grid;gap:14px;">
          <div style="display:flex;justify-content:space-between;font-size:25px;font-weight:900;"><span>823 Vlad Fedoryshyn</span><span class="badge">Ready</span></div>
          <div style="display:flex;justify-content:space-between;font-size:25px;font-weight:900;"><span>841 Adrian Morales</span><span class="badge">Ready</span></div>
          <div style="display:flex;justify-content:space-between;font-size:25px;font-weight:900;"><span>847 Denzel Ayala</span><span class="badge">Ready</span></div>
        </div>
      </div>
    `)}</div>`
  }));

  await render(browser, 'iphone-02-driver-stop-clarity.png', iphone.width, iphone.height, html({
    ...iphone,
    title: 'Give drivers the <em>details that matter.</em>',
    subtitle: 'Access codes, delivery notes, customer contact, and package context stay clear at the stop.',
    body: `<div class="stage">${phoneChrome(`
      <a style="color:#2678ff;font-size:28px;font-weight:800;">‹ Back</a>
      <h2 style="font-size:48px;line-height:1.05;margin:30px 0 16px;font-weight:950;">6924 Los Vientos Serenos</h2>
      <div style="display:flex;gap:12px;margin-bottom:26px;"><span class="pill">Pending</span><span class="pill">Delivery</span></div>
      <div class="card" style="margin-bottom:22px;">
        <div class="mini-label">Customer Contact</div>
        <div style="font-size:38px;font-weight:950;margin:16px 0;">Joseph Lambert</div>
        <div style="display:flex;justify-content:space-between;align-items:center;border:2px solid #dbe5ee;border-radius:20px;padding:16px 20px;font-size:29px;font-weight:900;"><span>760-613-3783</span><span class="orange">Call</span></div>
      </div>
      <div class="card" style="border-color:#ffd9c5;margin-bottom:22px;">
        <div class="mini-label orange">Access + Instructions</div>
        <div style="font-size:37px;font-weight:950;margin-top:16px;">Gate #5719</div>
        <div style="font-size:26px;color:#657484;font-weight:850;margin-top:8px;">1st house after 6930. Leave at front door.</div>
      </div>
      <div class="card">
        <div style="font-size:35px;font-weight:950;margin-bottom:20px;">Delivery Intel</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;"><span class="pill">House</span><span class="pill">1 package</span><span class="pill">SID 2581</span></div>
      </div>
    `)}</div>`
  }));

  await render(browser, 'iphone-03-fleet-tools.png', iphone.width, iphone.height, html({
    ...iphone,
    title: 'Manage fleet work <em>from the phone.</em>',
    subtitle: 'Vehicles, maintenance, VEDR, CSA switching, and access codes move with the manager.',
    body: `<div class="stage">${phoneChrome(`
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:22px;"><div style="width:70px;height:70px;border-radius:22px;background:#f45a18;color:white;display:grid;place-items:center;font-size:34px;font-weight:950;">P</div><div><div style="font-size:34px;font-weight:950;">Phillip</div><div style="font-size:24px;color:#657484;font-weight:850;">Bridge Transportation</div></div></div>
      <div class="card" style="border-color:#d5b8ff;background:#f7f0ff;margin-bottom:22px;"><div style="font-size:31px;font-weight:950;color:#5d1a9b;">Manager Mode</div><div style="font-size:23px;color:#6d5c7a;font-weight:800;margin-top:6px;">Switch CSA workspaces anytime</div></div>
      <div class="card" style="margin-bottom:22px;">
        <div class="mini-label">CSA Workspace</div>
        <div style="display:grid;gap:12px;margin-top:16px;">
          <div style="border:2px solid #b7ebc9;background:#f1fff6;border-radius:18px;padding:16px 18px;display:flex;justify-content:space-between;font-size:25px;font-weight:950;"><span>Bridge Transportation</span><span style="color:#1f7a43;">Current</span></div>
          <div style="border:2px solid #dbe5ee;border-radius:18px;padding:16px 18px;display:flex;justify-content:space-between;font-size:25px;font-weight:950;"><span>PV Delivery Inc</span><span style="color:#657484;">Switch</span></div>
        </div>
      </div>
      <div style="display:grid;gap:16px;">
        ${[
          ['Vehicles', 'Track assignments and maintenance'],
          ['VEDR Providers', 'Keep safety providers organized'],
          ['Access Codes', 'Save gate codes for every route'],
          ['Settings', 'Manage drivers, tools, and preferences']
        ].map(([label, detail]) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;"><div><div style="font-size:29px;font-weight:950;">${label}</div><div style="font-size:21px;color:#657484;font-weight:800;margin-top:3px;">${detail}</div></div><div style="color:#9aa8b4;font-size:34px;font-weight:950;">›</div></div>`).join('')}
      </div>
    `)}</div>`
  }));

  await render(browser, 'ipad-01-command-center.png', ipad.width, ipad.height, html({
    ...ipad,
    title: 'A command center for every CSA.',
    subtitle: 'ReadyRoute brings routes, vehicles, drivers, and live route context together for contractors.',
    body: `<div class="stage" style="top:720px;"><div class="portal-shell"><img class="portal-crop" src="${fleetUri}"></div></div><div class="floating-note">13 routes · 1,142 stops · 2 drivers on road</div>`
  }));

  await render(browser, 'ipad-02-route-map-review.png', ipad.width, ipad.height, html({
    ...ipad,
    title: 'Review routes before they roll.',
    subtitle: 'Spot missing pins, address warnings, pickups, deliveries, and route coverage before dispatch.',
    body: `<div class="stage" style="top:720px;"><div class="portal-shell" style="padding:44px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:34px;">
        <div><div class="mini-label orange">Dispatch Review</div><div style="font-size:58px;font-weight:950;">Route 823</div><div style="font-size:32px;color:#657484;font-weight:850;">153 deliveries · 7 pickups · 5 stops need review</div></div>
        <div class="badge" style="font-size:32px;padding:16px 26px;">Ready after review</div>
      </div>
      <div style="display:grid;grid-template-columns:410px 1fr;gap:28px;height:calc(100% - 124px);">
        <div style="display:grid;gap:20px;align-content:start;">
          ${['826 N Juniper St Apt 10','702 N Fig St Apt 101','130 Market Pl','6924 Los Vientos Serenos'].map((text, index) => `<div class="card" style="${index === 1 ? 'border-color:#f45a18;background:#fff7f1;' : ''}"><div style="display:flex;gap:18px;"><div style="width:50px;height:50px;border-radius:50%;background:${index === 1 ? '#f45a18' : '#102233'};color:white;display:grid;place-items:center;font-weight:950;">${index + 1}</div><div><div style="font-size:28px;font-weight:950;">${text}</div><div style="font-size:22px;color:#657484;font-weight:850;margin-top:8px;">Access + building intel attached</div></div></div></div>`).join('')}
        </div>
        <div style="border-radius:32px;background:#eef5f8;position:relative;overflow:hidden;border:2px solid #dbe5ee;">
          <svg width="100%" height="100%" viewBox="0 0 1000 900" preserveAspectRatio="none">
            <rect width="1000" height="900" fill="#edf5f8"/>
            ${Array.from({ length: 24 }).map((_, i) => `<path d="M${-100 + i * 58} 0 L${200 + i * 42} 900" stroke="#d7e2ea" stroke-width="10"/>`).join('')}
            ${Array.from({ length: 14 }).map((_, i) => `<path d="M0 ${60 + i * 64} C300 ${20 + i * 64}, 650 ${110 + i * 64}, 1000 ${55 + i * 64}" stroke="#d7e2ea" stroke-width="10" fill="none"/>`).join('')}
            <path d="M120 160 C220 250 300 270 380 360 C470 465 550 525 650 590 C760 660 780 760 860 820" stroke="#2f77ff" stroke-width="14" fill="none"/>
            ${[[190,210],[260,250],[340,330],[420,410],[500,470],[590,540],[690,640],[760,720],[840,800],[500,320],[620,380],[720,470]].map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="42" fill="white" stroke="${i<8?'#f45a18':'#102233'}" stroke-width="8"/><text x="${p[0]}" y="${p[1]+12}" text-anchor="middle" font-size="34" font-weight="900" fill="#102233">${i+1}</text>`).join('')}
          </svg>
        </div>
      </div>
    </div></div>`
  }));

  await render(browser, 'ipad-03-property-intel.png', ipad.width, ipad.height, html({
    ...ipad,
    title: 'Build reusable property intel.',
    subtitle: 'Save access codes, notes, and building details once. Make them available to every route that needs them.',
    body: `<div class="stage" style="top:720px;"><div class="portal-shell" style="padding:46px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;">
        <div><div class="mini-label orange">Property Intel</div><div style="font-size:58px;font-weight:950;">Access Codes</div><div style="font-size:32px;color:#657484;font-weight:850;">81 saved records · 79 ready for drivers</div></div>
        <div style="background:#f45a18;color:white;border-radius:22px;padding:18px 28px;font-size:30px;font-weight:950;">Add Access Code</div>
      </div>
      <div class="mini-grid" style="grid-template-columns:repeat(4, 1fr);margin-bottom:34px;">
        <div class="mini-card"><div class="mini-label">Properties</div><div class="mini-value">81</div></div>
        <div class="mini-card" style="border-color:#b7ebc9;"><div class="mini-label">With Codes</div><div class="mini-value">79</div></div>
        <div class="mini-card"><div class="mini-label">Imported</div><div class="mini-value">79</div></div>
        <div class="mini-card"><div class="mini-label">Driver Submitted</div><div class="mini-value">0</div></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="mock-table">
          <thead><tr><th>Property</th><th>Access</th><th>Notes</th><th>Action</th></tr></thead>
          <tbody>
            <tr><td>101 S Spruce St</td><td class="orange">#2511<br><span style="color:#657484;">Confirmed</span></td><td>No notes</td><td>Edit</td></tr>
            <tr><td>1020 E Washington Ave</td><td class="orange">#5719; #0829; #1945<br><span style="color:#657484;">Confirmed</span></td><td>#1957 to get in each building.</td><td>Edit</td></tr>
            <tr><td>6924 Los Vientos Serenos</td><td class="orange">#5719<br><span style="color:#657484;">Confirmed</span></td><td>1st house after 6930.</td><td>Edit</td></tr>
            <tr><td>702 N Fig St Apt 101</td><td class="orange">Apt 101<br><span style="color:#657484;">Confirmed</span></td><td>Unit details attached to stop.</td><td>Edit</td></tr>
          </tbody>
        </table>
      </div>
    </div></div>`
  }));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
