/* Weekly Planner - Electron/launcher (1.7.1, VPN-aware)
 * سرور API اکسپرس (server-dist/server.cjs) را به‌صورت پروسه Node لوکال
 * اجرا می‌کند و رابط کاربری بیلدشده (dist/) را در پنجره برنامه باز می‌کند.
 * همه‌چیز از http://localhost:<port> سرو می‌شود - کاملاً قابلیت آفلاین دارد.
 *
 * VPN/فیلترشکن:
 *  - پنجره برنامه (Chromium) به‌صورت پیش‌فرض «پروکسی سیستمی ویندوز» را
 *    دنبال می‌کند؛ هیچ‌چیز آن را بازنویسی نمی‌کند (بدون --no-proxy-server).
 *  - سرور Node چون پروکسی سیستمی ویندوز را نمی‌بیند، پیش از spawn، پروکسی
 *    سیستمی با session.resolveProxy تشخیص داده می‌شود و به‌صورت
 *    HTTPS_PROXY/HTTP_PROXY/NO_PROXY به پروسه سرور تزریق می‌شود؛ server.ts
 *    با EnvHttpProxyAgent (undici) و firebase-admin با HttpsProxyAgent
 *    آن را اعمال می‌کند (در server.log قابل مشاهده است).
 */
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

/* Google OAuth با UA حاوی Electron و نام برنامه رد میشود؛ توکنهای
غیرمرورگری را از UA سراسری حذف میکنیم (قبل از ساخت هر پنجره). */
try {
  app.userAgentFallback = app.userAgentFallback
    .replace(/\sElectron\/[\d.]+/i, '')
    .replace(/\sweekly-planner\/[\d.]+/i, '');
  log('UA fallback set:', app.userAgentFallback);
} catch (e) { log('UA fallback error:', e && e.message); }


const APP_DIR = __dirname;
const SERVER_SCRIPT = path.join(APP_DIR, 'server-dist', 'server.cjs');
const BASE_PORT = Number(process.env.PLANNER_PORT) || 3000;
const PORT_SCAN = 20;

let serverProc = null;
let mainWindow = null;
let creating = false;
let logFilePath = null;
const LOG_LINES = [];

function log() {
  try {
    console.log.apply(console, ['[weekly-planner]'].concat([].slice.call(arguments)));
  } catch (e) { /* ignore */ }
}

/* خروجی سرور فرزند هم در کنسول نوشته می‌شود و هم در فایل لاگ
 * (%APPDATA%/Weekly Planner/server.log) ذخیره می‌شود تا اگر روزی
 * سرور بالا نیامد، علت واقعی در دیالوگ خطا و فایل لاگ دیده شود. */
function captureServerOutput(chunk, isErr) {
  String(chunk).split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const stamped = new Date().toISOString() + (isErr ? ' [err] ' : ' ') + line;
    LOG_LINES.push(stamped);
    if (LOG_LINES.length > 200) LOG_LINES.shift();
    if (logFilePath) {
      try { fs.appendFileSync(logFilePath, stamped + '\n'); } catch (e) { /* ignore */ }
    }
  });
}

