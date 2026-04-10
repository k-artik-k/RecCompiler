/**
 * compiler.js — Direct port of src/compiler.c
 * Compiles AST to bytecode for the stack VM.
 */

const { TokenType, CompileError, tokenTypeName } = require('./lexer');
const { NodeType } = require('./ast');

const OpCode = Object.freeze({
    OP_CONST:  0,
    OP_POP:    1,
    OP_ADD:    2,
    OP_SUB:    3,
    OP_MUL:    4,
    OP_DIV:    5,
    OP_MOD:    6,
    OP_NEG:    7,
    OP_EQ:     8,
    OP_NEQ:    9,
    OP_LT:    10,
    OP_GT:    11,
    OP_LTE:   12,
    OP_GTE:   13,
    OP_AND:   14,
    OP_OR:    15,
    OP_NOT:   16,
    OP_LOAD:  17,
    OP_STORE: 18,
    OP_JMP:   19,
    OP_JZ:    20,
    OP_CALL:  21,
    OP_RET:   22,
    OP_ENTER: 23,
    OP_PRINT: 24,
    OP_SCAN:  25,
    OP_HALT:  26,
});

const OP_NAMES = {
    [OpCode.OP_CONST]:  'CONST',
    [OpCode.OP_POP]:    'POP',
    [OpCode.OP_ADD]:    'ADD',
    [OpCode.OP_SUB]:    'SUB',
    [OpCode.OP_MUL]:    'MUL',
    [OpCode.OP_DIV]:    'DIV',
    [OpCode.OP_MOD]:    'MOD',
    [OpCode.OP_NEG]:    'NEG',
    [OpCode.OP_EQ]:     'EQ',
    [OpCode.OP_NEQ]:    'NEQ',
    [OpCode.OP_LT]:     'LT',
    [OpCode.OP_GT]:     'GT',
    [OpCode.OP_LTE]:    'LTE',
    [OpCode.OP_GTE]:    'GTE',
    [OpCode.OP_AND]:    'AND',
    [OpCode.OP_OR]:     'OR',
    [OpCode.OP_NOT]:    'NOT',
    [OpCode.OP_LOAD]:   'LOAD',
    [OpCode.OP_STORE]:  'STORE',
    [OpCode.OP_JMP]:    'JMP',
    [OpCode.OP_JZ]:     'JZ',
    [OpCode.OP_CALL]:   'CALL',
    [OpCode.OP_RET]:    'RET',
    [OpCode.OP_ENTER]:  'ENTER',
    [OpCode.OP_PRINT]:  'PRINT',
    [OpCode.OP_SCAN]:   'SCAN',
    [OpCode.OP_HALT]:   'HALT',
};

function opName(op) {
    return OP_NAMES[op] || '???';
}

class Program {
    constructor() {
        this.code = [];
        this.count = 0;
        this.entry = -1;
    }
}

const MAX_LOCALS = 256;
const MAX_FUNCTIONS = 64;
const MAX_PATCHES = 512;

class Compiler {
    constructor() {
        this.prog = new Program();
        this.locals = [];
        this.localCount = 0;
        this.scopeDepth = 0;
        this.nParams = 0;
        this.nLocals = 0;
        this.functions = [];
        this.funcCount = 0;
        this.patches = [];
        this.patchCount = 0;

        // For semantic info visualization
        this.semanticInfo = {
            functions: [],
            scopes: [],
        };
    }

    // ── Emit helpers ──────────────────────────────────
    emit(val) {
        this.prog.code.push(val);
        this.prog.count++;
    }

    emitPlaceholder() {
        const pos = this.prog.count;
        this.emit(0);
        return pos;
    }

    patchAt(pos, val) {
        this.prog.code[pos] = val;
    }

    here() { return this.prog.count; }

    // ── Scope management ──────────────────────────────
    beginScope() { this.scopeDepth++; }

    endScope() {
        while (this.localCount > 0 &&
               this.locals[this.localCount - 1].depth === this.scopeDepth) {
            this.localCount--;
        }
        this.scopeDepth--;
    }

