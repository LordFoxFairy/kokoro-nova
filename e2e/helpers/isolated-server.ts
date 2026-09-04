import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const RECLAIM_TIMEOUT_MS = 5_000;
const RECLAIM_POLL_MS = 50;

type ControlRecord = {
  version: 1;
  port: number;
  pid: number;
  processGroup: number;
  processStartedAt?: string;
};

type ReclaimOptions = {
  port: number;
  controlFile: string;
  log: (message: string) => void;
};

function controlRecord(value: unknown): ControlRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<ControlRecord>;
  if (
    record.version !== 1 ||
    !Number.isInteger(record.port) ||
    !Number.isInteger(record.pid) ||
    !Number.isInteger(record.processGroup) ||
    record.pid < 1 ||
    record.processGroup < 1
  ) {
    return undefined;
  }
  if (
    record.processStartedAt !== undefined &&
    (typeof record.processStartedAt !== "string" || !record.processStartedAt)
  ) {
    return undefined;
  }
  return record as ControlRecord;
}

async function readControlFile(controlFile: string) {
  try {
    return controlRecord(JSON.parse(await readFile(controlFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

async function listeningPids(port: number) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return stdout
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 1) return [];
    throw new Error(
      `[e2e-server] could not inspect :${port} with lsof: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function processGroupId(pid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "pgid=", "-p", String(pid)]);
    const group = Number(stdout.trim());
    return Number.isInteger(group) ? group : undefined;
  } catch {
    return undefined;
  }
}

async function processStartedAt(pid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function isRecordedProcess(record: ControlRecord) {
  if (!record.processStartedAt) return false;
  return (await processStartedAt(record.pid)) === record.processStartedAt;
}

async function removeControlFile(controlFile: string) {
  await rm(controlFile, { force: true });
}

async function waitForVacantPort(port: number) {
  const deadline = Date.now() + RECLAIM_TIMEOUT_MS;
  do {
    if ((await listeningPids(port)).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, RECLAIM_POLL_MS));
  } while (Date.now() < deadline);
  throw new Error(
    `[e2e-server] runner-owned process did not release isolated port :${port} within ${RECLAIM_TIMEOUT_MS}ms.`,
  );
}

async function terminateProcessGroup(record: ControlRecord) {
  try {
    process.kill(-record.processGroup, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

/**
 * Reclaim only a listener that is both on the requested isolated port and
 * identified by this workspace's persisted runner control record. A process
 * without that exact marker remains untouched and fails with a diagnostic.
 */
export async function reclaimOwnedServer({
  port,
  controlFile,
  log,
}: ReclaimOptions) {
  const record = await readControlFile(controlFile);
  const listeners = await listeningPids(port);

  if (listeners.length === 0) {
    if (record && record.port === port && (await isRecordedProcess(record))) {
      log(
        `[e2e-server] reclaiming runner-owned hung process pid=${record.pid} on isolated port :${port}.`,
      );
      await terminateProcessGroup(record);
    }
    if (record) await removeControlFile(controlFile);
    return;
  }

  const ownsListener =
    record?.port === port &&
    (listeners.includes(record.pid) ||
      (await Promise.all(listeners.map(processGroupId))).some(
        (group) => group === record.processGroup,
      ));
  if (record && ownsListener) {
    log(
      `[e2e-server] reclaiming runner-owned orphan pid=${record.pid} on isolated port :${port}.`,
    );
    await terminateProcessGroup(record);
    await waitForVacantPort(port);
    await removeControlFile(controlFile);
    return;
  }

  if (record) await removeControlFile(controlFile);
  throw new Error(
    `[e2e-server] isolated port :${port} is occupied by a non-runner process (listener pid=${listeners.join(",")}). Refusing to reuse or terminate it; :3200 is never inspected or affected.`,
  );
}

async function writeControlFile(controlFile: string, record: ControlRecord) {
  await mkdir(path.dirname(controlFile), { recursive: true });
  const temporary = `${controlFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await rename(temporary, controlFile);
}

function isolatedRuntimeFromEnv(env = process.env) {
  const port = Number(env.E2E_ISOLATED_PORT);
  const controlFile = env.E2E_ISOLATED_CONTROL_FILE;
  const workspaceDir = env.E2E_ISOLATED_WORKSPACE_DIR;
  const dataDir = env.DATA_DIR;
  const nextDistDir = env.NEXT_DIST_DIR;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535 || port === 3200) {
    throw new Error("[e2e-server] E2E_ISOLATED_PORT must be an isolated port, never :3200.");
  }
  if (!controlFile || !workspaceDir || !dataDir || !nextDistDir) {
    throw new Error("[e2e-server] missing isolated runner control environment.");
  }
  return { port, controlFile, workspaceDir, dataDir, nextDistDir };
}

async function main() {
  const runtime = isolatedRuntimeFromEnv();
  const log = (message: string) => console.log(message);
  await reclaimOwnedServer({ ...runtime, log });
  if (process.argv.includes("--reclaim")) return;

  const child = spawn(
    "pnpm",
    ["exec", "next", "dev", "--turbopack", "-p", String(runtime.port)],
    {
      cwd: runtime.workspaceDir,
      detached: true,
      env: {
        ...process.env,
        DATA_DIR: runtime.dataDir,
        NEXT_DIST_DIR: runtime.nextDistDir,
      },
      stdio: "inherit",
    },
  );
  if (!child.pid) throw new Error("[e2e-server] failed to start isolated Next server.");

  const record: ControlRecord = {
    version: 1,
    port: runtime.port,
    pid: child.pid,
    processGroup: child.pid,
    processStartedAt: await processStartedAt(child.pid),
  };
  await writeControlFile(runtime.controlFile, record);
  log(
    `[e2e-server] started runner-owned isolated server pid=${record.pid} port=:${runtime.port} controlFile=${runtime.controlFile}.`,
  );

  // A detached child has no referenced IPC handle, so a launcher with only
  // signal callbacks would otherwise exit immediately. Keep the webServer
  // command alive: Playwright can then terminate it normally and this process
  // can clean up the isolated process group. The marker remains the fallback
  // for a hard-killed parent.
  const keepAlive = setInterval(() => undefined, 60_000);
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`[e2e-server] ${signal}; stopping runner-owned pid=${record.pid}.`);
    await terminateProcessGroup(record);
    await removeControlFile(runtime.controlFile);
    clearInterval(keepAlive);
    process.exit(0);
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => void shutdown(signal));
  }

  child.once("exit", (code, signal) => {
    void removeControlFile(runtime.controlFile).finally(() => {
      clearInterval(keepAlive);
      if (!shuttingDown) {
        process.exitCode = code ?? (signal ? 1 : 0);
      }
    });
  });
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