function serverLogTail() {
  return LOG_LINES.slice(-15).join('\n');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickFreePort() {
  for (let p = BASE_PORT; p < BASE_PORT + PORT_SCAN; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error('No free port in range ' + BASE_PORT + '..' + (BASE_PORT + PORT_SCAN - 1));
}

/* ── تشخیص پروکسی سیستمی ویندوز از موتور شبکه خود Chromium ──
 * خروجی resolveProxy چیزی شبیه این‌هاست:
 *   DIRECT | PROXY 127.0.0.1:10809 | PROXY a:80; PROXY b:80; DIRECT | SOCKS5 127.0.0.1:10808
 * فقط پروکسی HTTP را برمی‌گردانیم (undici/HttpsProxyAgent با HTTP proxy کار می‌کند).
 * SOCKS را با پرچم گزارش می‌کنیم (UI از Chromium رد می‌شود، سمت سرور خیر). */
function parseProxyResult(raw) {
  if (!raw) return null;
  const parts = String(raw).split(';').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^DIRECT$/i.test(p)) continue;
    const m = p.match(/^(PROXY|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+([^\s:]+):(\d+)$/i);
    if (!m) continue;
    const scheme = m[1].toUpperCase();
    if (scheme === 'SOCKS' || scheme === 'SOCKS4' || scheme === 'SOCKS5') {
      return { url: null, raw: p, socks: true };
    }
    return { url: 'http://' + m[2] + ':' + m[3], raw: p, socks: false };
  }
  return null;
}

function detectSystemProxy(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), timeoutMs || 3000);
    try {
      session.defaultSession.resolveProxy('https://generativelanguage.googleapis.com/')
        .then((raw) => { clearTimeout(timer); done(parseProxyResult(raw)); })
        .catch(() => { clearTimeout(timer); done(null); });
    } catch (e) {
      clearTimeout(timer);
      done(null);
    }
  });
}

/* متغیرهای محیطی پروسه سرور؛ اگر کاربر خودش HTTPS_PROXY ست کرده باشد
 * تشخیص خودکار را دور می‌زنیم (حاکمیت تنظیم دستی کاربر). */
async function buildServerEnv(port) {
  const env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    NODE_ENV: 'production',
    PORT: String(port)
  });
  const userSet = !!(process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
                     process.env.https_proxy || process.env.http_proxy);
  if (userSet) {
    log('HTTPS_PROXY/HTTP_PROXY already set by user - skipping auto detection');
    return env;
  }
  const proxy = await detectSystemProxy(3000);
  if (proxy && proxy.url) {
    env.HTTPS_PROXY = proxy.url;
    env.HTTP_PROXY = proxy.url;
    env.https_proxy = proxy.url;
    env.http_proxy = proxy.url;
    env.NO_PROXY = 'localhost,127.0.0.1,::1';
    env.no_proxy = env.NO_PROXY;
    log('system proxy detected (' + proxy.raw + ') -> server outbound (Gemini/Firebase Admin) will use it');
  } else if (proxy && proxy.socks) {
    log('system proxy is SOCKS (' + proxy.raw + ') -> UI traffic uses it via Chromium; for server-side AI set HTTPS_PROXY to an HTTP proxy');
  } else {
    log('no system proxy detected -> server outbound goes direct');
  }
  return env;
}

function startServer(port, env) {
  log('starting local API server on 127.0.0.1:' + port);
  const proc = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: APP_DIR,
    env: env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', (d) => { process.stdout.write('[server] ' + d); captureServerOutput(d, false); });
  proc.stderr.on('data', (d) => { process.stderr.write('[server] ' + d); captureServerOutput(d, true); });
  proc.on('exit', (code, signal) => {
    log('server exited', { code: code, signal: signal });
    if (serverProc === proc) serverProc = null;
  });
  return proc;
}

function waitForServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (why) => { if (!settled) { settled = true; reject(new Error(why)); } };
    const ok = () => { if (!settled) { settled = true; resolve(); } };
    /* اگر پروسه سرور قبل از آماده‌شدن بمیرد، به‌جای صبر ۳۰ ثانیه‌ای
     * تا timeout، همان لحظه علت واقعی + آخرین لاگ‌ها نشان داده می‌شود. */
    if (serverProc) {
      serverProc.once('exit', (code, signal) => {
        fail('server process exited prematurely (' + (signal ? 'signal ' + signal : 'code ' + code) + ')' +
          '\n\n--- آخرین خطوط لاگ سرور ---\n' + serverLogTail());
      });
    }
    const deadline = Date.now() + (timeoutMs || 30000);
    const attempt = () => {
      if (settled) return;
      if (Date.now() > deadline) {
        return fail('timeout' + '\n\n--- آخرین خطوط لاگ سرور ---\n' + serverLogTail());
      }
      const req = http.get({ host: '127.0.0.1', port: port, path: '/', timeout: 2500 }, (res) => {
        res.resume();
        ok();
      });
      req.on('timeout', () => req.destroy(new Error('probe timeout')));
      req.on('error', () => setTimeout(attempt, 400));
    };
    attempt();
  });
}

