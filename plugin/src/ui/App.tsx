import { useState, useEffect, useRef, useCallback } from 'react';
import PlanView from './PlanView';
import { scanFolder } from './folderScanner';
import {
  CATEGORY_ORDER,
  estimateTokensK,
} from './planStore';
import type { ConversionPlan, PlanStep, StepStatus, StepResult, ComponentCategory } from './planStore';
import type { ScannedFile, ScanResult } from './folderScanner';
import type { ClassifiedFile } from '../claude';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status =
  | { kind: 'idle' }
  | { kind: 'progress'; message: string }
  | { kind: 'success'; componentName: string; stylesCreated: number; warnings: string[] }
  | { kind: 'batch-progress'; index: number; total: number; componentName: string }
  | { kind: 'batch-done'; results: BatchResultSummary[] }
  | { kind: 'error'; message: string };

interface BatchResultSummary {
  componentName: string;
  ok: boolean;
  error?: string;
  stylesCreated: number;
  warnings: string[];
}

// Messages sent TO the plugin main thread (code.ts)
type OutboundMessage =
  | { type: 'convert'; code: string; apiKey: string; tailwindConfig?: string }
  | { type: 'convert-batch'; codes: string[]; apiKey: string; tailwindConfig?: string }
  | { type: 'classify-files'; paths: string[]; apiKey: string }
  | { type: 'load-api-key' }
  | { type: 'save-api-key'; apiKey: string }
  | { type: 'save-plan'; plan: unknown }
  | { type: 'restore-plan' }
  | { type: 'close' };

// Messages received FROM the plugin main thread
type InboundMessage =
  | { type: 'progress'; message: string }
  | { type: 'success'; componentName: string; stylesCreated: number; warnings: string[] }
  | { type: 'batch-progress'; index: number; total: number; componentName: string }
  | { type: 'batch-done'; results: BatchResultSummary[] }
  | { type: 'classify-result'; files: ClassifiedFile[] }
  | { type: 'classify-error'; message: string }
  | { type: 'plan-step-done'; stepId: string; results: StepResult[] }
  | { type: 'plan-restored'; plan: ConversionPlan | null }
  | { type: 'api-key-loaded'; apiKey: string }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SEPARATOR = '// ---';

const PLACEHOLDER_SINGLE = `// Paste your React / JSX / Tailwind component here
// Example:
export function Button({ label }: { label: string }) {
  return (
    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm">
      {label}
    </button>
  );
}`;

