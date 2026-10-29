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
exports.DECISION_LABEL = exports.KIND_META = void 0;
exports.buildBody = buildBody;
exports.buildSummaryMarkdown = buildSummaryMarkdown;
exports.plainBody = plainBody;
const vscode = __importStar(require("vscode"));
const style_1 = require("./style");
exports.KIND_META = {
    explain: { emoji: '💡', label: 'Explicação', icon: 'book', color: '#2f6fb3' },
    review: { emoji: '🔎', label: 'Revisão', icon: 'search', color: '#b7791f' },
    risk: { emoji: '⚠️', label: 'Risco', icon: 'warning', color: '#c0392b' },
    change: { emoji: '✏️', label: 'Mudança', icon: 'edit', color: '#2e8b57' },
    plan: { emoji: '🧭', label: 'Plano', icon: 'checklist', color: '#7b4fc2' },
    question: { emoji: '❓', label: 'Pergunta', icon: 'question', color: '#1b8a99' },
    note: { emoji: '📝', label: 'Nota', icon: 'note', color: '#6b7280' },
};
const SEVERITY_META = {
    info: { label: 'informativo', color: '#6b7280' },
    low: { label: 'baixa', color: '#2e8b57' },
    medium: { label: 'média', color: '#b7791f' },
    high: { label: 'alta', color: '#d9480f' },
    blocker: { label: 'bloqueante', color: '#c0392b' },
};
const PROGRESS_META = {
    planned: { label: '⏳ planejado', color: '#6b7280' },
    doing: { label: '🔧 em andamento', color: '#b7791f' },
    done: { label: '✅ concluído', color: '#2e8b57' },
    skipped: { label: '⏭️ descartado', color: '#6b7280' },
};
const CALLOUT_META = {
    why: { emoji: '🧠', label: 'Por quê', color: '#7b4fc2' },
    tip: { emoji: '💡', label: 'Dica', color: '#2e8b57' },
    info: { emoji: 'ℹ️', label: 'Contexto', color: '#2f6fb3' },
    warning: { emoji: '⚠️', label: 'Atenção', color: '#b7791f' },
    danger: { emoji: '⛔', label: 'Risco', color: '#c0392b' },
};
exports.DECISION_LABEL = {
    understood: 'entendi',
    approved: 'aprovado',
    changes: 'ajuste pedido',
};
function buildBody(step, index, total, anchor, style) {
    const parts = [header(step, index, total, style), `### ${step.title}`];
    if (anchor === 'missing') {
        parts.push('> ⚠️ Âncora não encontrada no arquivo; usando as linhas informadas.');
    }
    parts.push(...content(step, style));
    const md = new vscode.MarkdownString(parts.join('\n\n'));
    md.isTrusted = { enabledCommands: ['pairGuide.openDiagram'] };
    md.supportHtml = style.rich;
    md.supportThemeIcons = true;
    return md;
}
function buildSummaryMarkdown(session, state) {
    const lines = [`# ${session.title}`, '', `Modo: **${session.mode}** · ${session.steps.length} passos`];
    if (session.summary) {
        lines.push('', session.summary);
    }
    lines.push('', '## Passos', '');
    session.steps.forEach((step, index) => {
        const decision = state.steps[step.id]?.decision;
        const flags = [decision ? exports.DECISION_LABEL[decision] : undefined, step.progress ? PROGRESS_META[step.progress].label : undefined]
            .filter(Boolean)
            .join(' · ');
        const where = step.file ? ` — \`${step.file}${step.startLine ? `:${step.startLine}` : ''}\`` : '';
        lines.push(`${index + 1}. ${exports.KIND_META[step.kind].emoji} **${step.title}**${where}${flags ? ` _(${flags})_` : ''}`);
    });
    return lines.join('\n');
}
function plainBody(step) {
    return (step.body ?? '').replace(/```[\s\S]*?```/g, '_(código ou diagrama)_');
}
function header(step, index, total, style) {
    const meta = exports.KIND_META[step.kind];
    const pieces = [(0, style_1.badge)(`${meta.emoji} ${meta.label}`, meta.color, style)];
    if (step.severity) {
        pieces.push((0, style_1.badge)(`severidade ${SEVERITY_META[step.severity].label}`, SEVERITY_META[step.severity].color, style));
    }
    if (step.progress) {
        pieces.push((0, style_1.colored)(PROGRESS_META[step.progress].label, PROGRESS_META[step.progress].color, style));
    }
    if (step.compare) {
        const label = step.compare.type === 'implemented' ? '⇄ antes → implementado' : '⇄ atual → proposto';
        pieces.push((0, style_1.badge)(label, step.compare.type === 'implemented' ? '#2e8b57' : '#7b4fc2', style));
    }
    pieces.push(`passo ${index + 1}/${total}`);
    return pieces.join(' ');
}
function content(step, style) {
    const language = (0, style_1.inferLanguage)(step.file);
    const parts = [];
    if (step.body) {
        parts.push((0, style_1.stylize)(step.body, language, style));
    }
    for (const callout of step.callouts ?? []) {
        parts.push(calloutMarkdown(callout, language, style));
    }
    for (const snippet of step.snippets ?? []) {
        const title = snippet.title ? `**${snippet.title}**\n\n` : '';
        const caption = snippet.caption ? `\n\n_${snippet.caption}_` : '';
        parts.push(`${title}${(0, style_1.fenced)(snippet.code, snippet.language ?? language)}${caption}`);
    }
    if (step.diff) {
        parts.push(`**Diff**\n\n${(0, style_1.fenced)(step.diff, 'diff')}`);
    }
    if (step.proposal) {
        parts.push(`**Proposta**\n\n${(0, style_1.fenced)(step.proposal.code, step.proposal.language ?? language)}`);
    }
    return parts;
}
function calloutMarkdown(callout, language, style) {
    const meta = CALLOUT_META[callout.type] ?? CALLOUT_META.info;
    const label = `**${(0, style_1.colored)(callout.title ?? meta.label, meta.color, style)}**`;
    const text = (0, style_1.stylize)(callout.text, language, style);
    return `> ${meta.emoji} ${label} — ${text.split('\n').join('\n> ')}`;
}
