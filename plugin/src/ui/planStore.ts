/**
 * planStore.ts — Types for the conversion plan.
 *
 * After classifying a scanned folder, the plan is shown to the designer
 * as a list of steps they can run one at a time.
 */

import type { ScannedFile } from './folderScanner';

export type ComponentCategory = 'tokens' | 'atoms' | 'molecules' | 'organisms' | 'pages' | 'skip';

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface StepResult {
  fileName: string;
  componentName: string;
  ok: boolean;
  error?: string;
  stylesCreated: number;
  warnings: string[];
}

export interface PlanStep {
  id: string;
  label: string;               // basename of the single file
  category: ComponentCategory;
  files: ScannedFile[];
  estimatedRuns: number;
  estimatedTokensK: number;
  status: StepStatus;
  results: StepResult[];
  /** Basename of the co-located style file merged into this step, if any. e.g. "Button.module.scss" */
  attachedStyle?: string;
}

export interface ConversionPlan {
  id: string;
  createdAt: string;
  folderName: string;
  totalScanned: number;
  totalSkipped: number;
  steps: PlanStep[];
  tailwindConfig?: string;     // content of tailwind.config.js if found
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BATCH_SIZE = 5; // components per Claude run

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  tokens: 'Design Tokens',
  atoms: 'Atoms',
  molecules: 'Molecules',
  organisms: 'Organisms',
  pages: 'Pages / Layouts',
  skip: 'Skip',
};

export const CATEGORY_ORDER: ComponentCategory[] = [
  'tokens', 'atoms', 'molecules', 'organisms', 'pages',
];

// Rough token estimate per component (pass1 + pass2 + response)
const TOKENS_PER_COMPONENT = 3000;
const TOKENS_PER_TOKEN_FILE = 800;

/**
 * Estimate total tokens for a step.
 * Tokens file step uses a lower estimate (just extraction, no code generation).
 */
export function estimateTokensK(category: ComponentCategory, fileCount: number): number {
  const tokensPerItem = category === 'tokens' ? TOKENS_PER_TOKEN_FILE : TOKENS_PER_COMPONENT;
  return Math.round((tokensPerItem * fileCount) / 1000);
}
