import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/server.js";

const activeServers: import("node:http").Server[] = [];

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }),
    ),
  );
});

async function startServer() {
  const server = createApiServer();
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  activeServers.push(server);
  const address = server.address() as AddressInfo;
  return { server, port: address.port };
}

describe("HTTP API", () => {
  it("responde con notas generadas", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progression: "| Dm9  G13 | C∆ |", key: "C", seed: 99 }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.notes)).toBe(true);
    expect(payload.notes.length).toBeGreaterThan(0);
    expect(typeof payload.artifacts.text).toBe("string");
    expect(Array.isArray(payload.structured?.bars)).toBe(true);
  });

  it("permite descargar un MIDI binario reproducible", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/generate/midi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progression: "| Dm9  G13 | C∆ |", key: "C", seed: 42 }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/midi");
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(16);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("MThd");
  });

  it("genera variantes desde el endpoint dedicado", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/generate/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRequest: { progression: "| Dm9  G13 | C∆ |", key: "C" },
        count: 2,
      }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.variants)).toBe(true);
    expect(payload.variants.length).toBe(2);
    expect(payload.variants[0].meta.seed).not.toBe(payload.variants[1].meta.seed);
  });

  it("acepta rutas con prefijo /api", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progression: "| Fm7 Bb7 | Ebmaj7 |", key: "Eb", seed: 1234 }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.notes)).toBe(true);
    expect(payload.notes.length).toBeGreaterThan(0);
    expect(payload.meta?.progression).toBe("| Fm7 Bb7 | Ebmaj7 |");
  });

  it("responde con un mensaje informativo en GET", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/api/generate`, {
      method: "GET",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toMatch(/usa post/i);
  });

  it("devuelve errores estructurados para acordes desconocidos", async () => {
    const { port } = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progression: "| Zmaj7 |", key: "C" }),
    });
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.issues).toBeTruthy();
    expect(payload.issues[0].chordSymbol).toBe("Zmaj7");
  });
});
