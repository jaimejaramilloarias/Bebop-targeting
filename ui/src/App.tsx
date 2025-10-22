import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateFromRequest,
  generateMidiStream,
  type GeneratorMeta,
  type GeneratorResponse,
  type SchedulerRequest,
} from '../../src/api.ts';
import { UnknownChordError, type UnknownChordIssue } from '../../src/validation.ts';
import type { StructuredBar as EngineStructuredBar, StructuredData as EngineStructuredData } from '../../src/structure.ts';
import type { ChordWindow } from '../../src/parser.ts';

type NotePreview = GeneratorResponse['notes'][number];

type FormState = {
  key: string;
  progression: string;
  tempo: number;
  swing: boolean;
  contour: number;
  seed: string;
};

type ApiResponse = GeneratorResponse;

type ApiError = {
  message: string;
  issues?: UnknownChordIssue[];
};

const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEFAULT_PROGRESSION = '';
const PROGRESSION_PLACEHOLDER = '| Dm7  G7 | Cmaj7 |';

type TimelineEntry = {
  label: string;
  value: string;
};

type DownloadUrls = {
  midi: string;
  musicXml: string;
};

type StructuredChordWindow = ChordWindow;
type StructuredBar = EngineStructuredBar;
type StructuredData = EngineStructuredData;

type MidiOutputInfo = {
  id: string;
  label: string;
  port: MIDIOutput;
};

