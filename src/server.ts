import http from "node:http";
import {
  createHttpResponse,
  generateMidiStream,
  generateVariantsFromRequest,
  type GeneratorMidiStream,
  type GeneratorOptions,
  type GeneratorResponse,
  type GeneratorVariantsRequest,
  type SchedulerRequest,
} from "./api.js";
import { UnknownChordError, type UnknownChordIssue } from "./validation.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  log?: (message: string) => void;
  generator?: GeneratorOptions;
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MIDI_HEADERS = {
  "Content-Type": "audio/midi",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, JSON_HEADERS);
  res.end(body);
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => {
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", error => {
      reject(error);
    });
  });
}

function parseRequestBody(body: string): SchedulerRequest {
  try {
    const parsed = JSON.parse(body);
    return parsed;
  } catch (error) {
    throw new Error("El cuerpo de la petición debe ser JSON válido");
  }
}

function toErrorResponse(error: unknown): { message: string; issues?: UnknownChordIssue[] } {
  if (error instanceof UnknownChordError) {
    return { message: error.message, issues: error.issues };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function sendMidi(
  res: http.ServerResponse,
  payload: GeneratorMidiStream,
  filename = "bebop-targeting.mid",
): void {
  const buffer = Buffer.from(payload.midiBinary);
  res.writeHead(200, {
    ...MIDI_HEADERS,
    "Content-Length": buffer.byteLength,
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.end(buffer);
}

async function handleGenerate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: GeneratorOptions | undefined,
): Promise<void> {
  const body = await readRequestBody(req);
  const request = parseRequestBody(body);
  const response: GeneratorResponse = createHttpResponse(request, options);
  sendJson(res, 200, response);
}

async function handleGenerateMidi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: GeneratorOptions | undefined,
): Promise<void> {
  const body = await readRequestBody(req);
  const request = parseRequestBody(body);
  const response = generateMidiStream(request, options);
  const safeProgression = request.progression?.replace(/[^A-Za-z0-9_-]+/g, "-") ?? "bebop";
  const filename = `${safeProgression || "bebop"}.mid`;
  sendMidi(res, response, filename);
}

async function handleGenerateVariants(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: GeneratorOptions | undefined,
): Promise<void> {
  const body = await readRequestBody(req);
  const payload = parseRequestBody(body) as unknown as GeneratorVariantsRequest;
  const response = generateVariantsFromRequest(payload, options);
  sendJson(res, 200, response);
}

export function createApiServer(options: ServerOptions = {}): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(res, 404, { message: "Ruta no especificada" });
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, JSON_HEADERS);
        res.end();
        return;
      }
      if (req.method === "POST") {
        if (req.url === "/generate") {
          await handleGenerate(req, res, options.generator);
          return;
        }
        if (req.url === "/generate/midi") {
          await handleGenerateMidi(req, res, options.generator);
          return;
        }
        if (req.url === "/generate/variants") {
          await handleGenerateVariants(req, res, options.generator);
          return;
        }
      }
      sendJson(res, 404, { message: "Ruta no encontrada" });
    } catch (error) {
      const payload = toErrorResponse(error);
      const status = error instanceof UnknownChordError ? 422 : error instanceof Error ? 400 : 500;
      if (status >= 500) {
        options.log?.(`Error interno: ${payload.message}`);
      }
      sendJson(res, status, payload);
    }
  });

  server.on("listening", () => {
    const address = server.address();
    if (address && typeof address === "object") {
      options.log?.(`Servidor escuchando en http://${options.host ?? "localhost"}:${address.port}`);
    } else {
      options.log?.("Servidor escuchando");
    }
  });

  return server;
}

export async function startApiServer(options: ServerOptions = {}): Promise<http.Server> {
  const server = createApiServer(options);
  const port = options.port ?? 4000;
  const host = options.host ?? "0.0.0.0";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return server;
}

export type { SchedulerRequest } from "./api.js";

function isDirectExecution(): boolean {
  if (typeof process === "undefined" || typeof import.meta.url !== "string") {
    return false;
  }
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    const modulePath = new URL(import.meta.url);
    const entryPath = new URL(`file://${entry}`);
    return modulePath.pathname === entryPath.pathname;
  } catch (error) {
    return false;
  }
}

if (isDirectExecution()) {
  startApiServer({
    log: message => console.log(message),
  }).catch(error => {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo iniciar el servidor: ${reason}`);
    process.exit(1);
  });
}
