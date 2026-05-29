import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";

type FolderDropHandlers = {
  onEnter: () => void;
  onLeave: () => void;
  onDrop: (path: string) => void;
};

export function useFolderDrop({ onEnter, onLeave, onDrop }: FolderDropHandlers) {
  useEffect(() => {
    let disposed = false;
    let unlistenDragDrop: (() => void) | undefined;

    try {
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "enter") {
            onEnter();
            return;
          }

          if (event.payload.type === "leave") {
            onLeave();
            return;
          }

          if (event.payload.type === "drop") {
            onLeave();
            const [path] = event.payload.paths;
            if (path) {
              onDrop(path);
            }
          }
        })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          unlistenDragDrop = unlisten;
        });
    } catch {
      return undefined;
    }

    return () => {
      disposed = true;
      if (!window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener) {
        return;
      }
      void Promise.resolve(unlistenDragDrop?.()).catch(() => undefined);
    };
  }, [onEnter, onLeave, onDrop]);
}
