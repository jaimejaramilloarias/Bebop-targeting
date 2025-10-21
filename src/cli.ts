#!/usr/bin/env node
import { generateFromRequest, type GeneratorResponse, type SchedulerRequest } from "./api.js";

interface CliConfig {
  format: "text" | "json";
}

interface ParsedArguments {
  request: SchedulerRequest;
  config: CliConfig;
}

function printHelp(): void {
  console.log(`Uso: bebop-targeting --progression "| Dm9  G13 | C∆ |" [opciones]\n\n` +
    "Opciones disponibles:\n" +
    "  --progression <cadena>   Progresión armónica en notación simbólica (requerido)\n" +
    "  --key <tonalidad>        Tonalidad global (ej. C, F#, Bb)\n" +
    "  --tempo <bpm>            Tempo objetivo en BPM (entero)\n" +
    "  --swing                  Activa swing con ratio por defecto\n" +
    "  --no-swing               Fuerza swing desactivado\n" +
    "  --contour <0-1>          Slider de contorno estructural\n" +
    "  --seed <número>          Seed para reproducibilidad\n" +
    "  --format <text|json>     Formato de salida (por defecto text)\n" +
    "  --help                   Muestra esta ayuda\n");
}

function ensureValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`La opción ${flag} requiere un valor`);
  }
  return value;
}

function parseArguments(argv: string[]): ParsedArguments {
  const args = argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const request: SchedulerRequest = {
    key: "C",
    progression: "",
  };
  const config: CliConfig = { format: "text" };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      continue;
    }
    switch (token) {
      case "--progression": {
        request.progression = ensureValue(args, ++i, token);
        break;
      }
      case "--key": {
        request.key = ensureValue(args, ++i, token);
        break;
      }
      case "--tempo": {
        const value = Number.parseInt(ensureValue(args, ++i, token), 10);
        if (!Number.isFinite(value)) {
          throw new Error("El tempo debe ser un número entero");
        }
        request.tempo_bpm = value;
        break;
      }
      case "--swing": {
        request.swing = true;
        break;
      }
      case "--no-swing": {
        request.swing = false;
        break;
      }
      case "--contour": {
        const value = Number.parseFloat(ensureValue(args, ++i, token));
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error("El slider de contorno debe estar entre 0 y 1");
        }
        request.contour_slider = value;
        break;
      }
      case "--seed": {
        const value = Number.parseInt(ensureValue(args, ++i, token), 10);
        if (!Number.isFinite(value)) {
          throw new Error("La seed debe ser un número entero");
        }
        request.seed = value;
        break;
      }
      case "--format": {
        const value = ensureValue(args, ++i, token);
        if (value !== "text" && value !== "json") {
          throw new Error("El formato debe ser text o json");
        }
        config.format = value;
        break;
      }
      default: {
        throw new Error(`Opción desconocida: ${token}`);
      }
    }
  }

  if (!request.progression) {
    throw new Error("Debes proporcionar --progression");
  }

  return { request, config };
}

function printTextResponse(response: GeneratorResponse): void {
  const lines: string[] = [];
  lines.push("# Bebop Targeting Preview");
  lines.push(`Progresión: ${response.meta.progression}`);
  lines.push(`Seed: ${response.meta.seed}`);
  if (response.meta.tempo_bpm) {
    lines.push(`Tempo: ${response.meta.tempo_bpm} BPM`);
  }
  if (typeof response.meta.swing === "boolean") {
    lines.push(`Swing: ${response.meta.swing ? "activo" : "recto"}`);
  }
  lines.push(`Compases estimados: ${response.meta.totalBars}`);
  lines.push("");
  lines.push(response.artifacts.text);
  console.log(lines.join("\n"));
}

function main(): void {
  try {
    const { request, config } = parseArguments(process.argv);
    const response = generateFromRequest(request);
    if (config.format === "json") {
      console.log(JSON.stringify(response, null, 2));
    } else {
      printTextResponse(response);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
