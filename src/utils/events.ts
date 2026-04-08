type EventCallback = (...args: any[]) => void;

class GameEventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) cb(...args);
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
    const wrapped: EventCallback = (...args) => {
      this.off(event, wrapped);
      callback(...args);
    };
    this.on(event, wrapped);
  }
}

export const eventBus = new GameEventBus();
