import { StackFrame } from './frame.js';

/** 简化的 JVM 线程：就一个栈 */
export class Thread {
  private stack: StackFrame[] = [];

  pushFrame(f: StackFrame): void {
    this.stack.push(f);
  }

  popFrame(): StackFrame | undefined {
    return this.stack.pop();
  }

  topFrame(): StackFrame | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }
}
