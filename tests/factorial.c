// Recursive factorial
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int n = scan();
    print(factorial(n));
    return 0;
}
