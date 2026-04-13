/**
 * preload.js — Context bridge for renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Window controls API
contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    openFile: () => ipcRenderer.invoke('file:open'),
    saveFile: (data) => ipcRenderer.invoke('file:save', data),
    loadExample: (name) => ipcRenderer.invoke('file:loadExample', name),
});

// Load compiler modules with error catching
let Lexer, tokenizeAll, tokenTypeName, CompileError;
let NodeType, ASTNode, NODE_LABELS;
let parseFn;
let OpCode, opName, compileFn, disassemble;
let vmExecute;

try {
    const lexerMod = require('./compiler/lexer');
    Lexer = lexerMod.Lexer;
    tokenizeAll = lexerMod.tokenizeAll;
    tokenTypeName = lexerMod.tokenTypeName;
    CompileError = lexerMod.CompileError;
    console.log('[preload] lexer loaded OK');
} catch (e) {
    console.error('[preload] FAILED to load lexer:', e.message);
}

try {
    const astMod = require('./compiler/ast');
    NodeType = astMod.NodeType;
    ASTNode = astMod.ASTNode;
    NODE_LABELS = astMod.NODE_LABELS;
    console.log('[preload] ast loaded OK');
} catch (e) {
    console.error('[preload] FAILED to load ast:', e.message);
}

try {
    const parserMod = require('./compiler/parser');
    parseFn = parserMod.parse;
    console.log('[preload] parser loaded OK');
} catch (e) {
    console.error('[preload] FAILED to load parser:', e.message);
}

try {
    const compilerMod = require('./compiler/compiler');
    OpCode = compilerMod.OpCode;
    opName = compilerMod.opName;
    compileFn = compilerMod.compile;
    disassemble = compilerMod.disassemble;
    console.log('[preload] compiler loaded OK');
} catch (e) {
    console.error('[preload] FAILED to load compiler:', e.message);
}

try {
    const vmMod = require('./compiler/vm');
    vmExecute = vmMod.vmExecute;
    console.log('[preload] vm loaded OK');
} catch (e) {
    console.error('[preload] FAILED to load vm:', e.message);
}

const allLoaded = Lexer && tokenizeAll && parseFn && compileFn && vmExecute;
console.log('[preload] all modules loaded:', allLoaded);

/**
 * Expose compiler pipeline.
 * Returns JSON string to avoid contextBridge structured-clone issues.
 */
contextBridge.exposeInMainWorld('compiler', {
    ready: allLoaded ? true : false,

    compileAndRun: (source, inputValuesJSON) => {
        if (!allLoaded) {
            return JSON.stringify({
                error: { message: 'Compiler modules failed to load. Check DevTools console.', line: -1 }
            });
        }

        const inputValues = inputValuesJSON ? JSON.parse(inputValuesJSON) : [];
        const result = {
            tokens: null,
            ast: null,
            bytecode: null,
            semanticInfo: null,
            execution: null,
            error: null,
        };

        try {
            // Phase 1: Tokenize
            result.tokens = tokenizeAll(source);

            // Phase 2: Parse (needs a fresh lexer instance)
            const lexer = new Lexer(source);
            const ast = parseFn(lexer);
            result.ast = astToPlain(ast);

            // Phase 3: Compile
            const compiled = compileFn(ast);
            result.bytecode = disassemble(compiled.program);
            result.semanticInfo = JSON.parse(JSON.stringify(compiled.semanticInfo));

            // Phase 4: Execute
            const funcTable = compiled.semanticInfo.functions.map(f => ({
                name: f.name,
                address: f.address,
                nParams: f.params.length,
            }));

            let inputIdx = 0;

            const execResult = vmExecute(compiled.program, {
                onOutput: () => {},
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
                message: e.message || String(e),
                line: e.line || -1,
            };
        }

        return JSON.stringify(result);
    },
});

console.log('[preload] contextBridge exposed OK');

/**
 * Convert AST to plain serializable object.
 */
function astToPlain(node) {
    if (!node) return null;
    const obj = { type: node.type, line: node.line };
    if (node.int_value !== 0 || node.type === 'NODE_NUMBER') obj.int_value = node.int_value;
    if (node.name) obj.name = node.name;
    if (node.op) obj.op = node.op;
    if (node.data_type) obj.data_type = node.data_type;
    if (node.cond) obj.cond = astToPlain(node.cond);
    if (node.body) obj.body = astToPlain(node.body);
    if (node.else_body) obj.else_body = astToPlain(node.else_body);
    if (node.init) obj.init = astToPlain(node.init);
    if (node.update) obj.update = astToPlain(node.update);
    if (node.expr) obj.expr = astToPlain(node.expr);
    if (node.left) obj.left = astToPlain(node.left);
    if (node.right) obj.right = astToPlain(node.right);
    if (node.items && node.items.length > 0) obj.items = node.items.map(i => astToPlain(i));
    return obj;
}
