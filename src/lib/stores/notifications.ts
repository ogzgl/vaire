import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let nextId = 0;

export const toasts = writable<Toast[]>([]);

export function showToast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = ++nextId;
  toasts.update(list => [...list, { id, type, message }]);

  setTimeout(() => {
    dismissToast(id);
  }, duration);

  return id;
}

export function dismissToast(id: number) {
  toasts.update(list => list.filter(t => t.id !== id));
}
