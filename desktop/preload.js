/**
 * preload.js — Context bridge for renderer.
 * Must wrap all compiler calls as plain functions since contextBridge
 * cannot transfer class constructors across the isolation boundary.
 */
const { contextBridge, ipcRenderer } = require('electron');

const { Lexer, tokenizeAll, tokenTypeName, tokenCategory, CompileError } = require('./compiler/lexer');
const { NodeType, ASTNode, NODE_LABELS } = require('./compiler/ast');
const { parse } = require('./compiler/parser');
const { OpCode, opName, compile, disassemble } = require('./compiler/compiler');
const { vmExecute, VMError } = require('./compiler/vm');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    openFile: () => ipcRenderer.invoke('file:open'),
    saveFile: (data) => ipcRenderer.invoke('file:save', data),
    loadExample: (name) => ipcRenderer.invoke('file:loadExample', name),
});

/**
 * Expose compiler as plain function wrappers.
 * contextBridge strips class prototypes, so we serialize everything.
 */
contextBridge.exposeInMainWorld('compiler', {
    // Constants (plain objects pass through fine)
    NODE_LABELS: { ...NODE_LABELS },

    // Utility functions
    tokenTypeName: (t) => tokenTypeName(t),
    opName: (op) => opName(op),

    /**
     * Full compile-and-run pipeline.
     * Returns a plain serializable result object.
     */
    compileAndRun: (source, inputValues) => {
        const result = {
            tokens: null,
            ast: null,
            bytecode: null,
            semanticInfo: null,
            execution: null,
            error: null,
            errorPhase: null,
        };

        try {
            // Phase 1: Tokenize
            result.tokens = tokenizeAll(source);

            // Phase 2: Parse
            const lexer = new Lexer(source);
            const ast = parse(lexer);
            result.ast = astToPlain(ast);

            // Phase 3: Compile
            const { program, semanticInfo } = compile(ast);
            result.bytecode = disassemble(program);
            result.semanticInfo = JSON.parse(JSON.stringify(semanticInfo));

            // Phase 4: Execute
            const funcTable = semanticInfo.functions.map(f => ({
                name: f.name,
                address: f.address,
                nParams: f.params.length,
            }));

            let inputIdx = 0;
            const outputs = [];

            const execResult = vmExecute(program, {
                onOutput: (val) => { outputs.push(val); },
                onInput: () => {
                    if (inputValues && inputIdx < inputValues.length) {
                        return inputValues[inputIdx++];
                    }
                    return 0;
                },
                onCall: () => {},
                onReturn: () => {},
                funcTable,
            });

            result.execution = {
                exitCode: execResult.exitCode,
                outputs: execResult.outputs,
                callStackHistory: execResult.callStackHistory,
                maxRecursionDepth: execResult.maxRecursionDepth,
                stepCount: execResult.stepCount,
            };

        } catch (e) {
            result.error = {
                message: e.message,
                line: e.line || -1,
                name: e.name || 'Error',
            };
            // Determine which phase failed
            if (!result.tokens) result.errorPhase = 'lexer';
            else if (!result.ast) result.errorPhase = 'parser';
            else if (!result.bytecode) result.errorPhase = 'compiler';
            else result.errorPhase = 'vm';
        }

        return result;
    },

    /**
     * Tokenize only (for quick visualization without full compile).
     */
    tokenize: (source) => {
        try {
            return { tokens: tokenizeAll(source), error: null };
        } catch (e) {
            return { tokens: null, error: { message: e.message, line: e.line || -1 } };
        }
    },
});

/**
 * Convert AST node tree to a plain JSON-serializable object.
 */
function astToPlain(node) {
    if (!node) return null;

    const obj = {
        type: node.type,
        line: node.line,
        int_value: node.int_value,
        name: node.name,
        op: node.op,
        data_type: node.data_type,
        cond: astToPlain(node.cond),
        body: astToPlain(node.body),
        else_body: astToPlain(node.else_body),
        init: astToPlain(node.init),
        update: astToPlain(node.update),
        expr: astToPlain(node.expr),
        left: astToPlain(node.left),
        right: astToPlain(node.right),
        items: node.items ? node.items.map(i => astToPlain(i)) : [],
    };

    return obj;
}
