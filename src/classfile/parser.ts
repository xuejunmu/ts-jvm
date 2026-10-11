import { ByteReader } from './reader.js';
import {
  ACC,
  AttributeInfo,
  ClassFile,
  ConstantTag,
  CpInfo,
  MemberRef,
  MethodInfo,
} from './models.js';

const MAGIC = 0xcafebabe;

export function parseClassFile(buf: Uint8Array): ClassFile {
  const r = new ByteReader(buf);

  // ---- 魔数和版本 ----
  const magic = r.u4();
  if (magic !== MAGIC) {
    throw new Error(`不是合法的 .class 文件：magic = 0x${magic.toString(16)}（应为 0xcafebabe）`);
  }
  const minorVersion = r.u2();
  const majorVersion = r.u2();

  // ---- 常量池 ----
  const cpCount = r.u2();
  const cp: CpInfo[] = new Array(cpCount); // index 从 1 开始
  cp[0] = { tag: 0, placeholder: true };

  for (let i = 1; i < cpCount; i++) {
    const tag = r.u1() as ConstantTag;
    switch (tag) {
      case ConstantTag.Utf8:
        cp[i] = { tag, string: r.utf8() };
        break;
      case ConstantTag.Integer:
        cp[i] = { tag, value: r.i4() };
        break;
      case ConstantTag.Float: {
        const bits = r.u4();
        // 用 DataView 把 bits 按 float32 解释
        const f = new Float32Array(new Uint32Array([bits]).buffer)[0];
        cp[i] = { tag, value: f };
        break;
      }
      case ConstantTag.Long: {
        const high = r.u4();
        const low = r.u4();
        const v = (BigInt(high) << 32n) | BigInt(low);
        cp[i] = { tag, value: v };
        // Long 占两个槽位，下一个 index 是不可用的
        cp[++i] = { tag: 0, placeholder: true };
        break;
      }
      case ConstantTag.Double: {
        const high = r.u4();
        const low = r.u4();
        const buf8 = new ArrayBuffer(8);
        new DataView(buf8).setUint32(0, high);
        new DataView(buf8).setUint32(4, low);
        const v = new Float64Array(buf8)[0];
        cp[i] = { tag, value: v };
        cp[++i] = { tag: 0, placeholder: true };
        break;
      }
      case ConstantTag.Class:
        cp[i] = { tag, nameIndex: r.u2() };
        break;
      case ConstantTag.String:
        cp[i] = { tag, stringIndex: r.u2() };
        break;
      case ConstantTag.Fieldref:
      case ConstantTag.Methodref:
      case ConstantTag.InterfaceMethodref:
        cp[i] = { tag, classIndex: r.u2(), nameAndTypeIndex: r.u2() };
        break;
      case ConstantTag.NameAndType:
        cp[i] = { tag, nameIndex: r.u2(), descriptorIndex: r.u2() };
        break;
      case ConstantTag.MethodHandle:
        cp[i] = { tag, referenceKind: r.u1(), referenceIndex: r.u2() };
        break;
      case ConstantTag.MethodType:
        cp[i] = { tag, descriptorIndex: r.u2() };
        break;
      case ConstantTag.InvokeDynamic:
        cp[i] = { tag, bootstrapMethodAttrIndex: r.u2(), nameAndTypeIndex: r.u2() };
        break;
      case ConstantTag.Module:
      case ConstantTag.Package:
        cp[i] = { tag, nameIndex: r.u2() };
        break;
      default:
        throw new Error(`未知的常量池 tag=${tag}（index=${i}）`);
    }
  }

  // ---- access / this / super / interfaces ----
  const accessFlags = r.u2();
  const thisClassIdx = r.u2();
  const superClassIdx = r.u2();

  const ifCount = r.u2();
  const interfaceNames: string[] = [];
  for (let i = 0; i < ifCount; i++) {
    const idx = r.u2();
    interfaceNames.push(utf8At(cp, (cp[idx] as { tag: ConstantTag.Class; nameIndex: number }).nameIndex));
  }

  // ---- fields ----
  const fieldsCount = r.u2();
  const fields: MemberRef[] = [];
  for (let i = 0; i < fieldsCount; i++) {
    fields.push(parseMember(r, cp));
  }

  // ---- methods ----
  const methodsCount = r.u2();
  const methods: MethodInfo[] = [];
  for (let i = 0; i < methodsCount; i++) {
    const m = parseMember(r, cp) as MethodInfo;
    // 抓出 Code 属性
    for (const attr of m.attributes) {
      if (attr.name === 'Code') {
        const ar = new ByteReader(attr.info);
        m.maxStack = ar.u2();
        m.maxLocals = ar.u2();
        const codeLen = ar.u4();
        m.code = ar.bytes(codeLen);
        // 读 exception table
        const exCount = ar.u2();
        m.exceptionTable = [];
        for (let j = 0; j < exCount; j++) {
          m.exceptionTable.push({
            startPc: ar.u2(),
            endPc: ar.u2(),
            handlerPc: ar.u2(),
            catchType: ar.u2(),
          });
        }
      }
    }
    methods.push(m);
  }

  // ---- class-level attributes ----
  const attrCount = r.u2();
  const attributes: AttributeInfo[] = [];
  for (let i = 0; i < attrCount; i++) {
    attributes.push(parseAttribute(r, cp));
  }

  // ---- 解析 BootstrapMethods（lambda 需要）----
  let bootstrapMethods: BootstrapMethod[] | undefined;
  for (const attr of attributes) {
    if (attr.name === 'BootstrapMethods') {
      const ar = new ByteReader(attr.info);
      const count = ar.u2();
      bootstrapMethods = [];
      for (let i = 0; i < count; i++) {
        const methodRef = ar.u2();
        const argCount = ar.u2();
        const args: number[] = [];
        for (let j = 0; j < argCount; j++) args.push(ar.u2());
        bootstrapMethods.push({ methodRef, arguments: args });
      }
    }
  }

  return {
    minorVersion,
    majorVersion,
    constantPool: cp,
    accessFlags,
    thisClassName: utf8At(cp, (cp[thisClassIdx] as { tag: ConstantTag.Class; nameIndex: number }).nameIndex),
    superClassName: utf8At(cp, (cp[superClassIdx] as { tag: ConstantTag.Class; nameIndex: number }).nameIndex),
    interfaceNames,
    fields,
    methods,
    attributes,
    bootstrapMethods,
  };
}

