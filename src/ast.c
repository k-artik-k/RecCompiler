#include "ast.h"

ASTNode *ast_new(NodeType type, int line) {
    ASTNode *n = (ASTNode *)calloc(1, sizeof(ASTNode));
    if (!n) { fprintf(stderr, "Out of memory\n"); exit(1); }
    n->type = type;
    n->line = line;
    return n;
}

void ast_add_item(ASTNode *parent, ASTNode *child) {
    parent->item_count++;
    parent->items = (ASTNode **)realloc(parent->items,
                        sizeof(ASTNode *) * parent->item_count);
    if (!parent->items) { fprintf(stderr, "Out of memory\n"); exit(1); }
    parent->items[parent->item_count - 1] = child;
}

void ast_free(ASTNode *node) {
    if (!node) return;
    ast_free(node->cond);
    ast_free(node->body);
    ast_free(node->else_body);
    ast_free(node->init);
    ast_free(node->update);
    ast_free(node->expr);
    ast_free(node->left);
    ast_free(node->right);
    for (int i = 0; i < node->item_count; i++)
        ast_free(node->items[i]);
    free(node->items);
    free(node);
}
