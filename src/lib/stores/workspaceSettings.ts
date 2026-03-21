import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { workspacePath } from './workspace';

export interface WorkspaceSettings {
  theme?: string;
  excludedPaths?: string[];
  runConfigs?: Array<{
    name: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
  }>;
  [key: string]: unknown;
}

export const workspaceSettings = writable<WorkspaceSettings>({});

export async function loadWorkspaceSettings(wsPath: string): Promise<void> {
  try {
    const raw = await invoke<string>('load_workspace_settings', { workspacePath: wsPath });
    const parsed: WorkspaceSettings = JSON.parse(raw || '{}');
    workspaceSettings.set(parsed);
  } catch (e) {
    console.error('Failed to load workspace settings:', e);
    workspaceSettings.set({});
  }
}

export async function saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
  const wsPath = get(workspacePath);
  if (!wsPath) return;
  try {
    const json = JSON.stringify(settings, null, 2);
    await invoke('save_workspace_settings', { workspacePath: wsPath, settings: json });
  } catch (e) {
    console.error('Failed to save workspace settings:', e);
  }
}

export async function updateWorkspaceSetting<K extends keyof WorkspaceSettings>(
  key: K,
  value: WorkspaceSettings[K],
): Promise<void> {
  workspaceSettings.update(s => {
    const updated = { ...s, [key]: value };
    saveWorkspaceSettings(updated);
    return updated;
  });
}