const PLACEHOLDER_BATCH = `// Paste multiple components separated by: // ---
export function Button({ label }) {
  return <button className="px-4 py-2 bg-blue-600 text-white rounded">{label}</button>;
}

// ---

export function Badge({ text }) {
  return <span className="px-2 py-0.5 bg-gray-100 text-xs rounded-full">{text}</span>;
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postToPlugin(msg: OutboundMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

/** Split batch input by the separator line, filtering empty chunks. */
function splitBatchInput(input: string): string[] {
  return input
    .split(BATCH_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeySaved, setApiKeySaved] = useState<boolean>(false);
  const [componentCode, setComponentCode] = useState<string>('');
  const [tailwindConfig, setTailwindConfig] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const isLoading = status.kind === 'progress' || status.kind === 'batch-progress';
  const apiKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Folder scan state
  const [plan, setPlan] = useState<ConversionPlan | null>(null);
  const [scanPhase, setScanPhase] = useState<'idle' | 'scanning' | 'classifying'>('idle');
  const [scanError, setScanError] = useState<string>('');
  const scannedFilesRef = useRef<ScanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set webkitdirectory + accept on file input after mount.
  // webkitdirectory opens a folder-picker dialog and returns ALL files recursively.
  useEffect(() => {
    const el = fileInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('mozdirectory', '');
    el.setAttribute('accept', '.tsx,.jsx,.ts,.js,.json,.css');
  }, []);

  // Load API key AND restore saved plan on mount
  useEffect(() => {
    postToPlugin({ type: 'load-api-key' });
    postToPlugin({ type: 'restore-plan' });
  }, []);

  // Persist the plan to clientStorage whenever it changes
  useEffect(() => {
    postToPlugin({ type: 'save-plan', plan: plan ?? null });
  }, [plan]);

  // Persist API key to figma.clientStorage (debounced)
  useEffect(() => {
    if (apiKeyTimerRef.current) clearTimeout(apiKeyTimerRef.current);
    apiKeyTimerRef.current = setTimeout(() => {
      if (apiKey.trim()) {
        postToPlugin({ type: 'save-api-key', apiKey: apiKey.trim() });
        setApiKeySaved(true);
      }
    }, 600);
    return () => {
      if (apiKeyTimerRef.current) clearTimeout(apiKeyTimerRef.current);
    };
  }, [apiKey]);

  // â”€â”€ Listen for messages from code.ts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage as InboundMessage | undefined;
      if (!msg) return;

      switch (msg.type) {
        case 'api-key-loaded':
          setApiKey(msg.apiKey || '');
          setApiKeySaved(!!msg.apiKey);
          break;
        case 'plan-restored':
          if (msg.plan) setPlan(msg.plan);
          break;
        case 'progress':
          setStatus({ kind: 'progress', message: msg.message });
          break;
        case 'success':
          setStatus({
            kind: 'success',
            componentName: msg.componentName,
            stylesCreated: msg.stylesCreated ?? 0,
            warnings: msg.warnings ?? [],
          });
          break;
        case 'batch-progress':
          setStatus({
            kind: 'batch-progress',
            index: msg.index,
            total: msg.total,
            componentName: msg.componentName,
          });
          break;
        case 'batch-done':
          setStatus({ kind: 'batch-done', results: msg.results });
          break;
        case 'classify-result':
          handleClassifyResult(msg.files);
          break;
        case 'classify-error':
          setScanError(`Classification failed: ${msg.message}`);
          setScanPhase('idle');
          break;
        case 'plan-step-done':
          handleStepUpdate(
            msg.stepId,
            msg.results.every((r) => r.ok) ? 'done' : 'error',
            msg.results
          );
          break;
        case 'error':
          setStatus({ kind: 'error', message: msg.message });
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // -- File input handler (plain multi-select) ----------------------------
  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setScanError('');
    setScanPhase('scanning');
    try {
      const scanResult = await scanFolder(fileList);
      await processScanResult(scanResult);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setScanPhase('idle');
    }
    // Reset input so the same selection can be re-used if needed
    e.target.value = '';
  }

  async function processScanResult(scanResult: ScanResult) {
    scannedFilesRef.current = scanResult;
    if (scanResult.componentFiles.length === 0 && scanResult.tokenFiles.length === 0) {
      setScanError(
        `No component or token files found (${scanResult.totalFiles} files scanned, ` +
        `${scanResult.skipped} filtered). Make sure the folder contains .tsx / .jsx files.`
      );
      setScanPhase('idle');
      return;
    }
    setScanPhase('classifying');
    const allPaths = [
      ...scanResult.tokenFiles.map((f) => f.path),
      ...scanResult.componentFiles.map((f) => f.path),
    ];
    postToPlugin({ type: 'classify-files', paths: allPaths, apiKey: apiKey.trim() });
  }

  // -- Build plan from classify result -------------------------------------
  function handleClassifyResult(classified: ClassifiedFile[]) {
    const scanResult = scannedFilesRef.current;
    if (!scanResult) return;

    const allFiles: ScannedFile[] = [...scanResult.tokenFiles, ...scanResult.componentFiles];
    const fileByPath = new Map(allFiles.map((f) => [f.path, f]));

    // Build a lookup: "dir/basename" → style ScannedFile (for .scss/.css co-location)
    // e.g. "components/ui/button.module.scss" keyed as "components/ui/button"
    function styleKey(path: string): string {
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash >= 0 ? path.slice(0, lastSlash).toLowerCase() : '';
      const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      const base = filename.replace(/(\.(module))?\.(scss|css|less|sass)$/i, '').toLowerCase();
      return dir ? `${dir}/${base}` : base;
    }
    function componentKey(path: string): string {
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash >= 0 ? path.slice(0, lastSlash).toLowerCase() : '';
      const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      const base = filename.replace(/\.(tsx|jsx|ts|js)$/i, '').toLowerCase();
      return dir ? `${dir}/${base}` : base;
    }
    const styleMap = new Map<string, ScannedFile>();
    for (const sf of (scanResult.styleFiles ?? [])) {
      styleMap.set(styleKey(sf.path), sf);
    }

    const groups = new Map<ComponentCategory, ScannedFile[]>();
    for (const cf of classified) {
      if (cf.category === 'skip') continue;
      const scanned = fileByPath.get(cf.path);
      if (!scanned) continue;
      const arr = groups.get(cf.category as ComponentCategory) ?? [];
      arr.push(scanned);
      groups.set(cf.category as ComponentCategory, arr);
    }

    // One step per file — each converts independently for accuracy
    const steps: PlanStep[] = [];
    for (const cat of CATEGORY_ORDER) {
      const files = groups.get(cat);
      if (!files) continue;
      for (const file of files) {
        // Merge co-located style file content so Claude sees both in one pass
        const matchingStyle = styleMap.get(componentKey(file.path));
        const mergedContent = matchingStyle
          ? `/* === ${matchingStyle.name} ===\n${matchingStyle.content}\n=== end ${matchingStyle.name} === */\n\n${file.content}`
          : file.content;
        const mergedFile: ScannedFile = matchingStyle ? { ...file, content: mergedContent } : file;

        steps.push({
          id: `step-${cat}-${file.path}`,
          label: file.name,
          category: cat,
          files: [mergedFile],
          estimatedRuns: 1,
          estimatedTokensK: estimateTokensK(cat, 1),
          status: 'pending' as const,
          results: [],
          attachedStyle: matchingStyle?.name,
        });
      }
    }

    const tailwindFile = scanResult.tokenFiles.find((f) =>
      /tailwind\.config/i.test(f.name)
    );

    const newPlan: ConversionPlan = {
      id: `plan-${Date.now()}`,
      createdAt: new Date().toISOString(),
      folderName: scanResult.folderName,
      totalScanned: scanResult.totalFiles,
      totalSkipped: scanResult.skipped,
      steps,
      tailwindConfig: tailwindFile?.content,
    };
    setPlan(newPlan);
    setScanPhase('idle');
  }

  // -- Step status update (called by PlanView + classify-result handler) ----
  function handleStepUpdate(stepId: string, stepStatus: StepStatus, results?: StepResult[]) {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === stepId
            ? { ...s, status: stepStatus, results: results ?? s.results }
            : s
        ),
      };
    });
  }

  // â”€â”€ Convert handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleConvert = useCallback(() => {
    const trimmedKey = apiKey.trim();
    const trimmedConfig = tailwindConfig.trim() || undefined;

    if (!trimmedKey) {
      setStatus({ kind: 'error', message: 'Please enter your Anthropic API key first.' });
      return;
    }

    if (batchMode) {
      const codes = splitBatchInput(componentCode);
      if (codes.length === 0) {
        setStatus({ kind: 'error', message: 'No components found. Separate components with: // ---' });
        return;
      }
      setStatus({ kind: 'batch-progress', index: 0, total: codes.length, componentName: '...' });
      postToPlugin({ type: 'convert-batch', codes, apiKey: trimmedKey, tailwindConfig: trimmedConfig });
    } else {
      const trimmedCode = componentCode.trim();
      if (!trimmedCode) {
        setStatus({ kind: 'error', message: 'Please paste a component before converting.' });
        return;
      }
      setStatus({ kind: 'progress', message: 'Starting conversion...' });
      postToPlugin({ type: 'convert', code: trimmedCode, apiKey: trimmedKey, tailwindConfig: trimmedConfig });
    }
  }, [componentCode, apiKey, tailwindConfig, batchMode]);

  // â”€â”€ Keyboard shortcut: Cmd/Ctrl + Enter to convert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isLoading) {
        handleConvert();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleConvert, isLoading]);

  // â”€â”€ Batch result helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const batchOk = status.kind === 'batch-done' ? status.results.filter((r) => r.ok).length : 0;
  const batchFail = status.kind === 'batch-done' ? status.results.filter((r) => !r.ok).length : 0;

  // -- Render ----------------------------------------------------------------

  // Show plan view when a plan has been built from folder scan
  if (plan) {
    return (
      <PlanView
        plan={plan}
        apiKey={apiKey.trim()}
        onReset={() => {
          setPlan(null);
          scannedFilesRef.current = null;
          setStatus({ kind: 'idle' });
          setScanPhase('idle');
        }}
        onStepUpdate={handleStepUpdate}
      />
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <span className="header-logo">✨</span>
        <span className="header-title">Code to Figma</span>
        <span className="header-badge">Phase 2</span>
      </div>

      {/* File picker — plain multi-file input, the only thing that works in Figma sandbox */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      {/* Folder scan */}
      <div className="scan-box">
        <button
          className="scan-folder-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanPhase !== 'idle' || isLoading}
        >
          {scanPhase === 'scanning'
            ? <><span className="spinner spinner--small" />Scanning files...</>
            : scanPhase === 'classifying'
            ? <><span className="spinner spinner--small" />Classifying with Claude...</>
            : <>📂 Select Component Files</>}
        </button>
        <p className="scan-hint">
          In the file dialog: navigate <strong>inside</strong> your src folder, press <kbd>Ctrl+A</kbd> to select all, then click <strong>Open</strong>.
        </p>
        {scanError && <div className="scan-error">{scanError}</div>}
      </div>

      {/* API Key */}
      <div>
        <div className="section-label">Anthropic API Key</div>
        <div className="key-row">
          <input
            className="key-input"
            type="password"
            placeholder="sk-ant-api03-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setApiKeySaved(false);
            }}
            spellCheck={false}
            autoComplete="off"
          />
          {apiKeySaved && <span className="key-saved-pill">âœ“ Saved</span>}
        </div>
      </div>

      {/* Batch mode toggle */}
      <div className="batch-toggle-row">
        <label className="batch-toggle-label">
          <input
            type="checkbox"
            checked={batchMode}
            onChange={(e) => {
              setBatchMode(e.target.checked);
              setStatus({ kind: 'idle' });
              setComponentCode('');
            }}
            style={{ marginRight: 6 }}
          />
          Batch mode
        </label>
        {batchMode && (
          <span className="batch-hint">Separate components with <code>{BATCH_SEPARATOR}</code></span>
        )}
      </div>

      {/* Component code */}
      <div className="code-area">
        <div className="section-label">
          {batchMode ? 'Component Code (multiple)' : 'Component Code'}
        </div>
        <textarea
          className="code-textarea"
          placeholder={batchMode ? PLACEHOLDER_BATCH : PLACEHOLDER_SINGLE}
          value={componentCode}
          onChange={(e) => setComponentCode(e.target.value)}
          spellCheck={false}
        />
        {batchMode && componentCode.trim() && (
          <div className="batch-count-hint">
            {splitBatchInput(componentCode).length} component(s) detected
          </div>
        )}
      </div>

      {/* Advanced: Tailwind config */}
      <div>
        <button
          className="toggle-advanced"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'â–² Hide' : 'â–¼ Add'} Tailwind config (optional)
        </button>
        {showAdvanced && (
          <textarea
            className="tailwind-textarea"
            placeholder="Paste your tailwind.config.js content here for more accurate mapping and Figma Variables..."
            value={tailwindConfig}
            onChange={(e) => setTailwindConfig(e.target.value)}
            spellCheck={false}
            style={{ marginTop: 6 }}
          />
        )}
      </div>

      {/* Status banner */}
      {status.kind !== 'idle' && (
        <div className={`status-banner ${status.kind === 'batch-progress' || status.kind === 'batch-done' ? (batchFail > 0 ? 'error' : 'success') : status.kind}`}>
          {status.kind === 'progress' && (
            <>
              <span style={{ marginRight: 8 }}>â³</span>
              {status.message}
            </>
          )}
          {status.kind === 'batch-progress' && (
            <>
              <span style={{ marginRight: 8 }}>â³</span>
              Converting {status.index + 1}/{status.total}: {status.componentName}...
            </>
          )}
          {status.kind === 'success' && (
            <>
              âœ… &ldquo;{status.componentName}&rdquo; created!
              {status.stylesCreated > 0 && (
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                  {status.stylesCreated} local style{status.stylesCreated !== 1 ? 's' : ''} added to your library.
                </span>
              )}
            </>
          )}
          {status.kind === 'batch-done' && (
            <>
              {batchFail === 0 ? 'âœ…' : 'âš ï¸'} Batch complete: {batchOk}/{status.results.length} succeeded.
              {status.results.map((r, i) => (
                <div key={i} style={{ fontSize: 11, marginTop: 3, opacity: 0.85 }}>
                  {r.ok ? 'âœ“' : 'âœ—'} {r.componentName}{r.ok ? ` (${r.stylesCreated} styles)` : `: ${r.error}`}
                </div>
              ))}
            </>
          )}
          {status.kind === 'error' && (
            <>
              <strong>Error: </strong>
              {status.message}
            </>
          )}
        </div>
      )}

      {/* Warning banner (font substitutions / ambiguities) */}
      {status.kind === 'success' && status.warnings.length > 0 && (
        <div className="status-banner warning">
          <strong>âš ï¸ Heads up:</strong>
          <ul style={{ paddingLeft: 14, marginTop: 4 }}>
            {status.warnings.map((w, i) => (
              <li key={i} style={{ marginTop: 2 }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Convert button */}
      <button
        className="convert-btn"
        onClick={handleConvert}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="spinner" />
            {batchMode ? 'Processing batch...' : 'Converting...'}
          </>
        ) : (
          batchMode ? 'Convert Batch' : 'Convert to Figma'
        )}
      </button>

      {/* Footer */}
      <div className="footer">Powered by Claude · Code to Figma Plugin</div>
    </div>
  );
}
