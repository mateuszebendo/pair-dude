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
exports.Guide = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const anchor_1 = require("./anchor");
const decorations_1 = require("./decorations");
const compare_1 = require("./compare");
const diagrams_1 = require("./diagrams");
const render_1 = require("./render");
const tree_1 = require("./tree");
const SCHEME = 'pair-guide';
const AUTHOR_CLAUDE = { name: 'Claude' };
const AUTHOR_USER = { name: 'Você' };
class Guide {
    store;
    diagrams;
    session;
    state;
    thread;
    threadStepId;
    currentHash;
    lastHint;
    token = 0;
    reanchorTimer;
    presenceTimer;
    lastPresence = '';
    commentsSignature = '';
    threadAnchor = 'none';
    warnedInvalid = false;
    userThreads = new Set();
    controller;
    decorations = new decorations_1.Decorations();
    tree = new tree_1.StepsTree();
    treeView;
    status;
    contentChanged = new vscode.EventEmitter();
    disposables = [];
    reportedDiagramErrors = new Set();
    compare = new compare_1.CompareService(() => this.session);
    compareWarnings = [];
    constructor(store, diagrams) {
        this.store = store;
        this.diagrams = diagrams;
        this.controller = vscode.comments.createCommentController('pair-guide', 'Pair Dude');
        this.controller.options = { placeHolder: 'Pergunte ou comente sobre este trecho…', prompt: 'Enviar ao Claude' };
        this.controller.commentingRangeProvider = {
            provideCommentingRanges: (doc) => doc.uri.scheme === 'file' ? [new vscode.Range(0, 0, Math.max(doc.lineCount - 1, 0), 0)] : [],
        };
        this.treeView = vscode.window.createTreeView('pairGuide.steps', { treeDataProvider: this.tree, showCollapseAll: false });
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        this.status.command = 'pairGuide.pickStep';
        this.disposables.push(this.controller, this.decorations, this.treeView, this.status, this.contentChanged, this.compare, this.store.onDidChange((change) => void this.onStoreChange(change.sessionId, change.created, change.kind)), vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
            onDidChange: this.contentChanged.event,
            provideTextDocumentContent: (uri) => this.virtualContent(uri),
        }), vscode.window.onDidChangeVisibleTextEditors(() => this.decorations.refresh()), vscode.window.onDidChangeActiveColorTheme(() => {
            const current = this.state?.current;
            if (this.session && current) {
                void this.prefetchDiagrams(this.session);
                void this.show(current, { refresh: true });
            }
        }), vscode.workspace.onDidChangeTextDocument((event) => this.scheduleReanchor(event.document)));
    }
    register(context) {
        const command = (id, handler) => context.subscriptions.push(vscode.commands.registerCommand(id, handler));
        command('pairGuide.next', () => this.move(1));
        command('pairGuide.prev', () => this.move(-1));
        command('pairGuide.goto', (id) => this.show(id));
        command('pairGuide.pickStep', () => this.pickStep());
        command('pairGuide.pickSession', () => this.pickSession());
        command('pairGuide.showSummary', () => this.showSummary());
        command('pairGuide.openDataDir', () => vscode.env.openExternal(vscode.Uri.file(this.store.dataDir)));
        command('pairGuide.hide', () => this.hide());
        command('pairGuide.openDiagram', (stepId, index) => this.openDiagram(stepId, index));
        command('pairGuide.understood', (arg) => this.decide('understood', undefined, stepIdOf(arg)));
        command('pairGuide.approve', (arg) => this.decide('approved', undefined, stepIdOf(arg)));
        command('pairGuide.requestChange', (arg) => this.requestChange(arg));
        command('pairGuide.reply', (arg) => this.reply(arg));
        command('pairGuide.callClaude', () => this.callClaude());
        this.presenceTimer = setInterval(() => {
            const key = this.presenceKey();
            if (this.session && key !== this.lastPresence) {
                this.lastPresence = key;
                this.refreshChrome();
                this.rebuildThread();
            }
        }, 15000);
        const latest = this.store.listSessions()[0];
        if (latest) {
            void this.openSession(latest.id, false);
        }
        else {
            this.refreshChrome();
        }
    }
    dispose() {
        clearTimeout(this.reanchorTimer);
        clearInterval(this.presenceTimer);
        this.thread?.dispose();
        this.userThreads.forEach((thread) => thread.dispose());
        this.disposables.forEach((item) => item.dispose());
    }
    async onStoreChange(sessionId, created, kind) {
        if (kind !== 'session') {
            if (this.session?.id === sessionId) {
                this.lastPresence = this.presenceKey();
                this.refreshChrome();
                this.rebuildThread();
            }
            return;
        }
        const autoOpen = vscode.workspace.getConfiguration('pairGuide').get('autoOpenNewSessions', true);
        if (created && autoOpen && sessionId !== this.session?.id) {
            await this.openSession(sessionId, true);
            return;
        }
        if (!this.session || sessionId !== this.session.id) {
            return;
        }
        const loaded = this.store.readSession(sessionId);
        if (!loaded.session) {
            if (!this.warnedInvalid) {
                this.warnedInvalid = true;
                void vscode.window.showWarningMessage(`Pair Dude: sessão inválida (${loaded.error}). Mantendo a versão anterior.`);
            }
            return;
        }
        this.warnedInvalid = false;
        const previous = this.session;
        this.session = loaded.session;
        this.notifyNewReplies(previous, loaded.session);
        this.refreshChrome();
        void this.prefetchDiagrams(loaded.session);
        const hint = loaded.session.current;
        if (hint && hint !== this.lastHint) {
            this.lastHint = hint;
            await this.show(hint);
            return;
        }
        this.lastHint = hint;
        const currentId = this.state?.current;
        const step = loaded.session.steps.find((item) => item.id === currentId);
        if (currentId && !step) {
            await this.show(loaded.session.steps[0]?.id);
        }
        else if (step && this.currentHash !== undefined && hashOf(step) !== this.currentHash) {
            await this.show(step.id, { refresh: true });
        }
    }
    async openSession(id, reveal) {
        const loaded = this.store.readSession(id);
        if (!loaded.session) {
            void vscode.window.showWarningMessage(`Pair Dude: não foi possível ler a sessão "${id}" (${loaded.error}).`);
            return;
        }
        this.clearView();
        this.session = loaded.session;
        this.state = this.store.readState(id);
        this.lastHint = loaded.session.current;
        await vscode.commands.executeCommand('setContext', 'pairGuide.active', true);
        this.refreshChrome();
        this.store.appendEvent(id, { type: 'session_opened' });
        void this.prefetchDiagrams(loaded.session);
        if (reveal) {
            const target = loaded.session.current ?? this.state.current ?? loaded.session.steps[0]?.id;
            if (target) {
                await this.show(target);
            }
        }
    }
    async show(stepId, options = {}) {
        const session = this.session;
        const state = this.state;
        if (!session || !state || !stepId) {
            return;
        }
        const index = session.steps.findIndex((step) => step.id === stepId);
        if (index < 0) {
            return;
        }
        const step = session.steps[index];
        const mine = ++this.token;
        this.clearView();
        state.current = step.id;
        state.steps[step.id] = { ...state.steps[step.id], seen: true, at: new Date().toISOString() };
        if (!options.refresh) {
            this.store.appendEvent(session.id, { type: 'view', step: step.id });
        }
        this.compareWarnings = [];
        const prepared = step.compare ? this.compare.prepare(session, step) : undefined;
        if (prepared) {
            await this.showCompare(session, state, step, index, prepared, mine, Boolean(options.refresh));
            return;
        }
        await this.showLocated(session, state, step, index, mine);
    }
    async showLocated(session, state, step, index, mine) {
        let located = this.compare.locate(session, step);
        let doc;
        try {
            doc = await vscode.workspace.openTextDocument(located.uri);
        }
        catch {
            located = { uri: this.compare.noteUri(session, step), kind: 'note' };
            doc = await vscode.workspace.openTextDocument(located.uri);
        }
        if (mine !== this.token) {
            return;
        }
        const anchored = located.kind === 'file' || located.kind === 'ref';
        const { range, anchor } = (0, anchor_1.resolveRange)(doc, anchored ? step : { ...step, anchor: undefined, startLine: 1, endLine: 1 });
        state.view = { stepId: step.id, file: step.file, startLine: range.start.line + 1, endLine: range.end.line + 1 };
        this.store.writeState(state);
        this.refreshChrome();
        const editor = await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(range.start, range.start),
            preview: located.kind !== 'file',
            preserveFocus: true,
        });
        if (mine !== this.token) {
            return;
        }
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        this.attach(session, step, index, anchor, doc, range, mine, anchored);
    }
    async showCompare(session, state, step, index, prepared, mine, refresh) {
        if (refresh) {
            this.compare.refresh(prepared.right);
        }
        let doc;
        try {
            doc = await vscode.workspace.openTextDocument(prepared.right);
        }
        catch {
            await this.showLocated(session, state, step, index, mine);
            return;
        }
        if (mine !== this.token) {
            return;
        }
        let range = prepared.changed;
        let anchor = 'none';
        if (!range) {
            ({ range, anchor } = (0, anchor_1.resolveRange)(doc, step));
        }
        this.compareWarnings = prepared.warnings;
        for (const warning of prepared.warnings) {
            const key = `${session.id}:${step.id}:${warning}`;
            if (!this.reportedDiagramErrors.has(key)) {
                this.reportedDiagramErrors.add(key);
                this.store.appendEvent(session.id, { type: 'compare_warning', step: step.id, text: warning });
            }
        }
        state.view = {
            stepId: step.id,
            file: step.file,
            startLine: range.start.line + 1,
            endLine: range.end.line + 1,
            compare: step.compare?.type,
        };
        this.store.writeState(state);
        this.refreshChrome();
        await vscode.commands.executeCommand('vscode.diff', prepared.left, prepared.right, prepared.title, {
            selection: new vscode.Range(range.start, range.start),
            preview: false,
            preserveFocus: true,
        });
        if (mine !== this.token) {
            return;
        }
        const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === prepared.right.toString());
        editor?.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        this.attach(session, step, index, anchor, doc, range, mine);
    }
    attach(session, step, index, anchor, doc, range, mine, highlight = true) {
        if (highlight) {
            this.decorations.show({ uri: doc.uri, kind: step.kind, range, focus: (0, anchor_1.focusRanges)(doc, range, step.focus) });
        }
        else {
            this.decorations.clear();
        }
        const comments = this.buildComments(session, step, index, anchor);
        this.commentsSignature = commentsSignature(comments);
        const thread = this.controller.createCommentThread(doc.uri, range, comments);
        thread.label = `${render_1.KIND_META[step.kind].label} · ${index + 1}/${session.steps.length}`;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        thread.canReply = true;
        thread.contextValue = 'pairGuideStep';
        this.thread = thread;
        this.threadStepId = step.id;
        this.currentHash = hashOf(step);
        void this.completeDiagrams(session, step, index, anchor, thread, mine);
    }
    styleOptions() {
        return {
            dark: this.diagrams.dark,
            rich: vscode.workspace.getConfiguration('pairGuide').get('richText', true),
        };
    }
    bodyWithDiagrams(step, link) {
        const collected = (0, diagrams_1.collectDiagrams)(step);
        if (collected.diagrams.length === 0) {
            return step.body;
        }
        return (0, diagrams_1.fillDiagrams)(collected, (spec, index) => (0, diagrams_1.diagramMarkdown)(spec, this.diagrams.peek(spec.source), link ? { stepId: step.id, index } : undefined));
    }
    mainComment(session, step, index, anchor) {
        const warnings = this.compareWarnings.map((warning) => `> ⚠️ ${warning}`).join('\n');
        const text = this.bodyWithDiagrams(step, true);
        const merged = warnings ? `${warnings}\n\n${text ?? ''}` : text;
        const body = (0, render_1.buildBody)({ ...step, body: merged }, index, session.steps.length, anchor, this.styleOptions());
        return { body, mode: vscode.CommentMode.Preview, author: AUTHOR_CLAUDE };
    }
    async completeDiagrams(session, step, index, anchor, thread, token) {
        const pending = (0, diagrams_1.collectDiagrams)(step).diagrams.filter((spec) => !this.diagrams.peek(spec.source));
        if (pending.length === 0) {
            return;
        }
        await Promise.all(pending.map((spec) => this.ensureDiagram(session, step, spec.source)));
        if (this.thread !== thread || this.token !== token) {
            return;
        }
        thread.comments = [this.mainComment(session, step, index, anchor), ...thread.comments.slice(1)];
        this.commentsSignature = commentsSignature(thread.comments);
    }
    async ensureDiagram(session, step, source) {
        const outcome = await this.diagrams.ensure(source);
        if (outcome.state !== 'error') {
            return;
        }
        const key = `${session.id}:${step.id}:${source}`;
        if (!this.reportedDiagramErrors.has(key)) {
            this.reportedDiagramErrors.add(key);
            this.store.appendEvent(session.id, { type: 'diagram_error', step: step.id, text: outcome.message });
        }
    }
    async prefetchDiagrams(session) {
        for (const step of session.steps) {
            for (const spec of (0, diagrams_1.collectDiagrams)(step).diagrams) {
                await this.ensureDiagram(session, step, spec.source);
            }
        }
    }
    async openDiagram(stepId, index) {
        const step = this.session?.steps.find((item) => item.id === stepId);
        const spec = step ? (0, diagrams_1.collectDiagrams)(step).diagrams[index] : undefined;
        if (step && spec) {
            await this.diagrams.openViewer(spec.title ?? step.title, spec.source);
        }
    }
    buildComments(session, step, index, anchor) {
        this.threadAnchor = anchor;
        const comments = [this.mainComment(session, step, index, anchor)];
        const replies = step.replies ?? [];
        const claudeReply = (text) => ({
            body: new vscode.MarkdownString(text),
            mode: vscode.CommentMode.Preview,
            author: AUTHOR_CLAUDE,
        });
        const answeredReplies = new Set();
        const cursor = this.store.readCursor(session.id);
        let waiting = false;
        const userEvents = this.store
            .readEventsIndexed(session.id)
            .filter(({ event }) => event.step === step.id && (event.type === 'reply' || event.type === 'changes') && event.text);
        for (const { event, index: eventIndex } of userEvents) {
            const answered = replies.some((reply) => reply.to === event.ts);
            waiting = waiting || !answered;
            const prefix = event.type === 'changes' ? '**Pedido de ajuste:** ' : '';
            comments.push({
                body: new vscode.MarkdownString(`${prefix}${event.text}`),
                mode: vscode.CommentMode.Preview,
                author: AUTHOR_USER,
                label: answered ? '✓ respondido' : eventIndex < cursor ? '👀 visto pelo Claude' : '⏳ enviado',
            });
            replies.forEach((reply, replyIndex) => {
                if (reply.to === event.ts) {
                    comments.push(claudeReply(reply.text));
                    answeredReplies.add(replyIndex);
                }
            });
        }
        replies.forEach((reply, replyIndex) => {
            if (!answeredReplies.has(replyIndex)) {
                comments.push(claudeReply(reply.text));
            }
        });
        if (waiting) {
            comments.push(this.statusComment());
        }
        return comments;
    }
    statusComment() {
        const presence = this.session ? this.store.readPresence(this.session.id) : { state: 'offline' };
        const text = presence.state === 'listening'
            ? '🟢 _Claude está ouvindo esta sessão — a resposta chega aqui em instantes._'
            : presence.state === 'thinking'
                ? '✍️ _Claude está respondendo…_'
                : '⚪ _Ninguém está ouvindo esta sessão agora._ [Chamar o Claude](command:pairGuide.callClaude) _ou volte ao chat e diga “li o pair-dude”._';
        const body = new vscode.MarkdownString(text);
        body.isTrusted = { enabledCommands: ['pairGuide.callClaude'] };
        return { body, mode: vscode.CommentMode.Preview, author: { name: 'Pair Dude' } };
    }
    presenceKey() {
        const presence = this.session ? this.store.readPresence(this.session.id) : { state: 'offline' };
        return `${presence.state}`;
    }
    rebuildThread() {
        const session = this.session;
        const thread = this.thread;
        if (!session || !thread || !this.threadStepId) {
            return;
        }
        const index = session.steps.findIndex((item) => item.id === this.threadStepId);
        if (index < 0) {
            return;
        }
        const comments = this.buildComments(session, session.steps[index], index, this.threadAnchor);
        const signature = commentsSignature(comments);
        if (signature === this.commentsSignature) {
            return;
        }
        this.commentsSignature = signature;
        thread.comments = comments;
    }
    notifyNewReplies(previous, next) {
        if (!previous || previous.id !== next.id) {
            return;
        }
        for (const step of next.steps) {
            const before = previous.steps.find((item) => item.id === step.id)?.replies?.length ?? 0;
            if ((step.replies?.length ?? 0) <= before) {
                continue;
            }
            if (step.id === this.state?.current) {
                vscode.window.setStatusBarMessage('$(comment-discussion) Claude respondeu', 5000);
            }
            else {
                void vscode.window
                    .showInformationMessage(`Claude respondeu no passo "${step.title}".`, 'Abrir')
                    .then((choice) => (choice ? this.show(step.id) : undefined));
            }
        }
    }
    async callClaude() {
        const session = this.session;
        if (!session) {
            return;
        }
        const prompt = `Leia as mensagens novas do Pair Dude da sessão "${session.id}" (node ~/.claude/skills/pair-dude/scripts/pg.mjs inbox ${session.id}) e responda no balão.`;
        const commands = await vscode.commands.getCommands(true);
        if (session.claudeSession && commands.includes('claude-vscode.primaryEditor.open')) {
            await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', session.claudeSession, prompt);
            vscode.window.setStatusBarMessage('Pair Dude: conversa do Claude aberta com o pedido — confirme o envio se precisar.', 6000);
            return;
        }
        await vscode.env.clipboard.writeText(prompt);
        void vscode.window.showInformationMessage('Pair Dude: pedido copiado. Cole no chat do Claude que criou esta sessão.');
    }
    async afterSend() {
        this.rebuildThread();
        if (this.session && this.store.readPresence(this.session.id).state === 'offline') {
            const choice = await vscode.window.showInformationMessage('Registrado, mas ninguém está ouvindo esta sessão agora.', 'Chamar o Claude');
            if (choice) {
                await this.callClaude();
            }
        }
    }
    virtualContent(uri) {
        const [, sessionId] = uri.path.split('/');
        const session = this.session?.id === sessionId ? this.session : this.store.readSession(sessionId).session;
        if (!session) {
            return '# Sessão não encontrada';
        }
        return (0, render_1.buildSummaryMarkdown)(session, this.state?.sessionId === session.id ? this.state : this.store.readState(session.id));
    }
    async move(delta) {
        const session = this.session;
        if (!session || session.steps.length === 0) {
            return;
        }
        const current = session.steps.findIndex((step) => step.id === this.state?.current);
        const target = current < 0 ? 0 : current + delta;
        if (target < 0) {
            void vscode.window.showInformationMessage('Pair Dude: este é o primeiro passo.');
            return;
        }
        if (target >= session.steps.length) {
            void vscode.window.showInformationMessage('Pair Dude: fim do roteiro. Avise o Claude no chat.');
            return;
        }
        await this.show(session.steps[target].id);
    }
    async decide(decision, text, stepId) {
        const session = this.session;
        const state = this.state;
        const id = stepId ?? state?.current;
        if (!session || !state || !id) {
            return;
        }
        state.steps[id] = { ...state.steps[id], decision, note: text, at: new Date().toISOString() };
        this.store.writeState(state);
        this.store.appendEvent(session.id, { type: decision, step: id, text });
        this.tree.refresh();
        const advance = vscode.workspace.getConfiguration('pairGuide').get('autoAdvance', true);
        if (decision === 'changes') {
            await this.afterSend();
            return;
        }
        if (advance && id === state.current) {
            await this.move(1);
        }
        else if (this.thread && this.threadStepId === id) {
            this.thread.state = vscode.CommentThreadState.Resolved;
        }
    }
    async requestChange(arg) {
        const session = this.session;
        const id = isReply(arg) ? this.threadStepId : stepIdOf(arg) ?? this.state?.current;
        if (!session || !id) {
            return;
        }
        let text = isReply(arg) ? arg.text.trim() : '';
        if (!text) {
            text = (await vscode.window.showInputBox({ prompt: 'O que precisa mudar neste passo?', ignoreFocusOut: true }))?.trim() ?? '';
        }
        if (!text) {
            return;
        }
        await this.decide('changes', text, id);
    }
    async reply(arg) {
        const session = this.session;
        if (!arg || !arg.text.trim()) {
            return;
        }
        const text = arg.text.trim();
        if (arg.thread === this.thread && session && this.threadStepId) {
            this.store.appendEvent(session.id, { type: 'reply', step: this.threadStepId, text });
            await this.afterSend();
            return;
        }
        this.appendUserComment(arg.thread, text);
        if (session) {
            await this.recordAsk(session, arg.thread, text);
            arg.thread.comments = [...arg.thread.comments.filter((item) => item.author.name !== 'Pair Dude'), this.statusComment()];
            this.commentsSignature = '';
            if (this.store.readPresence(session.id).state === 'offline') {
                const choice = await vscode.window.showInformationMessage('Registrado, mas ninguém está ouvindo esta sessão agora.', 'Chamar o Claude');
                if (choice) {
                    await this.callClaude();
                }
            }
        }
    }
    async recordAsk(session, thread, text) {
        this.userThreads.add(thread);
        let snippet;
        try {
            const doc = await vscode.workspace.openTextDocument(thread.uri);
            snippet = thread.range ? doc.getText(thread.range).slice(0, 4000) : undefined;
        }
        catch {
            snippet = undefined;
        }
        this.store.appendEvent(session.id, {
            type: 'ask',
            text,
            file: thread.uri.fsPath,
            startLine: thread.range ? thread.range.start.line + 1 : undefined,
            endLine: thread.range ? thread.range.end.line + 1 : undefined,
            snippet,
        });
    }
    appendUserComment(thread, text) {
        thread.comments = [
            ...thread.comments,
            { body: new vscode.MarkdownString(text), mode: vscode.CommentMode.Preview, author: AUTHOR_USER },
        ];
        this.commentsSignature = '';
    }
    async pickStep() {
        const session = this.session;
        if (!session) {
            return;
        }
        const pick = await vscode.window.showQuickPick(session.steps.map((step, index) => {
            const decision = this.state?.steps[step.id]?.decision;
            return {
                label: `${index + 1}. ${render_1.KIND_META[step.kind].emoji} ${step.title}`,
                description: decision ? decision : step.file ? path.basename(step.file) : '',
                id: step.id,
            };
        }), { placeHolder: session.title });
        if (pick) {
            await this.show(pick.id);
        }
    }
    async pickSession() {
        const sessions = this.store.listSessions();
        if (sessions.length === 0) {
            void vscode.window.showInformationMessage('Pair Dude: nenhuma sessão encontrada.');
            return;
        }
        const pick = await vscode.window.showQuickPick(sessions.map((info) => ({ label: info.title, description: `${info.mode} · ${new Date(info.mtime).toLocaleString()}`, id: info.id })), { placeHolder: 'Escolha a sessão' });
        if (pick) {
            await this.openSession(pick.id, true);
        }
    }
    async showSummary() {
        if (!this.session) {
            return;
        }
        const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${this.session.id}/resumo.md` });
        this.contentChanged.fire(uri);
        try {
            await vscode.commands.executeCommand('markdown.showPreview', uri);
        }
        catch {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
        }
    }
    hide() {
        this.token++;
        this.clearView();
    }
    clearView() {
        this.thread?.dispose();
        this.thread = undefined;
        this.threadStepId = undefined;
        this.decorations.clear();
    }
    scheduleReanchor(document) {
        const active = this.session?.steps.find((item) => item.id === this.threadStepId);
        if (active?.compare?.type === 'proposed' && this.session && document.uri.scheme === 'file') {
            const target = this.compare.target(this.session, active);
            if (target && path.resolve(target).toLowerCase() === path.resolve(document.uri.fsPath).toLowerCase()) {
                clearTimeout(this.reanchorTimer);
                this.reanchorTimer = setTimeout(() => void this.show(active.id, { refresh: true }), 1200);
            }
            return;
        }
        if (!this.thread || document.uri.toString() !== this.thread.uri.toString()) {
            return;
        }
        clearTimeout(this.reanchorTimer);
        this.reanchorTimer = setTimeout(() => {
            const step = this.session?.steps.find((item) => item.id === this.threadStepId);
            if (!step || !this.thread) {
                return;
            }
            const { range } = (0, anchor_1.resolveRange)(document, step);
            this.thread.range = range;
            this.decorations.move(range, (0, anchor_1.focusRanges)(document, range, step.focus));
        }, 600);
    }
    refreshChrome() {
        const session = this.session;
        this.tree.set(session, this.state);
        if (!session) {
            this.status.hide();
            return;
        }
        const index = session.steps.findIndex((step) => step.id === this.state?.current);
        const presence = this.store.readPresence(session.id).state;
        const dot = presence === 'listening' ? '🟢' : presence === 'thinking' ? '✍️' : '⚪';
        const meaning = presence === 'listening'
            ? 'Claude está ouvindo'
            : presence === 'thinking'
                ? 'Claude está respondendo'
                : 'ninguém está ouvindo (volte ao chat e diga “li o pair-dude”)';
        this.status.text = `$(comment-discussion) ${index + 1}/${session.steps.length} ${dot}`;
        this.status.tooltip = `${session.title} — ${meaning}. Clique para escolher um passo.`;
        this.status.show();
        const node = this.state?.current ? this.tree.nodeFor(this.state.current) : undefined;
        if (node && this.treeView.visible) {
            void this.treeView.reveal(node, { select: false, focus: false, expand: true }).then(undefined, () => undefined);
        }
    }
}
exports.Guide = Guide;
function commentsSignature(comments) {
    return JSON.stringify(comments.map((comment) => [
        typeof comment.body === 'string' ? comment.body : comment.body.value,
        comment.author.name,
        comment.label ?? '',
    ]));
}
function hashOf(step) {
    return JSON.stringify(step);
}
function isReply(arg) {
    return typeof arg === 'object' && arg !== null && 'thread' in arg && 'text' in arg;
}
function stepIdOf(arg) {
    if (typeof arg === 'object' && arg !== null && arg.type === 'step') {
        return arg.step.id;
    }
    return undefined;
}
