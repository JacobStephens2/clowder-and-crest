type EventCallback = (detail?: any) => void;

class GameEventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  emit(event: string, detail?: any): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) cb(detail);
    }
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  once(event: string, callback: EventCallback): void {
    const wrapped: EventCallback = (detail) => {
      this.off(event, wrapped);
      callback(detail);
    };
    this.on(event, wrapped);
  }
}

export const eventBus = new GameEventBus();