    addLocal(name, line) {
        for (let i = this.localCount - 1; i >= 0; i--) {
            if (this.locals[i].depth < this.scopeDepth) break;
            if (this.locals[i].name === name) {
                throw new CompileError(line, `variable '${name}' already declared in this scope`);
            }
        }
        if (this.localCount >= MAX_LOCALS) {
            throw new CompileError(line, 'too many local variables');
        }

        const slot = this.nParams + this.nLocals;
        this.locals[this.localCount++] = { name, slot, depth: this.scopeDepth };
        this.nLocals++;
        return slot;
    }

    resolveLocal(name) {
        for (let i = this.localCount - 1; i >= 0; i--) {
            if (this.locals[i].name === name) return this.locals[i].slot;
        }
        return -1;
    }

    // ── Function table ────────────────────────────────
    findFunc(name) {
        for (let i = 0; i < this.funcCount; i++) {
            if (this.functions[i].name === name) return i;
        }
        return -1;
    }

    registerFunc(name, nParams, line) {
        if (this.funcCount >= MAX_FUNCTIONS) {
            throw new CompileError(line, 'too many functions');
        }
        const idx = this.funcCount++;
        this.functions[idx] = { name, address: -1, nParams };
        return idx;
    }

    // ── Compile expressions ──────────────────────────
    compileExpr(n) {
        switch (n.type) {
            case NodeType.NODE_NUMBER:
                this.emit(OpCode.OP_CONST);
                this.emit(n.int_value);
                break;

            case NodeType.NODE_IDENT: {
                const slot = this.resolveLocal(n.name);
                if (slot < 0) throw new CompileError(n.line, `undefined variable '${n.name}'`);
                this.emit(OpCode.OP_LOAD);
                this.emit(slot);
                break;
            }

            case NodeType.NODE_ASSIGN: {
                const slot = this.resolveLocal(n.name);
                if (slot < 0) throw new CompileError(n.line, `undefined variable '${n.name}'`);
                this.compileExpr(n.expr);
                this.emit(OpCode.OP_STORE);
                this.emit(slot);
                this.emit(OpCode.OP_LOAD);
                this.emit(slot);
                break;
            }

            case NodeType.NODE_BINARY:
                this.compileExpr(n.left);
                this.compileExpr(n.right);
                switch (n.op) {
                    case TokenType.TOKEN_PLUS:    this.emit(OpCode.OP_ADD); break;
                    case TokenType.TOKEN_MINUS:   this.emit(OpCode.OP_SUB); break;
                    case TokenType.TOKEN_STAR:    this.emit(OpCode.OP_MUL); break;
                    case TokenType.TOKEN_SLASH:   this.emit(OpCode.OP_DIV); break;
                    case TokenType.TOKEN_PERCENT: this.emit(OpCode.OP_MOD); break;
                    case TokenType.TOKEN_EQ:      this.emit(OpCode.OP_EQ);  break;
                    case TokenType.TOKEN_NEQ:     this.emit(OpCode.OP_NEQ); break;
                    case TokenType.TOKEN_LT:      this.emit(OpCode.OP_LT);  break;
                    case TokenType.TOKEN_GT:      this.emit(OpCode.OP_GT);  break;
                    case TokenType.TOKEN_LTE:     this.emit(OpCode.OP_LTE); break;
                    case TokenType.TOKEN_GTE:     this.emit(OpCode.OP_GTE); break;
                    case TokenType.TOKEN_AND:     this.emit(OpCode.OP_AND); break;
                    case TokenType.TOKEN_OR:      this.emit(OpCode.OP_OR);  break;
                    default:
                        throw new CompileError(n.line, 'unknown binary operator');
                }
                break;

            case NodeType.NODE_UNARY:
                this.compileExpr(n.left);
                switch (n.op) {
                    case TokenType.TOKEN_MINUS: this.emit(OpCode.OP_NEG); break;
                    case TokenType.TOKEN_NOT:   this.emit(OpCode.OP_NOT); break;
                    default:
                        throw new CompileError(n.line, 'unknown unary operator');
                }
                break;

            case NodeType.NODE_CALL: {
                if (n.name === 'print') {
                    if (n.items.length !== 1)
                        throw new CompileError(n.line, 'print() expects exactly 1 argument');
                    this.compileExpr(n.items[0]);
                    this.emit(OpCode.OP_PRINT);
                    break;
                }
                if (n.name === 'scan') {
                    if (n.items.length !== 0)
                        throw new CompileError(n.line, 'scan() expects no arguments');
                    this.emit(OpCode.OP_SCAN);
                    break;
                }

                const fi = this.findFunc(n.name);
                if (fi < 0) throw new CompileError(n.line, `undefined function '${n.name}'`);
                if (n.items.length !== this.functions[fi].nParams)
                    throw new CompileError(n.line,
                        `'${n.name}' expects ${this.functions[fi].nParams} args, got ${n.items.length}`);

                for (let i = 0; i < n.items.length; i++) {
                    this.compileExpr(n.items[i]);
                }

                this.emit(OpCode.OP_CALL);
                if (this.functions[fi].address >= 0) {
                    this.emit(this.functions[fi].address);
                } else {
                    if (this.patchCount >= MAX_PATCHES)
                        throw new CompileError(n.line, 'too many forward references');
                    this.patches[this.patchCount++] = {
                        position: this.prog.count,
                        funcIdx: fi,
                    };
                    this.emitPlaceholder();
                }
                this.emit(n.items.length);
                break;
            }

            default:
                throw new CompileError(n.line, `invalid expression node type ${n.type}`);
        }
    }

