import { ByteReader } from '../classfile/reader.js';
import {
  ACC,
  ClassFile,
  ConstantTag,
  CpInfo,
  MethodInfo,
} from '../classfile/models.js';
import { Metaspace } from '../rtda/heap.js';
import { ClassLoader } from '../rtda/classloader.js';
import { Thread } from '../rtda/thread.js';
import { StackFrame } from '../rtda/frame.js';
import { int, JavaObject, JValue, ref } from '../rtda/slot.js';
import koffi from 'koffi';
import * as fs from 'fs';
import * as path from 'path';

// 加载 DLL（只加载一次）
const nativeDll = koffi.load('native.dll');
const addFn = nativeDll.func('int add(int, int)');
const multiplyFn = nativeDll.func('int multiply(int, int)');
const factorialFn = nativeDll.func('int factorial(int)');

// Windows 内置 DLL：user32.dll 的 MessageBoxW（Unicode 版，支持中文）
const user32 = koffi.load('user32.dll');
const MessageBoxW = user32.func('int MessageBoxW(void *hwnd, const char16_t *text, const char16_t *caption, uint type)');
// kernel32.dll：获取当前进程 ID
const kernel32 = koffi.load('kernel32.dll');
const GetCurrentProcessId = kernel32.func('uint GetCurrentProcessId()');

/** 原生方法注册表：key = "类名.方法名(描述符)"，value = JS 函数 */
export type NativeFn = (args: JValue[]) => JValue;
export const nativeRegistry = new Map<string, NativeFn>();

nativeRegistry.set('NativeTest.add(II)I', (args) => {
  const a = (args[0] as { kind: 'int'; num: number }).num;
  const b = (args[1] as { kind: 'int'; num: number }).num;
  return int(addFn(a, b));
});

nativeRegistry.set('NativeTest.multiply(II)I', (args) => {
  const a = (args[0] as { kind: 'int'; num: number }).num;
  const b = (args[1] as { kind: 'int'; num: number }).num;
  return int(multiplyFn(a, b));
});

nativeRegistry.set('NativeTest.factorial(I)I', (args) => {
  const n = (args[0] as { kind: 'int'; num: number }).num;
  return int(factorialFn(n));
});

// Windows 内置 DLL 函数
nativeRegistry.set('NativeTest.showMessage(Ljava/lang/String;Ljava/lang/String;)I', (args) => {
  const text = (args[0] as { kind: 'ref'; obj: { markString?: string } | null }).obj?.markString ?? '';
  const caption = (args[1] as { kind: 'ref'; obj: { markString?: string } | null }).obj?.markString ?? '';
  return int(MessageBoxW(null, text, caption, 0x40)); // MB_ICONINFORMATION
});

nativeRegistry.set('NativeTest.getPid()I', () => {
  return int(GetCurrentProcessId());
});
import { OP } from './opcodes.js';

export class Executor {
  constructor(
    private readonly meta: Metaspace,
    private readonly loader: ClassLoader,
    private readonly thread: Thread
  ) {}

  run(mainClass: ClassFile): void {
    const main = mainClass.methods.find(
      (m) => m.name === 'main' && m.descriptor === '([Ljava/lang/String;)V'
    );
    if (!main || !main.code) {
      throw new Error('没找到 main 方法或它没有 Code 属性');
    }
    const frame = new StackFrame(main, mainClass.thisClassName, main.maxLocals ?? 1);
    frame.setLocal(0, ref(null));
    this.thread.pushFrame(frame);
    this.interpret();
  }

  private interpret(): void {
    while (this.thread.depth > 0) {
      const frame = this.thread.topFrame()!;
      const code = frame.method.code!;

      const reader = new ByteReader(code);
      for (let i = 0; i < frame.pc; i++) reader.u1();

      this.executeOp(frame, reader);
    }
  }

