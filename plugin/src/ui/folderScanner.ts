/**
 * folderScanner.ts — Reads a folder from <input webkitdirectory>,
 * filters out non-component files, and returns a structured manifest.
 *
 * Runs entirely client-side — zero API calls.
 */

export type FileCategory = 'tokens' | 'component' | 'skip';

export interface ScannedFile {
  path: string;      // relative path from folder root, e.g. "components/ui/Button.tsx"
  name: string;      // basename, e.g. "Button.tsx"
  size: number;      // bytes
  content: string;   // full file text (read synchronously via FileReader)
}

export interface ScanResult {
  folderName: string;
  totalFiles: number;           // all files seen in the folder
  skipped: number;              // filtered out (test, dist, etc.)
  tokenFiles: ScannedFile[];    // tailwind.config, theme.ts, tokens.json, etc.
  componentFiles: ScannedFile[];// .tsx/.jsx files that look like components
  styleFiles: ScannedFile[];    // .scss/.css/.less co-located style files
}

// ---------------------------------------------------------------------------
// Filter rules
// ---------------------------------------------------------------------------

/** Directory segments that should be ignored entirely. */
const BLOCKED_DIRS = new Set([
  'node_modules', 'dist', '.next', 'build', 'out', 'coverage',
  '.storybook', '__mocks__', '__tests__', 'e2e', 'cypress', '.cache',
  'public', 'assets', 'static', 'images', 'icons', 'fonts',
  'migrations', 'supabase', '.git', '.github',
]);

/** File extensions we care about. */
const COMPONENT_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js']);

/** Style file extensions — collected separately, merged into component content. */
const STYLE_EXTENSIONS = new Set(['.scss', '.css', '.less', '.sass']);

/** Filenames/patterns that are NOT components even if they are .tsx. */
const SKIP_PATTERNS = [
  /\.test\./i,
  /\.spec\./i,
  /\.stories\./i,
  /\.d\.ts$/i,
  /^index\./i,
  /^vite\.config/i,
  /^jest\.config/i,
  /^next\.config/i,
  /^postcss\.config/i,
  /^eslint/i,
  /^prettier/i,
  /^\.env/i,
];

/** Filenames that are design-token sources. */
const TOKEN_PATTERNS = [
  /^tailwind\.config\./i,
  /^theme\.(ts|js|json)$/i,
  /tokens?\.(ts|js|json|css)$/i,
  /\.tokens\.(ts|js|json)$/i,
  /^design-?tokens?\./i,
  /^colors?\.(ts|js|json)$/i,
  /^typography\.(ts|js|json)$/i,
  /^spacing\.(ts|js|json)$/i,
];

/** Max bytes to read per file — skip anything larger (generated files, etc.) */
const MAX_FILE_SIZE = 150_000; // 150 KB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ext(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function isBlockedDir(path: string): boolean {
  const segments = path.replace(/\\/g, '/').split('/');
  // Check all segments except the last (which is the filename)
  return segments.slice(0, -1).some((seg) => BLOCKED_DIRS.has(seg.toLowerCase()));
}

function isTokenFile(filename: string): boolean {
  return TOKEN_PATTERNS.some((p) => p.test(filename));
}

function isSkippedFile(filename: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(filename));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function getRelativePath(file: File, folderName: string): string {
  // webkitRelativePath = "FolderName/src/components/Button.tsx"
  const rel = (file as File & { webkitRelativePath: string }).webkitRelativePath;
  if (rel) {
    // Strip the top-level folder name prefix
    const slash = rel.indexOf('/');
    return slash >= 0 ? rel.slice(slash + 1) : rel;
  }
  return file.name;
}

// ---------------------------------------------------------------------------
// File System Access API path (showDirectoryPicker)
// ---------------------------------------------------------------------------

/**
 * Recursively walks a FileSystemDirectoryHandle and collects qualifying files.
 * Uses the modern File System Access API — works in Figma desktop + Chrome/Edge.
 */
