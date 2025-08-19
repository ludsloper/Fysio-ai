// LLM-driven auto-runner for the intake flow (no UI). Requires GEMINI_API_KEY.
// Usage:
//   GEMINI_API_KEY=... yarn auto
// Optional:
//   PATIENCE_MODE=short|normal|deep (default normal)
//   PATIENCE_BUDGET=<number>

import { mkdir, writeFile } from 'node:fs/promises';
import { GoogleGenAI, Type } from '@google/genai';

function nowISO() { return new Date().toISOString(); }

const SYSTEM_PROMPT = `Je bent een vriendelijke digitale fysio-assistent (casual NL) voor intake bij lage rugklachten. Specificeer vragen aan de hand van de onderrug klacht.
Belangrijk:
- Gebruik ALTIJD precies één functie-aanroep (function call) per beurt: voor vragen gebruik ask_*; voor afronden gebruik summarize.
- Géén vrije tekst teruggeven; alle stappen lopen via function calls.
- Respecteer geduld: als wrapUp=true of budget bijna op is, stel maximaal nog 3 essentiële vragen en rond af met summarize.
- Als forceSummarize=true, rond DIRECT af met summarize (geen extra vragen meer).
- Essentials prioriteit: context/aanvang/duur, triage, locatie, NRS pijn (0–10), uitstraling, neurologische symptomen, beperkingen/activiteiten, provocerend/verlichtend, eerdere episodes/behandelingen, doelen/verwachting, psychosociaal, rode vlaggen en LRS
- Voel je vrij om verdiepende of verduidelijkende vragen te stellen wanneer passend of nodig.
Tone: informeel, kort en duidelijk, 2e persoon. Geen medische claims of behandeladvies.
`;

const functionDeclarations = [
  { name: 'ask_yesno', description: 'Stelt een ja/nee vraag.', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, helpText: { type: Type.STRING } }, required: ['id','key','label'] } },
  { name: 'ask_select', description: 'Stelt een single-choice vraag.', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, placeholder: { type: Type.STRING }, allowUnknown: { type: Type.BOOLEAN }, options: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, label: { type: Type.STRING } }, required: ['value','label'] } } }, required: ['id','key','label','options'] } },
  { name: 'ask_multiselect', description: 'Stelt een multi-select vraag.', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, allowUnknown: { type: Type.BOOLEAN }, options: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, label: { type: Type.STRING } }, required: ['value','label'] } } }, required: ['id','key','label','options'] } },
  { name: 'ask_number', description: 'Stelt een numerieke vraag (evt. met min/max).', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, min: { type: Type.NUMBER }, max: { type: Type.NUMBER }, unit: { type: Type.STRING } }, required: ['id','key','label'] } },
  { name: 'ask_text', description: 'Stelt een open vraag (korte tekst).', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, placeholder: { type: Type.STRING }, maxLen: { type: Type.NUMBER } }, required: ['id','key','label'] } },
  { name: 'ask_pain_scale', description: 'Stelt een pijnschaal vraag (0-10).', parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, key: { type: Type.STRING }, label: { type: Type.STRING }, min: { type: Type.NUMBER }, max: { type: Type.NUMBER }, anchors: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['id','key','label'] } },
  { name: 'summarize', description: 'Maakt een NL samenvatting van de intake en levert gestructureerde velden.', parameters: { type: Type.OBJECT, properties: { reportText: { type: Type.STRING }, highlights: { type: Type.ARRAY, items: { type: Type.STRING } }, redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }, missingEssentials: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['reportText'] } },
];

function formatValue(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nee';
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}

function buildTranscript(messages) {
  const lines = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCall) {
      const args = m.toolCall.args || {};
      const qLabel = args.label || m.toolCall.name;
      const answerMsg = messages.find(mm => mm.role === 'tool' && mm.toolResult && mm.toolResult.id === args.id);
      const val = answerMsg?.toolResult?.value;
      const notes = answerMsg?.toolResult?.notes;
      lines.push(`- Vraag: ${qLabel}`);
      lines.push(`  Antwoord: ${formatValue(val)}`);
      if (notes && String(notes).trim() !== '') lines.push(`  Opmerking: ${notes}`);
    }
  }
  return lines.join('\n');
}
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));


function extractFirstJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}

function fallbackAnswer(toolCall) {
  const args = toolCall.args || {};
  switch (toolCall.name) {
    case 'ask_yesno':
      return { value: true };
    case 'ask_select': {
      const opts = args.options || [];
      return { value: opts[0]?.value ?? (args.allowUnknown ? 'unknown' : '') };
    }
    case 'ask_multiselect': {
      const opts = args.options || [];
      return { value: opts.length ? [opts[0].value] : (args.allowUnknown ? ['unknown'] : []) };
    }
    case 'ask_number':
    case 'ask_pain_scale': {
      const min = typeof args.min === 'number' ? args.min : 0;
      const max = typeof args.max === 'number' ? args.max : 10;
      return { value: Math.round((min + max) / 2) };
    }
    case 'ask_text':
      return { value: 'n.v.t.' };
    default:
      return { value: '' };
  }
}



