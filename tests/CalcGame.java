import java.util.Scanner;

public class CalcGame {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("=== ts-JVM 计算器 ===");

        while (true) {
            System.out.print("\n输入第一个数字（输入 q 退出）: ");
            String s1 = sc.nextLine();
            if (s1.equals("q")) break;

            System.out.print("输入运算符 (+ - * /): ");
            String op = sc.nextLine();

            System.out.print("输入第二个数字: ");
            String s2 = sc.nextLine();

            int a = Integer.parseInt(s1);
            int b = Integer.parseInt(s2);
            int result = 0;

            if (op.equals("+")) result = a + b;
            else if (op.equals("-")) result = a - b;
            else if (op.equals("*")) result = a * b;
            else if (op.equals("/")) result = a / b;
            else {
                System.out.println("未知运算符！");
                continue;
            }

            System.out.println("结果: " + a + " " + op + " " + b + " = " + result);
        }

        System.out.println("再见！");
        sc.close();
    }
}
