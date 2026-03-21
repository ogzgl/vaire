import { writable } from 'svelte/store';

export interface DiffDialogState {
  isOpen: boolean;
  repoPath: string;
  filePath: string;
  fileName: string;
  staged: boolean;
}

export const diffDialogState = writable<DiffDialogState | null>(null);

export function openDiffDialog(repoPath: string, filePath: string, fileName: string, staged: boolean) {
  diffDialogState.set({ isOpen: true, repoPath, filePath, fileName, staged });
}

export function closeDiffDialog() {
  diffDialogState.set(null);
}
