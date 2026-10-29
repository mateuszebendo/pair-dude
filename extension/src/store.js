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
exports.Store = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const SESSION_SUFFIX = '.session.json';
const PRESENCE_SUFFIX = '.presence.json';
const CURSOR_SUFFIX = '.cursor';
const LISTENING_TTL_MS = 75_000;
const THINKING_TTL_MS = 300_000;
class Store {
    sessionsDir;
    watcher;
    timers = new Map();
    known = new Set();
    emitter = new vscode.EventEmitter();
    onDidChange = this.emitter.event;
    constructor() {
        const configured = vscode.workspace.getConfiguration('pairGuide').get('dataDir');
        const base = configured && configured.trim() ? configured.trim() : path.join(os.homedir(), '.pair-guide');
        this.sessionsDir = path.join(base, 'sessions');
        fs.mkdirSync(this.sessionsDir, { recursive: true });
        for (const info of this.listSessions()) {
            this.known.add(info.id);
        }
        this.startWatching();
    }
    get dataDir() {
        return path.dirname(this.sessionsDir);
    }
    listSessions() {
        const infos = [];
        for (const file of fs.readdirSync(this.sessionsDir)) {
            if (!file.endsWith(SESSION_SUFFIX)) {
                continue;
            }
            const id = file.slice(0, -SESSION_SUFFIX.length);
            const full = path.join(this.sessionsDir, file);
            try {
                const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
                infos.push({
                    id,
                    title: typeof raw.title === 'string' ? raw.title : id,
                    mode: typeof raw.mode === 'string' ? raw.mode : 'explain',
                    mtime: fs.statSync(full).mtimeMs,
                });
            }
            catch {
                infos.push({ id, title: `${id} (inválida)`, mode: 'explain', mtime: fs.statSync(full).mtimeMs });
            }
        }
        return infos.sort((a, b) => b.mtime - a.mtime);
    }
    readSession(id) {
        try {
            const raw = JSON.parse(fs.readFileSync(this.sessionPath(id), 'utf8'));
            return { session: normalize(id, raw) };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
    readState(id) {
        try {
            const raw = JSON.parse(fs.readFileSync(this.statePath(id), 'utf8'));
            return { sessionId: id, updatedAt: '', steps: {}, ...raw };
        }
        catch {
            return { sessionId: id, updatedAt: new Date().toISOString(), steps: {} };
        }
    }
    writeState(state) {
        state.updatedAt = new Date().toISOString();
        const target = this.statePath(state.sessionId);
        const temp = `${target}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(temp, target);
    }
    appendEvent(id, event) {
        const full = { ts: new Date().toISOString(), ...event };
        fs.appendFileSync(this.eventsPath(id), `${JSON.stringify(full)}\n`, 'utf8');
        return full;
    }
    readEvents(id) {
        try {
            return fs
                .readFileSync(this.eventsPath(id), 'utf8')
                .split('\n')
                .filter((line) => line.trim())
                .map((line) => JSON.parse(line));
        }
        catch {
            return [];
        }
    }
    readEventsIndexed(id) {
        return this.readEvents(id).map((event, index) => ({ event, index }));
    }
    readCursor(id) {
        try {
            return Number(fs.readFileSync(path.join(this.sessionsDir, `${id}${CURSOR_SUFFIX}`), 'utf8')) || 0;
        }
        catch {
            return 0;
        }
    }
    readPresence(id) {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(this.sessionsDir, `${id}${PRESENCE_SUFFIX}`), 'utf8'));
            const age = Date.now() - Date.parse(raw.at);
            if (raw.state === 'listening' && age < LISTENING_TTL_MS) {
                return { state: 'listening' };
            }
            if (raw.state === 'thinking' && age < THINKING_TTL_MS) {
                return { state: 'thinking', step: typeof raw.step === 'string' ? raw.step : undefined };
            }
        }
        catch {
            return { state: 'offline' };
        }
        return { state: 'offline' };
    }
    dispose() {
        this.watcher?.close();
        this.timers.forEach((timer) => clearTimeout(timer));
        this.emitter.dispose();
    }
    sessionPath(id) {
        return path.join(this.sessionsDir, `${id}${SESSION_SUFFIX}`);
    }
    statePath(id) {
        return path.join(this.sessionsDir, `${id}.state.json`);
    }
    eventsPath(id) {
        return path.join(this.sessionsDir, `${id}.events.jsonl`);
    }
    startWatching() {
        this.watcher = fs.watch(this.sessionsDir, (_event, file) => {
            if (!file) {
                return;
            }
            const kind = file.endsWith(SESSION_SUFFIX)
                ? 'session'
                : file.endsWith(PRESENCE_SUFFIX)
                    ? 'presence'
                    : file.endsWith(CURSOR_SUFFIX)
                        ? 'cursor'
                        : undefined;
            if (!kind) {
                return;
            }
            const suffix = kind === 'session' ? SESSION_SUFFIX : kind === 'presence' ? PRESENCE_SUFFIX : CURSOR_SUFFIX;
            const id = file.slice(0, -suffix.length);
            const key = `${kind}:${id}`;
            clearTimeout(this.timers.get(key));
            this.timers.set(key, setTimeout(() => {
                this.timers.delete(key);
                if (kind !== 'session') {
                    this.emitter.fire({ sessionId: id, created: false, kind });
                    return;
                }
                if (!fs.existsSync(this.sessionPath(id))) {
                    this.known.delete(id);
                    return;
                }
                const created = !this.known.has(id);
                this.known.add(id);
                this.emitter.fire({ sessionId: id, created, kind });
            }, 200));
        });
    }
}
exports.Store = Store;
function normalize(id, raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) {
        throw new Error('o JSON precisa ter o campo "steps" (lista)');
    }
    const seen = new Set();
    const steps = raw.steps.map((item, index) => {
        let stepId = typeof item?.id === 'string' && item.id ? item.id : `s${index + 1}`;
        while (seen.has(stepId)) {
            stepId = `${stepId}_${index + 1}`;
        }
        seen.add(stepId);
        const kind = types_1.KINDS.includes(item?.kind) ? item.kind : 'note';
        return {
            ...item,
            id: stepId,
            kind,
            title: typeof item?.title === 'string' && item.title ? item.title : `Passo ${index + 1}`,
        };
    });
    return {
        id,
        title: typeof raw.title === 'string' ? raw.title : id,
        mode: ['review', 'implementation', 'plan', 'explain'].includes(raw.mode) ? raw.mode : 'explain',
        root: typeof raw.root === 'string' ? raw.root : undefined,
        baseRef: typeof raw.baseRef === 'string' ? raw.baseRef : undefined,
        claudeSession: typeof raw.claudeSession === 'string' ? raw.claudeSession : undefined,
        summary: typeof raw.summary === 'string' ? raw.summary : undefined,
        current: typeof raw.current === 'string' ? raw.current : undefined,
        steps,
    };
}
