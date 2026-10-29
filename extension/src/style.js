"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferLanguage = inferLanguage;
exports.stylize = stylize;
exports.fenced = fenced;
exports.badge = badge;
exports.colored = colored;
const PALETTES = {
    dark: {
        keyword: '#c586c0',
        function: '#dcdcaa',
        type: '#4ec9b0',
        constant: '#4fc1ff',
        property: '#9cdcfe',
        variable: '#9cdcfe',
        string: '#ce9178',
        number: '#b5cea8',
    },
    light: {
        keyword: '#af00db',
        function: '#795e26',
        type: '#267f99',
        constant: '#0070c1',
        property: '#001080',
        variable: '#001080',
        string: '#a31515',
        number: '#098658',
    },
};
const KEYWORDS = new Set([
    'const', 'let', 'var', 'return', 'if', 'else', 'new', 'async', 'await', 'export', 'import', 'from', 'class',
    'interface', 'enum', 'type', 'true', 'false', 'null', 'undefined', 'this', 'function', 'readonly', 'private',
    'public', 'protected', 'static', 'void', 'extends', 'implements', 'in', 'of', 'for', 'while', 'switch', 'case',
    'throw', 'try', 'catch', 'public', 'abstract', 'string', 'number', 'boolean',
]);
const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;
const TOKEN = /'[^'\n]*'|"[^"\n]*"|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*/g;
const LANGUAGE_BY_EXTENSION = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    json: 'json',
    html: 'html',
    scss: 'scss',
    css: 'css',
    cs: 'csharp',
    py: 'python',
    java: 'java',
    kt: 'kotlin',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shellscript',
    ps1: 'powershell',
    xml: 'xml',
};
function inferLanguage(file) {
    const extension = file?.split('.').pop()?.toLowerCase() ?? '';
    return LANGUAGE_BY_EXTENSION[extension] ?? '';
}
function stylize(text, language, options) {
    let result = '';
    let last = 0;
    const fences = new RegExp(FENCE.source, 'g');
    let match;
    while ((match = fences.exec(text))) {
        result += styleInlineCode(text.slice(last, match.index), options);
        const tag = match[1].trim() || language;
        result += `\`\`\`${tag}\n${match[2]}\`\`\``;
        last = match.index + match[0].length;
    }
    return result + styleInlineCode(text.slice(last), options);
}
function fenced(code, language) {
    return `\`\`\`${language}\n${code.replace(/\n$/, '')}\n\`\`\``;
}
function badge(label, background, options) {
    return options.rich
        ? `<span style="color:#ffffff;background-color:${background};">&nbsp;${escapeHtml(label)}&nbsp;</span>`
        : `**${label}**`;
}
function colored(text, color, options) {
    return options.rich ? `<span style="color:${color};">${escapeHtml(text)}</span>` : text;
}
function styleInlineCode(text, options) {
    if (!options.rich) {
        return text;
    }
    return text.replace(/`([^`\n]+)`/g, (_match, code) => `<code>${highlight(code, options)}</code>`);
}
function highlight(code, options) {
    const palette = PALETTES[options.dark ? 'dark' : 'light'];
    const token = new RegExp(TOKEN.source, 'g');
    let out = '';
    let last = 0;
    let match;
    while ((match = token.exec(code))) {
        out += escapeHtml(code.slice(last, match.index));
        const text = match[0];
        const role = roleOf(text, code[match.index - 1], code[match.index + text.length]);
        out += role ? `<span style="color:${palette[role]};">${escapeHtml(text)}</span>` : escapeHtml(text);
        last = match.index + text.length;
    }
    return out + escapeHtml(code.slice(last));
}
function roleOf(token, previous, next) {
    if (token.startsWith("'") || token.startsWith('"')) {
        return 'string';
    }
    if (/^\d/.test(token)) {
        return 'number';
    }
    if (KEYWORDS.has(token)) {
        return 'keyword';
    }
    if (next === '(') {
        return 'function';
    }
    if (/^[A-Z][A-Z0-9_]+$/.test(token)) {
        return 'constant';
    }
    if (/^[A-Z]/.test(token)) {
        return previous === '.' ? 'property' : 'type';
    }
    return previous === '.' ? 'property' : 'variable';
}
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
