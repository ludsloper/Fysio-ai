import { GoogleGenAI, Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import type {
  AgentMessage,
  AgentOutcome,
  AgentState,
  Patience,
  ToolCall,
  ToolName,
  ToolArgs,
  SelectArgs,
  MultiSelectArgs,
  NumberArgs,
  PainScaleArgs,
  AnswerValue,
} from '@/types/agent';

// System prompt in Dutch with guardrails and essentials
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

// Function declarations for Gemini tool calling
export const functionDeclarations = [
  {
    name: 'ask_yesno',
    description: 'Stelt een ja/nee vraag.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: 'Unieke id voor deze vraag' },
        key: { type: Type.STRING, description: 'Dot key waar het antwoord wordt opgeslagen' },
        label: { type: Type.STRING, description: 'De NL vraagtekst' },
        helpText: { type: Type.STRING, description: 'Optionele hulptekst' },
      },
      required: ['id','key','label'],
    },
  },
  {
    name: 'ask_select',
    description: 'Stelt een single-choice vraag.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        key: { type: Type.STRING },
        label: { type: Type.STRING },
        placeholder: { type: Type.STRING },
        allowUnknown: { type: Type.BOOLEAN },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              value: { type: Type.STRING },
              label: { type: Type.STRING },
            },
            required: ['value','label'],
          },
        },
      },
      required: ['id','key','label','options'],
    },
  },
  {
    name: 'ask_multiselect',
    description: 'Stelt een multi-select vraag.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        key: { type: Type.STRING },
        label: { type: Type.STRING },
        allowUnknown: { type: Type.BOOLEAN },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              value: { type: Type.STRING },
              label: { type: Type.STRING },
            },
            required: ['value','label'],
          },
        },
      },
      required: ['id','key','label','options'],
    },
  },
  {
    name: 'ask_number',
    description: 'Stelt een numerieke vraag (evt. met min/max).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        key: { type: Type.STRING },
        label: { type: Type.STRING },
        min: { type: Type.NUMBER },
        max: { type: Type.NUMBER },
        unit: { type: Type.STRING },
      },
      required: ['id','key','label'],
    },
  },
  {
    name: 'ask_text',
    description: 'Stelt een open vraag (korte tekst).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        key: { type: Type.STRING },
        label: { type: Type.STRING },
        placeholder: { type: Type.STRING },
        maxLen: { type: Type.NUMBER },
      },
      required: ['id','key','label'],
    },
  },
  {
    name: 'ask_pain_scale',
    description: 'Stelt een pijnschaal vraag (0-10).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        key: { type: Type.STRING },
        label: { type: Type.STRING },
        min: { type: Type.NUMBER },
        max: { type: Type.NUMBER },
        anchors: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['id','key','label'],
    },
  },
  {
    name: 'summarize',
    description: 'Maakt een NL samenvatting van de intake en levert gestructureerde velden.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportText: { type: Type.STRING, description: 'Korte NL rapportage (1-3 alinea\'s).'},
        highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
        redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
        missingEssentials: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['reportText'],
    },
  },
// Cast to SDK type to satisfy structural typing without verbose schemas in-code
] as unknown as FunctionDeclaration[];

export interface OrchestratorInitOptions {
  ky: string; // client-side for now
  model?: string; // default gemini-2.5-flash
}

export class AgentOrchestrator {
  private ai: GoogleGenAI;
  private model: string;

  constructor(opts: OrchestratorInitOptions) {
  this.ai = new GoogleGenAI({ apiKey: opts.ky });
    this.model = opts.model || 'gemini-2.5-flash';
  }

  getSystemMessage(): AgentMessage {
    return { role: 'system', content: SYSTEM_PROMPT, timestamp: new Date().toISOString() };
  }

  async next(
  messages: AgentMessage[],
  _answers: Record<string, unknown>,
    patience: Patience,
    opts?: { forceSummarize?: boolean; extraNote?: string }
  ): Promise<AgentOutcome> {
  // Build a readable transcript of all Q&A (with optional notes), like the logbook view
  const patienceLine = `Patience: mode=${patience.mode}, budget=${patience.budget}, asked=${patience.asked}, wrapUp=${patience.wrapUp}`;
  const forceLine = opts?.forceSummarize ? 'forceSummarize=true' : '';
  const transcript = buildTranscript(messages);
  const content = `${patienceLine}\n${forceLine}\n\nGesprekslog (vragen en antwoorden):\n${transcript}`;

  const raw = await this.ai.models.generateContent({
      model: this.model,
      contents: `${SYSTEM_PROMPT}\n\n${content}`,
      config: {
        tools: [{ functionDeclarations }],
      },
  });
  const response = raw as unknown as { functionCalls?: Array<{ name: ToolName; args: ToolArgs }>; text?: string };

  const fc = response.functionCalls as Array<{ name: ToolName; args: ToolArgs }> | undefined;
    if (fc && fc.length > 0) {
      const first = fc[0];
      if (first.name === 'summarize') {
        const args = first.args as unknown as { reportText: string; highlights?: string[]; redFlags?: string[]; missingEssentials?: string[] };
        return {
          type: 'summary',
          summary: {
            reportText: args.reportText,
            highlights: args.highlights ?? [],
            redFlags: args.redFlags ?? [],
            missingEssentials: args.missingEssentials ?? [],
          },
        } as AgentOutcome;
      }
      const toolCall: ToolCall = { name: first.name, args: first.args } as ToolCall;
      return { type: 'question', toolCall } as AgentOutcome;
    }

  // No function call -> consider it ended to avoid showing raw trace text

    return { type: 'ended', reason: 'Geen output.' } as AgentOutcome;
  }

