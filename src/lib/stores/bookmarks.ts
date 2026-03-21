import { writable, derived } from 'svelte/store';

export interface Bookmark {
  id: string; // `${filePath}:${line}`
  filePath: string;
  line: number;
  label?: string; // optional display label (file name)
}

export const bookmarks = writable<Bookmark[]>([]);

export function toggleBookmark(filePath: string, line: number, label?: string) {
  bookmarks.update(bm => {
    const id = `${filePath}:${line}`;
    const existingIdx = bm.findIndex(b => b.id === id);
    if (existingIdx >= 0) {
      // Remove bookmark
      return bm.filter((_, i) => i !== existingIdx);
    } else {
      // Add bookmark
      return [...bm, { id, filePath, line, label }];
    }
  });
}

export function removeBookmark(filePath: string, line: number) {
  const id = `${filePath}:${line}`;
  bookmarks.update(bm => bm.filter(b => b.id !== id));
}

export function hasBookmark(bookmarkList: Bookmark[], filePath: string, line: number): boolean {
  const id = `${filePath}:${line}`;
  return bookmarkList.some(b => b.id === id);
}

export function getNextBookmark(bookmarkList: Bookmark[], currentFilePath: string, currentLine: number): Bookmark | null {
  if (bookmarkList.length === 0) return null;

  // Find bookmarks in the same file after current line
  const sameFileAfter = bookmarkList.filter(
    b => b.filePath === currentFilePath && b.line > currentLine
  );
  if (sameFileAfter.length > 0) {
    return sameFileAfter.sort((a, b) => a.line - b.line)[0];
  }

  // Find bookmarks in other files or wrap around
  const sorted = bookmarkList.slice().sort((a, b) =>
    a.filePath.localeCompare(b.filePath) || a.line - b.line
  );

  // Try finding any bookmark that comes "after" in document order
  const afterCurrent = sorted.filter(
    b => b.filePath > currentFilePath ||
    (b.filePath === currentFilePath && b.line > currentLine)
  );

  if (afterCurrent.length > 0) return afterCurrent[0];
  // Wrap around to first bookmark
  return sorted[0];
}