  private executeOp(frame: StackFrame, r: ByteReader): void {
    const pcBefore = frame.pc;
    const op = r.u1();
    const cf = this.meta.findClass(frame.thisClassName)!;
    const cp = cf.constantPool;

    switch (op) {
      case OP.aconst_null:
        frame.push(ref(null));
        break;

      case OP.iconst_m1:
      case OP.iconst_0:
      case OP.iconst_1:
      case OP.iconst_2:
      case OP.iconst_3:
      case OP.iconst_4:
      case OP.iconst_5:
        frame.push(int(op - OP.iconst_0));
        break;

      case OP.bipush:
        frame.push(int(r.i1()));
        break;

      case OP.ldc: {
        const idx = r.u1();
        this.ldc(cp, idx, frame);
        break;
      }
      case 0x13: { // ldc_w: 宽索引 u2
        const idx = r.u2();
        this.ldc(cp, idx, frame);
        break;
      }
      case 0x14: { // ldc2_w: long/double 常量
        const idx = r.u2();
        const info = cp[idx];
        if (info.tag === ConstantTag.Long) {
          frame.push({ kind: 'long', big: BigInt((info as { value: number }).value) });
        }
        break;
      }

      case OP.aload_0: frame.push(frame.getLocal(0) ?? ref(null)); break;
      case OP.aload_1: frame.push(frame.getLocal(1) ?? ref(null)); break;
      case OP.aload_2: frame.push(frame.getLocal(2) ?? ref(null)); break;
      case OP.aload_3: frame.push(frame.getLocal(3) ?? ref(null)); break;
      case 0x19: frame.push(frame.getLocal(r.u1()) ?? ref(null)); break; // aload 宽索引
      case OP.iload_0: frame.push(frame.getLocal(0) ?? int(0)); break;
      case OP.iload_1: frame.push(frame.getLocal(1) ?? int(0)); break;
      case OP.iload_2: frame.push(frame.getLocal(2) ?? int(0)); break;
      case OP.iload_3: frame.push(frame.getLocal(3) ?? int(0)); break;
      case 0x15: frame.push(frame.getLocal(r.u1()) ?? int(0)); break; // iload 宽索引

      case OP.istore: frame.setLocal(r.u1(), frame.pop()); break;
      case 0x3b: frame.setLocal(0, frame.pop()); break; // istore_0
      case 0x3c: frame.setLocal(1, frame.pop()); break; // istore_1
      case 0x3d: frame.setLocal(2, frame.pop()); break; // istore_2
      case 0x3e: frame.setLocal(3, frame.pop()); break; // istore_3
      case 0x36: frame.setLocal(r.u1(), frame.pop()); break; // istore 宽索引
      case OP.astore_1: frame.setLocal(1, frame.pop()); break;
      case OP.astore_2: frame.setLocal(2, frame.pop()); break;
      case OP.astore_3: frame.setLocal(3, frame.pop()); break;
      case 0x3a: frame.setLocal(r.u1(), frame.pop()); break; // astore

      case OP.pop: frame.pop(); break;
      case OP.dup: {
        const v = frame.pop();
        frame.push(v);
        frame.push(v);
        break;
      }

      case OP.iadd: {
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        frame.push(int((a.num + b.num) | 0));
        break;
      }
      case OP.isub: {
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        frame.push(int((a.num - b.num) | 0));
        break;
      }
      case OP.imul: {
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        frame.push(int(Math.imul(a.num, b.num)));
        break;
      }
      case 0x6c: { // idiv
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        if (b.num === 0) {
          this.throwException(frame, 'java/lang/ArithmeticException');
          break;
        }
        frame.push(int(Math.trunc(a.num / b.num)));
        break;
      }

      case OP.iinc: {
        const idx = r.u1();
        const delta = r.i1();
        const cur = frame.getLocal(idx) as { kind: 'int'; num: number };
        frame.setLocal(idx, int((cur.num + delta) | 0));
        break;
      }

      // ---- new：在堆上分配对象 ----
      case OP.new: {
        const idx = r.u2();
        const classEntry = cp[idx] as { tag: ConstantTag.Class; nameIndex: number };
        const className = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const obj: JavaObject = {
          class: className,
          fields: new Map(),
        };
        // StringBuilder 用 markString 当内部 buffer
        if (className === 'java/lang/StringBuilder') {
          obj.markString = '';
        }
        // ArrayList 用 list 存元素
        if (className === 'java/util/ArrayList') {
          obj.list = [];
        }
        // HashMap 用 map 存键值对
        if (className === 'java/util/HashMap') {
          obj.map = new Map();
        }
        // Thread 对象：用 markString 存 Runnable lambda
        if (className === 'java/lang/Thread') {
          obj.markString = '';
        }
        // Scanner 对象
        if (className === 'java/util/Scanner') {
          obj.markString = '';
        }
        frame.push(ref(obj));
        break;
      }

      // ---- newarray：创建基本类型数组 ----
      case OP.newarray: {
        const atype = r.u1(); // 4=int, 5=long, 6=float, 7=double, 8=byte, 9=char, 10=short
        const count = (frame.pop() as { kind: 'int'; num: number }).num;
        const arrObj: JavaObject = {
          class: '[I',
          fields: new Map(),
          array: new Array(count).fill(int(0)),
        };
        frame.push(ref(arrObj));
        break;
      }

      // ---- iaload：从 int 数组读元素 ----
      case OP.iaload: {
        const index = (frame.pop() as { kind: 'int'; num: number }).num;
        const arrRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!arrRef.obj || !arrRef.obj.array) {
          this.throwException(frame, 'java/lang/NullPointerException');
          return;
        }
        frame.push(arrRef.obj.array[index] ?? int(0));
        break;
      }

      // ---- iastore：写 int 数组元素 ----
      case OP.iastore: {
        const val = frame.pop();
        const index = (frame.pop() as { kind: 'int'; num: number }).num;
        const arrRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!arrRef.obj || !arrRef.obj.array) {
          this.throwException(frame, 'java/lang/NullPointerException');
          return;
        }
        arrRef.obj.array[index] = val;
        break;
      }