  // Generate a plausible answer for the current tool-call using the LLM
  async proposeAnswer(toolCall: ToolCall, messages: AgentMessage[], answers: Record<string, unknown>): Promise<{ value: AnswerValue; note?: string }> {
    const transcript = buildTranscript(messages);
    const args = toolCall.args as ToolArgs;
    const guide = `Je simuleert een cliënt die intakevragen beantwoordt. Geef een realistisch en consistent antwoord als JSON.
Antwoord ALLEEN met JSON (geen uitleg), volgens:
{ "value": <waarde>, "note"?: <korte toelichting> }
Type regels:
- ask_yesno: value is boolean
- ask_select: value is string uit opties (of "unknown" indien allowUnknown passend)
- ask_multiselect: value is array van strings uit opties (of ["unknown"]) 
- ask_number: value is number binnen min/max (indien gegeven)
- ask_pain_scale: value is integer tussen min/max (default 0..10)
- ask_text: value is korte string (max 140)
Wees consistent met eerdere antwoorden.`;
    const payload = `${guide}\n\nVraag (tool):\n${JSON.stringify({ name: toolCall.name, args }, null, 2)}\n\nBekende antwoorden:\n${JSON.stringify(answers, null, 2)}\n\nLogboek tot nu (Q/A):\n${transcript}`;
    const raw = await this.ai.models.generateContent({ model: this.model, contents: payload });
    const text = (raw as unknown as { text?: string }).text ?? '';
    const parsed = extractFirstJson<{ value: AnswerValue; note?: string }>(text);
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) {
      const fb = fallbackAnswer(toolCall);
      return { value: fb.value as AnswerValue, note: fb.note };
    }
    return parsed;
  }

  // Run the full flow automatically: keep asking next and answer via LLM until summary/ended
  async autoComplete(
    init: { messages: AgentMessage[]; answers: Record<string, AnswerValue>; patience: Patience },
    opts?: { maxSteps?: number }
  ): Promise<AgentState> {
    const maxSteps = opts?.maxSteps ?? 200;
    let messages = [...init.messages];
    let answers = { ...init.answers } as Record<string, AnswerValue>;
    let patience = { ...init.patience } as Patience;
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    for (let step = 0; step < maxSteps; step++) {
      const outcome = await this.next(messages, answers, patience, patience.asked >= patience.budget || patience.wrapUp ? { forceSummarize: true } : undefined);
      if (outcome.type === 'question') {
        const toolCall = outcome.toolCall;
        const askMsg: AgentMessage = { role: 'assistant', toolCall, timestamp: new Date().toISOString() };
        messages = [...messages, askMsg];
    // Rate limiting: wait 5s before generating each new answer
    console.log("Next questions, sleeping 5secs");
    await sleep(5000);
        const { value, note } = await this.proposeAnswer(toolCall, messages, answers);
        // Build tool result
        const { id, key } = toolCall.args as ToolArgs;
        const answeredAt = new Date().toISOString();
        const toolMsg: AgentMessage = {
          role: 'tool',
          toolResult: { id, key, value, askedAt: askMsg.timestamp, answeredAt, notes: note },
          timestamp: answeredAt,
        };
        messages = [...messages, toolMsg];
        answers = { ...answers, [key]: value, ...(note ? { [`${key}.extra_note`]: note } : {}) };
        patience = { ...patience, asked: patience.asked + 1 };
        continue;
      }
      // summary or ended
      return { messages, answers, patience, outcome } as AgentState;
    }
    return { messages, answers, patience, outcome: { type: 'ended', reason: 'Max steps reached' } } as AgentState;
  }
}

// Format a transcript from the message history, pairing each assistant toolCall
// with its corresponding toolResult answer. Includes optional notes.
function buildTranscript(messages: AgentMessage[]): string {
  const lines: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && m.toolCall) {
      const args = m.toolCall.args as unknown as { id: string; label?: string };
      const qLabel = args?.label || m.toolCall.name;
      const answerMsg = messages.find(mm => mm.role === 'tool' && mm.toolResult && mm.toolResult.id === args.id);
      const val = answerMsg?.toolResult?.value as unknown;
      const notes = answerMsg?.toolResult?.notes;
      const formattedValue = formatValue(val);
      lines.push(`- Vraag: ${qLabel}`);
      lines.push(`  Antwoord: ${formattedValue}`);
      if (notes && String(notes).trim() !== '') {
        lines.push(`  Opmerking: ${notes}`);
      }
    }
  }
  return lines.join('\n');
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nee';
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}

// (Answers map remains available in UI state; transcript is derived from messages.)

// Extract JSON helper
function extractFirstJson<T>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(body.slice(start, end + 1)) as T; } catch { return null; }
}

function fallbackAnswer(toolCall: ToolCall): { value: unknown; note?: string } {
  const args = toolCall.args as ToolArgs;
  switch (toolCall.name) {
    case 'ask_yesno':
      return { value: true };
    case 'ask_select': {
      const sel = args as SelectArgs;
      const opts = sel.options ?? [];
      return { value: opts[0]?.value ?? (sel.allowUnknown ? 'unknown' : '') };
    }
    case 'ask_multiselect': {
      const mul = args as MultiSelectArgs;
      const opts = mul.options ?? [];
      return { value: opts.length ? [opts[0].value] : (mul.allowUnknown ? ['unknown'] : []) };
    }
    case 'ask_number':
    case 'ask_pain_scale': {
      const num = (toolCall.name === 'ask_number' ? (args as NumberArgs) : (args as PainScaleArgs));
      const min = typeof num.min === 'number' ? num.min : 0;
      const max = typeof num.max === 'number' ? num.max : 10;
      return { value: Math.round((min + max) / 2) };
    }
    case 'ask_text':
      return { value: 'n.v.t.' };
    default:
      return { value: '' };
  }
}