function normalizeSymbol(raw: string): string {
  return raw
    .replace(/∆/g, 'maj7')
    .replace(/ø/g, 'ø')
    .replace(/º7/g, 'dim7')
    .replace(/º/g, 'dim')
    .replace(/\+/g, '#5')
    .replace(/\(([#b])5\)/g, '$15')
    .replace(/\s+/g, ' ')
    .trim();
}

type ProgressionBar = {
  bar: number;
  chords: string[];
};

function parseProgressionForUi(input: string): ProgressionBar[] {
  const bars = input
    .split('|')
    .map((bar) => bar.trim())
    .filter(Boolean);

  return bars.map((bar, index) => {
    const chords = bar
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => normalizeSymbol(token));
    return { bar: index + 1, chords };
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

interface WebAudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function isAudioSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const audioWindow = window as WebAudioWindow;
  return Boolean(window.AudioContext || audioWindow.webkitAudioContext);
}

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const audioWindow = window as WebAudioWindow;
  const Ctor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  return new Ctor();
}

function isWebMidiSupported(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return typeof navigator.requestMIDIAccess === 'function';
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function eighthToSeconds(eighth: number, tempoBpm: number, swingRatio: number | null): number {
  const tempo = tempoBpm > 0 ? tempoBpm : 160;
  const quarter = 60 / tempo;
  const beatIndex = Math.floor(eighth / 2);
  const position = eighth % 2;
  if (position === 0) {
    return beatIndex * quarter;
  }
  if (swingRatio === null) {
    return beatIndex * quarter + quarter / 2;
  }
  const ratio = clamp(swingRatio, 0, 1);
  return beatIndex * quarter + quarter * ratio;
}

type PlaybackEvent = {
  start: number;
  end: number;
  midi: number;
};

function computePlaybackSchedule(notes: NotePreview[], tempoBpm: number, swingRatio: number | null): PlaybackEvent[] {
  if (!notes.length) {
    return [];
  }
  const schedule = notes.map((note) => {
    const start = eighthToSeconds(note.t, tempoBpm, swingRatio);
    const end = eighthToSeconds(note.t + note.dur, tempoBpm, swingRatio);
    const safeEnd = end > start ? end : start + 0.12;
    return { start, end: safeEnd, midi: note.midi };
  });
  return schedule.sort((a, b) => a.start - b.start);
}

function computeTimeline(meta: GeneratorMeta | null, notes: NotePreview[]): TimelineEntry[] {
  if (!meta || !notes.length) {
    return [];
  }

  const entries: TimelineEntry[] = [
    { label: 'Corcheas totales', value: String(meta.totalEighths) },
    { label: 'Compases estimados', value: `${meta.totalBars} × 4/4` },
    { label: 'Seed', value: String(meta.seed) }
  ];

  if (meta.tempo_bpm) {
    entries.push({ label: 'Tempo', value: `${meta.tempo_bpm} BPM` });
  }

  if (typeof meta.swing === 'boolean') {
    entries.push({ label: 'Swing', value: meta.swing ? 'Activado' : 'Recto' });
  }

  const lastNote = notes[notes.length - 1];
  entries.push({ label: 'Último evento', value: `t=${lastNote.t} (${lastNote.src})` });

  return entries;
}

const NOTE_COLORS: Record<NotePreview['src'], string> = {
  approach: '#f59e0b',
  target: '#2563eb',
  isolated: '#10b981',
  closure: '#ec4899',
};

const SCORE_CONFIG = {
  width: 320,
  height: 140,
  paddingX: 32,
  paddingY: 24,
  minMidi: 60,
  maxMidi: 84,
};

function ScorePreview({ structured }: { structured: StructuredData | null }) {
  if (!structured || !structured.bars.length) {
    return <div className="preview-empty">Genera una línea para ver la partitura.</div>;
  }

  const { width, height, paddingX, paddingY, minMidi, maxMidi } = SCORE_CONFIG;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const staffSpacing = usableHeight / 4;

  const midiToY = (midi: number) => {
    const clampedValue = clamp(midi, minMidi, maxMidi);
    const ratio = (clampedValue - minMidi) / (maxMidi - minMidi || 1);
    return height - paddingY - ratio * usableHeight;
  };

  return (
    <div className="score-grid">
      {structured.bars.map((bar) => (
        <div key={bar.index} className="score-bar">
          <div className="score-bar-header">
            <span className="score-bar-index">Compás {bar.index + 1}</span>
          </div>
          <svg
            className="score-canvas"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Compás ${bar.index + 1}`}
          >
            {[0, 1, 2, 3, 4].map((line) => {
              const y = paddingY + staffSpacing * line;
              return (
                <line
                  key={line}
                  x1={paddingX - 12}
                  y1={y}
                  x2={width - paddingX + 12}
                  y2={y}
                  className="score-staff-line"
                />
              );
            })}
            {Array.from({ length: bar.lengthEighths + 1 }, (_, index) => {
              const ratio = index / bar.lengthEighths;
              const x = paddingX + ratio * usableWidth;
              return (
                <line
                  key={`grid-${index}`}
                  x1={x}
                  y1={paddingY}
                  x2={x}
                  y2={height - paddingY}
                  className={`score-grid-line${index % 2 === 0 ? ' strong' : ''}`}
                />
              );
            })}
            {bar.chordWindows.map((window) => {
              const startRatio = (window.startEighth - bar.startEighth) / bar.lengthEighths;
              const endRatio =
                (window.startEighth + window.lengthEighths - bar.startEighth) / bar.lengthEighths;
              const x = paddingX + ((startRatio + endRatio) / 2) * usableWidth;
              return (
                <text
                  key={`${window.chordSymbol}-${window.startEighth}`}
                  x={x}
                  y={18}
                  className="score-chord-label"
                >
                  {window.chordSymbol}
                </text>
              );
            })}
            {bar.notes.map((note, index) => {
              const ratio = (note.t - bar.startEighth) / bar.lengthEighths;
              const x = paddingX + ratio * usableWidth;
              const y = midiToY(note.midi);
              const color = NOTE_COLORS[note.src];
              const radius = note.src === 'target' ? 7.5 : note.src === 'closure' ? 7 : 6;
              return (
                <g key={`${note.t}-${note.midi}-${index}`} className="score-note" transform={`translate(${x}, ${y})`}>
                  <circle r={radius + 1.5} className="score-note-outline" />
                  <circle r={radius} fill={color} />
                </g>
              );
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}

function parseSeed(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function requestPreview(payload: SchedulerRequestPayload): Promise<ApiResponse> {
  try {
    return await Promise.resolve(generateFromRequest(payload));
  } catch (error) {
    throw normalizeApiError(error);
  }
}

function normalizeApiError(error: unknown): ApiError {
  if (error instanceof UnknownChordError) {
    return { message: error.message, issues: error.issues };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

type SchedulerRequestPayload = SchedulerRequest;

export default function App() {
  const [form, setForm] = useState<FormState>({
    key: 'C',
    progression: DEFAULT_PROGRESSION,
    tempo: 160,
    swing: true,
    contour: 0.42,
    seed: '20240601'
  });
  const [previewNotes, setPreviewNotes] = useState<NotePreview[]>([]);
  const [meta, setMeta] = useState<GeneratorMeta | null>(null);
  const [structured, setStructured] = useState<StructuredData | null>(null);
  const [artifacts, setArtifacts] = useState<ApiResponse['artifacts'] | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<DownloadUrls | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'previewed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unknownChords, setUnknownChords] = useState<UnknownChordIssue[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioSupported = useMemo(isAudioSupported, []);
  const webMidiSupported = useMemo(isWebMidiSupported, []);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeNodesRef = useRef<{ oscillator: OscillatorNode; gain: GainNode }[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiOutputRef = useRef<MIDIOutput | null>(null);
  const lastPayloadRef = useRef<SchedulerRequestPayload | null>(null);
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiOutputs, setMidiOutputs] = useState<MidiOutputInfo[]>([]);
  const [selectedMidiOutput, setSelectedMidiOutput] = useState<string | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);

  const bars = useMemo(() => parseProgressionForUi(form.progression), [form.progression]);
  const timeline = useMemo(() => computeTimeline(meta, previewNotes), [meta, previewNotes]);

  const refreshMidiOutputs = useCallback((access: MIDIAccess) => {
    const outputs: MidiOutputInfo[] = [];
    access.outputs.forEach((port) => {
      outputs.push({
        id: port.id,
        label: port.name ?? port.id,
        port,
      });
    });
    setMidiOutputs(outputs);
    setSelectedMidiOutput((current) => {
      if (current && outputs.some((output) => output.id === current)) {
        return current;
      }
      return outputs[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    setDownloadUrls((current) => {
      if (current) {
        URL.revokeObjectURL(current.midi);
        URL.revokeObjectURL(current.musicXml);
      }
      return null;
    });
    if (!artifacts) {
      return;
    }
    const midiUrl = URL.createObjectURL(base64ToBlob(artifacts.midiBase64, 'audio/midi'));
    const musicXmlUrl = URL.createObjectURL(new Blob([artifacts.musicXml], { type: 'application/xml' }));
    setDownloadUrls({ midi: midiUrl, musicXml: musicXmlUrl });
    return () => {
      URL.revokeObjectURL(midiUrl);
      URL.revokeObjectURL(musicXmlUrl);
    };
  }, [artifacts]);

  const handleEnableMidi = useCallback(async () => {
    if (!webMidiSupported || midiEnabled) {
      return;
    }
    try {
      setMidiError(null);
      const access = await navigator.requestMIDIAccess?.({ sysex: false });
      if (!access) {
        setMidiError('No se pudo inicializar WebMIDI.');
        return;
      }
      midiAccessRef.current = access;
      refreshMidiOutputs(access);
      access.onstatechange = () => refreshMidiOutputs(access);
      setMidiEnabled(true);
    } catch (error) {
      console.error('No se pudo habilitar WebMIDI', error);
      setMidiError('El navegador bloqueó el acceso a WebMIDI.');
    }
  }, [webMidiSupported, midiEnabled, refreshMidiOutputs]);

  const handleRefreshMidiPorts = useCallback(() => {
    if (midiAccessRef.current) {
      refreshMidiOutputs(midiAccessRef.current);
    }
  }, [refreshMidiOutputs]);

  useEffect(() => {
    return () => {
      if (midiAccessRef.current) {
        midiAccessRef.current.onstatechange = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!midiEnabled) {
      midiOutputRef.current = null;
      return;
    }
    const next = midiOutputs.find((output) => output.id === selectedMidiOutput) ?? null;
    midiOutputRef.current = next?.port ?? null;
  }, [midiEnabled, midiOutputs, selectedMidiOutput]);

  const stopPlayback = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const context = audioContextRef.current;
    activeNodesRef.current.forEach(({ oscillator, gain }) => {
      try {
        const now = context ? context.currentTime : 0;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, 0.01);
        oscillator.stop(now + 0.03);
      } catch (error) {
        console.warn('No se pudo detener un oscilador', error);
      }
    });
    activeNodesRef.current = [];
    const midiPort = midiOutputRef.current;
    if (midiPort) {
      try {
        midiPort.send([0xb0, 0x7b, 0x00]);
      } catch (error) {
        console.warn('No se pudo enviar All Notes Off al puerto MIDI', error);
      }
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    stopPlayback();
    audioContextRef.current?.close().catch(() => null);
  }, [stopPlayback]);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === 'progression' && status === 'error') {
      setStatus('idle');
      setErrorMessage(null);
      setUnknownChords([]);
    }
  };

  const playbackTempo = meta?.tempo_bpm ?? (form.tempo > 0 ? form.tempo : 160);
  const playbackSwingRatio = meta?.swingRatio ?? (meta?.swing ? 2 / 3 : null);
  const playbackSchedule = useMemo(
    () => computePlaybackSchedule(previewNotes, playbackTempo, playbackSwingRatio),
    [previewNotes, playbackTempo, playbackSwingRatio]
  );

  useEffect(() => {
    stopPlayback();
  }, [previewNotes, meta, stopPlayback]);

  const startPlayback = useCallback(async () => {
    if (!audioSupported || !playbackSchedule.length) {
      return;
    }
    stopPlayback();
    let context = audioContextRef.current;
    if (!context) {
      context = createAudioContext();
      audioContextRef.current = context;
    }
    if (!context) {
      return;
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    const now = context.currentTime + 0.05;
    activeNodesRef.current = playbackSchedule.map((event) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = midiToFrequency(event.midi);
      const attack = 0.01;
      const release = 0.12;
      const sustain = Math.max(0, event.end - event.start - release);
      gain.gain.setValueAtTime(0, now + event.start);
      gain.gain.linearRampToValueAtTime(0.18, now + event.start + attack);
      gain.gain.setValueAtTime(0.18, now + event.start + attack + sustain);
      gain.gain.linearRampToValueAtTime(0.0001, now + event.start + Math.max(sustain, 0) + release);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(now + event.start);
      oscillator.stop(now + event.end + 0.25);
      return { oscillator, gain };
    });
    const midiPort = midiOutputRef.current;
    if (midiPort) {
      const timingBase = typeof window !== 'undefined' && window.performance ? window.performance.now() : Date.now();
      playbackSchedule.forEach((event) => {
        const startTimestamp = timingBase + (event.start + 0.05) * 1000;
        const endTimestamp = timingBase + (event.end + 0.05) * 1000;
        try {
          midiPort.send([0x90, event.midi & 0x7f, 0x64], startTimestamp);
          midiPort.send([0x80, event.midi & 0x7f, 0x40], endTimestamp);
        } catch (error) {
          console.warn('No se pudo enviar evento MIDI', error);
        }
      });
    }
    if (activeNodesRef.current.length) {
      const totalDuration = playbackSchedule[playbackSchedule.length - 1].end;
      stopTimerRef.current = window.setTimeout(() => {
        stopPlayback();
      }, (totalDuration + 0.5) * 1000);
      setIsPlaying(true);
    }
  }, [audioSupported, playbackSchedule, stopPlayback]);

  const buildPayload = useCallback(
    (seedOverride?: number): SchedulerRequestPayload => {
      const trimmedProgression = form.progression.trim();
      const payload: SchedulerRequestPayload = {
        key: form.key,
        progression: trimmedProgression,
        swing: form.swing,
        contour_slider: form.contour
      };
      if (form.tempo > 0) {
        payload.tempo_bpm = form.tempo;
      }
      const seed = seedOverride ?? parseSeed(form.seed);
      if (seed !== undefined) {
        payload.seed = seed;
      }
      return payload;
    },
    [form]
  );

  const generatePreview = useCallback(
    async (payload: SchedulerRequestPayload, nextSeed?: string) => {
      stopPlayback();
      setStatus('loading');
      setErrorMessage(null);
      setUnknownChords([]);
      setPreviewNotes([]);
      setMeta(null);
      setArtifacts(null);
      setStructured(null);

      try {
        const response = await requestPreview(payload);
        setPreviewNotes(response.notes);
        setMeta(response.meta);
        setArtifacts(response.artifacts);
        setStructured(response.structured ?? null);
        lastPayloadRef.current = payload;
        if (typeof nextSeed === 'string') {
          setForm((current) => ({ ...current, seed: nextSeed }));
        }
        setStatus('previewed');
      } catch (error) {
        const apiError = normalizeApiError(error);
        setErrorMessage(apiError.message ?? 'No se pudo generar la previsualización');
        setUnknownChords(apiError.issues ?? []);
        setStructured(null);
        setStatus('error');
      }
    },
    [stopPlayback]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedProgression = form.progression.trim();
    if (!trimmedProgression) {
      setStatus('error');
      setErrorMessage('Introduce un cifrado para generar aproximaciones.');
      setUnknownChords([]);
      setPreviewNotes([]);
      setMeta(null);
      setArtifacts(null);
      setStructured(null);
      return;
    }
    const payload = buildPayload();
    await generatePreview(payload);
  };

  const handleReset = () => {
    stopPlayback();
    setForm({
      key: 'C',
      progression: DEFAULT_PROGRESSION,
      tempo: 160,
      swing: true,
      contour: 0.42,
      seed: '20240601'
    });
    setPreviewNotes([]);
    setMeta(null);
    setStructured(null);
    setArtifacts(null);
    setErrorMessage(null);
    setUnknownChords([]);
    setStatus('idle');
    lastPayloadRef.current = null;
  };

  const handleRegenerate = async () => {
    if (isLoading || status !== 'previewed') {
      return;
    }
    const newSeed = Math.floor(Math.random() * 1_000_000_000);
    const payload = buildPayload(newSeed);
    await generatePreview(payload, String(newSeed));
  };

  const handleDownloadMidiStream = useCallback(() => {
    if (!lastPayloadRef.current) {
      return;
    }
    try {
      const response = generateMidiStream(lastPayloadRef.current);
      const blob = new Blob([response.midiBinary], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bebop-targeting-stream.mid';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo descargar el MIDI en streaming', error);
      const payload = normalizeApiError(error);
      setErrorMessage(payload.message ?? 'No se pudo descargar el MIDI en streaming.');
    }
  }, []);

  const isLoading = status === 'loading';
  const hasProgression = Boolean(form.progression.trim());

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Bebop Targeting Studio</h1>
        <p className="header-subtitle">
          Diseña, visualiza y exporta líneas bebop con enfoque en <em>targeting</em>. Configura la
          progresión, controla el contorno melódico y genera previsualizaciones reproducibles.
        </p>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Parámetros de generación</h2>
          <form onSubmit={handleSubmit} className="field-group">
            <div className="field">
              <div className="label-row">
                <span>Tonalidad global</span>
                <small className="muted">Para transponer targets y fórmulas</small>
              </div>
              <select
                value={form.key}
                onChange={(event) => handleChange('key', event.target.value)}
                aria-label="Seleccionar tonalidad global"
              >
                {KEY_OPTIONS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <div className="label-row">
                <span>Progresión armónica</span>
                <small className="muted">Soporta hasta dos acordes por compás</small>
              </div>
              <textarea
                value={form.progression}
                onChange={(event) => handleChange('progression', event.target.value)}
                spellCheck={false}
                aria-label="Introducir progresión armónica"
                placeholder={`Introduce un cifrado, por ejemplo ${PROGRESSION_PLACEHOLDER}`}
              />
            </div>

            <div className="field">
              <div className="label-row">
                <span>Tempo objetivo</span>
                <small className="muted">BPM para la exportación</small>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                value={form.tempo}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^0-9]/g, '');
                  handleChange('tempo', value ? Number(value) : 0);
                }}
                aria-label="Tempo en BPM"
              />
            </div>

            <div className="field">
              <div className="label-row">
                <span>Swing</span>
                <small className="muted">Activa shuffle y exportación ternaria</small>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className={`secondary${form.swing ? '' : ' muted'}`}
                  onClick={() => handleChange('swing', true)}
                  aria-pressed={form.swing}
                >
                  Activado
                </button>
                <button
                  type="button"
                  className={`secondary${form.swing ? ' muted' : ''}`}
                  onClick={() => handleChange('swing', false)}
                  aria-pressed={!form.swing}
                >
                  Recto
                </button>
              </div>
            </div>

            <div className="field">
              <div className="label-row">
                <span>Contorno estructural</span>
                <small className="muted">Controla el rango C4–C6</small>
              </div>
              <div className="slider">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.contour}
                  onChange={(event) => handleChange('contour', Number(event.target.value))}
                  aria-label="Ajustar contorno estructural"
                />
                <div className="slider-value">{form.contour.toFixed(2)}</div>
              </div>
            </div>

            <div className="field">
              <div className="label-row">
                <span>Seed opcional</span>
                <small className="muted">Para reproducibilidad</small>
              </div>
              <input
                type="text"
                value={form.seed}
                onChange={(event) => handleChange('seed', event.target.value)}
                aria-label="Seed para el generador aleatorio"
              />
            </div>

            <div className="actions">
              <button type="submit" className="primary" disabled={isLoading || !hasProgression}>
                {isLoading ? 'Generando…' : 'Previsualizar'}
              </button>
              <button type="button" className="secondary" onClick={handleReset} disabled={isLoading}>
                Restablecer
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleRegenerate}
                disabled={isLoading || status !== 'previewed'}
              >
                Regenerar variación
              </button>
            </div>

            {status === 'error' && errorMessage ? (
              <div className="alert error" role="alert">
                <strong>Ups:</strong> {errorMessage}
                {unknownChords.length ? (
                  <ul>
                    {unknownChords.map((issue) => (
                      <li key={`${issue.index}-${issue.chordSymbol}`}>
                        Compás {issue.index + 1}: {issue.chordSymbol}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>

        <section className="panel">
          <h2>Previsualización</h2>
          <div className="preview">
            <div className="preview-card">
              <div className="preview-card-header">
                <h3>Progresión normalizada</h3>
                {status === 'previewed' ? <span className="status-chip">Actualizado</span> : null}
              </div>
              {bars.length ? (
                <div className="preview-grid">
                  {bars.map((bar) => (
                    <div key={bar.bar} className="badge">
                      <strong>Compás {bar.bar}</strong>
                      <span>{bar.chords.join(' • ') || '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="preview-empty">Introduce una progresión válida.</div>
              )}
            </div>

            <div className="preview-card">
              <h3>Targets y aproximaciones</h3>
              {playbackSchedule.length ? (
                <div className="playback-controls">
                  {audioSupported ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={isPlaying ? stopPlayback : startPlayback}
                    >
                      {isPlaying ? 'Detener audio' : 'Reproducir audio'}
                    </button>
                  ) : (
                    <span className="playback-meta muted">Audio no soportado en este navegador.</span>
                  )}
                  <span className="playback-meta">
                    Tempo {Math.round(playbackTempo)} BPM
                    {playbackSwingRatio !== null ? ` · Swing ${(playbackSwingRatio * 100).toFixed(0)}%` : ' · Recto'}
                  </span>
                  {webMidiSupported ? (
                    <div className="midi-controls">
                      <button
                        type="button"
                        className="secondary"
                        onClick={midiEnabled ? handleRefreshMidiPorts : handleEnableMidi}
                      >
                        {midiEnabled ? 'Actualizar puertos MIDI' : 'Conectar WebMIDI'}
                      </button>
                      {midiEnabled ? (
                        midiOutputs.length ? (
                          <select
                            value={selectedMidiOutput ?? ''}
                            onChange={(event) => setSelectedMidiOutput(event.target.value || null)}
                            aria-label="Seleccionar salida MIDI"
                          >
                            {midiOutputs.map((output) => (
                              <option key={output.id} value={output.id}>
                                {output.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="playback-meta muted">Sin salidas MIDI disponibles.</span>
                        )
                      ) : null}
                    </div>
                  ) : (
                    <span className="playback-meta muted">WebMIDI no soportado.</span>
                  )}
                </div>
              ) : null}
              {midiError ? <div className="alert error">{midiError}</div> : null}
              {status === 'idle' ? (
                <div className="preview-empty">
                  Completa los parámetros y pulsa «Previsualizar» para simular el scheduler.
                </div>
              ) : isLoading ? (
                <div className="preview-empty loading">Calculando scheduler…</div>
              ) : previewNotes.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>t</th>
                      <th>dur</th>
                      <th>nota</th>
                      <th>rol</th>
                      <th>acorde</th>
                      <th>grado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewNotes.map((note, index) => (
                      <tr key={`${note.t}-${index}`}>
                        <td>{note.t}</td>
                        <td>{note.dur}</td>
                        <td>
                          {note.pitch} <span className="muted">({note.midi})</span>
                        </td>
                        <td>{note.src}</td>
                        <td>{note.chord ?? '—'}</td>
                        <td>{note.degree ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="preview-empty">Aún no hay notas generadas.</div>
              )}
            </div>

            <div className="preview-card">
              <h3>Vista de partitura / tablatura</h3>
              <ScorePreview structured={structured} />
            </div>

            {meta && artifacts ? (
              <div className="preview-card">
                <h3>Exportadores</h3>
                <div className="downloads">
                  <a
                    className="primary"
                    href={downloadUrls?.midi}
                    download="bebop-targeting.mid"
                    aria-disabled={!downloadUrls}
                  >
                    Descargar MIDI
                  </a>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleDownloadMidiStream}
                    disabled={!lastPayloadRef.current}
                  >
                    Descargar MIDI (stream)
                  </button>
                  <a
                    className="secondary"
                    href={downloadUrls?.musicXml}
                    download="bebop-targeting.musicxml"
                    aria-disabled={!downloadUrls}
                  >
                    Descargar MusicXML
                  </a>
                </div>
                <details>
                  <summary>Mostrar texto exportado</summary>
                  <pre className="text-preview">{artifacts.text}</pre>
                </details>
              </div>
            ) : null}

            {timeline.length ? (
              <div className="preview-card">
                <h3>Resumen temporal</h3>
                <div className="preview-grid">
                  {timeline.map((item) => (
                    <div key={item.label} className="badge">
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
