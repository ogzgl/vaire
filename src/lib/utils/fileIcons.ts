/**
 * Returns an <img> tag pointing to material-icon-theme SVGs in /icons/.
 * Falls back to inline SVG for types without a material icon.
 */

const iconMap: Record<string, string> = {
  // Languages
  kotlin: 'kotlin',
  java: 'java',
  typescript: 'typescript',
  javascript: 'javascript',
  python: 'python',
  rust: 'rust',
  go: 'go',
  ruby: 'ruby',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  json: 'json',
  yaml: 'yaml',
  html: 'html',
  css: 'css',
  scss: 'sass',
  markdown: 'markdown',
  dockerfile: 'docker',
  shell: 'file',
  toml: 'toml',
  sql: 'sql',
  svelte: 'svelte',
  vue: 'vue',
  xml: 'xml',
  terraform: 'terraform',
  gradle: 'gradle',
  graphql: 'graphql',
  csv: 'file',
  ini: 'settings',
  properties: 'settings',
  env: 'file',
  ignore: 'git',
};

// Filename-based icon mapping
const filenameMap: Record<string, string> = {
  'package.json': 'json',
  'tsconfig.json': 'typescript',
  'dockerfile': 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  'makefile': 'file',
  'gnumakefile': 'file',
  'license': 'license',
  'licence': 'license',
  'readme.md': 'readme',
  'readme': 'readme',
  '.env': 'file',
  'cargo.toml': 'rust',
  'go.mod': 'go',
  'go.sum': 'go',
};

function materialImg(iconName: string, size: number = 15): string {
  return `<img src="/icons/${iconName}.svg" width="${size}" height="${size}" alt="" style="display:block" />`;
}

export function getFileIconSvg(lang: string | undefined, type?: string, filename?: string): string {
  if (type === 'folder') return materialImg('folder');
  if (type === 'folder-open') return materialImg('folder-open');
  if (type === 'repo') return materialImg('git', 14);

  // Filename-based matching
  if (filename) {
    const lower = filename.toLowerCase();

    // Check exact filename matches
    for (const [pattern, icon] of Object.entries(filenameMap)) {
      if (lower === pattern || lower.startsWith(pattern + '.')) {
        return materialImg(icon);
      }
    }

    // Extension-based for special files
    if (lower.endsWith('.svelte')) return materialImg('svelte');
    if (lower.endsWith('.vue')) return materialImg('vue');
    if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) return materialImg('react');

    // Image files
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg'];
    const ext = lower.split('.').pop() || '';
    if (imageExts.includes(ext)) return materialImg('image');
  }

  // Language-based mapping
  if (lang && iconMap[lang]) {
    return materialImg(iconMap[lang]);
  }

  return materialImg('file');
}
