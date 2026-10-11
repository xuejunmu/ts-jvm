/**
 * 大端字节读取器。
 * JVM .class 文件规范规定所有多字节整数都是大端序（big-endian）。
 */
export class ByteReader {
  private view: DataView;
  private offset = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  u1(): number {
    const v = this.buf[this.offset];
    this.offset += 1;
    return v;
  }

  u2(): number {
    const v = this.view.getUint16(this.offset);
    this.offset += 2;
    return v;
  }

  u4(): number {
    const v = this.view.getUint32(this.offset);
    this.offset += 4;
    return v;
  }

  /** i4 是有符号的 4 字节整数（读字节码 offset 时会用到） */
  i4(): number {
    const v = this.view.getInt32(this.offset);
    this.offset += 4;
    return v;
  }

  i2(): number {
    const v = this.view.getInt16(this.offset);
    this.offset += 2;
    return v;
  }

  i1(): number {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  bytes(n: number): Uint8Array {
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  /** 按 MUTF-8 读一段（length 是 u2，后面跟着 length 个字节） */
  utf8(): string {
    const len = this.u2();
    const raw = this.bytes(len);
    // JVM 用的是 modified UTF-8，但对 BMP 内字符和 UTF-8 完全一致
    // Node 自带的 TextDecoder 够用
    return new TextDecoder('utf-8').decode(raw);
  }
}