// ---- 工具函数 ----

function parseMember(r: ByteReader, cp: CpInfo[]): MemberRef {
  const accessFlags = r.u2();
  const nameIdx = r.u2();
  const descIdx = r.u2();
  const attrCount = r.u2();
  const attributes: AttributeInfo[] = [];
  for (let i = 0; i < attrCount; i++) {
    attributes.push(parseAttribute(r, cp));
  }
  return {
    accessFlags,
    name: utf8At(cp, nameIdx),
    descriptor: utf8At(cp, descIdx),
    attributes,
  };
}

function parseAttribute(r: ByteReader, cp: CpInfo[]): AttributeInfo {
  const nameIdx = r.u2();
  const len = r.u4();
  const info = r.bytes(len);
  return { name: utf8At(cp, nameIdx), info };
}

export function utf8At(cp: CpInfo[], idx: number): string {
  const e = cp[idx];
  if (!e || e.tag !== ConstantTag.Utf8) {
    throw new Error(`常量池 #${idx} 不是 Utf8 项`);
  }
  return e.string;
}

export function classSimpleName(name: string): string {
  return name.replace(/\//g, '.');
}

export function formatAccessFlags(flags: number): string {
  const parts: string[] = [];
  if (flags & ACC.PUBLIC) parts.push('public');
  if (flags & ACC.PRIVATE) parts.push('private');
  if (flags & ACC.PROTECTED) parts.push('protected');
  if (flags & ACC.STATIC) parts.push('static');
  if (flags & ACC.FINAL) parts.push('final');
  if (flags & ACC.ABSTRACT) parts.push('abstract');
  if (flags & ACC.NATIVE) parts.push('native');
  return parts.join(' ');
}
