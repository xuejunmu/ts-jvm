import type { ClassFile } from '../classfile/models.js';
import type { JValue, JavaObject } from './slot.js';

/**
 * 类区域 / 方法区：存放已加载的类元数据 + 静态字段。
 * M2 阶段先做最小版。
 */
export class Metaspace {
  private classes = new Map<string, ClassFile>();
  private staticFields = new Map<string, Map<string, JValue>>();
  /** 内置对象实例（比如 System.out 那个 PrintStream） */
  private intrinsicObjects = new Map<string, JavaObject>();

  defineClass(cf: ClassFile): void {
    this.classes.set(cf.thisClassName, cf);
    this.staticFields.set(cf.thisClassName, new Map());
  }

  findClass(name: string): ClassFile | undefined {
    return this.classes.get(name);
  }

  getStaticField(className: string, fieldName: string): JValue | undefined {
    return this.staticFields.get(className)?.get(fieldName);
  }

  setStaticField(className: string, fieldName: string, v: JValue): void {
    let m = this.staticFields.get(className);
    if (!m) {
      m = new Map();
      this.staticFields.set(className, m);
    }
    m.set(fieldName, v);
  }

  /** 注册一个内置对象（比如 PrintStream） */
  registerIntrinsic(name: string, obj: JavaObject): void {
    this.intrinsicObjects.set(name, obj);
  }

  getIntrinsic(name: string): JavaObject | undefined {
    return this.intrinsicObjects.get(name);
  }
}
