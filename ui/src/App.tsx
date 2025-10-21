import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type NotePreview = {
  t: number;
  dur: number;
  midi: number;
  pitch: string;
  src: 'approach' | 'target' | 'isolated' | 'closure';
  chord?: string;
  degree?: string;
};

type FormState = {
  key: string;
  progression: string;
  tempo: number;
  swing: boolean;
  contour: number;
  seed: string;
};

type UnknownChordIssue = {
  chordSymbol: string;
  index: number;
  message: string;
};

type GeneratorMeta = {
  progression: string;
  totalEighths: number;
  totalBars: number;
  tempo_bpm?: number;
  swing?: boolean;
  swingRatio: number | null;
  seed: number;
};

type ApiResponse = {
  notes: NotePreview[];
  meta: GeneratorMeta;
  artifacts: {
    text: string;
    midiBase64: string;
    musicXml: string;
  };
};

type ApiError = {
  message: string;
  issues?: UnknownChordIssue[];
};

const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEFAULT_PROGRESSION = '| Dm9  G13 | C∆ |';
const API_ENDPOINT = '/api/generate';

type TimelineEntry = {
  label: string;
  value: string;
};

type DownloadUrls = {
  midi: string;
  musicXml: string;
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

function parseSeed(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function requestPreview(payload: SchedulerRequestPayload): Promise<ApiResponse> {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({ message: 'Error desconocido' }));
    throw error;
  }

  return (await response.json()) as ApiResponse;
}

type SchedulerRequestPayload = {
  key: string;
  progression: string;
  tempo_bpm?: number;
  swing?: boolean;
  contour_slider?: number;
  seed?: number;
};

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
  const [artifacts, setArtifacts] = useState<ApiResponse['artifacts'] | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<DownloadUrls | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'previewed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unknownChords, setUnknownChords] = useState<UnknownChordIssue[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioSupported = useMemo(isAudioSupported, []);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeNodesRef = useRef<{ oscillator: OscillatorNode; gain: GainNode }[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const bars = useMemo(() => parseProgressionForUi(form.progression), [form.progression]);
  const timeline = useMemo(() => computeTimeline(meta, previewNotes), [meta, previewNotes]);

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
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    stopPlayback();
    audioContextRef.current?.close().catch(() => null);
  }, [stopPlayback]);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
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
      const payload: SchedulerRequestPayload = {
        key: form.key,
        progression: form.progression,
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

      try {
        const response = await requestPreview(payload);
        setPreviewNotes(response.notes);
        setMeta(response.meta);
        setArtifacts(response.artifacts);
        if (typeof nextSeed === 'string') {
          setForm((current) => ({ ...current, seed: nextSeed }));
        }
        setStatus('previewed');
      } catch (error) {
        const apiError = error as ApiError;
        setErrorMessage(apiError.message ?? 'No se pudo generar la previsualización');
        setUnknownChords(apiError.issues ?? []);
        setStatus('error');
      }
    },
    [stopPlayback]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setArtifacts(null);
    setErrorMessage(null);
    setUnknownChords([]);
    setStatus('idle');
  };

  const handleRegenerate = async () => {
    if (isLoading || status !== 'previewed') {
      return;
    }
    const newSeed = Math.floor(Math.random() * 1_000_000_000);
    const payload = buildPayload(newSeed);
    await generatePreview(payload, String(newSeed));
  };

  const isLoading = status === 'loading';

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
              <button type="submit" className="primary" disabled={isLoading}>
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
                </div>
              ) : null}
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
