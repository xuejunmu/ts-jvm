/**
 * JVM 运行时的"值"。
 *
 * JVM 规范里，long 和 double 占两个局部变量槽位，其他类型占一个。
 * 为了 M2 先简单点，我们不严格做双槽，用 TS 类型区分就行。
 */
export type JValue =
  | { kind: 'int'; num: number }
  | { kind: 'float'; num: number }
  | { kind: 'long'; big: bigint }
  | { kind: 'double'; num: number }
  | { kind: 'ref'; obj: JavaObject | null } // null 引用
  | { kind: 'returnAddress'; num: number };

/** Java 对象：用一个普通 JS 对象模拟堆里的实例 */
export interface JavaObject {
  class: string;
  fields: Map<string, JValue>;
  markString?: string;               // 如果是 java/lang/String，缓存一下 JS 字符串
  array?: JValue[];                  // 如果是数组，存元素
  list?: JValue[];                   // 如果是 ArrayList
  map?: Map<string, JValue>;         // 如果是 HashMap
}

export const int = (num: number): JValue => ({ kind: 'int', num });
export const ref = (obj: JavaObject | null): JValue => ({ kind: 'ref', obj });

/** 把 JValue 转成易读字符串（调试用） */
export function vToString(v: JValue | undefined): string {
  if (!v) return '<empty>';
  switch (v.kind) {
    case 'int': return `${v.num}`;
    case 'float': return `${v.num}f`;
    case 'long': return `${v.big}L`;
    case 'double': return `${v.num}d`;
    case 'ref':
      if (v.obj === null) return 'null';
      if (v.obj.markString !== undefined) return `"${v.obj.markString}"`;
      return `Object(${v.obj.class})`;
    case 'returnAddress': return `returnAddr(${v.num})`;
  }
}
