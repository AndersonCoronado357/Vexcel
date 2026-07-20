import { Injectable, signal } from '@angular/core';

export type ToastType = 'ok' | 'err' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  msg: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(type: ToastType, title: string, msg = ''): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, type, title, msg }]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 3200);
  }
}
