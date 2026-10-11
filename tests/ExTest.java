public class ExTest {
    public static void main(String[] args) {
        try {
            int[] arr = null;
            System.out.println(arr[0]);
        } catch (NullPointerException e) {
            System.out.println("捕获到空指针异常");
        }
        System.out.println("程序继续运行");
    }
}
