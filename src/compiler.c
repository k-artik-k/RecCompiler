/*
 * compiler.c — Compiles AST to bytecode for the stack VM.
 *
 * Key design for recursion:
 *   - Each function is compiled to bytecode with OP_ENTER (allocate locals).
 *   - OP_CALL saves the frame, sets a new frame pointer.
 *   - Variables are accessed via OP_LOAD/OP_STORE relative to frame pointer.
 *   - Recursive calls naturally get new frames with isolated locals.
 */

#include "compiler.h"

/* ── Compiler state ─────────────────────────────────────── */
typedef struct {
    char name[MAX_IDENT_LEN];
    int  slot;      /* index relative to frame pointer */
    int  depth;     /* scope depth                     */
} Local;

typedef struct {
    char name[MAX_IDENT_LEN];
    int  address;   /* bytecode address (-1 = not yet compiled) */
    int  n_params;
} FuncInfo;

typedef struct {
    int position;   /* index in code[] to patch */
    int func_idx;   /* index into functions[]   */
} Patch;

typedef struct {
    Program  *prog;

    /* Current function context */
    Local     locals[MAX_LOCALS];
    int       local_count;
    int       scope_depth;
    int       n_params;       /* params in current function */
    int       n_locals;       /* locals (non-param) count   */

    /* Function table */
    FuncInfo  functions[MAX_FUNCTIONS];
    int       func_count;

    /* Forward-reference patches */
    Patch     patches[MAX_PATCHES];
    int       patch_count;
} Compiler;

/* ── Emit helpers ───────────────────────────────────────── */
static void emit(Compiler *c, int val) {
    if (c->prog->count >= MAX_CODE)
        error_exit(0, "bytecode overflow (program too large)");
    c->prog->code[c->prog->count++] = val;
}

static int emit_placeholder(Compiler *c) {
    int pos = c->prog->count;
    emit(c, 0);
    return pos;
}

static void patch_at(Compiler *c, int pos, int val) {
    c->prog->code[pos] = val;
}

static int here(Compiler *c) { return c->prog->count; }

/* ── Scope management ───────────────────────────────────── */
static void begin_scope(Compiler *c) { c->scope_depth++; }

static void end_scope(Compiler *c) {
    while (c->local_count > 0 &&
           c->locals[c->local_count - 1].depth == c->scope_depth) {
        c->local_count--;
    }
    c->scope_depth--;
}

static int add_local(Compiler *c, const char *name, int line) {
    /* Check for duplicate in same scope */
    for (int i = c->local_count - 1; i >= 0; i--) {
        if (c->locals[i].depth < c->scope_depth) break;
        if (strcmp(c->locals[i].name, name) == 0)
            error_exit(line, "variable '%s' already declared in this scope", name);
    }
    if (c->local_count >= MAX_LOCALS)
        error_exit(line, "too many local variables");

    int slot = c->n_params + c->n_locals;
    Local *loc = &c->locals[c->local_count++];
    strncpy(loc->name, name, MAX_IDENT_LEN - 1);
    loc->name[MAX_IDENT_LEN - 1] = '\0';
    loc->slot  = slot;
    loc->depth = c->scope_depth;
    c->n_locals++;
    return slot;
}

static int resolve_local(Compiler *c, const char *name) {
    for (int i = c->local_count - 1; i >= 0; i--) {
        if (strcmp(c->locals[i].name, name) == 0)
            return c->locals[i].slot;
    }
    return -1;
}

/* ── Function table ─────────────────────────────────────── */
static int find_func(Compiler *c, const char *name) {
    for (int i = 0; i < c->func_count; i++)
        if (strcmp(c->functions[i].name, name) == 0) return i;
    return -1;
}

static int register_func(Compiler *c, const char *name, int n_params, int line) {
    if (c->func_count >= MAX_FUNCTIONS)
        error_exit(line, "too many functions");
    int idx = c->func_count++;
    strncpy(c->functions[idx].name, name, MAX_IDENT_LEN - 1);
    c->functions[idx].address  = -1;
    c->functions[idx].n_params = n_params;
    return idx;
}

