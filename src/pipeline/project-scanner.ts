// =============================================================================
// Project_Scanner — Recursively discovers and classifies all files in a React project
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type {
  FileCategory,
  ProjectMeta,
  ScannedFile,
  ScannedProject,
} from './pipeline-types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions we care about during scanning. */
const SCANNABLE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.ts', '.js',
  '.css', '.scss', '.less',
  '.json',
]);

/** Directory names that are always excluded. */
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '__tests__', '__mocks__',
]);

/** Regex patterns for files that should be excluded. */
const EXCLUDED_FILE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.stories\./,
];

/** Config file basenames we recognise. */
const CONFIG_BASENAMES = new Set([
  'package.json', 'tsconfig.json', '.babelrc',
]);

/** Config file prefix patterns (e.g. vite.config.ts, next.config.mjs). */
const CONFIG_PREFIX_PATTERNS = [
  /^vite\.config\./,
  /^next\.config\./,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a React project directory and return a fully classified `ScannedProject`.
 *
 * @throws {Error} if `sourceDir` does not exist or contains zero scannable files.
 */
export async function scanProject(sourceDir: string): Promise<ScannedProject> {
  const rootDir = resolve(sourceDir);

  // 1. Validate directory exists
  if (!existsSync(rootDir)) {
    throw new Error(
      `Source directory does not exist: "${rootDir}". Please provide a valid React project path.`,
    );
  }

  const stat = statSync(rootDir);
  if (!stat.isDirectory()) {
    throw new Error(
      `Source path is not a directory: "${rootDir}". Please provide a directory, not a file.`,
    );
  }

  // 2. Discover all files (recursive, with exclusions)
  const allFiles = discoverFiles(rootDir, rootDir);

  if (allFiles.length === 0) {
    throw new Error(
      `No scannable files found in "${rootDir}". Ensure the directory contains *.tsx, *.jsx, *.ts, *.js, *.css, *.scss, *.less, or *.json files.`,
    );
  }

  // 3. Classify each file
  const components: ScannedFile[] = [];
  const services: ScannedFile[] = [];
  const styles: ScannedFile[] = [];
  const configs: ScannedFile[] = [];
  const assets: ScannedFile[] = [];

  for (const file of allFiles) {
    const category = classifyFile(file.path, file.content, rootDir);
    const classified: ScannedFile = { ...file, category };

    switch (category) {
      case 'component': components.push(classified); break;
      case 'service':   services.push(classified);   break;
      case 'style':     styles.push(classified);     break;
      case 'config':    configs.push(classified);     break;
      case 'asset':     assets.push(classified);      break;
    }
  }

  // 4. Build dependency graph (component → child components)
  const dependencyGraph = buildDependencyGraph(components, rootDir);

  // 5. Detect project metadata
  const projectMeta = detectProjectMeta(rootDir, allFiles);

  return {
    rootDir,
    components,
    services,
    styles,
    configs,
    assets,
    dependencyGraph,
    projectMeta,
  };
}


// ---------------------------------------------------------------------------
// File Discovery (recursive)
// ---------------------------------------------------------------------------

interface RawFile {
  readonly path: string;
  readonly absolutePath: string;
  readonly content: string;
}

/**
 * Recursively walk `dir`, returning every file that passes the inclusion /
 * exclusion filters.  Paths are relative to `rootDir`.
 */
function discoverFiles(dir: string, rootDir: string): RawFile[] {
  const results: RawFile[] = [];
  let entries: string[];

  try {
    entries = readdirSync(dir);
  } catch {
    return results; // unreadable directory — skip silently
  }

  for (const entry of entries) {
    const absolutePath = join(dir, entry);
    let entryStat;

    try {
      entryStat = statSync(absolutePath);
    } catch {
      continue; // broken symlink or permission issue — skip
    }

    if (entryStat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) {
        results.push(...discoverFiles(absolutePath, rootDir));
      }
      continue;
    }

    if (!entryStat.isFile()) continue;

    // Check extension
    const ext = extname(entry).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    // Check excluded file patterns
    if (EXCLUDED_FILE_PATTERNS.some((re) => re.test(entry))) continue;

    const relPath = relative(rootDir, absolutePath);

    let content: string;
    try {
      content = readFileSync(absolutePath, 'utf-8');
    } catch {
      continue; // unreadable file — skip
    }

    results.push({ path: relPath, absolutePath, content });
  }

  return results;
}

// ---------------------------------------------------------------------------
// File Classification
// ---------------------------------------------------------------------------

