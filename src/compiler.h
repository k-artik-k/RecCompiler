#ifndef COMPILER_H
#define COMPILER_H

#include "ast.h"

/* ── Bytecodes ──────────────────────────────────────────── */
typedef enum {
    /* Stack */
    OP_CONST,       /* OP_CONST <value>        push immediate         */
    OP_POP,         /* OP_POP                  discard top            */

    /* Arithmetic (pop 2, push 1) */
    OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD,
    OP_NEG,         /* negate top                                     */

    /* Comparison / Logic (pop 2, push 0 or 1) */
    OP_EQ, OP_NEQ, OP_LT, OP_GT, OP_LTE, OP_GTE,
    OP_AND, OP_OR,
    OP_NOT,         /* logical not (pop 1, push 0 or 1)              */

    /* Variables (relative to frame pointer) */
    OP_LOAD,        /* OP_LOAD <slot>          push stack[fp+slot]    */
    OP_STORE,       /* OP_STORE <slot>         pop → stack[fp+slot]   */

    /* Control flow */
    OP_JMP,         /* OP_JMP <addr>           unconditional jump     */
    OP_JZ,          /* OP_JZ  <addr>           jump if top == 0 (pops)*/

    /* Functions */
    OP_CALL,        /* OP_CALL <addr> <nargs>  call function          */
    OP_RET,         /* OP_RET                  return (top = retval)  */
    OP_ENTER,       /* OP_ENTER <nlocals>      allocate locals space  */

    /* Built-ins */
    OP_PRINT,       /* pop, print, push 0                             */
    OP_SCAN,        /* read int, push it                              */

    OP_HALT,        /* stop execution                                 */
} OpCode;

/* ── Compiled program ───────────────────────────────────── */
typedef struct {
    int  code[MAX_CODE];
    int  count;
    int  entry;         /* bytecode address of main() */
} Program;

/* Compile an AST into a Program. Returns 0 on success. */
int compiler_compile(ASTNode *ast, Program *prog);

/* Debug: disassemble the bytecode to stdout */
void compiler_disassemble(const Program *prog);

#endif /* COMPILER_H */
