import type { MethodInfo } from '../classfile/models.js';
import type { JValue } from './slot.js';

/**
 * 栈帧：每次方法调用都会压入一个新栈帧。
 * 里面有：局部变量表、操作数栈、当前方法、程序计数器。
 */
export class StackFrame {
  locals: JValue[] = [];
  operandStack: JValue[] = [];
  pc = 0; // 程序计数器：相对于方法 code 起始位置的偏移

  constructor(
    public readonly method: MethodInfo,
    public readonly thisClassName: string,
    maxLocals: number
  ) {
    this.locals = new Array(maxLocals);
  }

  push(v: JValue): void {
    this.operandStack.push(v);
  }

  pop(): JValue {
    const v = this.operandStack.pop();
    if (v === undefined) throw new Error('操作数栈为空，pop 失败');
    return v;
  }

  setLocal(idx: number, v: JValue): void {
    this.locals[idx] = v;
  }

  getLocal(idx: number): JValue | undefined {
    return this.locals[idx];
  }
}