async function walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  pathPrefix: string,
  tokenFiles: ScannedFile[],
  componentFiles: ScannedFile[],
  styleFiles: ScannedFile[],
  skippedRef: { count: number },
): Promise<void> {
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === 'directory') {
      if (BLOCKED_DIRS.has(name.toLowerCase())) {
        skippedRef.count++;
        continue;
      }
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        pathPrefix ? `${pathPrefix}/${name}` : name,
        tokenFiles,
        componentFiles,
        styleFiles,
        skippedRef,
      );
    } else if (handle.kind === 'file') {
      const filePath = pathPrefix ? `${pathPrefix}/${name}` : name;

      if (isBlockedDir(filePath)) {
        skippedRef.count++;
        continue;
      }

      const file: File = await (handle as FileSystemFileHandle).getFile();

      if (file.size > MAX_FILE_SIZE) {
        skippedRef.count++;
        continue;
      }

      if (isTokenFile(name)) {
        const content = await readFileAsText(file);
        tokenFiles.push({ path: filePath, name, size: file.size, content });
        continue;
      }

      if (STYLE_EXTENSIONS.has(ext(name))) {
        const content = await readFileAsText(file);
        styleFiles.push({ path: filePath, name, size: file.size, content });
        continue;
      }

      if (!COMPONENT_EXTENSIONS.has(ext(name))) {
        skippedRef.count++;
        continue;
      }

      if (isSkippedFile(name)) {
        skippedRef.count++;
        continue;
      }

      const content = await readFileAsText(file);
      componentFiles.push({ path: filePath, name, size: file.size, content });
    }
  }
}

/**
 * Reads all entries from a FileSystemDirectoryReader, handling the
 * "max 100 per readEntries call" limitation by looping until empty.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const results: FileSystemEntry[] = [];
    function read() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(results);
        } else {
          results.push(...entries);
          read(); // read until empty
        }
      }, reject);
    }
    read();
  });
}

function entryAsFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Recursive walk using the FileSystemEntry drag-and-drop API. */
async function walkEntry(
  entry: FileSystemEntry,
  pathPrefix: string,
  tokenFiles: ScannedFile[],
  componentFiles: ScannedFile[],
  styleFiles: ScannedFile[],
  skippedRef: { count: number },
): Promise<void> {
  if (entry.isDirectory) {
    const dirName = entry.name;
    if (BLOCKED_DIRS.has(dirName.toLowerCase())) {
      skippedRef.count++;
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    const dirPath = pathPrefix ? `${pathPrefix}/${dirName}` : dirName;
    for (const child of children) {
      await walkEntry(child, dirPath, tokenFiles, componentFiles, styleFiles, skippedRef);
    }
  } else if (entry.isFile) {
    const name = entry.name;
    const filePath = pathPrefix ? `${pathPrefix}/${name}` : name;

    if (isBlockedDir(filePath)) { skippedRef.count++; return; }

    const file = await entryAsFile(entry as FileSystemFileEntry);

    if (file.size > MAX_FILE_SIZE) { skippedRef.count++; return; }

    if (isTokenFile(name)) {
      const content = await readFileAsText(file);
      tokenFiles.push({ path: filePath, name, size: file.size, content });
      return;
    }

    if (STYLE_EXTENSIONS.has(ext(name))) {
      const content = await readFileAsText(file);
      styleFiles.push({ path: filePath, name, size: file.size, content });
      return;
    }
    if (!COMPONENT_EXTENSIONS.has(ext(name))) { skippedRef.count++; return; }
    if (isSkippedFile(name)) { skippedRef.count++; return; }

    const content = await readFileAsText(file);
    componentFiles.push({ path: filePath, name, size: file.size, content });
  }
}

/**
 * Scans a folder from a drag-and-drop DataTransfer event.
 * Uses the FileSystemEntry API — works in Figma's sandboxed iframe.
 */
export async function scanFolderFromDrop(dataTransfer: DataTransfer): Promise<ScanResult> {
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < dataTransfer.items.length; i++) {
    const entry = dataTransfer.items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) {
    throw new Error('No folder was dropped. Drag and drop a project folder here.');
  }

  // Determine root folder name
  const rootEntry = entries[0];
  const folderName = rootEntry.isDirectory ? rootEntry.name : 'folder';

  const tokenFiles: ScannedFile[] = [];
  const componentFiles: ScannedFile[] = [];
  const styleFiles: ScannedFile[] = [];
  const skippedRef = { count: 0 };

  for (const entry of entries) {
    if (entry.isDirectory) {
      // Walk children directly so the root folder name is not included in paths
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await readAllEntries(reader);
      for (const child of children) {
        await walkEntry(child, '', tokenFiles, componentFiles, styleFiles, skippedRef);
      }
    } else {
      await walkEntry(entry, '', tokenFiles, componentFiles, styleFiles, skippedRef);
    }
  }

  tokenFiles.sort((a, b) => a.path.localeCompare(b.path));
  componentFiles.sort((a, b) => a.path.localeCompare(b.path));
  styleFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    folderName,
    totalFiles: tokenFiles.length + componentFiles.length + styleFiles.length + skippedRef.count,
    skipped: skippedRef.count,
    tokenFiles,
    componentFiles,
    styleFiles,
  };
}