/* ── Compile expressions ────────────────────────────────── */
static void compile_expr(Compiler *c, ASTNode *n);
static void compile_stmt(Compiler *c, ASTNode *n);

static void compile_expr(Compiler *c, ASTNode *n) {
    switch (n->type) {
    case NODE_NUMBER:
        emit(c, OP_CONST);
        emit(c, n->int_value);
        break;

    case NODE_IDENT: {
        int slot = resolve_local(c, n->name);
        if (slot < 0)
            error_exit(n->line, "undefined variable '%s'", n->name);
        emit(c, OP_LOAD);
        emit(c, slot);
        break;
    }

    case NODE_ASSIGN: {
        int slot = resolve_local(c, n->name);
        if (slot < 0)
            error_exit(n->line, "undefined variable '%s'", n->name);
        compile_expr(c, n->expr);
        emit(c, OP_STORE);
        emit(c, slot);
        /* Assignment is an expression: leave the value on the stack */
        emit(c, OP_LOAD);
        emit(c, slot);
        break;
    }

    case NODE_BINARY:
        compile_expr(c, n->left);
        compile_expr(c, n->right);
        switch (n->op) {
            case TOKEN_PLUS:    emit(c, OP_ADD); break;
            case TOKEN_MINUS:   emit(c, OP_SUB); break;
            case TOKEN_STAR:    emit(c, OP_MUL); break;
            case TOKEN_SLASH:   emit(c, OP_DIV); break;
            case TOKEN_PERCENT: emit(c, OP_MOD); break;
            case TOKEN_EQ:      emit(c, OP_EQ);  break;
            case TOKEN_NEQ:     emit(c, OP_NEQ); break;
            case TOKEN_LT:      emit(c, OP_LT);  break;
            case TOKEN_GT:      emit(c, OP_GT);  break;
            case TOKEN_LTE:     emit(c, OP_LTE); break;
            case TOKEN_GTE:     emit(c, OP_GTE); break;
            case TOKEN_AND:     emit(c, OP_AND); break;
            case TOKEN_OR:      emit(c, OP_OR);  break;
            default:
                error_exit(n->line, "unknown binary operator");
        }
        break;

    case NODE_UNARY:
        compile_expr(c, n->left);
        switch (n->op) {
            case TOKEN_MINUS: emit(c, OP_NEG); break;
            case TOKEN_NOT:   emit(c, OP_NOT); break;
            default:
                error_exit(n->line, "unknown unary operator");
        }
        break;

    case NODE_CALL: {
        /* Check for built-in functions */
        if (strcmp(n->name, "print") == 0) {
            if (n->item_count != 1)
                error_exit(n->line, "print() expects exactly 1 argument");
            compile_expr(c, n->items[0]);
            emit(c, OP_PRINT);
            break;
        }
        if (strcmp(n->name, "scan") == 0) {
            if (n->item_count != 0)
                error_exit(n->line, "scan() expects no arguments");
            emit(c, OP_SCAN);
            break;
        }

        /* User-defined function call */
        int fi = find_func(c, n->name);
        if (fi < 0)
            error_exit(n->line, "undefined function '%s'", n->name);
        if (n->item_count != c->functions[fi].n_params)
            error_exit(n->line, "'%s' expects %d args, got %d",
                       n->name, c->functions[fi].n_params, n->item_count);

        /* Push arguments */
        for (int i = 0; i < n->item_count; i++)
            compile_expr(c, n->items[i]);

        /* Emit CALL: address will be patched if forward reference */
        emit(c, OP_CALL);
        if (c->functions[fi].address >= 0) {
            emit(c, c->functions[fi].address);
        } else {
            /* Forward reference — add to patch list */
            if (c->patch_count >= MAX_PATCHES)
                error_exit(n->line, "too many forward references");
            c->patches[c->patch_count].position = c->prog->count;
            c->patches[c->patch_count].func_idx = fi;
            c->patch_count++;
            emit_placeholder(c);
        }
        emit(c, n->item_count);
        break;
    }

    default:
        error_exit(n->line, "invalid expression node type %d", n->type);
    }
}

