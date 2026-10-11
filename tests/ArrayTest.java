public class ArrayTest {
    public static void main(String[] args) {
        int[] arr = new int[5];
        arr[0] = 42;
        arr[1] = 100;
        arr[2] = arr[0] + arr[1];
        System.out.println(arr[0]);
        System.out.println(arr[1]);
        System.out.println(arr[2]);
        System.out.println(arr.length);
    }
}
