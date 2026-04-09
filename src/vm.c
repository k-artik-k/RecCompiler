/*
 * vm.c — Stack-based virtual machine.
 *
 * Recursion support:
 *   OP_CALL pushes a call frame (return address + old frame pointer).
 *   OP_ENTER allocates space for local variables.
 *   OP_RET restores the previous frame and pushes the return value.
 *   Each recursive call gets its own frame with isolated variables.
 */

#include "vm.h"

typedef struct {
    int return_ip;
    int fp;
} CallFrame;

int vm_execute(const Program *prog) {
    int        stack[MAX_STACK];
    CallFrame  frames[MAX_FRAMES];
    int        sp = 0;           /* stack pointer          */
    int        fp = 0;           /* frame pointer          */
    int        ip = 0;           /* instruction pointer    */
    int        fc = 0;           /* frame count            */
    const int *code = prog->code;

    for (;;) {
        if (ip < 0 || ip >= prog->count)
            error_exit(0, "VM: instruction pointer out of bounds (%d)", ip);

        int op = code[ip++];

        switch (op) {

        /* ── Stack ────────────────────────────────────── */
        case OP_CONST:
            stack[sp++] = code[ip++];
            break;

        case OP_POP:
            sp--;
            break;

        /* ── Arithmetic ──────────────────────────────── */
        case OP_ADD: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=a+b; break; }
        case OP_SUB: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=a-b; break; }
        case OP_MUL: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=a*b; break; }
        case OP_DIV: {
            int b=stack[--sp]; int a=stack[--sp];
            if (b == 0) error_exit(0, "VM: division by zero");
            stack[sp++]=a/b; break;
        }
        case OP_MOD: {
            int b=stack[--sp]; int a=stack[--sp];
            if (b == 0) error_exit(0, "VM: modulo by zero");
            stack[sp++]=a%b; break;
        }
        case OP_NEG: stack[sp-1] = -stack[sp-1]; break;

        /* ── Comparison / Logic ──────────────────────── */
        case OP_EQ:  { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a==b); break; }
        case OP_NEQ: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a!=b); break; }
        case OP_LT:  { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a<b);  break; }
        case OP_GT:  { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a>b);  break; }
        case OP_LTE: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a<=b); break; }
        case OP_GTE: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a>=b); break; }
        case OP_AND: { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a&&b)?1:0; break; }
        case OP_OR:  { int b=stack[--sp]; int a=stack[--sp]; stack[sp++]=(a||b)?1:0; break; }
        case OP_NOT: stack[sp-1] = !stack[sp-1]; break;

        /* ── Variables ───────────────────────────────── */
        case OP_LOAD: {
            int slot = code[ip++];
            stack[sp++] = stack[fp + slot];
            break;
        }
        case OP_STORE: {
            int slot = code[ip++];
            stack[fp + slot] = stack[--sp];
            break;
        }

        /* ── Control flow ────────────────────────────── */
        case OP_JMP:
            ip = code[ip];
            break;

        case OP_JZ: {
            int addr = code[ip++];
            if (stack[--sp] == 0) ip = addr;
            break;
        }

        /* ── Function calls (key to recursion!) ──────── */
        case OP_CALL: {
            int addr   = code[ip++];
            int nargs  = code[ip++];

            /* Save current frame */
            if (fc >= MAX_FRAMES)
                error_exit(0, "VM: call stack overflow (too much recursion?)");
            frames[fc].return_ip = ip;
            frames[fc].fp        = fp;
            fc++;

            /* New frame: fp points to first argument */
            fp = sp - nargs;
            ip = addr;
            break;
        }

        case OP_RET: {
            int retval = stack[--sp];

            /* Discard frame (args + locals) */
            sp = fp;

            /* Restore caller frame */
            fc--;
            ip = frames[fc].return_ip;
            fp = frames[fc].fp;

            /* Push return value for caller */
            stack[sp++] = retval;
            break;
        }

        case OP_ENTER: {
            int nlocals = code[ip++];
            /* Reserve space for local variables (init to 0) */
            for (int i = 0; i < nlocals; i++)
                stack[sp++] = 0;
            break;
        }

        /* ── Built-ins ───────────────────────────────── */
        case OP_PRINT: {
            int val = stack[--sp];
            printf("%d\n", val);
            fflush(stdout);
            stack[sp++] = 0;   /* push dummy return value */
            break;
        }

        case OP_SCAN: {
            int val = 0;
            printf("> ");
            fflush(stdout);
            if (scanf("%d", &val) != 1)
                error_exit(0, "VM: failed to read integer from input");
            stack[sp++] = val;
            break;
        }

        case OP_HALT:
            /* Return value of main is on the stack */
            return (sp > 0) ? stack[sp - 1] : 0;

        default:
            error_exit(0, "VM: unknown opcode %d at position %d", op, ip - 1);
        }

        /* Stack bounds check */
        if (sp < 0)
            error_exit(0, "VM: stack underflow");
        if (sp >= MAX_STACK)
            error_exit(0, "VM: stack overflow");
    }
}
