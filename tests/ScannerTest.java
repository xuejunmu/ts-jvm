import java.util.Scanner;

public class ScannerTest {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("你叫什么名字？");
        String name = sc.nextLine();
        System.out.println("你好，" + name + "！欢迎使用 ts-JVM！");
        sc.close();
    }
}
