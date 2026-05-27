interface TauriInternalsMock {
  invoke: (cmd: string, args?: unknown, options?: unknown) => unknown;
  transformCallback: () => number;
  unregisterCallback: () => undefined;
  convertFileSrc: (filePath: string) => string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__: TauriInternalsMock;
  }
}

export {};
