/**
 * preload.js — Context bridge for renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    openFile: () => ipcRenderer.invoke('file:open'),
    saveFile: (data) => ipcRenderer.invoke('file:save', data),
    loadExample: (name) => ipcRenderer.invoke('file:loadExample', name),
});

// Expose compiler modules directly (they're pure JS, no Node APIs needed at runtime)
contextBridge.exposeInMainWorld('compiler', {
    Lexer: require('./compiler/lexer').Lexer,
    TokenType: require('./compiler/lexer').TokenType,
    tokenTypeName: require('./compiler/lexer').tokenTypeName,
    tokenCategory: require('./compiler/lexer').tokenCategory,
    tokenizeAll: require('./compiler/lexer').tokenizeAll,
    CompileError: require('./compiler/lexer').CompileError,
    NodeType: require('./compiler/ast').NodeType,
    ASTNode: require('./compiler/ast').ASTNode,
    NODE_LABELS: require('./compiler/ast').NODE_LABELS,
    parse: require('./compiler/parser').parse,
    OpCode: require('./compiler/compiler').OpCode,
    opName: require('./compiler/compiler').opName,
    compile: require('./compiler/compiler').compile,
    disassemble: require('./compiler/compiler').disassemble,
    vmExecute: require('./compiler/vm').vmExecute,
    VMError: require('./compiler/vm').VMError,
});
