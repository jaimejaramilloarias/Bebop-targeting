export {};

declare global {
  interface MIDIOutput {
    id: string;
    name?: string;
    manufacturer?: string;
    state: 'connected' | 'disconnected' | 'pending';
    send(data: number[] | Uint8Array, timestamp?: number): void;
    close?: () => Promise<void>;
  }

  interface MIDIConnectionEvent extends Event {
    port?: MIDIOutput;
  }

  interface MIDIOutputMap {
    forEach(callback: (output: MIDIOutput) => void, thisArg?: unknown): void;
    values(): Iterable<MIDIOutput>;
  }

  interface MIDIAccess {
    outputs: MIDIOutputMap;
    onstatechange: ((event: MIDIConnectionEvent) => void) | null;
  }

  interface Navigator {
    requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
  }
}