/** Regex patterns that indicate a file contains JSX returns (component). */
const JSX_RETURN_PATTERNS = [
  /return\s*\(?\s*</,
  /=>\s*\(?\s*</,
  /export\s+default\s+function\b/,
];

/** Regex patterns that indicate a file contains HTTP/service calls. */
const SERVICE_PATTERNS = [
  /\bfetch\s*\(/,
  /\baxios\./,
  /\.get\s*\(/,
  /\.post\s*\(/,
];

/**
 * Classify a single file into one of the five categories.
 */
function classifyFile(
  relPath: string,
  content: string,
  _rootDir: string,
): FileCategory {
  const ext = extname(relPath).toLowerCase();
  const name = basename(relPath);
  const normalised = relPath.replace(/\\/g, '/');

  // --- Asset: files under public/ or static/ ---
  if (normalised.startsWith('public/') || normalised.startsWith('static/')) {
    return 'asset';
  }

  // --- Style ---
  if (ext === '.css' || ext === '.scss' || ext === '.less') {
    return 'style';
  }

  // --- Config ---
  if (CONFIG_BASENAMES.has(name)) {
    return 'config';
  }
  if (CONFIG_PREFIX_PATTERNS.some((re) => re.test(name))) {
    return 'config';
  }

  // --- Skip UI library primitives (shadcn/ui, radix, headless-ui) ---
  // These are replaced by PrimeNG, not migrated as components
  if (normalised.includes('components/ui/') || normalised.includes('components\\ui\\')) {
    return 'config'; // classify as config so they're skipped by component transformer
  }

  // --- Skip React entry points (main.tsx, index.tsx) ---
  if (name === 'main.tsx' || name === 'main.jsx' || name === 'index.tsx' || name === 'index.jsx') {
    if (content.includes('createRoot') || content.includes('ReactDOM') || content.includes('render(')) {
      return 'config'; // entry point, not a component
    }
  }

  // --- Component vs Service (for .tsx, .jsx, .ts, .js) ---
  if (ext === '.tsx' || ext === '.jsx') {
    // Skip class components that use React.Component (ErrorBoundary etc.)
    // These are Angular-specific patterns that don't translate well
    const isClassComponent = /class\s+\w+\s+extends\s+(React\.)?Component/.test(content);

    // ErrorBoundary class components → skip (Angular uses ErrorHandler)
    if (isClassComponent && /ErrorBoundary|getDerivedStateFromError|componentDidCatch/.test(content)) {
      return 'config'; // skip — Angular has its own error handling
    }

    // .tsx/.jsx files with JSX returns → component
    const hasJSX = JSX_RETURN_PATTERNS.some((re) => re.test(content));
    if (hasJSX && !isClassComponent) return 'component';

    // Class components with JSX → still component but mark for special handling
    if (hasJSX && isClassComponent) return 'component';

    // .tsx/.jsx without JSX returns but with HTTP calls → service
    const hasHTTP = SERVICE_PATTERNS.some((re) => re.test(content));
    if (hasHTTP) return 'service';

    // .tsx/.jsx with React.forwardRef → UI primitive, skip
    if (content.includes('React.forwardRef') || content.includes('forwardRef(')) {
      return 'config';
    }

    // Default for .tsx/.jsx → component (likely has JSX we didn't detect)
    return 'component';
  }

  if (ext === '.ts' || ext === '.js') {
    // Check for service patterns first (no JSX possible in .ts/.js)
    const hasHTTP = SERVICE_PATTERNS.some((re) => re.test(content));
    if (hasHTTP) return 'service';

    // Custom hooks → service
    if (/export\s+function\s+use[A-Z]/.test(content)) return 'service';

    // .ts/.js without HTTP calls — could be a utility, treat as service
    return 'service';
  }

  // Fallback for .json that isn't a known config
  if (ext === '.json') {
    return 'config';
  }

  return 'asset';
}


// ---------------------------------------------------------------------------
// Dependency Graph Construction
// ---------------------------------------------------------------------------

/**
 * Build a dependency graph mapping each component's relative path to the
 * relative paths of child components it imports.
 *
 * We parse `import` / `require` statements and resolve them against the set
 * of known component files.
 */
function buildDependencyGraph(
  components: readonly ScannedFile[],
  rootDir: string,
): ReadonlyMap<string, readonly string[]> {
  // Build a lookup: normalised relative path (no ext) → ScannedFile.path
  const componentPathSet = new Map<string, string>();
  for (const comp of components) {
    const norm = normaliseImportPath(comp.path);
    componentPathSet.set(norm, comp.path);
    // Also register with /index stripped
    if (norm.endsWith('/index')) {
      componentPathSet.set(norm.replace(/\/index$/, ''), comp.path);
    }
  }

  const graph = new Map<string, readonly string[]>();

  for (const comp of components) {
    const imports = extractImports(comp.content);
    const children: string[] = [];

    for (const imp of imports) {
      // Skip package imports (no leading . or /)
      if (!imp.startsWith('.') && !imp.startsWith('/')) continue;

      // Resolve relative to the component's directory
      const compDir = dirname(join(rootDir, comp.path));
      const resolved = resolve(compDir, imp);
      const relResolved = relative(rootDir, resolved).replace(/\\/g, '/');
      const normResolved = normaliseImportPath(relResolved);

      const match = componentPathSet.get(normResolved);
      if (match && match !== comp.path) {
        children.push(match);
      }
    }

    graph.set(comp.path, children);
  }

  return graph;
}

/**
 * Extract import specifier strings from source code.
 * Handles: `import ... from '...'`, `import '...'`, `require('...')`.
 */
function extractImports(source: string): string[] {
  const results: string[] = [];

  // ES import: import ... from 'specifier'  or  import 'specifier'
  const esImportRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = esImportRe.exec(source)) !== null) {
    results.push(m[1]);
  }

  // require('specifier')
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(source)) !== null) {
    results.push(m[1]);
  }

  return results;
}

/**
 * Strip extension and normalise path separators for import resolution.
 */
function normaliseImportPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/\.(tsx|jsx|ts|js)$/, '');
}