      // ---- athrow：抛出异常 ----
      case OP.athrow: {
        const ex = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!ex.obj) {
          this.throwException(frame, 'java/lang/NullPointerException');
          return;
        }
        this.dispatchException(frame, ex.obj);
        return;
      }

      // ---- arraylength：数组长度 ----
      case OP.arraylength: {
        const arrRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!arrRef.obj || !arrRef.obj.array) throw new Error('arraylength: NullPointerException');
        frame.push(int(arrRef.obj.array.length));
        break;
      }

      // ---- getstatic / putstatic ----
      case OP.getstatic: {
        const idx = r.u2();
        this.getStatic(cp, idx, frame);
        break;
      }

      // ---- getfield / putfield ----
      case OP.getfield: {
        const idx = r.u2();
        const fieldRef = cp[idx] as { tag: ConstantTag.Fieldref; classIndex: number; nameAndTypeIndex: number };
        const nt = cp[fieldRef.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number };
        const fieldName = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const objRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!objRef.obj) throw new Error('getfield: NullPointerException');
        const v = objRef.obj.fields.get(fieldName) ?? ref(null);
        frame.push(v);
        break;
      }
      case OP.putfield: {
        const idx = r.u2();
        const fieldRef = cp[idx] as { tag: ConstantTag.Fieldref; classIndex: number; nameAndTypeIndex: number };
        const nt = cp[fieldRef.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number };
        const fieldName = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const val = frame.pop();
        const objRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!objRef.obj) throw new Error('putfield: NullPointerException');
        objRef.obj.fields.set(fieldName, val);
        break;
      }

      // ---- 方法调用 ----
      case OP.invokevirtual: {
        const idx = r.u2();
        this.invokeVirtual(cp, idx, frame);
        break;
      }
      case OP.invokespecial: {
        const idx = r.u2();
        this.invokeSpecial(cp, idx, frame);
        break;
      }
      case OP.invokestatic: {
        const idx = r.u2();
        this.invokeStatic(cp, idx, frame);
        break;
      }

      // ---- anewarray：创建引用类型数组 ----
      case 0xbd: {
        const idx = r.u2();
        const len = (frame.pop() as { kind: 'int'; num: number }).num;
        const arr: JavaObject = {
          class: '[Ljava/lang/Object;',
          fields: new Map(),
          array: new Array(len).fill(ref(null)),
        };
        frame.push(ref(arr));
        break;
      }

      // ---- invokedynamic：lambda 工厂 ----
      case OP.invokedynamic: {
        const cpIdx = r.u2();
        r.u2(); // 两个 0 字节（reserved）
        const indy = cp[cpIdx] as { tag: ConstantTag.InvokeDynamic; bootstrapMethodAttrIndex: number; nameAndTypeIndex: number };
        const bsms = cf.bootstrapMethods ?? [];
        const bsm = bsms[indy.bootstrapMethodAttrIndex];
        if (!bsm) throw new Error(`invokedynamic: 找不到 BootstrapMethods[${indy.bootstrapMethodAttrIndex}]`);
        // arguments[1] 是 MethodHandle，指向 lambda 实现
        const mhIdx = bsm.arguments[1];
        const mh = cp[mhIdx] as { tag: ConstantTag.MethodHandle; referenceIndex: number };
        const targetRef = cp[mh.referenceIndex] as { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number };
        const targetClassEntry = cp[targetRef.classIndex] as { tag: ConstantTag.Class; nameIndex: number };
        const targetClass = (cp[targetClassEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const nt = cp[targetRef.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number };
        const targetName = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const targetDesc = (cp[nt.descriptorIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const lambdaObj: JavaObject = {
          class: 'Lambda',
          fields: new Map(),
          markString: `${targetClass}.${targetName}${targetDesc}`,
        };
        frame.push(ref(lambdaObj));
        break;
      }

      // ---- aastore：存引用数组 ----
      case 0x53: {
        const value = frame.pop();
        const index = (frame.pop() as { kind: 'int'; num: number }).num;
        const arrRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (arrRef.obj?.array) arrRef.obj.array[index] = value;
        break;
      }

      // ---- invokeinterface：调用 lambda ----
      case OP.invokeinterface: {
        const idx = r.u2();
        r.u1(); // count
        r.u1(); // 0
        const ref_ = cp[idx] as { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number };
        const nt = cp[ref_.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number };
        const desc = (cp[nt.descriptorIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        const paramCount = countParams(desc);
        const args: JValue[] = [];
        for (let i = 0; i < paramCount; i++) args.unshift(frame.pop());
        const lambdaRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        if (!lambdaRef.obj) throw new Error('invokeinterface: lambda 为 null');
        const target = lambdaRef.obj.markString!;
        const dotIdx = target.lastIndexOf('.');
        const parenIdx = target.indexOf('(');
        const targetClass = target.slice(0, dotIdx);
        const targetName = target.slice(dotIdx + 1, parenIdx);
        const targetDesc = target.slice(parenIdx);
        const targetCf = this.meta.findClass(targetClass) ?? this.loader.loadClass(targetClass);
        const method = targetCf.methods.find(m => m.name === targetName && m.descriptor === targetDesc);
        if (!method) throw new Error(`lambda 方法未找到: ${targetClass}.${targetName}${targetDesc}`);
        const newFrame = new StackFrame(method, targetClass, method.maxLocals ?? (paramCount + 1));
        for (let i = 0; i < args.length; i++) newFrame.setLocal(i, args[i]);
        this.thread.pushFrame(newFrame);
        break;
      }

      // ---- 分支 ----
      case OP.goto: {
        const offset = r.i2();
        frame.pc = pcBefore + offset;
        return;
      }
      case OP.ifeq: {
        const offset = r.i2();
        const v = frame.pop() as { kind: 'int'; num: number };
        if (v.num === 0) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case OP.ifne: {
        const offset = r.i2();
        const v = frame.pop() as { kind: 'int'; num: number };
        if (v.num !== 0) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case OP.iflt: {
        const offset = r.i2();
        const v = frame.pop() as { kind: 'int'; num: number };
        if (v.num < 0) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case OP.ificmp_ge: {
        const offset = r.i2();
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        if (a.num >= b.num) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case OP.if_icmp_gt: {
        const offset = r.i2();
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        if (a.num > b.num) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case 0xa1: { // if_icmple
        const offset = r.i2();
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        if (a.num <= b.num) { frame.pc = pcBefore + offset; return; }
        break;
      }
      case 0xa2: { // if_icmpge
        const offset = r.i2();
        const b = frame.pop() as { kind: 'int'; num: number };
        const a = frame.pop() as { kind: 'int'; num: number };
        if (a.num >= b.num) { frame.pc = pcBefore + offset; return; }
        break;
      }

      // ---- 类型转换 ----
      case 0x85: { // i2l: int → long
        const v = frame.pop() as { kind: 'int'; num: number };
        frame.push({ kind: 'long', big: BigInt(v.num) });
        break;
      }
      case 0x86: { // i2f: int → float
        const v = frame.pop() as { kind: 'int'; num: number };
        frame.push({ kind: 'float', num: v.num });
        break;
      }
      case 0x87: { // i2d: int → double
        const v = frame.pop() as { kind: 'int'; num: number };
        frame.push({ kind: 'double', num: v.num });
        break;
      }

      // ---- checkcast：类型检查，暂时空操作 ----
      case 0xc0: {
        r.u2(); // 跳过类索引
        break;
      }

      // ---- ifnull：如果为 null 跳转 ----
      case 0xc6: {
        const offset = r.i2();
        const v = frame.pop();
        if (v.kind === 'ref' && v.obj === null) {
          frame.pc = pcBefore + offset;
          return;
        }
        break;
      }

      // ---- 返回 ----
      case OP.return_void: {
        this.thread.popFrame();
        return;
      }
      case 0xac: { // ireturn
        // 返回值已经在栈顶，传给调用者
        const v = frame.pop();
        this.thread.popFrame();
        const caller = this.thread.topFrame();
        if (caller) caller.push(v);
        return;
      }
      case 0xb0: { // areturn（引用返回）
        const v = frame.pop();
        this.thread.popFrame();
        const caller = this.thread.topFrame();
        if (caller) caller.push(v);
        return;
      }

      default:
        throw new Error(
          `未实现的字节码指令: 0x${op.toString(16)}（在 ${frame.thisClassName}.${frame.method.name} 的 pc=${pcBefore}）`
        );
    }

    frame.pc = r.position;
  }

  // ---- 辅助 ----

  private ldc(cp: CpInfo[], idx: number, frame: StackFrame): void {
    const e = cp[idx];
    if (e.tag === ConstantTag.String) {
      const str = (cp[e.stringIndex] as { tag: ConstantTag.Utf8; string: string }).string;
      const obj: JavaObject = { class: 'java/lang/String', fields: new Map(), markString: str };
      frame.push(ref(obj));
    } else if (e.tag === ConstantTag.Integer) {
      frame.push(int(e.value));
    } else if (e.tag === ConstantTag.Class) {
      frame.push(ref(null));
    } else {
      throw new Error(`ldc 暂不支持的常量类型 tag=${e.tag}`);
    }
  }

  private getStatic(cp: CpInfo[], idx: number, frame: StackFrame): void {
    const ref_ = cp[idx] as { tag: ConstantTag.Fieldref; classIndex: number; nameAndTypeIndex: number };
    const classEntry = cp[ref_.classIndex] as { tag: ConstantTag.Class; nameIndex: number };
    const className = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const nt = cp[ref_.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number };
    const fieldName = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;

    if (className === 'java/lang/System' && fieldName === 'out') {
      const ps = this.meta.getIntrinsic('java/io/PrintStream')!;
      frame.push(ref(ps));
      return;
    }
    if (className === 'java/lang/System' && fieldName === 'in') {
      const isObj: JavaObject = { class: 'java/io/InputStream', fields: new Map() };
      frame.push(ref(isObj));
      return;
    }
    const v = this.meta.getStaticField(className, fieldName);
    if (v) frame.push(v);
    else throw new Error(`getStatic: 未知静态字段 ${className}.${fieldName}`);
  }

  private invokeVirtual(cp: CpInfo[], idx: number, frame: StackFrame): void {
    const ref_ = cp[idx] as { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number };
    const classEntry = cp[ref_.classIndex] as { tag: ConstantTag.Class; nameIndex: number };
    const className = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const nt = cp[ref_.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number };
    const name = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const desc = (cp[nt.descriptorIndex] as { tag: ConstantTag.Utf8; string: string }).string;

    // 内置：PrintStream.println
    if (className === 'java/io/PrintStream' && name === 'println') {
      const arg = frame.pop();
      frame.pop(); // objectref
      if (desc === '(Ljava/lang/String;)V') {
        console.log((arg as { kind: 'ref'; obj: JavaObject }).obj!.markString ?? '');
      } else if (desc === '(I)V') {
        console.log((arg as { kind: 'int'; num: number }).num);
      } else {
        console.log(String(arg));
      }
      return;
    }

    // 内置：PrintStream.print（不换行）
    if (className === 'java/io/PrintStream' && name === 'print' && desc === '(Ljava/lang/String;)V') {
      const arg = frame.pop();
      frame.pop(); // objectref
      process.stdout.write((arg as { kind: 'ref'; obj: JavaObject }).obj!.markString ?? '');
      return;
    }

    // 内置：StringBuilder.append / toString
    if (className === 'java/lang/StringBuilder') {
      const paramCount = countParams(desc);
      const objRef = frame.operandStack[frame.operandStack.length - 1 - paramCount] as { kind: 'ref'; obj: JavaObject | null };
      const sb = objRef.obj!;

      if (name === 'append' && desc === '(Ljava/lang/String;)Ljava/lang/StringBuilder;') {
        const arg = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        frame.pop(); // this
        sb.markString = (sb.markString ?? '') + (arg.obj?.markString ?? '');
        frame.push(ref(sb)); // append 返回 this
        return;
      }
      if (name === 'append' && desc === '(I)Ljava/lang/StringBuilder;') {
        const arg = frame.pop() as { kind: 'int'; num: number };
        frame.pop(); // this
        sb.markString = (sb.markString ?? '') + arg.num;
        frame.push(ref(sb));
        return;
      }
      if (name === 'append' && desc === '(Ljava/lang/Object;)Ljava/lang/StringBuilder;') {
        const arg = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
        frame.pop(); // this
        const s = arg.obj?.markString ?? String(arg.obj);
        sb.markString = (sb.markString ?? '') + s;
        frame.push(ref(sb));
        return;
      }
      if (name === 'toString' && desc === '()Ljava/lang/String;') {
        frame.pop(); // this
        const result: JavaObject = {
          class: 'java/lang/String',
          fields: new Map(),
          markString: sb.markString ?? '',
        };
        frame.push(ref(result));
        return;
      }
    }

    // 内置：ArrayList
    if (className === 'java/util/ArrayList') {
      const paramCount = countParams(desc);
      const objRef = frame.operandStack[frame.operandStack.length - 1 - paramCount] as { kind: 'ref'; obj: JavaObject | null };
      const list = objRef.obj!.list!;

      if (name === 'add' && desc === '(Ljava/lang/Object;)Z') {
        const arg = frame.pop();
        frame.pop(); // this
        list.push(arg);
        frame.push(int(1)); // true
        return;
      }
      if (name === 'size' && desc === '()I') {
        frame.pop(); // this
        frame.push(int(list.length));
        return;
      }
      if (name === 'get' && desc === '(I)Ljava/lang/Object;') {
        const idx = (frame.pop() as { kind: 'int'; num: number }).num;
        frame.pop(); // this
        frame.push(list[idx] ?? ref(null));
        return;
      }
    }

    // 内置：HashMap
    if (className === 'java/util/HashMap') {
      const paramCount = countParams(desc);
      const objRef = frame.operandStack[frame.operandStack.length - 1 - paramCount] as { kind: 'ref'; obj: JavaObject | null };
      const map = objRef.obj!.map!;

      if (name === 'put' && desc === '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;') {
        const v = frame.pop();
        const k = frame.pop();
        frame.pop(); // this
        const key = (k as { kind: 'ref'; obj: JavaObject | null }).obj!.markString ?? '';
        map.set(key, v);
        frame.push(ref(null));
        return;
      }
      if (name === 'get' && desc === '(Ljava/lang/Object;)Ljava/lang/Object;') {
        const k = frame.pop();
        frame.pop(); // this
        const key = (k as { kind: 'ref'; obj: JavaObject | null }).obj!.markString ?? '';
        frame.push(map.get(key) ?? ref(null));
        return;
      }
      if (name === 'size' && desc === '()I') {
        frame.pop(); // this
        frame.push(int(map.size));
        return;
      }
    }

    // 内置：Class.getDeclaredConstructor(Class[]) -> Constructor
    if (className === 'java/lang/Class' && name === 'getDeclaredConstructor') {
      frame.pop(); // Class[]（忽略参数类型）
      const classRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const ctorObj: JavaObject = {
        class: 'java/lang/reflect/Constructor',
        fields: new Map(),
        markString: classRef.obj!.markString,
      };
      frame.push(ref(ctorObj));
      return;
    }

    // 内置：Class.getMethod(String, Class[]) -> Method
    if (className === 'java/lang/Class' && name === 'getMethod') {
      frame.pop(); // Class[]
      const methodNameRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const classRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const methodName = methodNameRef.obj!.markString!;
      const cls = classRef.obj!.markString!;
      // 找方法描述符
      const cf = this.meta.findClass(cls) ?? this.loader.loadClass(cls);
      const method = cf.methods.find(m => m.name === methodName);
      const methodObj: JavaObject = {
        class: 'java/lang/reflect/Method',
        fields: new Map(),
        markString: `${cls}.${methodName}${method?.descriptor ?? '()V'}`,
      };
      frame.push(ref(methodObj));
      return;
    }

    // 内置：Constructor.newInstance(Object[]) -> Object
    if (className === 'java/lang/reflect/Constructor' && name === 'newInstance') {
      frame.pop(); // Object[]
      const ctorRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const cls = ctorRef.obj!.markString!;
      const obj: JavaObject = { class: cls, fields: new Map() };
      // 调用默认构造器
      const cf = this.meta.findClass(cls) ?? this.loader.loadClass(cls);
      const ctor = cf.methods.find(m => m.name === '<init>' && m.descriptor === '()V');
      if (ctor) {
        const newFrame = new StackFrame(ctor, cls, ctor.maxLocals ?? 1);
        newFrame.setLocal(0, ref(obj));
        this.thread.pushFrame(newFrame);
      }
      frame.push(ref(obj));
      return;
    }

    // 内置：Method.invoke(Object, Object[]) -> Object
    if (className === 'java/lang/reflect/Method' && name === 'invoke') {
      const argsArr = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const thisRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const methodRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const target = methodRef.obj!.markString!;
      const dotIdx = target.lastIndexOf('.');
      const parenIdx = target.indexOf('(');
      const cls = target.slice(0, dotIdx);
      const methodName = target.slice(dotIdx + 1, parenIdx);
      const desc = target.slice(parenIdx);
      const cf = this.meta.findClass(cls) ?? this.loader.loadClass(cls);
      const method = cf.methods.find(m => m.name === methodName && m.descriptor === desc);
      if (!method) throw new Error(`Method.invoke: 找不到 ${cls}.${methodName}${desc}`);
      // 从 argsArr 拿参数
      const params: JValue[] = [];
      if (argsArr.obj?.array) {
        for (const a of argsArr.obj.array) params.push(a);
      }
      const newFrame = new StackFrame(method, cls, method.maxLocals ?? (params.length + 1));
      newFrame.setLocal(0, thisRef);
      for (let i = 0; i < params.length; i++) newFrame.setLocal(i + 1, params[i]);
      this.thread.pushFrame(newFrame);
      frame.push(ref(null));
      return;
    }

    // 内置：Thread.start() -> void（同步执行 Runnable.run()）
    if (className === 'java/lang/Thread' && name === 'start' && desc === '()V') {
      const threadRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const target = threadRef.obj?.markString ?? '';
      if (!target) return;
      const dotIdx = target.lastIndexOf('.');
      const parenIdx = target.indexOf('(');
      const cls = target.slice(0, dotIdx);
      const methodName = target.slice(dotIdx + 1, parenIdx);
      const desc2 = target.slice(parenIdx);
      const cf = this.meta.findClass(cls) ?? this.loader.loadClass(cls);
      const method = cf.methods.find(m => m.name === methodName && m.descriptor === desc2);
      if (!method) throw new Error(`Thread.start: 找不到 ${cls}.${methodName}${desc2}`);
      const newFrame = new StackFrame(method, cls, method.maxLocals ?? 1);
      this.thread.pushFrame(newFrame);
      return;
    }

    // 内置：Class.getResourceAsStream(String) -> InputStream
    if (className === 'java/lang/Class' && name === 'getResourceAsStream') {
      const pathRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      frame.pop(); // Class 对象
      const resourcePath = pathRef.obj?.markString ?? '';
      // 在 tests/out 目录找文件
      const fileName = resourcePath.replace(/^\//, '');
      const fullPath = path.join(process.cwd(), 'tests', fileName);
      const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
      const isObj: JavaObject = {
        class: 'java/io/InputStream',
        fields: new Map(),
        markString: content,
      };
      frame.push(ref(isObj));
      return;
    }

    // 内置：BufferedReader.readLine() -> String
    if (className === 'java/io/BufferedReader' && name === 'readLine' && desc === '()Ljava/lang/String;') {
      const brRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const content = brRef.obj?.markString ?? '';
      const lines = content.split('\n');
      const idx = (brRef.obj?.fields.get('lineIdx') as { kind: 'int'; num: number })?.num ?? 0;
      if (idx >= lines.length) {
        frame.push(ref(null));
      } else {
        brRef.obj?.fields.set('lineIdx', int(idx + 1));
        frame.push(ref({ class: 'java/lang/String', fields: new Map(), markString: lines[idx].trim() }));
      }
      return;
    }

    // 内置：BufferedReader.close() -> void
    if (className === 'java/io/BufferedReader' && name === 'close') {
      frame.pop();
      return;
    }

    // 内置：Scanner.nextLine() -> String（同步读键盘输入）
    if (className === 'java/util/Scanner' && name === 'nextLine' && desc === '()Ljava/lang/String;') {
      frame.pop(); // this
      const buf = Buffer.alloc(1024);
      try {
        const n = fs.readSync(0, buf, 0, 1024, null);
        if (n === 0) {
          frame.push(ref(null));
          return;
        }
        const decoder = new TextDecoder('gbk');
        const line = decoder.decode(buf.subarray(0, n)).trim();
        frame.push(ref({ class: 'java/lang/String', fields: new Map(), markString: line }));
      } catch {
        frame.push(ref(null));
      }
      return;
    }

    // 内置：Scanner.close() -> void
    if (className === 'java/util/Scanner' && name === 'close') {
      frame.pop();
      return;
    }

    // 内置：String.equals(Object) -> boolean
    if (className === 'java/lang/String' && name === 'equals' && desc === '(Ljava/lang/Object;)Z') {
      const otherRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const thisRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const a = thisRef.obj?.markString ?? '';
      const b = otherRef.obj?.markString ?? '';
      frame.push(int(a === b ? 1 : 0));
      return;
    }

    // 虚分派：从对象的实际类开始找方法
    const paramCount = countParams(desc);
    // objectref 在栈中的位置：栈顶是最后一个参数，往下 paramCount 个就是 objectref
    const objRef = frame.operandStack[frame.operandStack.length - 1 - paramCount] as { kind: 'ref'; obj: JavaObject | null };
    if (!objRef.obj) throw new Error('invokevirtual: NullPointerException');
    const actualClass = objRef.obj.class;

    const method = this.resolveMethod(actualClass, name, desc);
    this.invokeMethod(frame, method, actualClass);
  }

  private invokeSpecial(cp: CpInfo[], idx: number, frame: StackFrame): void {
    const ref_ = cp[idx] as { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number };
    const classEntry = cp[ref_.classIndex] as { tag: ConstantTag.Class; nameIndex: number };
    const className = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const nt = cp[ref_.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number };
    const name = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const desc = (cp[nt.descriptorIndex] as { tag: ConstantTag.Utf8; string: string }).string;

    // Object.<init>() 空构造器
    if (className === 'java/lang/Object' && name === '<init>') {
      frame.pop(); // this
      return;
    }

    // StringBuilder.<init>() 空构造器（new 时已初始化 buffer）
    if (className === 'java/lang/StringBuilder' && name === '<init>') {
      frame.pop();
      return;
    }
    // ArrayList/HashMap 空构造器
    if ((className === 'java/util/ArrayList' || className === 'java/util/HashMap') && name === '<init>') {
      frame.pop();
      return;
    }
    // Thread.<init>(Runnable)：存 Runnable
    if (className === 'java/lang/Thread' && name === '<init>' && desc === '(Ljava/lang/Runnable;)V') {
      const runnable = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const thisRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      if (thisRef.obj) thisRef.obj.markString = runnable.obj?.markString ?? '';
      return;
    }
    // InputStreamReader.<init>(InputStream)：包装
    if (className === 'java/io/InputStreamReader' && name === '<init>' && desc === '(Ljava/io/InputStream;)V') {
      const isRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const thisRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      if (thisRef.obj) thisRef.obj.markString = isRef.obj?.markString ?? '';
      return;
    }
    // BufferedReader.<init>(Reader)：包装
    if (className === 'java/io/BufferedReader' && name === '<init>' && desc === '(Ljava/io/Reader;)V') {
      const readerRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const thisRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      if (thisRef.obj) thisRef.obj.markString = readerRef.obj?.markString ?? '';
      return;
    }
    // Scanner.<init>(InputStream)：空构造器
    if (className === 'java/util/Scanner' && name === '<init>' && desc === '(Ljava/io/InputStream;)V') {
      frame.pop(); // InputStream
      frame.pop(); // this
      return;
    }

    const method = this.resolveMethod(className, name, desc);
    this.invokeMethod(frame, method, className);
  }

  private invokeStatic(cp: CpInfo[], idx: number, frame: StackFrame): void {
    const ref_ = cp[idx] as { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number };
    const classEntry = cp[ref_.classIndex] as { tag: ConstantTag.Class; nameIndex: number };
    const className = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const nt = cp[ref_.nameAndTypeIndex] as { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number };
    const name = (cp[nt.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
    const desc = (cp[nt.descriptorIndex] as { tag: ConstantTag.Utf8; string: string }).string;

    // 内置：Integer.valueOf(I) -> Integer 对象
    if (className === 'java/lang/Integer' && name === 'valueOf' && desc === '(I)Ljava/lang/Integer;') {
      const v = (frame.pop() as { kind: 'int'; num: number }).num;
      const intObj: JavaObject = {
        class: 'java/lang/Integer',
        fields: new Map(),
        markString: String(v),
      };
      frame.push(ref(intObj));
      return;
    }

    // 内置：Class.forName(String) -> Class 对象
    if (className === 'java/lang/Class' && name === 'forName' && desc === '(Ljava/lang/String;)Ljava/lang/Class;') {
      const nameRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      const className = nameRef.obj!.markString!.replace(/\./g, '/');
      const classObj: JavaObject = {
        class: 'java/lang/Class',
        fields: new Map(),
        markString: className,
      };
      frame.push(ref(classObj));
      return;
    }

    // 内置：Thread.sleep(J) -> void（忽略）
    if (className === 'java/lang/Thread' && name === 'sleep' && desc === '(J)V') {
      frame.pop(); // long
      return;
    }

    // 内置：Integer.parseInt(String) -> int
    if (className === 'java/lang/Integer' && name === 'parseInt' && desc === '(Ljava/lang/String;)I') {
      const sRef = frame.pop() as { kind: 'ref'; obj: JavaObject | null };
      frame.push(int(parseInt(sRef.obj?.markString ?? '0')));
      return;
    }

    const method = this.resolveMethod(className, name, desc);

    // native 方法：从注册表找 JS 函数
    if (method.accessFlags & ACC.NATIVE) {
      const paramCount = countParams(desc);
      const args: JValue[] = [];
      for (let i = 0; i < paramCount; i++) args.unshift(frame.pop());
      const key = `${className}.${name}${desc}`;
      const fn = nativeRegistry.get(key);
      if (!fn) throw new Error(`未注册的 native 方法: ${key}`);
      const result = fn(args);
      // 如果方法有返回值，压回调用者栈
      if (desc.endsWith('I') || desc.endsWith('L') || desc.endsWith('Ljava/lang/String;')) {
        frame.push(result);
      }
      return;
    }

    this.invokeMethod(frame, method, className);
  }

  /** 创建并抛出一个异常对象 */
  private throwException(frame: StackFrame, exClassName: string): void {
    const exObj: JavaObject = {
      class: exClassName,
      fields: new Map(),
      markString: exClassName,
    };
    this.dispatchException(frame, exObj);
  }

  /** 在当前方法的 exception table 里找 handler，找不到就弹栈帧往上找 */
  /** 未捕获异常时设为 true，主程序据此返回退出码 1 */
  uncaughtException = false;

  private dispatchException(frame: StackFrame, exObj: JavaObject): void {
    const table = frame.method.exceptionTable ?? [];
    const pc = frame.pc;

    for (const handler of table) {
      if (pc >= handler.startPc && pc < handler.endPc) {
        // catch_type = 0 表示 catch any (finally)
        if (handler.catchType === 0) {
          frame.operandStack.length = 0;
          frame.push(ref(exObj));
          frame.pc = handler.handlerPc;
          return;
        }
        // 简化：只按类名匹配（不做继承链）
        const cf = this.meta.findClass(frame.thisClassName)!;
        const cp = cf.constantPool;
        const classEntry = cp[handler.catchType] as { tag: ConstantTag.Class; nameIndex: number };
        const catchName = (cp[classEntry.nameIndex] as { tag: ConstantTag.Utf8; string: string }).string;
        if (catchName === exObj.class) {
          frame.operandStack.length = 0;
          frame.push(ref(exObj));
          frame.pc = handler.handlerPc;
          return;
        }
      }
    }

    // 当前方法没 handler，弹栈帧
    console.error(`Exception in thread "main" ${exObj.class}: ${exObj.markString ?? ''}`);
    this.uncaughtException = true;
    this.thread.popFrame();
  }

  /** 在类及其父类链里找方法 */
  private resolveMethod(className: string, name: string, desc: string): MethodInfo {
    let current: string | undefined = className;
    while (current) {
      const cf = this.meta.findClass(current) ?? this.loader.loadClass(current);
      const m = cf.methods.find((x) => x.name === name && x.descriptor === desc);
      if (m) return m;
      current = cf.superClassName;
      // 不继续追 java/lang/Object 以外的父类链了（我们没加载 Object）
      if (current === 'java/lang/Object') break;
    }
    throw new Error(`方法未找到: ${className}.${name}${desc}`);
  }

  /** 建立新栈帧并把参数传进去 */
  private invokeMethod(caller: StackFrame, method: MethodInfo, methodClassName: string): void {
    // 从描述符算参数个数
    const paramCount = countParams(method.descriptor);
    // 弹出参数（倒序）
    const args: JValue[] = [];
    for (let i = 0; i < paramCount; i++) args.unshift(caller.pop());
    // 再弹 this（实例方法）
    const isStatic = (method.accessFlags & ACC.STATIC) !== 0;
    let thisObj: JavaObject | null = null;
    if (!isStatic) {
      thisObj = (caller.pop() as { kind: 'ref'; obj: JavaObject | null }).obj;
    }

    const newFrame = new StackFrame(method, methodClassName, method.maxLocals ?? (paramCount + 1));
    let slot = 0;
    if (!isStatic) {
      newFrame.setLocal(slot++, ref(thisObj));
    }
    for (const a of args) {
      newFrame.setLocal(slot++, a);
    }
    this.thread.pushFrame(newFrame);
  }
}

/** 从方法描述符算参数个数，比如 "(Ljava/lang/String;I)V" -> 2 */
function countParams(desc: string): number {
  const m = desc.match(/^\((.*)\)/);
  if (!m) return 0;
  const params = m[1];
  let count = 0;
  let i = 0;
  while (i < params.length) {
    const c = params[i];
    if (c === 'L') {
      // 对象类型，读到分号
      const end = params.indexOf(';', i);
      i = end + 1;
      count++;
    } else if (c === '[') {
      // 数组，跳到下一个完整类型
      i++;
      while (params[i] === '[') i++;
      if (params[i] === 'L') {
        i = params.indexOf(';', i) + 1;
      } else {
        i++;
      }
      count++;
    } else {
      // 基本类型 I/Z/B/C/S/J/F/D
      count++;
      i++;
    }
  }
  return count;
}