    // ── Compile statements ────────────────────────────
    compileStmt(n) {
        switch (n.type) {
            case NodeType.NODE_EXPR_STMT:
                this.compileExpr(n.expr);
                this.emit(OpCode.OP_POP);
                break;

            case NodeType.NODE_VAR_DECL: {
                const slot = this.addLocal(n.name, n.line);
                if (n.init) {
                    this.compileExpr(n.init);
                } else {
                    this.emit(OpCode.OP_CONST);
                    this.emit(0);
                }
                this.emit(OpCode.OP_STORE);
                this.emit(slot);
                break;
            }

            case NodeType.NODE_BLOCK:
                this.beginScope();
                for (let i = 0; i < n.items.length; i++) {
                    this.compileStmt(n.items[i]);
                }
                this.endScope();
                break;

            case NodeType.NODE_IF: {
                this.compileExpr(n.cond);
                this.emit(OpCode.OP_JZ);
                const elseJump = this.emitPlaceholder();

                this.compileStmt(n.body);

                if (n.else_body) {
                    this.emit(OpCode.OP_JMP);
                    const endJump = this.emitPlaceholder();
                    this.patchAt(elseJump, this.here());
                    this.compileStmt(n.else_body);
                    this.patchAt(endJump, this.here());
                } else {
                    this.patchAt(elseJump, this.here());
                }
                break;
            }

            case NodeType.NODE_WHILE: {
                const loopStart = this.here();
                this.compileExpr(n.cond);
                this.emit(OpCode.OP_JZ);
                const exitJump = this.emitPlaceholder();

                this.compileStmt(n.body);
                this.emit(OpCode.OP_JMP);
                this.emit(loopStart);

                this.patchAt(exitJump, this.here());
                break;
            }

            case NodeType.NODE_FOR: {
                this.beginScope();

                if (n.init) {
                    if (n.init.type === NodeType.NODE_VAR_DECL) {
                        this.compileStmt(n.init);
                    } else {
                        this.compileExpr(n.init);
                        this.emit(OpCode.OP_POP);
                    }
                }

                const loopStart = this.here();

                if (n.cond) {
                    this.compileExpr(n.cond);
                } else {
                    this.emit(OpCode.OP_CONST);
                    this.emit(1);
                }
                this.emit(OpCode.OP_JZ);
                const exitJump = this.emitPlaceholder();

                this.compileStmt(n.body);

                if (n.update) {
                    this.compileExpr(n.update);
                    this.emit(OpCode.OP_POP);
                }

                this.emit(OpCode.OP_JMP);
                this.emit(loopStart);

                this.patchAt(exitJump, this.here());
                this.endScope();
                break;
            }

            case NodeType.NODE_RETURN:
                if (n.expr) {
                    this.compileExpr(n.expr);
                } else {
                    this.emit(OpCode.OP_CONST);
                    this.emit(0);
                }
                this.emit(OpCode.OP_RET);
                break;

            default:
                throw new CompileError(n.line, `unexpected statement node type ${n.type}`);
        }
    }

