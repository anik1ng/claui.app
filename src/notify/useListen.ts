import { useEffect, useRef } from 'react';
import { listen, type EventCallback } from '@tauri-apps/api/event';

/** Subscribe to a Tauri event for the component's lifetime. The handler is read
 *  through a ref, so it always sees the latest closure without re-subscribing. */
export function useListen<T>(event: string, handler: EventCallback<T>): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const unlisten = listen<T>(event, (e) => ref.current(e));
    return () => { void unlisten.then((fn) => fn()); };
  }, [event]);
}
