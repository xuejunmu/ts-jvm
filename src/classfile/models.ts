/**
 * .class 文件结构的 TS 类型定义。
 * 参考 JVM 规范（JEP 版）第 4 章 "The class File Format"。
 */

// ---- 常量池 ----
export const enum ConstantTag {
  Class = 7,
  Fieldref = 9,
  Methodref = 10,
  InterfaceMethodref = 11,
  String = 8,
  Integer = 3,
  Float = 4,
  Long = 5,
  Double = 6,
  NameAndType = 12,
  Utf8 = 1,
  MethodHandle = 15,
  MethodType = 16,
  InvokeDynamic = 18,
  Module = 19,
  Package = 20,
}

export type CpInfo =
  | { tag: ConstantTag.Class; nameIndex: number }
  | { tag: ConstantTag.Fieldref; classIndex: number; nameAndTypeIndex: number }
  | { tag: ConstantTag.Methodref; classIndex: number; nameAndTypeIndex: number }
  | { tag: ConstantTag.InterfaceMethodref; classIndex: number; nameAndTypeIndex: number }
  | { tag: ConstantTag.String; stringIndex: number }
  | { tag: ConstantTag.Integer; value: number }
  | { tag: ConstantTag.Float; value: number }
  | { tag: ConstantTag.Long; value: bigint }
  | { tag: ConstantTag.Double; value: number }
  | { tag: ConstantTag.NameAndType; nameIndex: number; descriptorIndex: number }
  | { tag: ConstantTag.Utf8; string: string }
  | { tag: ConstantTag.MethodHandle; referenceKind: number; referenceIndex: number }
  | { tag: ConstantTag.MethodType; descriptorIndex: number }
  | { tag: ConstantTag.InvokeDynamic; bootstrapMethodAttrIndex: number; nameAndTypeIndex: number }
  | { tag: ConstantTag.Module; nameIndex: number }
  | { tag: ConstantTag.Package; nameIndex: number }
  | { tag: 0; placeholder: true }; // Long/Double 占两个槽位，第二个槽位是占位

// ---- access_flags ----
export const ACC = {
  PUBLIC: 0x0001,
  PRIVATE: 0x0002,
  PROTECTED: 0x0004,
  STATIC: 0x0008,
  FINAL: 0x0010,
  SUPER: 0x0020,
  VOLATILE: 0x0040,
  TRANSIENT: 0x0080,
  NATIVE: 0x0100,
  INTERFACE: 0x0200,
  ABSTRACT: 0x0400,
  STRICT: 0x0800,
  SYNTHETIC: 0x1000,
  ANNOTATION: 0x2000,
  ENUM: 0x4000,
} as const;

export interface MemberRef {
  accessFlags: number;
  name: string;        // 从常量池解析出来的 UTF8
  descriptor: string;  // 从常量池解析出来的 UTF8
  attributes: AttributeInfo[];
}

export interface AttributeInfo {
  name: string;
  info: Uint8Array;
}

export interface MethodInfo extends MemberRef {
  /** 从 Code 属性里提取出来的字节码，M1 阶段先留空 */
  code?: Uint8Array;
  maxStack?: number;
  maxLocals?: number;
  exceptionTable?: ExceptionHandler[];
}

export interface ExceptionHandler {
  startPc: number;
  endPc: number;
  handlerPc: number;
  catchType: number; // 常量池 index，0 = catch any (finally)
}

export interface ClassFile {
  minorVersion: number;
  majorVersion: number;
  constantPool: CpInfo[]; // index 从 1 开始，[0] 留空
  accessFlags: number;
  thisClassName: string;   // 已经解析好
  superClassName: string;  // 已经解析好
  interfaceNames: string[];
  fields: MemberRef[];
  methods: MethodInfo[];
  attributes: AttributeInfo[];
  bootstrapMethods?: BootstrapMethod[];
}

export interface BootstrapMethod {
  methodRef: number;
  arguments: number[];
}
