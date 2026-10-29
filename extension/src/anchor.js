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
exports.resolveRange = resolveRange;
exports.focusRanges = focusRanges;
const vscode = __importStar(require("vscode"));
function resolveRange(doc, step) {
    const lastLine = Math.max(doc.lineCount - 1, 0);
    const requestedStart = clamp((step.startLine ?? 1) - 1, 0, lastLine);
    const requestedEnd = clamp((step.endLine ?? step.startLine ?? 1) - 1, requestedStart, lastLine);
    let start = requestedStart;
    let end = requestedEnd;
    let anchor = 'none';
    if (step.anchor) {
        const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const needle = step.anchor.replace(/\r?\n/g, eol);
        const hits = indexesOf(doc.getText(), needle);
        if (hits.length > 0) {
            const best = hits.reduce((a, b) => Math.abs(doc.positionAt(a).line - requestedStart) <= Math.abs(doc.positionAt(b).line - requestedStart) ? a : b);
            const from = doc.positionAt(best);
            const to = doc.positionAt(best + needle.length);
            const span = requestedEnd - requestedStart;
            start = from.line;
            end = clamp(Math.max(to.line, start + span), start, lastLine);
            anchor = 'found';
        }
        else {
            anchor = 'missing';
        }
    }
    return { range: new vscode.Range(start, 0, end, doc.lineAt(end).range.end.character), anchor };
}
function focusRanges(doc, range, focus) {
    if (!focus?.length) {
        return [];
    }
    const text = doc.getText();
    const from = doc.offsetAt(range.start);
    const to = doc.offsetAt(range.end);
    const found = [];
    for (const term of focus) {
        if (!term) {
            continue;
        }
        for (const index of indexesOf(text, term)) {
            if (index >= from && index + term.length <= to) {
                found.push(new vscode.Range(doc.positionAt(index), doc.positionAt(index + term.length)));
            }
        }
    }
    return found;
}
function indexesOf(text, needle) {
    const hits = [];
    if (!needle) {
        return hits;
    }
    let index = text.indexOf(needle);
    while (index !== -1) {
        hits.push(index);
        index = text.indexOf(needle, index + 1);
    }
    return hits;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
