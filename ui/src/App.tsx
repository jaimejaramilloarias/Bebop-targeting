import { FormEvent, useMemo, useState } from 'react';

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

const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEFAULT_PROGRESSION = '| Dm9  G13 | C∆ |';

const SAMPLE_NOTES: NotePreview[] = [
  { t: 1, dur: 1, midi: 64, pitch: 'E4', src: 'target', chord: 'Dm9', degree: '3' },
  { t: 2, dur: 1, midi: 63, pitch: 'Eb4', src: 'approach', chord: 'G13' },
  { t: 5, dur: 1, midi: 66, pitch: 'F#4', src: 'approach', chord: 'G13' },
  { t: 7, dur: 1, midi: 67, pitch: 'G4', src: 'target', chord: 'G13', degree: '1' },
  { t: 9, dur: 1, midi: 71, pitch: 'B4', src: 'approach', chord: 'Cmaj7' },
  { t: 11, dur: 1, midi: 72, pitch: 'C5', src: 'target', chord: 'Cmaj7', degree: '1' },
  { t: 12, dur: 2, midi: 69, pitch: 'A4', src: 'closure' }
];

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

function formatTimeline(notes: NotePreview[]): { label: string; value: string }[] {
  if (!notes.length) {
    return [];
  }

  const totalEighths = notes.reduce((max, note) => Math.max(max, note.t + note.dur), 0);
  const totalBars = Math.ceil(totalEighths / 8);

  return [
    { label: 'Corcheas totales', value: String(totalEighths) },
    { label: 'Compases estimados', value: `${totalBars} × 4/4` },
    {
      label: 'Último evento',
      value: `t=${notes[notes.length - 1].t} (${notes[notes.length - 1].src})`
    }
  ];
}

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
  const [status, setStatus] = useState<'idle' | 'previewed'>('idle');

  const bars = useMemo(() => parseProgressionForUi(form.progression), [form.progression]);
  const timeline = useMemo(() => formatTimeline(previewNotes), [previewNotes]);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPreviewNotes(SAMPLE_NOTES);
    setStatus('previewed');
  };

  const handleReset = () => {
    setForm({
      key: 'C',
      progression: DEFAULT_PROGRESSION,
      tempo: 160,
      swing: true,
      contour: 0.42,
      seed: '20240601'
    });
    setPreviewNotes([]);
    setStatus('idle');
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Bebop Targeting Studio</h1>
        <p className="header-subtitle">
          Diseña, visualiza y exporta líneas bebop con enfoque en <em>targeting</em>. Configura la
          progresión, controla el contorno melódico y visualiza una pre-escucha de la secuencia de
          notas antes de conectarla con el motor rítmico.
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
                <small className="muted">Activa shuffle y visualización ternaria</small>
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
              <button type="submit" className="primary">
                Previsualizar
              </button>
              <button type="button" className="secondary" onClick={handleReset}>
                Restablecer
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>Previsualización</h2>
          <div className="preview">
            <div className="preview-card">
              <h3>Progresión normalizada</h3>
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
              {status === 'idle' ? (
                <div className="preview-empty">
                  Completa los parámetros y pulsa «Previsualizar» para simular el scheduler.
                </div>
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