/**
 * Opens a native directory picker via the File System Access API and scans it.
 * Throws 'CANCELLED' if user cancels, 'FALLBACK' if API is unavailable.
 */
export async function pickAndScanFolder(): Promise<ScanResult> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('FALLBACK');
  }

  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
  } catch (e: any) {
    // User cancelled (AbortError)
    throw new Error('CANCELLED');
  }

  const folderName = dirHandle.name;
  const tokenFiles: ScannedFile[] = [];
  const componentFiles: ScannedFile[] = [];
  const styleFiles: ScannedFile[] = [];
  const skippedRef = { count: 0 };

  await walkDirectory(dirHandle, '', tokenFiles, componentFiles, styleFiles, skippedRef);

  tokenFiles.sort((a, b) => a.path.localeCompare(b.path));
  componentFiles.sort((a, b) => a.path.localeCompare(b.path));
  styleFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    folderName,
    totalFiles: tokenFiles.length + componentFiles.length + styleFiles.length + skippedRef.count,
    skipped: skippedRef.count,
    tokenFiles,
    componentFiles,
    styleFiles,
  };
}

// ---------------------------------------------------------------------------
// FileList fallback (webkitdirectory input)
// ---------------------------------------------------------------------------

/** Max bytes to read per file — skip anything larger (generated files, etc.) */
// NOTE: MAX_FILE_SIZE is already declared above; this section just documents the fallback.

/**
 * Scans a FileList from <input webkitdirectory> and returns a structured
 * manifest of token files and component files. Reads all content client-side.
 */
export async function scanFolder(fileList: FileList): Promise<ScanResult> {
  if (fileList.length === 0) {
    throw new Error('No files selected. Open the dialog, navigate inside your src folder, press Ctrl+A, then click Open.');
  }

  const firstFile = fileList[0] as File & { webkitRelativePath: string };
  // webkitRelativePath is only populated when webkitdirectory is set.
  // Without it, fall back to a generic folder name.
  const rootFolder = firstFile.webkitRelativePath?.split('/')[0] || 'project';

  const tokenFiles: ScannedFile[] = [];
  const componentFiles: ScannedFile[] = [];
  const styleFiles: ScannedFile[] = [];
  let skipped = 0;

  const reads: Array<() => Promise<void>> = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const relativePath = getRelativePath(file, rootFolder);
    const filename = file.name;

    // Skip blocked directories
    if (isBlockedDir(relativePath)) {
      skipped++;
      continue;
    }

    // Skip oversized files (likely generated)
    if (file.size > MAX_FILE_SIZE) {
      skipped++;
      continue;
    }

    // Token files (check before extension filter)
    if (isTokenFile(filename)) {
      reads.push(async () => {
        const content = await readFileAsText(file);
        tokenFiles.push({ path: relativePath, name: filename, size: file.size, content });
      });
      continue;
    }

    // Style files — collect separately, will be merged into component content later
    if (STYLE_EXTENSIONS.has(ext(filename))) {
      reads.push(async () => {
        const content = await readFileAsText(file);
        styleFiles.push({ path: relativePath, name: filename, size: file.size, content });
      });
      continue;
    }

    // Extension filter
    if (!COMPONENT_EXTENSIONS.has(ext(filename))) {
      skipped++;
      continue;
    }

    // Skip test/stories/config files
    if (isSkippedFile(filename)) {
      skipped++;
      continue;
    }

    reads.push(async () => {
      const content = await readFileAsText(file);
      componentFiles.push({ path: relativePath, name: filename, size: file.size, content });
    });
  }

  // Read all files concurrently (browser handles this fine for local files)
  await Promise.all(reads.map((fn) => fn()));

  // Sort by path for consistent ordering
  tokenFiles.sort((a, b) => a.path.localeCompare(b.path));
  componentFiles.sort((a, b) => a.path.localeCompare(b.path));
  styleFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    folderName: rootFolder,
    totalFiles: fileList.length,
    skipped,
    tokenFiles,
    componentFiles,
    styleFiles,
  };
}
