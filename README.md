# ts-JVM

用 TypeScript 从零写一个迷你 JVM——能解析真正的 `.class` 字节码文件，并解释执行 Java 程序。

## 当前进度

- [x] **M1** `.class` 文件解析器（魔数、版本、常量池、字段、方法、Code 属性）
- [x] **M2** 栈帧 + 操作数栈 + 字节码解释器，跑通 `System.out.println("Hello")`
- [x] **M3** 算术、局部变量、方法调用、分支
- [x] **M4** 对象 `new`、构造器、继承、数组
- [x] **M5** static 方法调用、继承多态、数组
- [x] **M6** 字符串拼接（StringBuilder）、异常处理（athrow/异常表）、更多指令集
- [x] **M7** JAR 包支持（解压 + MANIFEST.MF 读主类）
- [x] **M8** 集合框架（ArrayList / HashMap）
- [x] **M9** lambda 表达式 + invokedynamic + invokeinterface
- [x] **M10** 反射（Class.forName / Method.invoke / Constructor.newInstance）
- [x] **M11** 多线程（Thread / Runnable / Thread.start / Thread.sleep）
- [x] **M12** 资源文件加载（Class.getResourceAsStream / BufferedReader）
- [x] **M13** Scanner 键盘输入（System.in / nextLine / GBK 编码）
- [x] **FFI** koffi 调用 GCC 编译的 native.dll + Windows user32/kernel32
- [x] **异常退出码** 未捕获异常时 process.exit(1)

## 怎么跑

```powershell
# 1. 装依赖（只需要一次）
npm install

# 2. 编译测试用的 Java 文件
javac -source 8 -target 8 -Xlint:-options tests/*.java -d tests/out

# 3. 构建 JVM
npx esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/jvm.js

# 4. 跑 .class
node dist/jvm.js HelloWorld

# 5. 跑 JAR
node dist/jvm.js CalcGame.jar
```

## 测试程序

| 程序 | 说明 |
|---|---|
| `HelloWorld` | 经典 Hello World |
| `CalcGame` | 交互式计算器（+ - * /，除以 0 抛 ArithmeticException） |
| `LambdaTest` | lambda 表达式 |
| `CollectionsTest` | ArrayList / HashMap |
| `ReflectionTest` | 反射调用 |
| `ThreadTest` | 多线程 |
| `ResourceTest` | 读资源文件 |
| `ScannerTest` | 键盘输入 |

## 项目结构

```
src/
├── classfile/        # .class 文件格式解析
│   ├── reader.ts     #   大端字节读取器
│   ├── models.ts     #   ClassFile / 常量池 / 访问标志 / BootstrapMethod
│   └── parser.ts     #   二进制 → 结构化对象
├── rtda/             # 运行时数据区（Run-Time Data Areas）
│   ├── slot.ts       #   JValue、JavaObject（list/map/array 扩展）
│   ├── frame.ts      #   栈帧（局部变量表 + 操作数栈 + PC）
│   ├── thread.ts     #   线程栈
│   └── heap.ts       #   方法区/类空间 + 内置对象
├── interpreter/
│   ├── opcodes.ts    #   JVM 操作码表
│   └── executor.ts   #   字节码解释执行主循环
└── index.ts          # 入口
```

## 已经支持的字节码指令

**加载存储**：`aconst_null`, `iconst_*`, `ldc`, `ldc_w`, `ldc2_w`, `bipush`,
`iload_*`, `aload_*`, `istore`, `astore_*`, `iload/istore 宽索引`, `pop`, `dup`

**算术**：`iadd`, `isub`, `imul`, `idiv`, `iinc`

**类型转换**：`i2l`, `i2f`, `i2d`

**控制流**：`goto`, `ifeq`, `ifne`, `iflt`, `if_icmpge`, `if_icmpgt`, `if_icmple`, `if_icmpeq`, `ifnull`

**对象操作**：`new`, `getstatic`, `putstatic`, `getfield`, `putfield`, `checkcast`

**方法调用**：`invokevirtual`, `invokespecial`, `invokestatic`, `invokeinterface`, `invokedynamic`

**数组**：`newarray`, `anewarray`, `aastore`, `iaload`

**异常**：`athrow`（异常表匹配）

**返回**：`return`, `(I/A)return`

## 内置类（不走 .class 加载，硬编码拦截）

- `java.lang.System`（out / in）
- `java.io.PrintStream`（println / print）
- `java.lang.StringBuilder`（append / toString）
- `java.util.ArrayList`（add / get / size）
- `java.util.HashMap`（put / get / size）
- `java.lang.Integer`（valueOf / parseInt）
- `java.lang.Class`（forName / getResourceAsStream / getMethod）
- `java.lang.reflect.Method`（invoke）
- `java.lang.reflect.Constructor`（newInstance）
- `java.lang.Thread`（start / sleep）
- `java.util.Scanner`（nextLine / close）
- `java.io.BufferedReader`（readLine / close）

## FFI 外部函数

通过 [koffi](https://koffi.dev/) 调用：
- `native.dll`（GCC 编译）：add / multiply / factorial
- `user32.dll`：MessageBoxW（中文对话框）
- `kernel32.dll`：GetCurrentProcessId