/* اگر کاربر فایل .env را در پوشه تنظیمات برنامه (%APPDATA%/Weekly Planner)
 * بگذارد، به کنار سرور کپی می‌شود تا قابلیت‌های ابری (Gemini/Firebase/PG)
 * با کلیدهای خود کاربر فعال شوند. */
function copyUserEnv() {
  try {
    const userEnv = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(userEnv)) {
      fs.copyFileSync(userEnv, path.join(APP_DIR, '.env'));
      log('user .env applied from', userEnv);
    }
  } catch (e) { log('copyUserEnv skipped:', e && e.message); }
}

function killServer() {
  if (serverProc) {
    try { serverProc.kill(); } catch (e) { /* ignore */ }
    serverProc = null;
  }
}

const SPLASH_HTML = '<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">' +
  '<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;font-family:Vazirmatn,Tahoma,sans-serif;color:#334155}' +
  '.ring{width:44px;height:44px;border:4px solid #e2e8f0;border-top-color:#0ea5e9;border-radius:50%;animation:sp 1s linear infinite}' +
  '@keyframes sp{to{transform:rotate(360deg)}}p{margin-top:16px;font-size:14px}</style></head>' +
  '<body><div class="ring"></div><p>در حال راه‌اندازی…</p></body></html>';

async function createWindow() {
  if (creating || mainWindow) return;
  creating = true;
  try {
    copyUserEnv();

    try {
      logFilePath = path.join(app.getPath('userData'), 'server.log');
      fs.appendFileSync(logFilePath, '\n=== ' + new Date().toISOString() + ' launch ===\n');
    } catch (e) { logFilePath = null; }

    mainWindow = new BrowserWindow({
      width: 1366,
      height: 860,
      minWidth: 1024,
      minHeight: 640,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#f8fafc',
      title: 'Weekly Planner',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.once('ready-to-show', () => mainWindow.show());

    /* پاپ‌آپ‌های OAuth گوگل (ورود با گوگل / جیمیل / تقویم) باید داخل
     * برنامه باز شوند تا جریان postMessage فایربیس کار کند؛ این
     * پنجره‌ها هم session مشترک دارند و از پروکسی سیستمی رد می‌شوند. */
    mainWindow.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 640,
        autoHideMenuBar: true,
        parent: mainWindow,
        modal: false,
        title: 'Weekly Planner',
        backgroundColor: '#f8fafc',
        webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
      }
    }));

    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (url.indexOf('http://localhost:') !== 0 && url.indexOf('http://127.0.0.1:') !== 0) {
        e.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML));

    const port = await pickFreePort();
    const serverEnv = await buildServerEnv(port);
    serverProc = startServer(port, serverEnv);
    await waitForServer(port, 30000);

    /* localhost (نه 127.0.0.1) تا با دامنه مجاز پیش‌فرض Firebase
     * برای ورود با گوگل سازگار باشد. */
    await mainWindow.loadURL('http://localhost:' + port);
    log('app ready at http://localhost:' + port);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    dialog.showErrorBox('Weekly Planner - خطای راه‌اندازی',
      'راه‌اندازی سرور محلی برنامه ناموفق بود:\n' + msg +
      '\n\nلطفاً برنامه را ببندید و دوباره اجرا کنید.' +
      (logFilePath ? '\n\nگزارش کامل سرور:\n' + logFilePath : ''));
    killServer();
    app.quit();
  } finally {
    creating = false;
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
}

app.on('activate', () => { if (app.isReady()) createWindow(); });
app.on('window-all-closed', () => { killServer(); app.quit(); });
app.on('before-quit', killServer);
process.on('exit', killServer);
process.on('uncaughtException', (e) => log('uncaughtException:', e));
process.on('unhandledRejection', (e) => log('unhandledRejection:', e));
