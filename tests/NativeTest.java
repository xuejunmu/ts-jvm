public class NativeTest {
    public static native int add(int a, int b);
    public static native int multiply(int a, int b);
    public static native int factorial(int n);
    public static native int showMessage(String text, String caption);
    public static native int getPid();

    public static void main(String[] args) {
        System.out.println("3 + 4 = " + add(3, 4));
        System.out.println("3 * 4 = " + multiply(3, 4));
        System.out.println("5! = " + factorial(5));
        System.out.println("当前进程 ID: " + getPid());
        showMessage("你好钧沐！这是从 ts-JVM 弹出的 Windows 对话框！", "ts-JVM 提示");
    }
}
