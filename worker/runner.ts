// Runs one turn of an agent on a system without /bin/sh: it starts the command it was given, sends its output straight
// to the files the worker reads, and publishes the exit code in the file the worker waits for. It outlives the worker
// the same way the shell does on a POSIX system, and it is what a stop kills (with its children).
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";

type Spec = { argv: string[]; out: string; err: string; exit: string; cwd: string };

const [file] = process.argv.slice(2);
if (!file) throw new Error("用法：node runner.ts <command.json>");
const spec = JSON.parse(readFileSync(file, "utf8")) as Spec;

/** Written to a temporary name and renamed, so a reader never sees half an exit code. */
function publish(code: number) {
  writeFileSync(`${spec.exit}.tmp`, String(code));
  renameSync(`${spec.exit}.tmp`, spec.exit);
}

const out = openSync(spec.out, "w");
const err = openSync(spec.err, "w");
try {
  const child = spawn(spec.argv[0], spec.argv.slice(1), {
    cwd: spec.cwd,
    stdio: ["ignore", out, err],
    windowsHide: true,
  });
  child.on("error", (error) => {
    writeFileSync(spec.err, `${String(error)}\n`, { flag: "a" });
    closeSync(out);
    closeSync(err);
    publish(127);
  });
  child.on("exit", (code, named) => {
    closeSync(out);
    closeSync(err);
    publish(code ?? (named ? 128 : 1));
  });
} catch (error) {
  writeFileSync(spec.err, `${String(error)}\n`, { flag: "a" });
  closeSync(out);
  closeSync(err);
  publish(127);
}
