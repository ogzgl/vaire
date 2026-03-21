/**
 * Returns an SVG string for a given language/file type.
 * All SVGs are 16x16 viewBox.
 */
export function getFileIconSvg(lang: string | undefined, type?: string): string {
  if (type === 'folder') return folderIcon();
  if (type === 'repo') return repoIcon();

  switch (lang) {
    case 'kotlin':    return kotlinIcon();
    case 'java':      return javaIcon();
    case 'typescript':return tsIcon();
    case 'javascript':return jsIcon();
    case 'python':    return pythonIcon();
    case 'rust':      return rustIcon();
    case 'go':        return goIcon();
    case 'json':      return jsonIcon();
    case 'yaml':      return yamlIcon();
    case 'html':      return htmlIcon();
    case 'css':       return cssIcon();
    case 'scss':      return scssIcon();
    case 'markdown':  return markdownIcon();
    case 'dockerfile':return dockerIcon();
    case 'ignore':    return gitIgnoreIcon();
    case 'shell':     return shellIcon();
    case 'toml':
    case 'ini':
    case 'properties':
    case 'env':       return configIcon();
    case 'sql':       return sqlIcon();
    case 'svelte':    return svelteIcon();
    case 'xml':       return xmlIcon();
    case 'terraform': return terraformIcon();
    case 'gradle':    return gradleIcon();
    default:          return fileIcon();
  }
}

// ─── Icon implementations ───────────────────────────────────────────────────

function folderIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="#e8a020" opacity="0.85">
    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z"/>
  </svg>`;
}

function repoIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
    <path d="M6 9v6a3 3 0 0 0 3 3h3"/><path d="M18 15V9a3 3 0 0 0-3-3h-3"/>
  </svg>`;
}

function kotlinIcon(): string {
  // Purple K in a rounded square
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#7F52FF"/>
    <text x="2.5" y="11.5" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="white">K</text>
  </svg>`;
}

function javaIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#e76f00"/>
    <text x="2" y="11.5" font-family="system-ui, sans-serif" font-size="8.5" font-weight="700" fill="white">J</text>
  </svg>`;
}

function tsIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#3178c6"/>
    <text x="1" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">TS</text>
  </svg>`;
}

function jsIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#f7df1e"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="#333">JS</text>
  </svg>`;
}

function pythonIcon(): string {
  // Two-tone snake-style: blue top half, yellow bottom half
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="7.5" rx="2" fill="#3776ab"/>
    <rect y="7.5" width="15" height="7.5" rx="2" fill="#ffd343"/>
    <rect width="15" height="15" rx="3" fill="none" stroke="#3776ab" stroke-width="0.5"/>
    <text x="2.5" y="11" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" fill="#3776ab">Py</text>
  </svg>`;
}

function rustIcon(): string {
  // Orange gear-like R
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#dea584"/>
    <text x="2.5" y="11.5" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="#5c3a1e">R</text>
  </svg>`;
}

function goIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#00add8"/>
    <text x="1" y="11.5" font-family="system-ui, sans-serif" font-size="8" font-weight="700" fill="white">Go</text>
  </svg>`;
}

function jsonIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#f0db4f"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" fill="#333">{}</text>
  </svg>`;
}

function yamlIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#cb171e"/>
    <text x="2.5" y="11.5" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="white">Y</text>
  </svg>`;
}

function htmlIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#e34f26"/>
    <text x="1" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">&lt;/&gt;</text>
  </svg>`;
}

function cssIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#1572b6"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="8" font-weight="700" fill="white">CSS</text>
  </svg>`;
}

function scssIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#c6538c"/>
    <text x="1" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">SCSS</text>
  </svg>`;
}

function markdownIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#083fa1"/>
    <text x="2" y="11.5" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="white">M</text>
  </svg>`;
}

function dockerIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#2496ed"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">D🐳</text>
  </svg>`;
}

function gitIgnoreIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#f05033"/>
    <text x="1.5" y="11" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">.git</text>
  </svg>`;
}

function shellIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#4ec94e" opacity="0.9"/>
    <text x="2.5" y="11.5" font-family="monospace" font-size="9" font-weight="700" fill="#1a1a1a">$</text>
  </svg>`;
}

function configIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#7a7a8a"/>
    <text x="2" y="11.5" font-family="system-ui, sans-serif" font-size="9" font-weight="700" fill="white">⚙</text>
  </svg>`;
}

function sqlIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#336791"/>
    <text x="1" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">SQL</text>
  </svg>`;
}

function svelteIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#ff3e00"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" fill="white">Sv</text>
  </svg>`;
}

function xmlIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#e07b39"/>
    <text x="0.5" y="11.5" font-family="system-ui, sans-serif" font-size="7" font-weight="700" fill="white">XML</text>
  </svg>`;
}

function terraformIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#7b42bc"/>
    <text x="2" y="11.5" font-family="system-ui, sans-serif" font-size="8" font-weight="700" fill="white">TF</text>
  </svg>`;
}

function gradleIcon(): string {
  return `<svg width="15" height="15" viewBox="0 0 15 15">
    <rect width="15" height="15" rx="3" fill="#02303a"/>
    <text x="1.5" y="11.5" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" fill="#02af8e">G</text>
  </svg>`;
}

function fileIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>`;
}
