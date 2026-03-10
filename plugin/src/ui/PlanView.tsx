/**
 * PlanView.tsx — Shows the conversion plan generated from a scanned folder.
 * One row per file — run each individually for maximum accuracy.
 */
import type { ConversionPlan, PlanStep, StepStatus, StepResult, ComponentCategory } from './planStore';
import { CATEGORY_ORDER, CATEGORY_LABELS } from './planStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanViewProps {
  plan: ConversionPlan;
  apiKey: string;
  onReset: () => void;
  onStepUpdate: (stepId: string, status: StepStatus, results?: StepResult[]) => void;
}

// Messages sent to code.ts
type OutboundMessage =
  | { type: 'run-plan-step'; stepId: string; category: string; codes: string[]; fileNames: string[]; apiKey: string; tailwindConfig?: string };

function postToPlugin(msg: OutboundMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ---------------------------------------------------------------------------
// Category icons
// ---------------------------------------------------------------------------

const CATEGORY_ICON: Record<string, string> = {
  tokens:    '🎨',
  atoms:     '⚛️',
  molecules: '🧩',
  organisms: '🏗️',
  pages:     '📄',
};

// Style file extension → short label colour
const STYLE_EXT_COLOR: Record<string, string> = {
  scss: '#c76494',
  css: '#264de4',
  less: '#1d365d',
  sass: '#c76494',
};
function styleExtLabel(filename: string): { label: string; color: string } {
  const m = filename.match(/\.(module\.)?(scss|css|less|sass)$/i);
  const ext = (m?.[2] ?? 'css').toLowerCase();
  return { label: `.${ext}`, color: STYLE_EXT_COLOR[ext] ?? '#888' };
}

// ---------------------------------------------------------------------------
// StepRow — one row = one file
// ---------------------------------------------------------------------------

function StepRow({
  step,
  apiKey,
  tailwindConfig,
  onUpdate,
  isAnyRunning,
}: {
  step: PlanStep;
  apiKey: string;
  tailwindConfig?: string;
  onUpdate: (status: StepStatus, results?: StepResult[]) => void;
  isAnyRunning: boolean;
}) {
  const file     = step.files[0];
  const canRun   = !isAnyRunning && step.status === 'pending';
  const canRerun = !isAnyRunning && (step.status === 'done' || step.status === 'error');

  function handleRun() {
    onUpdate('running');
    postToPlugin({
      type: 'run-plan-step',
      stepId: step.id,
      category: step.category,
      codes: [file.content],
      fileNames: [file.name],
      apiKey,
      tailwindConfig,
    });
  }

  const result   = step.results[0];
  const hasError = result && !result.ok;
  const styleTag = step.attachedStyle ? styleExtLabel(step.attachedStyle) : null;

  return (
    <div className={`plan-step plan-step--${step.status}`}>
      <div className="plan-step-header">

        {/* File name + metadata */}
        <div className="plan-step-info">
          <div className="plan-step-label-row">
            <span className="plan-step-label">{step.label}</span>
            {styleTag && (
              <span
                className="plan-style-badge"
                style={{ background: styleTag.color }}
                title={`Style file included: ${step.attachedStyle}`}
              >
                {styleTag.label}
              </span>
            )}
          </div>
          <div className="plan-step-meta">
            <span className="plan-file-path-meta">{file?.path ?? ''}</span>
            <span className="plan-token-estimate">~{step.estimatedTokensK}k tokens</span>
          </div>
          {step.attachedStyle && (
            <div className="plan-style-pair">
              ↳ paired with <strong>{step.attachedStyle}</strong>
            </div>
          )}
          {hasError && (
            <div className="plan-inline-error">⚠ {result.error ?? 'conversion failed'}</div>
          )}
          {step.category === 'tokens' && step.status === 'done' && !hasError && (
            <div className="plan-token-hint">
              🎨 Variables created — check <strong>Local Variables</strong> panel
            </div>
          )}
          {step.status === 'done' && !hasError && step.category !== 'tokens' && (
            <div className="plan-done-hint">
              ✓ Check Figma canvas — variants appear as a Component Set if detected
            </div>
          )}
        </div>

        {/* Right-side status + buttons */}
        <div className="plan-step-actions">
          {step.status === 'pending' && (
            <span className="plan-step-badge plan-step-badge--pending">Pending</span>
          )}
          {step.status === 'running' && (
            <span className="plan-step-badge plan-step-badge--running">
              <span className="spinner spinner--small" /> Running…
            </span>
          )}
          {step.status === 'done' && (
            <span className="plan-step-badge plan-step-badge--done">✓ Done</span>
          )}
          {step.status === 'error' && (
            <span className="plan-step-badge plan-step-badge--error">✗ Error</span>
          )}
          {step.status === 'skipped' && (
            <span className="plan-step-badge plan-step-badge--skipped">Skipped</span>
          )}

          {(canRun || canRerun) && (
            <button className="plan-run-btn" onClick={handleRun}>
              {canRerun ? 'Re-run' : 'Run'}
            </button>
          )}

          {canRun && (
            <button className="plan-skip-btn" onClick={() => onUpdate('skipped')}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategorySection — group header + its file rows
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  steps,
  apiKey,
  tailwindConfig,
  isAnyRunning,
  onStepUpdate,
}: {
  category: ComponentCategory;
  steps: PlanStep[];
  apiKey: string;
  tailwindConfig?: string;
  isAnyRunning: boolean;
  onStepUpdate: (stepId: string, status: StepStatus, results?: StepResult[]) => void;
}) {
  const icon   = CATEGORY_ICON[category] ?? '📦';
  const label  = CATEGORY_LABELS[category];
  const done   = steps.filter((s) => s.status === 'done').length;
  const errors = steps.filter((s) => s.status === 'error').length;

  return (
    <div className="plan-category-section">
      <div className="plan-category-header">
        <span className="plan-category-icon">{icon}</span>
        <span className="plan-category-label">{label}</span>
        <span className="plan-category-count">
          {steps.length} file{steps.length !== 1 ? 's' : ''}
          {done > 0 && <span className="plan-category-done"> · {done} done</span>}
          {errors > 0 && <span className="plan-category-err"> · {errors} ✗</span>}
        </span>
      </div>
      {steps.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          apiKey={apiKey}
          tailwindConfig={tailwindConfig}
          onUpdate={(status, results) => onStepUpdate(step.id, status, results)}
          isAnyRunning={isAnyRunning}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanView
// ---------------------------------------------------------------------------

export default function PlanView({ plan, apiKey, onReset, onStepUpdate }: PlanViewProps) {
  const allSteps     = plan.steps;
  const totalFiles   = allSteps.length;
  const totalTokensK = allSteps.reduce((sum, s) => sum + s.estimatedTokensK, 0);
  const doneSteps    = allSteps.filter((s) => s.status === 'done').length;
  const isAnyRunning = allSteps.some((s) => s.status === 'running');

  // Build category groups in canonical order
  const groups = CATEGORY_ORDER
    .map((cat) => ({ cat, steps: allSteps.filter((s) => s.category === cat) }))
    .filter((g) => g.steps.length > 0);

  return (
    <div className="plan-view">
      {/* Header */}
      <div className="plan-header">
        <div className="plan-header-top">
          <span className="header-title">Conversion Plan</span>
          <button className="plan-reset-btn" onClick={onReset} title="Scan another folder">
            ↩ Reset
          </button>
        </div>
        <div className="plan-summary">
          <span className="plan-folder">📁 {plan.folderName}</span>
          <span className="plan-stats">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} · {groups.length} categor{groups.length !== 1 ? 'ies' : 'y'} · ~{totalTokensK}k tokens
          </span>
          {doneSteps > 0 && (
            <span className="plan-progress-text">
              {doneSteps}/{totalFiles} done
            </span>
          )}
        </div>
        {plan.tailwindConfig && (
          <div className="plan-token-hint">
            🎨 tailwind.config found — tokens will create Figma Variables
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalFiles > 0 && (
        <div className="plan-progress-bar-track">
          <div
            className="plan-progress-bar-fill"
            style={{ width: `${(doneSteps / totalFiles) * 100}%` }}
          />
        </div>
      )}

      {/* Category sections */}
      <div className="plan-steps">
        {groups.length === 0 ? (
          <div className="plan-empty">No convertible files found in this folder.</div>
        ) : (
          groups.map(({ cat, steps }) => (
            <CategorySection
              key={cat}
              category={cat}
              steps={steps}
              apiKey={apiKey}
              tailwindConfig={plan.tailwindConfig}
              isAnyRunning={isAnyRunning}
              onStepUpdate={onStepUpdate}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="footer">Powered by Claude · Code to Figma Plugin</div>
    </div>
  );
}
