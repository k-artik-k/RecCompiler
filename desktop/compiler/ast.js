/**
 * ast.js — Direct port of src/ast.h + src/ast.c
 * AST node types and helpers.
 */

const NodeType = Object.freeze({
    NODE_PROGRAM:   'NODE_PROGRAM',
    NODE_FUNC_DEF:  'NODE_FUNC_DEF',
    NODE_BLOCK:     'NODE_BLOCK',
    NODE_VAR_DECL:  'NODE_VAR_DECL',
    NODE_IF:        'NODE_IF',
    NODE_WHILE:     'NODE_WHILE',
    NODE_FOR:       'NODE_FOR',
    NODE_RETURN:    'NODE_RETURN',
    NODE_EXPR_STMT: 'NODE_EXPR_STMT',
    NODE_ASSIGN:    'NODE_ASSIGN',
    NODE_BINARY:    'NODE_BINARY',
    NODE_UNARY:     'NODE_UNARY',
    NODE_CALL:      'NODE_CALL',
    NODE_NUMBER:    'NODE_NUMBER',
    NODE_IDENT:     'NODE_IDENT',
});

const NODE_LABELS = {
    [NodeType.NODE_PROGRAM]:   'Program',
    [NodeType.NODE_FUNC_DEF]:  'FuncDef',
    [NodeType.NODE_BLOCK]:     'Block',
    [NodeType.NODE_VAR_DECL]:  'VarDecl',
    [NodeType.NODE_IF]:        'If',
    [NodeType.NODE_WHILE]:     'While',
    [NodeType.NODE_FOR]:       'For',
    [NodeType.NODE_RETURN]:    'Return',
    [NodeType.NODE_EXPR_STMT]: 'ExprStmt',
    [NodeType.NODE_ASSIGN]:    'Assign',
    [NodeType.NODE_BINARY]:    'Binary',
    [NodeType.NODE_UNARY]:     'Unary',
    [NodeType.NODE_CALL]:      'Call',
    [NodeType.NODE_NUMBER]:    'Number',
    [NodeType.NODE_IDENT]:     'Ident',
};

class ASTNode {
    constructor(type, line) {
        this.type = type;
        this.line = line;

        // Literal value (NODE_NUMBER)
        this.int_value = 0;

        // Name (NODE_IDENT, NODE_FUNC_DEF, NODE_VAR_DECL, NODE_CALL, NODE_ASSIGN)
        this.name = '';

        // Operator token type (NODE_BINARY, NODE_UNARY)
        this.op = null;

        // Data type (NODE_FUNC_DEF, NODE_VAR_DECL)
        this.data_type = null;

        // Children
        this.cond = null;
        this.body = null;
        this.else_body = null;
        this.init = null;
        this.update = null;
        this.expr = null;
        this.left = null;
        this.right = null;

        // Lists (items)
        this.items = [];
    }

    addItem(child) {
        this.items.push(child);
    }

    /**
     * Convert to a plain object for visualization.
     */
    toJSON() {
        const { tokenTypeName } = require('./lexer');
        const obj = {
            type: NODE_LABELS[this.type] || this.type,
            line: this.line,
        };
        if (this.name) obj.name = this.name;
        if (this.int_value !== 0 || this.type === NodeType.NODE_NUMBER) obj.value = this.int_value;
        if (this.op) obj.op = tokenTypeName(this.op);
        if (this.data_type) obj.dataType = tokenTypeName(this.data_type);
        if (this.cond) obj.cond = this.cond.toJSON();
        if (this.body) obj.body = this.body.toJSON();
        if (this.else_body) obj.elseBranch = this.else_body.toJSON();
        if (this.init) obj.init = this.init.toJSON();
        if (this.update) obj.update = this.update.toJSON();
        if (this.expr) obj.expr = this.expr.toJSON();
        if (this.left) obj.left = this.left.toJSON();
        if (this.right) obj.right = this.right.toJSON();
        if (this.items.length > 0) obj.items = this.items.map(i => i.toJSON());
        return obj;
    }
}

if (typeof module !== 'undefined') {
    module.exports = { NodeType, ASTNode, NODE_LABELS };
}
