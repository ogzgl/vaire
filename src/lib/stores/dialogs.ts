import { writable, derived } from 'svelte/store';

// Dialog stack manager — prevents Esc from exiting fullscreen when dialogs are open
const dialogStack = writable<string[]>([]);

export function pushDialog(id: string) {
  dialogStack.update(stack => {
    if (stack.includes(id)) return stack;
    return [...stack, id];
  });
}

export function popDialog(id?: string) {
  dialogStack.update(stack => {
    if (id) return stack.filter(d => d !== id);
    return stack.slice(0, -1);
  });
}

export const hasOpenDialogs = derived(dialogStack, $stack => $stack.length > 0);
export const topDialog = derived(dialogStack, $stack => $stack[$stack.length - 1] ?? null);

export { dialogStack };
