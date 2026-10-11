import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { parseClassFile } from './classfile/parser.js';
import { Metaspace } from './rtda/heap.js';
import { ClassLoader } from './rtda/classloader.js';
import { Thread } from './rtda/thread.js';
import { Executor } from './interpreter/executor.js';
import { JavaObject } from './rtda/slot.js';

const DEFAULT_CLASSPATH = resolve('tests/out');

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法:');
    console.error('  node jvm.js <类名>          例如: node jvm.js Add');
    console.error('  node jvm.js <.class路径>    例如: node jvm.js tests/out/Add.class');
    console.error('  node jvm.js <.jar文件>      例如: node jvm.js MyApp.jar');
    process.exit(1);
  }

  let classFile: string;
  let classDir: string;

  if (arg.endsWith('.jar')) {
    // ---- JAR 文件：解压、读 MANIFEST、找主类 ----
    const jarPath = resolve(arg);
    if (!existsSync(jarPath)) {
      console.error(`找不到 JAR: ${jarPath}`);
      process.exit(1);
    }

    // 解压到临时目录（Expand-Archive 只认 .zip，先复制一份）
    const tmpDir = join(process.env.TEMP || '/tmp', 'ts-jvm-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const zipCopy = join(tmpDir, 'app.zip');
    writeFileSync(zipCopy, readFileSync(jarPath));
    console.log(`[ts-JVM] 解压 JAR 到临时目录...`);
    execSync(`powershell -Command "Expand-Archive -Path '${zipCopy}' -DestinationPath '${tmpDir}' -Force"`);

    // 读 MANIFEST.MF
    const manifestPath = join(tmpDir, 'META-INF', 'MANIFEST.MF');
    if (!existsSync(manifestPath)) {
      console.error('JAR 里没有 META-INF/MANIFEST.MF');
      process.exit(1);
    }
    const manifest = readFileSync(manifestPath, 'utf-8');
    const mainClassMatch = manifest.match(/Main-Class:\s*(.+)/);
    if (!mainClassMatch) {
      console.error('MANIFEST.MF 里没有 Main-Class');
      process.exit(1);
    }
    const mainClassName = mainClassMatch[1].trim();
    console.log(`[ts-JVM] 主类: ${mainClassName}`);

    classFile = join(tmpDir, mainClassName.replace(/\./g, '/') + '.class');
    classDir = tmpDir;
  } else if (arg.endsWith('.class')) {
    classFile = resolve(arg);
    classDir = dirname(classFile);
  } else {
    classFile = join(DEFAULT_CLASSPATH, arg.replace(/\./g, '/') + '.class');
    classDir = DEFAULT_CLASSPATH;
  }

  if (!existsSync(classFile)) {
    console.error(`找不到文件: ${classFile}`);
    process.exit(1);
  }

  const buf = readFileSync(classFile);
  const cf = parseClassFile(new Uint8Array(buf));

  const meta = new Metaspace();
  meta.defineClass(cf);

  const loader = new ClassLoader([classDir, DEFAULT_CLASSPATH], meta);

  meta.registerIntrinsic('java/io/PrintStream', {
    class: 'java/io/PrintStream',
    fields: new Map(),
  } as JavaObject);

  const thread = new Thread();
  const exe = new Executor(meta, loader, thread);

  console.log(`\n[ts-JVM] 开始运行 ${cf.thisClassName.replace(/\//g, '.')}...\n`);
  exe.run(cf);

  // 清理临时目录
  if (arg.endsWith('.jar')) {
    try { rmSync(classDir, { recursive: true, force: true }); } catch {}
  }

  if (exe.uncaughtException) {
    console.log('\n[ts-JVM] 异常退出。');
    process.exit(1);
  }
  console.log('\n[ts-JVM] 进程正常退出。');
  process.exit(0);
}

main();