/* ── Compile statements ─────────────────────────────────── */
static void compile_stmt(Compiler *c, ASTNode *n) {
    switch (n->type) {
    case NODE_EXPR_STMT:
        compile_expr(c, n->expr);
        emit(c, OP_POP);   /* discard expression result */
        break;

    case NODE_VAR_DECL: {
        int slot = add_local(c, n->name, n->line);
        if (n->init) {
            compile_expr(c, n->init);
        } else {
            emit(c, OP_CONST);
            emit(c, 0);    /* default initialise to 0 */
        }
        emit(c, OP_STORE);
        emit(c, slot);
        break;
    }

    case NODE_BLOCK:
        begin_scope(c);
        for (int i = 0; i < n->item_count; i++)
            compile_stmt(c, n->items[i]);
        end_scope(c);
        break;

    case NODE_IF: {
        compile_expr(c, n->cond);
        emit(c, OP_JZ);
        int else_jump = emit_placeholder(c);

        compile_stmt(c, n->body);

        if (n->else_body) {
            emit(c, OP_JMP);
            int end_jump = emit_placeholder(c);
            patch_at(c, else_jump, here(c));
            compile_stmt(c, n->else_body);
            patch_at(c, end_jump, here(c));
        } else {
            patch_at(c, else_jump, here(c));
        }
        break;
    }

    case NODE_WHILE: {
        int loop_start = here(c);
        compile_expr(c, n->cond);
        emit(c, OP_JZ);
        int exit_jump = emit_placeholder(c);

        compile_stmt(c, n->body);
        emit(c, OP_JMP);
        emit(c, loop_start);

        patch_at(c, exit_jump, here(c));
        break;
    }

    case NODE_FOR: {
        begin_scope(c);

        /* Init */
        if (n->init) {
            if (n->init->type == NODE_VAR_DECL)
                compile_stmt(c, n->init);
            else {
                compile_expr(c, n->init);
                emit(c, OP_POP);
            }
        }

        int loop_start = here(c);

        /* Condition */
        if (n->cond) {
            compile_expr(c, n->cond);
        } else {
            emit(c, OP_CONST);
            emit(c, 1); /* infinite loop if no condition */
        }
        emit(c, OP_JZ);
        int exit_jump = emit_placeholder(c);

        /* Body */
        compile_stmt(c, n->body);

        /* Update */
        if (n->update) {
            compile_expr(c, n->update);
            emit(c, OP_POP);
        }

        emit(c, OP_JMP);
        emit(c, loop_start);

        patch_at(c, exit_jump, here(c));
        end_scope(c);
        break;
    }

    case NODE_RETURN:
        if (n->expr)
            compile_expr(c, n->expr);
        else {
            emit(c, OP_CONST);
            emit(c, 0);
        }
        emit(c, OP_RET);
        break;

    default:
        error_exit(n->line, "unexpected statement node type %d", n->type);
    }
}

/* ── Compile a function definition ──────────────────────── */
static void compile_func(Compiler *c, ASTNode *fn) {
    int fi = find_func(c, fn->name);

    /* Set function address to current position */
    c->functions[fi].address = here(c);

    /* Reset local context */
    c->local_count = 0;
    c->scope_depth = 0;
    c->n_params    = fn->item_count;
    c->n_locals    = 0;

    /* Register parameters as locals (slot 0..n-1) */
    begin_scope(c);
    for (int i = 0; i < fn->item_count; i++) {
        ASTNode *p = fn->items[i];
        if (c->local_count >= MAX_LOCALS)
            error_exit(p->line, "too many parameters");
        Local *loc = &c->locals[c->local_count++];
        strncpy(loc->name, p->name, MAX_IDENT_LEN - 1);
        loc->name[MAX_IDENT_LEN - 1] = '\0';
        loc->slot  = i;
        loc->depth = c->scope_depth;
    }

    /* Emit ENTER with placeholder for local count */
    emit(c, OP_ENTER);
    int locals_pos = emit_placeholder(c);

    /* Compile body */
    if (fn->body->type == NODE_BLOCK) {
        /* Compile block contents directly (scope already open) */
        for (int i = 0; i < fn->body->item_count; i++)
            compile_stmt(c, fn->body->items[i]);
    } else {
        compile_stmt(c, fn->body);
    }

    /* Safety net: if function doesn't explicitly return, push 0 and return */
    emit(c, OP_CONST);
    emit(c, 0);
    emit(c, OP_RET);

    /* Patch ENTER with actual local count */
    patch_at(c, locals_pos, c->n_locals);

    end_scope(c);
}

