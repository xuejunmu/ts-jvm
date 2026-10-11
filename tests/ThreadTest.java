public class ThreadTest {
    public static void main(String[] args) throws Exception {
        Thread t = new Thread(() -> {
            for (int i = 0; i < 3; i++) {
                System.out.println("子线程: " + i);
            }
        });
        t.start();
        Thread.sleep(100);
        for (int i = 0; i < 3; i++) {
            System.out.println("主线程: " + i);
        }
    }
}
