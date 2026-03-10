/**
 * code.ts — Figma Plugin main thread
 *
 * ALL figma.* API calls must live here. This file runs in Figma's sandboxed
 * JavaScript environment (not a browser). It communicates with the React UI
 * via figma.ui.postMessage / figma.ui.onmessage.
 *
 * Architecture:
 *   UI (React)  ──postMessage──▶  code.ts  ──generates + eval──▶  Figma canvas
 *
 * Message types from UI:
 *   { type: 'convert',         code: string, apiKey: string, tailwindConfig?: string }
 *   { type: 'convert-batch',   codes: string[], apiKey: string, tailwindConfig?: string }
 *   { type: 'classify-files',  paths: string[], apiKey: string }
 *   { type: 'run-plan-step',   codes: string[], apiKey: string, tailwindConfig?: string, stepId: string }
 *   { type: 'load-api-key' }
 *   { type: 'save-api-key',    apiKey: string }
 *   { type: 'close' }
 *
 * Message types to UI:
 *   { type: 'progress',         message: string }
 *   { type: 'success',          componentName: string, stylesCreated: number, warnings: string[] }
 *   { type: 'batch-progress',   index: number, total: number, componentName: string }
 *   { type: 'batch-done',       results: BatchResultSummary[] }
 *   { type: 'classify-result',  files: ClassifiedFile[] }
 *   { type: 'plan-step-done',   stepId: string, results: BatchResultSummary[] }
 *   { type: 'api-key-loaded',   apiKey: string }
 *   { type: 'error',            message: string }
 */

import { runPipeline, runBatchPipeline, isPipelineError, classifyFiles, extractTokensFromFile } from './claude';
import type { ClassifiedFile } from './claude';
import { createFigmaVariables, parseTailwindConfig } from './tokens';

// Key used for figma.clientStorage component registry (Phase 2)
const REGISTRY_KEY = 'component-registry';

/** Persisted record of a component created by this plugin. */
interface RegistryEntry {
  figmaId: string;
  name: string;
  sourceHash: string;
  lastSyncedAt: string; // ISO timestamp
}

async function loadRegistry(): Promise<Record<string, RegistryEntry>> {
  try {
    const stored = await figma.clientStorage.getAsync(REGISTRY_KEY);
    return (stored as Record<string, RegistryEntry>) ?? {};
  } catch {
    return {};
  }
}

async function saveRegistry(registry: Record<string, RegistryEntry>): Promise<void> {
  await figma.clientStorage.setAsync(REGISTRY_KEY, registry);
}

/** Simple djb2 hash to detect source changes without storing full code. */
function hashCode(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

// Debug: Log UI loading to help diagnose blank screen issues
console.log('[Code to Figma] Plugin starting...');
console.log('[Code to Figma] __html__ type:', typeof __html__);
console.log('[Code to Figma] __html__ length:', typeof __html__ === 'string' ? __html__.length : 'N/A');

figma.showUI(__html__, {
  width: 400,
  height: 560,
  title: 'Code to Figma',
});

console.log('[Code to Figma] UI shown successfully');

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'load-api-key') {
    const storedKey = await figma.clientStorage.getAsync('anthropic-api-key');
    figma.ui.postMessage({ type: 'api-key-loaded', apiKey: storedKey || '' });
    return;
  }

  if (msg.type === 'save-api-key') {
    await figma.clientStorage.setAsync('anthropic-api-key', msg.apiKey);
    return;
  }

  if (msg.type === 'save-plan') {
    await figma.clientStorage.setAsync('conversion-plan', msg.plan ?? null);
    return;
  }

  if (msg.type === 'restore-plan') {
    const saved = await figma.clientStorage.getAsync('conversion-plan');
    figma.ui.postMessage({ type: 'plan-restored', plan: saved ?? null });
    return;
  }

  if (msg.type === 'classify-files') {
    await handleClassifyFiles(msg);
    return;
  }

  if (msg.type === 'run-plan-step') {
    await handlePlanStep(msg);
    return;
  }

  if (msg.type === 'close') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'convert') {
    await handleConvert(msg);
    return;
  }

  if (msg.type === 'convert-batch') {
    await handleBatch(msg);
  }
};

