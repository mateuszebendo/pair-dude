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
exports.StepsTree = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const render_1 = require("./render");
class StepsTree {
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    session;
    state;
    groups = [];
    nodes = [];
    set(session, state) {
        this.session = session;
        this.state = state;
        this.build();
        this.emitter.fire();
    }
    refresh() {
        this.emitter.fire();
    }
    nodeFor(stepId) {
        return this.nodes.find((node) => node.step.id === stepId);
    }
    getChildren(element) {
        if (!element) {
            return this.groups.length ? this.groups : this.nodes;
        }
        return element.type === 'group' ? this.nodes.filter((node) => node.parent === element) : [];
    }
    getParent(element) {
        return element.type === 'step' ? element.parent : undefined;
    }
    getTreeItem(element) {
        if (element.type === 'group') {
            const done = element.steps.filter((step) => this.isDone(step)).length;
            const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Expanded);
            item.description = `${done}/${element.steps.length}`;
            item.iconPath = new vscode.ThemeIcon('folder');
            return item;
        }
        const { step, index } = element;
        const item = new vscode.TreeItem(`${index + 1}. ${step.title}`, vscode.TreeItemCollapsibleState.None);
        const isCurrent = this.state?.current === step.id;
        const where = step.file ? `${path.basename(step.file)}${step.startLine ? `:${step.startLine}` : ''}` : '';
        item.description = [isCurrent ? '▶' : '', step.compare ? '⇄' : '', where].filter(Boolean).join(' ');
        item.iconPath = this.iconFor(step, isCurrent);
        item.contextValue = 'step';
        item.command = { command: 'pairGuide.goto', title: 'Ir para o passo', arguments: [step.id] };
        const text = (0, render_1.plainBody)(step);
        const tip = new vscode.MarkdownString(`**${step.title}**${text ? `\n\n${text}` : ''}`);
        tip.isTrusted = false;
        item.tooltip = tip;
        return item;
    }
    iconFor(step, isCurrent) {
        const decision = this.state?.steps[step.id]?.decision;
        if (isCurrent) {
            return new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.blue'));
        }
        if (decision === 'approved') {
            return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
        }
        if (decision === 'understood') {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        }
        if (decision === 'changes') {
            return new vscode.ThemeIcon('request-changes', new vscode.ThemeColor('charts.orange'));
        }
        if (step.progress === 'done') {
            return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
        }
        if (step.progress === 'doing') {
            return new vscode.ThemeIcon('loading~spin');
        }
        if (step.progress === 'skipped') {
            return new vscode.ThemeIcon('circle-slash');
        }
        return new vscode.ThemeIcon(render_1.KIND_META[step.kind].icon);
    }
    isDone(step) {
        return Boolean(this.state?.steps[step.id]?.decision) || step.progress === 'done';
    }
    build() {
        this.groups = [];
        this.nodes = [];
        if (!this.session) {
            return;
        }
        const hasGroups = this.session.steps.some((step) => step.group);
        const byName = new Map();
        this.session.steps.forEach((step, index) => {
            let parent;
            if (hasGroups) {
                const name = step.group ?? 'Geral';
                parent = byName.get(name);
                if (!parent) {
                    parent = { type: 'group', name, steps: [] };
                    byName.set(name, parent);
                    this.groups.push(parent);
                }
                parent.steps.push(step);
            }
            this.nodes.push({ type: 'step', step, index, parent });
        });
    }
}
exports.StepsTree = StepsTree;