/* ── Main compile entry point ───────────────────────────── */
int compiler_compile(ASTNode *ast, Program *prog) {
    Compiler c;
    memset(&c, 0, sizeof(c));
    c.prog = prog;
    prog->count = 0;
    prog->entry = -1;

    /* Emit preamble: CALL main, HALT */
    emit(&c, OP_CALL);
    int main_addr_pos = emit_placeholder(&c);
    emit(&c, 0);   /* 0 args */
    emit(&c, OP_POP); /* discard main's return value */
    emit(&c, OP_HALT);

    /* Pass 1: register all function signatures */
    for (int i = 0; i < ast->item_count; i++) {
        ASTNode *fn = ast->items[i];
        if (fn->type != NODE_FUNC_DEF)
            error_exit(fn->line, "only function definitions allowed at top level");
        if (find_func(&c, fn->name) >= 0)
            error_exit(fn->line, "function '%s' already defined", fn->name);
        register_func(&c, fn->name, fn->item_count, fn->line);
    }

    /* Pass 2: compile all function bodies */
    for (int i = 0; i < ast->item_count; i++)
        compile_func(&c, ast->items[i]);

    /* Resolve forward references */
    for (int i = 0; i < c.patch_count; i++) {
        int fi   = c.patches[i].func_idx;
        int pos  = c.patches[i].position;
        if (c.functions[fi].address < 0)
            error_exit(0, "function '%s' declared but never defined",
                       c.functions[fi].name);
        patch_at(&c, pos, c.functions[fi].address);
    }

    /* Patch main() address in preamble */
    int main_idx = find_func(&c, "main");
    if (main_idx < 0)
        error_exit(0, "no 'main' function defined");
    patch_at(&c, main_addr_pos, c.functions[main_idx].address);
    prog->entry = 0;

    return 0;
}

/* ── Disassembler (for debugging) ───────────────────────── */
static const char *op_name(int op) {
    switch (op) {
        case OP_CONST: return "CONST";   case OP_POP:   return "POP";
        case OP_ADD:   return "ADD";     case OP_SUB:   return "SUB";
        case OP_MUL:   return "MUL";     case OP_DIV:   return "DIV";
        case OP_MOD:   return "MOD";     case OP_NEG:   return "NEG";
        case OP_EQ:    return "EQ";      case OP_NEQ:   return "NEQ";
        case OP_LT:    return "LT";      case OP_GT:    return "GT";
        case OP_LTE:   return "LTE";     case OP_GTE:   return "GTE";
        case OP_AND:   return "AND";     case OP_OR:    return "OR";
        case OP_NOT:   return "NOT";
        case OP_LOAD:  return "LOAD";    case OP_STORE: return "STORE";
        case OP_JMP:   return "JMP";     case OP_JZ:    return "JZ";
        case OP_CALL:  return "CALL";    case OP_RET:   return "RET";
        case OP_ENTER: return "ENTER";
        case OP_PRINT: return "PRINT";   case OP_SCAN:  return "SCAN";
        case OP_HALT:  return "HALT";
        default:       return "???";
    }
}

void compiler_disassemble(const Program *prog) {
    printf("=== Bytecode (%d instructions) ===\n", prog->count);
    int i = 0;
    while (i < prog->count) {
        int op = prog->code[i];
        printf("%04d  %-8s", i, op_name(op));
        switch (op) {
            case OP_CONST: case OP_LOAD: case OP_STORE:
            case OP_JMP:   case OP_JZ:   case OP_ENTER:
                printf(" %d", prog->code[i + 1]);
                i += 2;
                break;
            case OP_CALL:
                printf(" addr=%d nargs=%d", prog->code[i+1], prog->code[i+2]);
                i += 3;
                break;
            default:
                i += 1;
                break;
        }
        printf("\n");
    }
    printf("=================================\n");
}
