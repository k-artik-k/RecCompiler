#ifndef VM_H
#define VM_H

#include "compiler.h"

/* Execute a compiled program. Returns the exit code (main's return value). */
int vm_execute(const Program *prog);

#endif /* VM_H */
