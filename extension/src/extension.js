"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const diagrams_1 = require("./diagrams");
const guide_1 = require("./guide");
const store_1 = require("./store");
function activate(context) {
    const store = new store_1.Store();
    const diagrams = new diagrams_1.DiagramService(context.extensionPath, store.dataDir);
    const guide = new guide_1.Guide(store, diagrams);
    context.subscriptions.push(store, diagrams, guide);
    guide.register(context);
}
function deactivate() { }
