// LLM-driven auto-runner for the intake flow (no UI). Requires GEMINI_API_KEY.
// Usage:
//   GEMINI_API_KEY=... yarn auto
// Optional env vars:
//   PATIENCE_MODE=short|normal|deep (default normal)
//   PATIENCE_BUDGET=<number> (overrides default budget for mode)

import { mkdir, writeFile } from 'node:fs/promises';
import { AgentOrchestrator } from '../src/lib/agentOrchestrator.ts';
import type { AgentMessage, AgentState, PatienceMode } from '../src/types/agent.ts';

function nowISO() { return new Date().toISOString(); }

const ky = "AIzaSyAiRh2D1WD1LYysSNEor_IiTh6szjn8X_c"

const mode = (process.env.PATIENCE_MODE as PatienceMode) || 'normal';
const defaultBudgets = { short: 8, normal: 15, deep: 25 } as const;
const budget = Number(process.env.PATIENCE_BUDGET ?? defaultBudgets[mode]);

const orch = new AgentOrchestrator({ ky:ky, model: 'gemini-2.5-flash' });
const sys: AgentMessage = orch.getSystemMessage();

const init = {
  messages: [sys] as AgentMessage[],
  answers: {},
  patience: { mode, budget, asked: 0, wrapUp: false },
};

const outDir = new URL('../run-output/', import.meta.url);

async function main() {
  console.log(`[auto-intake] Starting at ${nowISO()} with mode=${mode}, budget=${budget}`);
  let state: AgentState = init as AgentState;
  try {
    state = await orch.autoComplete(init, { maxSteps: 200 });
  } catch (err) {
    console.error('[auto-intake] Error during autoComplete:', err);
  }

  const ended = state.outcome?.type ?? 'unknown';
  console.log(`[auto-intake] Finished with outcome=${ended}`);
  if (ended === 'summary') {
    console.log('--- SUMMARY ---');
    console.log(state.outcome?.summary.reportText);
    console.log('----------------');
  }

  // Persist full state
  try {
    await mkdir(outDir, { recursive: true });
    const fileName = `intake_${Date.now()}.json`;
    const filePath = new URL(fileName, outDir);
    await writeFile(filePath, JSON.stringify({ ...state, exportedAt: nowISO() }, null, 2));
    console.log(`[auto-intake] Saved to ${filePath.pathname}`);
  } catch (err) {
    console.error('[auto-intake] Failed to write output file:', err);
  }
}

await main();
