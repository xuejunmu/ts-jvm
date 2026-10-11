#include <windows.h>

/* 导出函数：两个 int 相加 */
__declspec(dllexport) int add(int a, int b) {
    return a + b;
}

/* 导出函数：两个 int 相乘 */
__declspec(dllexport) int multiply(int a, int b) {
    return a * b;
}

/* 导出函数：计算阶乘 */
__declspec(dllexport) int factorial(int n) {
    int result = 1;
    for (int i = 1; i <= n; i++) result *= i;
    return result;
}
