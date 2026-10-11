import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseClassFile } from '../classfile/parser.js';
import { ClassFile } from '../classfile/models.js';
import { Metaspace } from './heap.js';

/**
 * 极简类加载器：从 classpath 目录里找 .class 文件并解析。
 * M4 阶段只支持从文件系统加载，不做 jar、不做网络。
 */
export class ClassLoader {
  constructor(
    private readonly classpath: string[],
    private readonly meta: Metaspace
  ) {}

  loadClass(name: string): ClassFile {
    // 已经加载过？
    const existing = this.meta.findClass(name);
    if (existing) return existing;

    // 从 classpath 找
    const relative = name.replace(/\./g, '/') + '.class';
    for (const dir of this.classpath) {
      const p = join(dir, relative);
      try {
        const buf = readFileSync(p);
        const cf = parseClassFile(new Uint8Array(buf));
        this.meta.defineClass(cf);
        return cf;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    throw new Error(`类加载失败：找不到 ${name}（在 classpath: ${this.classpath.join('; ')}）`);
  }
}
