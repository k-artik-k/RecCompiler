/**
 * vm.js — Direct port of src/vm.c
 * Stack-based virtual machine with instrumentation for visualization.
 */

const { OpCode, opName } = require('./compiler');
const { CompileError } = require('./lexer');

const MAX_STACK = 4096;
const MAX_FRAMES = 256;

class VMError extends Error {
    constructor(message) {
        super(`VM: ${message}`);
        this.name = 'VMError';
    }
}

/**
 * Execute a compiled program.
 *
 * Options:
 *   onOutput(value)          — called when OP_PRINT fires
 *   onInput()                — called when OP_SCAN fires, must return a number
 *   onCall(funcName, args, depth)   — called when OP_CALL fires
 *   onReturn(funcName, retval, depth) — called when OP_RET fires
 *   funcTable                — array of {name, address, nParams} from compiler
 */
function vmExecute(prog, options = {}) {
    const {
        onOutput = (v) => {},
        onInput = () => 0,
        onCall = () => {},
        onReturn = () => {},
        funcTable = [],
    } = options;

    const stack = new Array(MAX_STACK).fill(0);
    const frames = [];
    let sp = 0;
    let fp = 0;
    let ip = 0;
    let fc = 0;
    const code = prog.code;

    // Build address-to-function-name map
    const addrToFunc = {};
    for (const f of funcTable) {
        addrToFunc[f.address] = f.name;
    }

    // Track call stack for visualization
    const callStackHistory = [];
    const currentCallStack = [];
    let maxDepth = 0;

    const outputs = [];
    let stepCount = 0;
    const MAX_STEPS = 1000000; // safety limit

    for (;;) {
        if (ip < 0 || ip >= prog.count) {
            throw new VMError(`instruction pointer out of bounds (${ip})`);
        }

        if (++stepCount > MAX_STEPS) {
            throw new VMError('execution limit reached (possible infinite loop)');
        }

        const op = code[ip++];

        switch (op) {
            case OpCode.OP_CONST:
                stack[sp++] = code[ip++];
                break;

            case OpCode.OP_POP:
                sp--;
                break;

            case OpCode.OP_ADD: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=a+b; break; }
            case OpCode.OP_SUB: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=a-b; break; }
            case OpCode.OP_MUL: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=a*b; break; }
            case OpCode.OP_DIV: {
                const b=stack[--sp]; const a=stack[--sp];
                if (b === 0) throw new VMError('division by zero');
                stack[sp++] = Math.trunc(a/b); break;
            }
            case OpCode.OP_MOD: {
                const b=stack[--sp]; const a=stack[--sp];
                if (b === 0) throw new VMError('modulo by zero');
                stack[sp++] = a%b; break;
            }
            case OpCode.OP_NEG: stack[sp-1] = -stack[sp-1]; break;

            case OpCode.OP_EQ:  { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a===b)?1:0; break; }
            case OpCode.OP_NEQ: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a!==b)?1:0; break; }
            case OpCode.OP_LT:  { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a<b)?1:0;  break; }
            case OpCode.OP_GT:  { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a>b)?1:0;  break; }
            case OpCode.OP_LTE: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a<=b)?1:0; break; }
            case OpCode.OP_GTE: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a>=b)?1:0; break; }
            case OpCode.OP_AND: { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a&&b)?1:0; break; }
            case OpCode.OP_OR:  { const b=stack[--sp]; const a=stack[--sp]; stack[sp++]=(a||b)?1:0; break; }
            case OpCode.OP_NOT: stack[sp-1] = (!stack[sp-1])?1:0; break;

            case OpCode.OP_LOAD: {
                const slot = code[ip++];
                stack[sp++] = stack[fp + slot];
                break;
            }
            case OpCode.OP_STORE: {
                const slot = code[ip++];
                stack[fp + slot] = stack[--sp];
                break;
            }

            case OpCode.OP_JMP:
                ip = code[ip];
                break;

            case OpCode.OP_JZ: {
                const addr = code[ip++];
                if (stack[--sp] === 0) ip = addr;
                break;
            }

            case OpCode.OP_CALL: {
                const addr = code[ip++];
                const nargs = code[ip++];

                if (fc >= MAX_FRAMES)
                    throw new VMError('call stack overflow (too much recursion?)');

                frames[fc] = { return_ip: ip, fp: fp };
                fc++;

                // Collect args for visualization
                const args = [];
                for (let i = 0; i < nargs; i++) {
                    args.push(stack[sp - nargs + i]);
                }

                fp = sp - nargs;
                ip = addr;

                const funcName = addrToFunc[addr] || `func@${addr}`;
                currentCallStack.push({ name: funcName, args: [...args], depth: fc });
                maxDepth = Math.max(maxDepth, fc);

                callStackHistory.push({
                    action: 'call',
                    name: funcName,
                    args: [...args],
                    depth: fc,
                    stack: currentCallStack.map(f => ({ ...f })),
                });

                onCall(funcName, args, fc);
                break;
            }

            case OpCode.OP_RET: {
                const retval = stack[--sp];
                sp = fp;
                fc--;
                ip = frames[fc].return_ip;
                fp = frames[fc].fp;
                stack[sp++] = retval;

                const frame = currentCallStack.pop();
                const funcName = frame ? frame.name : '?';

                callStackHistory.push({
                    action: 'return',
                    name: funcName,
                    returnValue: retval,
                    depth: fc,
                    stack: currentCallStack.map(f => ({ ...f })),
                });

                onReturn(funcName, retval, fc);
                break;
            }

            case OpCode.OP_ENTER: {
                const nlocals = code[ip++];
                for (let i = 0; i < nlocals; i++) {
                    stack[sp++] = 0;
                }
                break;
            }

            case OpCode.OP_PRINT: {
                const val = stack[--sp];
                outputs.push(val);
                onOutput(val);
                stack[sp++] = 0;
                break;
            }

            case OpCode.OP_SCAN: {
                const val = onInput();
                if (typeof val !== 'number' || isNaN(val)) {
                    throw new VMError('scan() requires a valid integer input');
                }
                stack[sp++] = Math.trunc(val);
                break;
            }

            case OpCode.OP_HALT:
                return {
                    exitCode: (sp > 0) ? stack[sp - 1] : 0,
                    outputs,
                    callStackHistory,
                    maxRecursionDepth: maxDepth,
                    stepCount,
                };

            default:
                throw new VMError(`unknown opcode ${op} at position ${ip - 1}`);
        }

        if (sp < 0) throw new VMError('stack underflow');
        if (sp >= MAX_STACK) throw new VMError('stack overflow');
    }
}

if (typeof module !== 'undefined') {
    module.exports = { vmExecute, VMError };
}
