import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reclaimOwnedServer } from "./isolated-server";

const spawned: ReturnType<typeof spawn>[] = [];
const tempDirs: string[] = [];

async function freePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForListener(port: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`fixture server did not listen on ${port}`);
}

async function startListener(port: number) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import http from "node:http"; http.createServer((_, res) => res.end("fixture")).listen(${port}, "127.0.0.1");`,
    ],
    { detached: true, stdio: "ignore" },
  );
  spawned.push(child);
  await waitForListener(port);
  return child;
}

async function startGroupedListener(port: number) {
  const source = `import http from "node:http"; http.createServer((_, res) => res.end("fixture")).listen(${port}, "127.0.0.1");`;
  const child = spawn(
    "zsh",
    [
      "-c",
      `${JSON.stringify(process.execPath)} --input-type=module --eval ${JSON.stringify(source)} & wait`,
    ],
    { detached: true, stdio: "ignore" },
  );
  spawned.push(child);
  await waitForListener(port);
  return child;
}

async function isListening(port: number) {
  try {
    await fetch(`http://127.0.0.1:${port}`);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const child of spawned.splice(0)) {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {
      // The recovery test already stopped it.
    }
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("reclaimOwnedServer", () => {
  it("terminates only the marker-owned orphan that is listening on the isolated port", async () => {
    const port = await freePort();
    const child = await startListener(port);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "libtv-e2e-test-"));
    tempDirs.push(tempDir);
    const controlFile = path.join(tempDir, "3210.json");
    await writeFile(
      controlFile,
      JSON.stringify({ version: 1, port, pid: child.pid, processGroup: child.pid }),
    );

    const messages: string[] = [];
    await reclaimOwnedServer({
      port,
      controlFile,
      log: (message) => messages.push(message),
    });

    expect(await isListening(port)).toBe(false);
    expect(messages.join("\n")).toMatch(/reclaiming runner-owned orphan/i);
  });

  it("reclaims an owned listener that belongs to the launcher's process group", async () => {
    const port = await freePort();
    const launcher = await startGroupedListener(port);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "libtv-e2e-test-"));
    tempDirs.push(tempDir);
    const controlFile = path.join(tempDir, "3210.json");
    await writeFile(
      controlFile,
      JSON.stringify({
        version: 1,
        port,
        pid: launcher.pid,
        processGroup: launcher.pid,
      }),
    );

    await reclaimOwnedServer({ port, controlFile, log: () => {} });

    expect(await isListening(port)).toBe(false);
  });

  it("refuses an unmarked listener without terminating it", async () => {
    const port = await freePort();
    await startListener(port);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "libtv-e2e-test-"));
    tempDirs.push(tempDir);

    await expect(
      reclaimOwnedServer({
        port,
        controlFile: path.join(tempDir, "absent.json"),
        log: () => {},
      }),
    ).rejects.toThrow(/non-runner process/i);
    expect(await isListening(port)).toBe(true);
  });
});
