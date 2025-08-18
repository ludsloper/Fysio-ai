import { GoogleGenAI, Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import type { AgentMessage, AgentOutcome, Patience, ToolCall, ToolName, ToolArgs } from '@/types/agent';

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