    // ── Compile function ──────────────────────────────
    compileFunc(fn) {
        const fi = this.findFunc(fn.name);
        this.functions[fi].address = this.here();

        this.localCount = 0;
        this.scopeDepth = 0;
        this.nParams = fn.items.length;
        this.nLocals = 0;

        this.beginScope();
        for (let i = 0; i < fn.items.length; i++) {
            const p = fn.items[i];
            this.locals[this.localCount++] = {
                name: p.name,
                slot: i,
                depth: this.scopeDepth,
            };
        }

        this.emit(OpCode.OP_ENTER);
        const localsPos = this.emitPlaceholder();

        if (fn.body.type === NodeType.NODE_BLOCK) {
            for (let i = 0; i < fn.body.items.length; i++) {
                this.compileStmt(fn.body.items[i]);
            }
        } else {
            this.compileStmt(fn.body);
        }

        this.emit(OpCode.OP_CONST);
        this.emit(0);
        this.emit(OpCode.OP_RET);

        this.patchAt(localsPos, this.nLocals);

        // Record semantic info
        this.semanticInfo.functions.push({
            name: fn.name,
            address: this.functions[fi].address,
            params: fn.items.map(p => p.name),
            localCount: this.nLocals,
            returnType: tokenTypeName(fn.data_type),
        });

        this.endScope();
    }

    // ── Main entry point ──────────────────────────────
    compile(ast) {
        this.emit(OpCode.OP_CALL);
        const mainAddrPos = this.emitPlaceholder();
        this.emit(0);
        this.emit(OpCode.OP_POP);
        this.emit(OpCode.OP_HALT);

        // Pass 1: register all functions
        for (let i = 0; i < ast.items.length; i++) {
            const fn = ast.items[i];
            if (fn.type !== NodeType.NODE_FUNC_DEF) {
                throw new CompileError(fn.line, 'only function definitions allowed at top level');
            }
            if (this.findFunc(fn.name) >= 0) {
                throw new CompileError(fn.line, `function '${fn.name}' already defined`);
            }
            this.registerFunc(fn.name, fn.items.length, fn.line);
        }

        // Pass 2: compile bodies
        for (let i = 0; i < ast.items.length; i++) {
            this.compileFunc(ast.items[i]);
        }

        // Resolve forward references
        for (let i = 0; i < this.patchCount; i++) {
            const fi = this.patches[i].funcIdx;
            const pos = this.patches[i].position;
            if (this.functions[fi].address < 0) {
                throw new CompileError(0, `function '${this.functions[fi].name}' declared but never defined`);
            }
            this.patchAt(pos, this.functions[fi].address);
        }

        // Patch main address
        const mainIdx = this.findFunc('main');
        if (mainIdx < 0) {
            throw new CompileError(0, "no 'main' function defined");
        }
        this.patchAt(mainAddrPos, this.functions[mainIdx].address);
        this.prog.entry = 0;

        return this.prog;
    }
}

/**
 * Disassemble bytecode into an array of instruction objects (for visualization).
 */
function disassemble(prog) {
    const instructions = [];
    let i = 0;
    while (i < prog.count) {
        const op = prog.code[i];
        const addr = i;
        const name = opName(op);
        let operands = '';
        let size = 1;

        switch (op) {
            case OpCode.OP_CONST:
            case OpCode.OP_LOAD:
            case OpCode.OP_STORE:
            case OpCode.OP_JMP:
            case OpCode.OP_JZ:
            case OpCode.OP_ENTER:
                operands = String(prog.code[i + 1]);
                size = 2;
                break;
            case OpCode.OP_CALL:
                operands = `addr=${prog.code[i + 1]} nargs=${prog.code[i + 2]}`;
                size = 3;
                break;
        }

        instructions.push({ addr, name, operands, op, size });
        i += size;
    }
    return instructions;
}

function compile(ast) {
    const c = new Compiler();
    const prog = c.compile(ast);
    return { program: prog, semanticInfo: c.semanticInfo };
}

if (typeof module !== 'undefined') {
    module.exports = { OpCode, opName, Program, Compiler, compile, disassemble };
}
