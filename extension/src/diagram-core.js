"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBrowser = findBrowser;
exports.renderMermaid = renderMermaid;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const url_1 = require("url");
const MAX_WIDTH = 640;
function findBrowser(custom) {
    const candidates = [];
    if (custom) {
        candidates.push(custom);
    }
    if (process.platform === 'win32') {
        for (const base of [process.env['ProgramFiles(x86)'], process.env['ProgramFiles'], process.env['LOCALAPPDATA']]) {
            if (base) {
                candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
            }
        }
    }
    else if (process.platform === 'darwin') {
        candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
    }
    else {
        for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
            for (const name of ['microsoft-edge', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
                candidates.push(path.join(dir, name));
            }
        }
    }
    return candidates.find((candidate) => {
        try {
            return fs.statSync(candidate).isFile();
        }
        catch {
            return false;
        }
    });
}
async function renderMermaid(source, options) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-guide-'));
    try {
        const page = path.join(dir, 'index.html');
        fs.writeFileSync(page, template(source, options), 'utf8');
        const stdout = await run(options.browser, [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--hide-scrollbars',
            '--virtual-time-budget=4000',
            `--user-data-dir=${path.join(dir, 'profile')}`,
            '--dump-dom',
            (0, url_1.pathToFileURL)(page).href,
        ], options.timeoutMs ?? 30000);
        const match = /<script id="out"[^>]*>([\s\S]*?)<\/script>/.exec(stdout);
        const payload = match?.[1] ?? '';
        if (payload.startsWith('OK')) {
            return finish(payload.slice(2), options.dark);
        }
        if (payload.startsWith('ERR')) {
            throw new Error(payload.slice(3).trim() || 'erro desconhecido ao renderizar');
        }
        throw new Error('o navegador não devolveu o diagrama (mermaid não carregou ou excedeu o tempo)');
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
function template(source, options) {
    const mermaidUrl = (0, url_1.pathToFileURL)(options.mermaidJs).href;
    const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
    return `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script id="out" type="text/plain"></script>
<script src="${mermaidUrl}"></script>
<script>
(async () => {
  const out = document.getElementById('out');
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: ${options.dark ? "'dark'" : "'default'"},
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      class: { htmlLabels: false, useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
      themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '14px' }
    });
    const result = await mermaid.render('pgd', ${encoded});
    out.textContent = 'OK' + result.svg;
  } catch (error) {
    out.textContent = 'ERR' + ((error && error.message) || String(error));
  }
})();
</script>
</body></html>`;
}
function run(command, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks = [];
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`tempo excedido (${timeoutMs / 1000}s) ao renderizar o diagrama`));
        }, timeoutMs);
        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.stderr.on('data', () => undefined);
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString('utf8'));
        });
    });
}
function finish(rawSvg, dark) {
    const svg = rawSvg.replace(/^\s*<\?xml[^>]*>\s*/, '').trim();
    const open = /<svg\b[^>]*>/.exec(svg);
    if (!open) {
        throw new Error('resposta do renderizador sem SVG');
    }
    const viewBox = /viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(open[0]);
    const naturalWidth = viewBox ? Number(viewBox[3]) : 600;
    const naturalHeight = viewBox ? Number(viewBox[4]) : 300;
    const scale = naturalWidth > MAX_WIDTH ? MAX_WIDTH / naturalWidth : 1;
    const width = Math.round(naturalWidth * scale);
    const height = Math.round(naturalHeight * scale);
    const background = dark ? '#1e1e1e' : '#ffffff';
    let tag = open[0]
        .replace(/\s(width|height|style)="[^"]*"/g, '')
        .replace(/^<svg\b/, `<svg width="${width}" height="${height}" style="background-color:${background};border-radius:6px"`);
    if (!/xmlns:xlink=/.test(tag)) {
        tag = tag.replace(/^<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    return { svg: svg.replace(open[0], tag), width: naturalWidth, height: naturalHeight };
}