// ---------------------------------------------------------------------------
// Conversion handler
// ---------------------------------------------------------------------------

async function handleConvert(msg: ConvertMessage): Promise<void> {
  const { code, apiKey, tailwindConfig } = msg;

  console.log('[Code.ts] handleConvert called - running in Figma main thread');
  console.log('[Code.ts] typeof fetch:', typeof fetch);

  sendProgress('Analysing component (Pass 1)...');

  const result = await runPipeline(code, { apiKey }, tailwindConfig);

  if (isPipelineError(result)) {
    sendError(result.message);
    return;
  }

  sendProgress('Generating Figma code (Pass 2)...');

  const { pass1, pluginCode } = result;

  // Phase 2: Create Figma Variables from extracted design tokens.
  if (pass1.tokens) {
    try {
      sendProgress('Creating Figma Variables from design tokens...');
      const varResult = await createFigmaVariables(pass1.tokens, pass1.componentName);
      if (varResult.skipped.length) {
        result.warnings.push(
          `Variables: skipped ${varResult.skipped.length} token(s) — ${varResult.skipped.slice(0, 3).join(', ')}`,
        );
      }
    } catch (e) {
      // Non-fatal — variables are a bonus, not required for the component to render.
      result.warnings.push(`Variables creation failed: ${(e as Error).message}`);
    }
  }

  sendProgress(`Creating "${pass1.componentName}" on canvas...`);

  try {
    // Execute the generated Figma plugin JavaScript.
    // Pass 2 always wraps code in `(async () => { ... })()`, which is an expression
    // that returns a Promise. We wrap it with `return (...)` so new Function returns it.
    const trimmed = pluginCode.trim();
    const returnExpr = trimmed.startsWith('(') ? trimmed : `(${trimmed})`;
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return ${returnExpr}`);
    await fn();

    // Phase 2: Persist to component registry.
    const registry = await loadRegistry();
    const hash = hashCode(code);
    const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
    if (node) {
      registry[pass1.componentName] = {
        figmaId: node.id,
        name: pass1.componentName,
        sourceHash: hash,
        lastSyncedAt: new Date().toISOString(),
      };
      await saveRegistry(registry);
    }

    sendSuccess(pass1.componentName, result.stylesCreated, result.warnings);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(
      `Figma execution error: ${errorMessage}\n\n` +
        'The generated code could not run. This is usually caused by a font issue ' +
        'or an unsupported API call. Try again — Claude will attempt a different approach.',
    );
  }
}

// ---------------------------------------------------------------------------
// Batch conversion handler (Phase 2)
// ---------------------------------------------------------------------------

interface BatchResultSummary {
  componentName: string;
  ok: boolean;
  error?: string;
  stylesCreated: number;
  warnings: string[];
}

async function handleBatch(msg: BatchConvertMessage): Promise<void> {
  const { codes, apiKey, tailwindConfig } = msg;

  sendProgress(`Starting batch: ${codes.length} component(s)...`);

  // Pre-parse shared Tailwind config once (for token fallback).
  const sharedTokens = tailwindConfig ? parseTailwindConfig(tailwindConfig) : undefined;

  const results = await runBatchPipeline(
    codes,
    { apiKey },
    (index, total, componentName) => {
      figma.ui.postMessage({ type: 'batch-progress', index, total, componentName });
    },
    tailwindConfig,
  );

  const summaries: BatchResultSummary[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (isPipelineError(result)) {
      summaries.push({
        componentName: '(unknown)',
        ok: false,
        error: result.message,
        stylesCreated: 0,
        warnings: [],
      });
      continue;
    }

    const { pass1, pluginCode } = result;
    const tokensToUse = pass1.tokens ?? sharedTokens;

    if (tokensToUse) {
      try {
        await createFigmaVariables(tokensToUse, pass1.componentName);
      } catch {
        // Non-fatal
      }
    }

    try {
      const trimmed = pluginCode.trim();
      const returnExpr = trimmed.startsWith('(') ? trimmed : `(${trimmed})`;
      // eslint-disable-next-line no-new-func
      await (new Function(`return ${returnExpr}`))();

      // Update registry for batch items.
      const registry = await loadRegistry();
      const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
      if (node) {
        registry[pass1.componentName] = {
          figmaId: node.id,
          name: pass1.componentName,
          sourceHash: hashCode(codes[i] ?? ''),
          lastSyncedAt: new Date().toISOString(),
        };
        await saveRegistry(registry);
      }

      summaries.push({
        componentName: pass1.componentName,
        ok: true,
        stylesCreated: result.stylesCreated,
        warnings: result.warnings,
      });
    } catch (err) {
      summaries.push({
        componentName: pass1.componentName,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stylesCreated: 0,
        warnings: result.warnings,
      });
    }
  }

  figma.ui.postMessage({ type: 'batch-done', results: summaries });
}

// ---------------------------------------------------------------------------
// UI message helpers
// ---------------------------------------------------------------------------

function sendProgress(message: string): void {
  figma.ui.postMessage({ type: 'progress', message });
}

function sendSuccess(componentName: string, stylesCreated: number, warnings: string[]): void {
  figma.ui.postMessage({ type: 'success', componentName, stylesCreated, warnings });
}

function sendError(message: string): void {
  figma.ui.postMessage({ type: 'error', message });
}

// ---------------------------------------------------------------------------
// Message type definitions
// ---------------------------------------------------------------------------

interface ConvertMessage {
  type: 'convert';
  code: string;
  apiKey: string;
  tailwindConfig?: string;
}

interface BatchConvertMessage {
  type: 'convert-batch';
  codes: string[];
  apiKey: string;
  tailwindConfig?: string;
}

interface LoadApiKeyMessage {
  type: 'load-api-key';
}

interface SaveApiKeyMessage {
  type: 'save-api-key';
  apiKey: string;
}

interface CloseMessage {
  type: 'close';
}

interface ClassifyFilesMessage {
  type: 'classify-files';
  paths: string[];
  apiKey: string;
}

interface RunPlanStepMessage {
  type: 'run-plan-step';
  stepId: string;
  category: string;
  codes: string[];
  fileNames: string[];
  apiKey: string;
  tailwindConfig?: string;
}

interface SavePlanMessage   { type: 'save-plan';    plan: unknown; }
interface RestorePlanMessage { type: 'restore-plan'; }

type PluginMessage =
  | ConvertMessage
  | BatchConvertMessage
  | LoadApiKeyMessage
  | SaveApiKeyMessage
  | SavePlanMessage
  | RestorePlanMessage
  | ClassifyFilesMessage
  | RunPlanStepMessage
  | CloseMessage;

// ---------------------------------------------------------------------------
// Classify handler
// ---------------------------------------------------------------------------

async function handleClassifyFiles(msg: ClassifyFilesMessage): Promise<void> {
  try {
    const chunkCount = Math.ceil(msg.paths.length / 50);
    sendProgress(
      chunkCount > 1
        ? `Classifying ${msg.paths.length} files in ${chunkCount} batches…`
        : `Classifying ${msg.paths.length} files…`
    );
    const result = await classifyFiles(msg.paths, { apiKey: msg.apiKey });
    figma.ui.postMessage({ type: 'classify-result', files: result.files });
  } catch (err) {
    figma.ui.postMessage({ type: 'classify-error', message: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Plan step handler
// ---------------------------------------------------------------------------

async function handlePlanStep(msg: RunPlanStepMessage): Promise<void> {
  const { stepId, category, codes, apiKey, tailwindConfig } = msg;
  const fileNames = msg.fileNames ?? [];
  const summaries: BatchResultSummary[] = [];

  // Top-level guard: always send plan-step-done, even if we crash.
  try {
    for (let i = 0; i < codes.length; i++) {
      const fileName = fileNames[i] ?? `file ${i + 1}`;
      const displayName = fileName;

      sendProgress(`[${i + 1}/${codes.length}] ${fileName}…`);
      figma.ui.postMessage({ type: 'batch-progress', index: i, total: codes.length, componentName: fileName });

      // ── TOKEN FILES ──────────────────────────────────────────────────────
      // Use Claude Haiku to extract tokens from ANY source format.
      // Works with nested TS objects, flat JSON, SCSS vars, Style Dictionary, etc.
      if (category === 'tokens') {
        try {
          sendProgress(`[${i + 1}/${codes.length}] Extracting tokens from ${fileName}…`);
          const tokens = await extractTokensFromFile(codes[i], fileName, { apiKey });

          const totalTokens =
            Object.keys(tokens.colors).length +
            Object.keys(tokens.spacing).length +
            Object.keys(tokens.borderRadius).length;

          if (totalTokens === 0) {
            summaries.push({ componentName: displayName, ok: true, stylesCreated: 0, warnings: ['No token values found — file may only contain CSS var() references'] });
            continue;
          }

          const collectionName = fileName.replace(/\.[^.]+$/, '').replace(/[/\\]/g, ' › ');
          const varResult = await createFigmaVariables(tokens, collectionName);
          summaries.push({
            componentName: displayName,
            ok: true,
            stylesCreated: varResult.count,
            warnings: varResult.skipped.length ? [`Skipped ${varResult.skipped.length} unsupported token(s)`] : [],
          });
        } catch (err) {
          summaries.push({ componentName: displayName, ok: false, error: err instanceof Error ? err.message : String(err), stylesCreated: 0, warnings: [] });
        }
        continue;
      }

      // ── COMPONENT FILES ──────────────────────────────────────────────────
      try {
        const result = await runPipeline(codes[i], { apiKey }, tailwindConfig);

        if (isPipelineError(result)) {
          summaries.push({ componentName: displayName, ok: false, error: result.message, stylesCreated: 0, warnings: [] });
          continue;
        }

        const { pass1, pluginCode } = result;

        if (pass1.tokens) {
          try { await createFigmaVariables(pass1.tokens, pass1.componentName); } catch (_) { /* non-fatal */ }
        }

        try {
          // Strip figma.closePlugin() and its preceding notify so the plugin
          // stays open for subsequent steps. Also strip figma.viewport.scrollAndZoomIntoView
          // because zooming on every component is jarring in batch mode.
          const safeCode = pluginCode
            .replace(/figma\.notify\s*\([^)]*\)\s*;?\s*\n?\s*figma\.closePlugin\s*\(\s*\)\s*;?/g, '')
            .replace(/figma\.closePlugin\s*\(\s*\)\s*;?/g, '')
            .replace(/figma\.viewport\.scrollAndZoomIntoView\s*\([^)]*\)\s*;?/g, '')
            .trim();

          const trimmed = safeCode;
          const returnExpr = trimmed.startsWith('(') ? trimmed : `(${trimmed})`;
          // eslint-disable-next-line no-new-func
          await (new Function(`return ${returnExpr}`))();

          const registry = await loadRegistry();
          const node = figma.currentPage.findOne((n) => n.name === pass1.componentName);
          if (node) {
            registry[pass1.componentName] = { figmaId: node.id, name: pass1.componentName, sourceHash: hashCode(codes[i]), lastSyncedAt: new Date().toISOString() };
            await saveRegistry(registry);
          }

          summaries.push({ componentName: pass1.componentName, ok: true, stylesCreated: result.stylesCreated, warnings: result.warnings });
        } catch (execErr) {
          summaries.push({ componentName: pass1.componentName, ok: false, error: `Figma exec error: ${execErr instanceof Error ? execErr.message : String(execErr)}`, stylesCreated: 0, warnings: result.warnings });
        }
      } catch (pipelineErr) {
        summaries.push({ componentName: displayName, ok: false, error: `Pipeline error: ${pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr)}`, stylesCreated: 0, warnings: [] });
      }
    }
  } catch (fatalErr) {
    // Catch anything not handled above so plan-step-done always fires
    summaries.push({ componentName: 'step', ok: false, error: `Fatal: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, stylesCreated: 0, warnings: [] });
  }

  const totalCreated = summaries.reduce((n, s) => n + s.stylesCreated, 0);
  if (category === 'tokens' && totalCreated > 0) {
    figma.notify(`✓ ${totalCreated} Figma Variables created — open Local Variables panel`, { timeout: 6000 });
  }

  figma.ui.postMessage({ type: 'plan-step-done', stepId, results: summaries });
}
