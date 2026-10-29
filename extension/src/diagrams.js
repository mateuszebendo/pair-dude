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
exports.DiagramService = void 0;
exports.collectDiagrams = collectDiagrams;
exports.fillDiagrams = fillDiagrams;
exports.diagramMarkdown = diagramMarkdown;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const diagram_core_1 = require("./diagram-core");
const CACHE_VERSION = '1';
const FENCE = /```mermaid[^\n]*\n([\s\S]*?)```/g;
const MARK = /\u0001D(\d+)\u0001/g;
function collectDiagrams(step) {
    const diagrams = [];
    let body = (step.body ?? '').replace(FENCE, (_match, source) => {
        diagrams.push({ source: source.trim() });
        return `\u0001D${diagrams.length - 1}\u0001`;
    });
    for (const diagram of step.diagrams ?? []) {
        if (typeof diagram?.source === 'string' && diagram.source.trim()) {
            diagrams.push({ ...diagram, source: diagram.source.trim() });
            body += `\n\n\u0001D${diagrams.length - 1}\u0001`;
        }
    }
    return { body: body.trim(), diagrams };
}
function fillDiagrams(collected, resolve) {
    return collected.body.replace(MARK, (_match, index) => resolve(collected.diagrams[Number(index)], Number(index)));
}
class DiagramService {
    extensionPath;
    memo = new Map();
    inflight = new Map();
    cacheDir;
    chain = Promise.resolve();
    panel;
    constructor(extensionPath, dataDir) {
        this.extensionPath = extensionPath;
        this.cacheDir = path.join(dataDir, 'cache');
        fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    get dark() {
        const kind = vscode.window.activeColorTheme.kind;
        return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
    }
    peek(source) {
        const key = this.key(source);
        const memoized = this.memo.get(key);
        if (memoized) {
            return memoized;
        }
        try {
            const cached = JSON.parse(fs.readFileSync(this.cacheFile(key), 'utf8'));
            const outcome = { state: 'ok', svg: cached.svg, width: cached.width, height: cached.height };
            this.memo.set(key, outcome);
            return outcome;
        }
        catch {
            return undefined;
        }
    }
    ensure(source) {
        const known = this.peek(source);
        if (known) {
            return Promise.resolve(known);
        }
        const key = this.key(source);
        const running = this.inflight.get(key);
        if (running) {
            return running;
        }
        const promise = this.chain.then(() => this.render(source, key));
        this.chain = promise.catch(() => undefined);
        this.inflight.set(key, promise);
        void promise.finally(() => this.inflight.delete(key));
        return promise;
    }
    async openViewer(title, source) {
        const outcome = await this.ensure(source);
        if (outcome.state !== 'ok') {
            void vscode.window.showWarningMessage(`Pair Dude: ${outcome.message}`);
            return;
        }
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('pairGuide.diagram', title, vscode.ViewColumn.Beside, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });
            this.panel.onDidDispose(() => (this.panel = undefined));
        }
        this.panel.title = title;
        this.panel.webview.html = viewerHtml(outcome, source);
        this.panel.reveal(undefined, true);
    }
    dispose() {
        this.panel?.dispose();
    }
    async render(source, key) {
        const browser = (0, diagram_core_1.findBrowser)(vscode.workspace.getConfiguration('pairGuide').get('browserPath'));
        if (!browser) {
            return {
                state: 'unavailable',
                message: 'nenhum navegador (Edge/Chrome) encontrado para renderizar o diagrama; configure pairGuide.browserPath.',
            };
        }
        try {
            const result = await (0, diagram_core_1.renderMermaid)(source, {
                mermaidJs: path.join(this.extensionPath, 'resources', 'mermaid.min.js'),
                browser,
                dark: this.dark,
            });
            const outcome = { state: 'ok', ...result };
            this.memo.set(key, outcome);
            fs.writeFileSync(this.cacheFile(key), JSON.stringify(result), 'utf8');
            return outcome;
        }
        catch (error) {
            const message = (error instanceof Error ? error.message : String(error)).split('\n').slice(0, 3).join(' ').slice(0, 400);
            const outcome = { state: 'error', message };
            this.memo.set(key, outcome);
            return outcome;
        }
    }
    key(source) {
        return crypto.createHash('sha1').update(`${CACHE_VERSION}\n${this.dark}\n${source}`).digest('hex');
    }
    cacheFile(key) {
        return path.join(this.cacheDir, `${key}.json`);
    }
}
exports.DiagramService = DiagramService;
function diagramMarkdown(spec, outcome, link) {
    const title = spec.title ? `**${spec.title}**\n\n` : '';
    const caption = spec.caption ? `\n\n_${spec.caption}_` : '';
    const source = `\`\`\`mermaid\n${spec.source}\n\`\`\``;
    if (!outcome) {
        return `${title}> ⏳ Renderizando diagrama…`;
    }
    if (outcome.state === 'error') {
        return `${title}> ❌ Diagrama inválido: ${outcome.message}\n\n${source}`;
    }
    if (outcome.state === 'unavailable') {
        return `${title}> ⚠️ ${outcome.message}\n\n${source}`;
    }
    const alt = (spec.title ?? 'diagrama').replace(/[\[\]]/g, '');
    const image = `![${alt}](data:image/svg+xml;base64,${Buffer.from(outcome.svg, 'utf8').toString('base64')})`;
    const open = link
        ? `\n\n[🔍 Ampliar](command:pairGuide.openDiagram?${encodeURIComponent(JSON.stringify([link.stepId, link.index]))})`
        : '';
    return `${title}${image}${open}${caption}`;
}
function viewerHtml(outcome, source) {
    const nonce = crypto.randomBytes(12).toString('hex');
    const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .bar { position: sticky; top: 0; z-index: 1; display: flex; gap: 6px; align-items: center; padding: 6px 10px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
  button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 0; padding: 3px 10px; border-radius: 3px; cursor: pointer; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #stage { padding: 16px; overflow: auto; }
  #stage svg { width: calc(var(--w) * var(--z) * 1px) !important; height: auto !important; max-width: none !important; }
  pre { margin: 0; padding: 16px; font-family: var(--vscode-editor-font-family); white-space: pre-wrap; }
</style></head>
<body style="--w:${outcome.width};--z:1">
<div class="bar"><button id="out">−</button><button id="in">+</button><button id="fit">Ajustar</button><button id="reset">100%</button><button id="src">Código</button><span id="label"></span></div>
<div id="stage">${outcome.svg}</div>
<pre id="code" hidden>${escaped}</pre>
<script nonce="${nonce}">
  const body = document.body, stage = document.getElementById('stage'), code = document.getElementById('code'), label = document.getElementById('label');
  const natural = ${outcome.width};
  let zoom = 1;
  const apply = () => { body.style.setProperty('--z', zoom); label.textContent = Math.round(zoom * 100) + '%'; };
  const set = (value) => { zoom = Math.min(Math.max(value, 0.2), 4); apply(); };
  document.getElementById('in').onclick = () => set(zoom * 1.25);
  document.getElementById('out').onclick = () => set(zoom / 1.25);
  document.getElementById('reset').onclick = () => set(1);
  document.getElementById('fit').onclick = () => set((stage.clientWidth - 32) / natural);
  document.getElementById('src').onclick = () => { const showCode = code.hidden; code.hidden = !showCode; stage.hidden = showCode; };
  window.addEventListener('wheel', (event) => { if (event.ctrlKey) { event.preventDefault(); set(zoom * (event.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
  apply();
</script></body></html>`;
}
