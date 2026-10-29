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
exports.CompareService = void 0;
exports.changedLines = changedLines;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const BASE_SCHEME = 'pair-guide-base';
const PROPOSED_SCHEME = 'pair-guide-proposed';
const NOTE_SCHEME = 'pair-guide-note';
function changedLines(current, proposed) {
    const before = current.split(/\r?\n/);
    const after = proposed.split(/\r?\n/);
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
        prefix++;
    }
    let suffix = 0;
    while (suffix < before.length - prefix &&
        suffix < after.length - prefix &&
        before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
        suffix++;
    }
    const start = Math.min(prefix, Math.max(after.length - 1, 0));
    const end = Math.max(start, after.length - 1 - suffix);
    return { start, end };
}
class CompareService {
    currentSession;
    changed = new vscode.EventEmitter();
    disposables;
    constructor(currentSession) {
        this.currentSession = currentSession;
        this.disposables = [
            this.changed,
            vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, {
                provideTextDocumentContent: (uri) => this.baseText(uri),
            }),
            vscode.workspace.registerTextDocumentContentProvider(NOTE_SCHEME, {
                provideTextDocumentContent: (uri) => this.noteText(uri),
            }),
            vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, {
                onDidChange: this.changed.event,
                provideTextDocumentContent: (uri) => this.proposedContent(uri),
            }),
        ];
    }
    prepare(session, step) {
        const compare = step.compare;
        const target = targetPath(session, step);
        if (!compare || !target) {
            return undefined;
        }
        const name = path.basename(target);
        if (compare.type === 'implemented') {
            if (!fs.existsSync(target)) {
                return undefined;
            }
            const ref = compare.baseRef ?? session.baseRef ?? 'HEAD';
            return {
                left: this.baseUri(target, ref),
                right: vscode.Uri.file(target),
                title: `${name} (${ref.slice(0, 8)} ↔ atual)`,
                warnings: [],
            };
        }
        const { current, text, warnings } = this.compute(session, step, target);
        const lines = changedLines(current, text);
        const lastLength = text.split(/\r?\n/)[lines.end]?.length ?? 0;
        return {
            left: fs.existsSync(target) ? vscode.Uri.file(target) : this.baseUri(target, ''),
            right: this.proposedUri(session, step, target),
            title: `${name} (atual ↔ proposto)`,
            changed: new vscode.Range(lines.start, 0, lines.end, lastLength),
            warnings,
        };
    }
    target(session, step) {
        return targetPath(session, step);
    }
    refresh(uri) {
        this.changed.fire(uri);
    }
    dispose() {
        this.disposables.forEach((item) => item.dispose());
    }
    locate(session, step) {
        const target = targetPath(session, step);
        if (!target) {
            return { uri: this.noteUri(session, step), kind: 'note' };
        }
        if (step.ref) {
            return { uri: this.baseUri(target, step.ref, session.root, true), kind: 'ref' };
        }
        if (fs.existsSync(target)) {
            return { uri: vscode.Uri.file(target), kind: 'file' };
        }
        return { uri: this.baseUri(target, '', session.root), kind: 'empty' };
    }
    noteUri(session, step) {
        const slug = step.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || step.id;
        return vscode.Uri.from({ scheme: NOTE_SCHEME, path: `/${session.id}/${step.id}/${slug}.txt` });
    }
    baseUri(file, ref, root, strict = false) {
        return vscode.Uri.from({
            scheme: BASE_SCHEME,
            path: `/${ref || 'vazio'}/${path.basename(file)}`,
            query: JSON.stringify({ file, ref, root, strict }),
        });
    }
    noteText(uri) {
        const [, sessionId, stepId] = uri.path.split('/');
        const session = this.currentSession();
        const step = session?.id === sessionId ? session.steps.find((item) => item.id === stepId) : undefined;
        return `${step?.title ?? 'Nota'}\n\n(passo sem trecho de código associado)\n`;
    }
    proposedUri(session, step, file) {
        return vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/${session.id}/${step.id}/${path.basename(file)}` });
    }
    baseText(uri) {
        const { file, ref, root, strict } = JSON.parse(uri.query);
        if (!ref) {
            return Promise.resolve('');
        }
        const useRoot = Boolean(root) && fs.existsSync(root);
        const cwd = useRoot ? root : path.dirname(file);
        const relative = useRoot ? path.relative(root, file).split(path.sep).join('/') : path.basename(file);
        return new Promise((resolve) => {
            (0, child_process_1.execFile)('git', ['-C', cwd, 'show', `${ref}:./${relative}`], { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
                if (!error) {
                    resolve(stdout);
                    return;
                }
                const message = String(stderr);
                if (/does not exist in|exists on disk, but not in/.test(message)) {
                    resolve(strict ? `// ${path.basename(file)} não existe em ${ref}\n` : '');
                    return;
                }
                resolve(`git não conseguiu ler ${path.basename(file)} em ${ref}:\n${message}`);
            });
        });
    }
    proposedContent(uri) {
        const [, sessionId, stepId] = uri.path.split('/');
        const session = this.currentSession();
        const step = session?.id === sessionId ? session.steps.find((item) => item.id === stepId) : undefined;
        const target = session && step ? targetPath(session, step) : undefined;
        if (!session || !step || !target) {
            return '';
        }
        return this.compute(session, step, target).text;
    }
    compute(session, step, target) {
        let current = '';
        try {
            current = fs.readFileSync(target, 'utf8');
        }
        catch {
            current = '';
        }
        const eol = current.includes('\r\n') ? '\r\n' : '\n';
        const normalize = (value) => value.replace(/\r?\n/g, eol);
        const warnings = [];
        const compare = step.compare;
        let text = current;
        if (typeof compare?.code === 'string') {
            text = normalize(compare.code);
        }
        else {
            for (const edit of compare?.replace ?? []) {
                const find = normalize(edit.find);
                const index = text.indexOf(find);
                if (index < 0) {
                    warnings.push(`trecho da proposta não encontrado no arquivo: \`${edit.find.trim().split('\n')[0].slice(0, 70)}\``);
                    continue;
                }
                text = text.slice(0, index) + normalize(edit.with) + text.slice(index + find.length);
            }
        }
        void session;
        return { current, text, warnings };
    }
}
exports.CompareService = CompareService;
function targetPath(session, step) {
    if (!step.file) {
        return undefined;
    }
    const root = session.root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return path.isAbsolute(step.file) || !root ? step.file : path.join(root, step.file);
}