class RunnerOrchestrator {
  constructor({ ky, ky2, model }) {
    this.ai = new GoogleGenAI({ apiKey: ky });
    this.ai2 = new GoogleGenAI({ apiKey: ky2 });
    this.model = model || 'gemini-2.5-flash';
  }
  getSystemMessage() {
    return { role: 'system', content: SYSTEM_PROMPT, timestamp: nowISO() };
  }
  async next(messages, _answers, patience, opts) {
    const patienceLine = `Patience: mode=${patience.mode}, budget=${patience.budget}, asked=${patience.asked}, wrapUp=${patience.wrapUp}`;
    const forceLine = opts?.forceSummarize ? 'forceSummarize=true' : '';
    const transcript = buildTranscript(messages);
    const content = `${patienceLine}\n${forceLine}\n\nGesprekslog (vragen en antwoorden):\n${transcript}`;

    const client = this.ai2 && Math.random() < 0.5 ? this.ai2 : this.ai;
    const raw = await client.models.generateContent({
      model: this.model,
      contents: `${SYSTEM_PROMPT}\n\n${content}`,
      config: { tools: [{ functionDeclarations }] },
    });
    const response = raw;
    const fc = response.functionCalls;
    if (fc && fc.length > 0) {
      const first = fc[0];
      if (first.name === 'summarize') {
        const args = first.args || {};
        return { type: 'summary', summary: { reportText: args.reportText, highlights: args.highlights ?? [], redFlags: args.redFlags ?? [], missingEssentials: args.missingEssentials ?? [] } };
      }
      return { type: 'question', toolCall: { name: first.name, args: first.args } };
    }
    return { type: 'ended', reason: 'Geen output.' };
  }
  async proposeAnswer(toolCall, messages, answers) {
    const transcript = buildTranscript(messages);
    const args = toolCall.args || {};
    const guide = `Je simuleert een cliënt die intakevragen beantwoordt. Geef een realistisch, consistent en niet te lang antwoord als JSON.
Antwoord ALLEEN met JSON (geen uitleg), volgens:
{ "value": <waarde>, "note"?: <korte toelichting> }`;
    const payload = `${guide}\n\nVraag (tool):\n${JSON.stringify({ name: toolCall.name, args }, null, 2)}\n\nBekende antwoorden:\n${JSON.stringify(answers, null, 2)}\n\nLogboek tot nu (Q/A):\n${transcript}`;
    const raw = await this.ai.models.generateContent({ model: this.model, contents: payload });
    const text = raw.text ?? '';
    const parsed = extractFirstJson(text);
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return fallbackAnswer(toolCall);
    return parsed;
  }
  async autoComplete(init, opts) {
    const maxSteps = opts?.maxSteps ?? 200;
    let messages = [...init.messages];
    let answers = { ...init.answers };
    let patience = { ...init.patience };

    for (let i = 0; i < maxSteps; i++) {
        const outcome = await this.next(messages, answers, patience, patience.asked >= patience.budget || patience.wrapUp ? { forceSummarize: true } : undefined);
        console.log(outcome);
        console.log(`Next question: ${patience.asked + 1} / ${patience.budget}, sleeping 10 SECS`);
        await sleep(10000);
      if (outcome.type === 'question') {
        const askMsg = { role: 'assistant', toolCall: outcome.toolCall, timestamp: nowISO() };
        messages = [...messages, askMsg];
        const { value, note } = await this.proposeAnswer(outcome.toolCall, messages, answers);
        console.log("answers:")
        console.log(value, note);
        const { id, key } = outcome.toolCall.args;
        const answeredAt = nowISO();
        const toolMsg = { role: 'tool', toolResult: { id, key, value, askedAt: askMsg.timestamp, answeredAt, notes: note }, timestamp: answeredAt };
        messages = [...messages, toolMsg];
        answers = { ...answers, [key]: value, ...(note ? { [`${key}.extra_note`]: note } : {}) };
        patience = { ...patience, asked: patience.asked + 1 };
        continue;
      }
      return { messages, answers, patience, outcome };
    }
    return { messages, answers, patience, outcome: { type: 'ended', reason: 'Max steps reached' } };
  }
}

const ky = "AIzaSyAiRh2D1WD1LYysSNEor_IiTh6szjn8X_c";
const ky2 = "AIzaSyC83_vamCMn6cfFI9qAPn6FAyZMzNXCVmc"
if (!ky) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}
console.log("STARTING1");

const mode = process.env.PATIENCE_MODE || 'normal';
const defaultBudgets = { short: 8, normal: 15, deep: 25 };
// const budget = Number(process.env.PATIENCE_BUDGET ?? defaultBudgets[mode] ?? 8);
const budget = 25

const orch = new RunnerOrchestrator({ ky, ky2, model: 'gemini-2.5-flash' });
const sys = orch.getSystemMessage();
const init = { messages: [sys], answers: {}, patience: { mode, budget, asked: 0, wrapUp: false } };
console.log("STARTING");
const outDir = new URL('../run-output/', import.meta.url);

(async () => {
  console.log(`[auto-intake] Starting at ${nowISO()} with mode=${mode}, budget=${budget}`);
  let state = init;
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
  try {
    await mkdir(outDir, { recursive: true });
    const fileName = `intake_${Date.now()}.json`;
    const filePath = new URL(fileName, outDir);
    await writeFile(filePath, JSON.stringify({ ...state, exportedAt: nowISO() }, null, 2));
    console.log(`[auto-intake] Saved to ${filePath.pathname}`);
  } catch (err) {
    console.error('[auto-intake] Failed to write output file:', err);
  }
})();