// ---------------------------------------------------------------------------
// Project Metadata Detection
// ---------------------------------------------------------------------------

/**
 * Detect project-level metadata: package manager, build tool, TypeScript
 * usage, router, UI libraries, state management, and source directory.
 */
function detectProjectMeta(
  rootDir: string,
  allFiles: readonly RawFile[],
): ProjectMeta {
  const packageManager = detectPackageManager(rootDir);
  const packageJson = readPackageJson(rootDir);
  const buildTool = detectBuildTool(rootDir, packageJson);
  const hasTypeScript = allFiles.some(
    (f) => f.path.endsWith('.ts') || f.path.endsWith('.tsx'),
  );

  const allDeps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  } as Record<string, string>;

  const hasRouter = 'react-router-dom' in allDeps || 'react-router' in allDeps;

  const uiLibraries = detectUILibraries(allDeps);
  const stateManagement = detectStateManagement(allDeps);
  const srcDir = detectSrcDir(rootDir);

  return {
    packageManager,
    buildTool,
    hasTypeScript,
    hasRouter,
    uiLibraries,
    stateManagement,
    srcDir,
  };
}

function detectPackageManager(rootDir: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rootDir, 'yarn.lock'))) return 'yarn';
  return 'npm'; // default / package-lock.json
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readPackageJson(rootDir: string): PackageJsonShape | null {
  const pkgPath = join(rootDir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJsonShape;
  } catch {
    return null;
  }
}

function detectBuildTool(
  rootDir: string,
  packageJson: PackageJsonShape | null,
): ProjectMeta['buildTool'] {
  if (!packageJson) return 'unknown';

  const deps = packageJson.dependencies ?? {};
  const devDeps = packageJson.devDependencies ?? {};
  const allDeps = { ...deps, ...devDeps };

  // Order matters — more specific checks first
  if ('next' in deps || configFileExists(rootDir, /^next\.config\./)) {
    return 'nextjs';
  }
  if ('@remix-run/react' in deps) {
    return 'remix';
  }
  if ('react-scripts' in deps || 'react-scripts' in devDeps) {
    return 'cra';
  }
  if ('vite' in allDeps || configFileExists(rootDir, /^vite\.config\./)) {
    return 'vite';
  }
  if ('webpack' in devDeps && !('react-scripts' in deps) && !('react-scripts' in devDeps)) {
    return 'webpack-custom';
  }

  return 'unknown';
}

function configFileExists(rootDir: string, pattern: RegExp): boolean {
  try {
    return readdirSync(rootDir).some((f) => pattern.test(f));
  } catch {
    return false;
  }
}

const UI_LIBRARY_MAP: Record<string, string> = {
  '@mui/material': 'MUI',
  '@material-ui/core': 'MUI',
  'antd': 'Ant Design',
  '@chakra-ui/react': 'Chakra UI',
  'react-bootstrap': 'React Bootstrap',
  '@headlessui/react': 'Headless UI',
  '@radix-ui/react-dialog': 'Radix UI',
};

function detectUILibraries(allDeps: Record<string, string>): readonly string[] {
  const found: string[] = [];
  for (const [pkg, label] of Object.entries(UI_LIBRARY_MAP)) {
    if (pkg in allDeps) found.push(label);
  }
  // Tailwind detection (may be in devDeps)
  if ('tailwindcss' in allDeps) found.push('Tailwind CSS');
  return found;
}

const STATE_MANAGEMENT_MAP: Record<string, string> = {
  'redux': 'Redux',
  '@reduxjs/toolkit': 'Redux Toolkit',
  'react-redux': 'React Redux',
  'zustand': 'Zustand',
  'jotai': 'Jotai',
  'recoil': 'Recoil',
  'mobx': 'MobX',
  'mobx-react': 'MobX',
  'mobx-react-lite': 'MobX',
};

function detectStateManagement(allDeps: Record<string, string>): readonly string[] {
  const found = new Set<string>();
  for (const [pkg, label] of Object.entries(STATE_MANAGEMENT_MAP)) {
    if (pkg in allDeps) found.add(label);
  }
  return [...found];
}

function detectSrcDir(rootDir: string): string {
  for (const candidate of ['src', 'app', 'pages']) {
    const candidatePath = join(rootDir, candidate);
    if (existsSync(candidatePath) && statSync(candidatePath).isDirectory()) {
      return candidate;
    }
  }
  return '.';
}
