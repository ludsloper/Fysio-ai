import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TextInputQuestion, NumberInputQuestion, SelectQuestion, MultiSelectQuestion, YesNoQuestion, PainScale } from '@/components';
import { AgentOrchestrator } from '@/lib/agentOrchestrator';
import type { AgentMessage, AgentState, AnswerValue, PatienceMode, Patience } from '@/types/agent';

type Props = {
  ky: string;
};

function nowISO() { return new Date().toISOString(); }

// export function fileDownload(name: string, data: unknown) {
//   const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.href = url; a.download = name; a.click();
//   URL.revokeObjectURL(url);
// }

export default function QuestionsView({ ky }: Props) {
  const [patienceMode, setPatienceMode] = useState<PatienceMode>('normal');
  const budgets = { short: 8, normal: 15, deep: 25 } as const;
  const [state, setState] = useState<AgentState>(() => ({
    messages: [],
    answers: {},
    patience: { mode: 'normal', budget: budgets['normal'], asked: 0, wrapUp: false },
  }));
  const [currentAnswer, setCurrentAnswer] = useState<AnswerValue | ''>('');
  const [extraNote, setExtraNote] = useState<string>('');
  const [showLog, setShowLog] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const orchestratorRef = useRef<AgentOrchestrator | null>(null);

  useEffect(() => {
    const orch = new AgentOrchestrator({ ky, model: 'gemini-2.5-flash' });
    orchestratorRef.current = orch;
    const sys = orch.getSystemMessage();
    const initMessages: AgentMessage[] = [sys];
    const initPatience: Patience = { mode: 'normal', budget: budgets['normal'], asked: 0, wrapUp: false };
    const initState: AgentState = { messages: initMessages, answers: {}, patience: initPatience };
    setState(initState);
    // Kick off first question with explicit state
    void askNext({ messages: initMessages, answers: {}, patience: initPatience });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ky]);

  useEffect(() => {
    setState(s => ({ ...s, patience: { ...s.patience, mode: patienceMode, budget: budgets[patienceMode] } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patienceMode]);

  function persist() {
    localStorage.setItem('intake_state', JSON.stringify(state));
  }

  // function maybeAutoDownload(outcome?: AgentOutcome) {
  //   if (!outcome) return;
  //   if (outcome.type === 'summary' || outcome.type === 'ended') {
  //     const payload = { ...state, outcome, finishedAt: nowISO() };
  //     fileDownload(`intake_${Date.now()}.json`, payload);
  //   }
  // }

  async function askNext(payload?: { messages: AgentMessage[]; answers: Record<string, AnswerValue>; patience: Patience }, opts?: { forceSummarize?: boolean }) {
    const orch = orchestratorRef.current!;
    setLoading(true);
    try {
      const msgs = payload?.messages ?? state.messages;
      const ans = (payload?.answers as Record<string, unknown>) ?? state.answers;
      const pat = payload?.patience ?? state.patience;
  const outcome = await orch.next(msgs, ans, pat, opts);
      if (outcome.type === 'question') {
        const toolCall = outcome.toolCall;
        const msg: AgentMessage = { role: 'assistant', toolCall, timestamp: nowISO() };
        setState(s => ({ ...s, messages: [...(payload?.messages ?? s.messages), msg], outcome }));
        setCurrentAnswer('');
        setExtraNote('');
      } else {
        setState(s => ({ ...(payload ? { ...s, ...payload } : s), outcome }));
        persist();
        // maybeAutoDownload(outcome);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleWrapUp() {
    // If there's a current question and an extra note, persist it as a tool result so it appears in the log/JSON
    let nextMessages = state.messages;
    const last = [...state.messages].reverse().find(m => m.role === 'assistant' && m.toolCall);
    const note = extraNote.trim();
    if (last?.toolCall && note !== '') {
      const { args } = last.toolCall;
      const keyed = args as { id: string; key: string };
      const answeredAt = nowISO();
      const toolMsg: AgentMessage = {
        role: 'tool',
        toolResult: { id: keyed.id, key: keyed.key, value: currentAnswer as AnswerValue, askedAt: last.timestamp, answeredAt, notes: note },
        timestamp: answeredAt,
      };
      nextMessages = [...state.messages, toolMsg];
    }
    // Also add dotted note key to answers so it appears in the single answers JSON
    const nextAnswers = (() => {
      if (last?.toolCall && note !== '') {
        const toolArgs = last.toolCall.args as unknown as { id: string; key: string };
        return { ...state.answers, [`${toolArgs.key}.extra_note`]: note } as Record<string, AnswerValue>;
      }
      return state.answers;
    })();
    const next = { ...state, messages: nextMessages, answers: nextAnswers, patience: { ...state.patience, wrapUp: true } };
    setState(next);
    // Force immediate summarize on next turn
    void askNext({ messages: next.messages, answers: next.answers, patience: next.patience }, { forceSummarize: true });
  }

  function setAnswerForKey(_key: string, value: AnswerValue) {
    setCurrentAnswer(value);
  }

  async function submitAnswer() {
    const last = [...state.messages].reverse().find(m => m.role === 'assistant' && m.toolCall);
    if (!last?.toolCall) return;
    const { args } = last.toolCall;
    const answeredAt = nowISO();
    const askedAt = last.timestamp;
  const keyed = args as { id: string; key: string };
  const key = keyed.key;
  const note = extraNote.trim();
  const result = { id: keyed.id, key, value: currentAnswer, askedAt, answeredAt, notes: note !== '' ? note : undefined };

    const toolMsg: AgentMessage = { role: 'tool', toolResult: result, timestamp: answeredAt };
    const nextAsked = state.patience.asked + 1;
    const nextState: AgentState = {
      ...state,
      messages: [...state.messages, toolMsg],
  answers: { ...state.answers, [key]: currentAnswer, ...(note !== '' ? { [`${key}.extra_note`]: note } : {}) },
      patience: { ...state.patience, asked: nextAsked },
    };
  setState(nextState);
  persist();
  await askNext({ messages: nextState.messages, answers: nextState.answers, patience: nextState.patience });
  }

  const currentTool = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === 'assistant' && m.toolCall) return m.toolCall;
    }
    return undefined as undefined | NonNullable<AgentMessage['toolCall']>;
  }, [state.messages]);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Label>Aantal vragen</Label>
          <Select value={patienceMode} onValueChange={(v) => setPatienceMode(v as PatienceMode)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Normaal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Kort (±8)</SelectItem>
              <SelectItem value="normal">Normaal (±15)</SelectItem>
              <SelectItem value="deep">Diep (±25)</SelectItem>
            </SelectContent>
          </Select>
          {/* <Button variant="outline" onClick={handleWrapUp}>Minder vragen</Button> */}
          <Button variant="outline" onClick={() => setShowLog(v => !v)}>{showLog ? 'Verberg log' : 'Toon log'}</Button>
          {/* <Button variant="outline" onClick={() => fileDownload(`intake_snapshot_${Date.now()}.json`, state)} title="Download log">
            <Download className="h-4 w-4 mr-2"/> Export
          </Button> */}
        </div>
        <div className="text-xs text-muted-foreground">Vragen gesteld: {state.patience.asked} (richtlijn: ±{state.patience.budget}) {state.patience.wrapUp && '· afronden gewenst'}</div>
      </Card>

      {currentTool && (
        <Card className="p-4 space-y-4">
          <fieldset disabled={loading} className={loading ? 'opacity-60 pointer-events-none space-y-4' : 'space-y-4'}>
            {renderTool(currentTool, currentAnswer, setAnswerForKey)}
            <div className="space-y-1">
              <Label htmlFor="extra-note" className="text-xs text-muted-foreground">Extra opmerkingen (optioneel)</Label>
              <textarea
                id="extra-note"
                className="w-full min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                placeholder="Bijv. context, specifieke zorgen, of iets dat je niet kwijt kon in de vorige vraag"
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button id="submit-next" onClick={submitAnswer} disabled={loading || (currentTool.name === 'ask_text' && typeof currentAnswer === 'string' && currentAnswer.trim() === '')}>
                {loading && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent mr-2" />}
                Volgende
              </Button>
              <Button variant="outline" onClick={handleWrapUp} disabled={loading}>Afronden</Button>
            </div>
          </fieldset>
        </Card>
      )}

      {!currentTool && loading && (
        <Card className="p-4 flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">De assistent is aan het nadenken…</span>
        </Card>
      )}

      {state.outcome?.type === 'summary' && (
        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Samenvatting</h2>
          <p className="whitespace-pre-wrap text-sm">{state.outcome.summary.reportText}</p>
        </Card>
      )}

      {showLog && (
        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Vragen & Antwoorden Logboek</h2>
      <div className="space-y-2 text-sm">
            {state.messages.filter(m => m.role === 'assistant' && m.toolCall).map((m, idx) => {
              const call = m.toolCall!;
              const args = call.args as unknown as { id: string; label?: string };
              const label = args.label || call.name;
              const answerMsg = state.messages.find(mm => mm.role === 'tool' && mm.toolResult && mm.toolResult.id === args.id);
              const value = answerMsg?.toolResult?.value;
        const notes = answerMsg?.toolResult?.notes;
              const formatted = Array.isArray(value)
                ? (value as string[]).join(', ')
                : typeof value === 'boolean'
                  ? (value ? 'Ja' : 'Nee')
                  : value ?? '—';
              return (
                <div key={`${args.id}-${idx}`} className="border-b border-border pb-2 last:border-b-0">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-medium">{String(formatted)}</div>
          {notes && <div className="text-xs text-muted-foreground mt-1">Opmerking: {notes}</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

import type { ToolCall } from '@/types/agent';

function renderTool(tool: ToolCall, current: AnswerValue | '', setAnswerForKey: (key: string, value: AnswerValue) => void) {
  const args = (tool.args as unknown) as { key: string; label: string; options?: Array<{ value: string; label: string }>; allowUnknown?: boolean; min?: number; max?: number; anchors?: [string, string] };
  const key: string = args.key;
  switch (tool.name) {
    case 'ask_yesno':
      return (
  <YesNoQuestion label={args.label} value={typeof current === 'boolean' ? current : null} onChange={(v) => { setAnswerForKey(key, v); }} />
      );
    case 'ask_select': {
      const options = args.options as Array<{ value: string; label: string }>;
      const extended = args.allowUnknown ? [...options, { value: 'unknown', label: 'Weet ik niet / N.v.t.' }] : options;
      return (
  <SelectQuestion label={args.label} value={typeof current === 'string' ? current : ''} onChange={(v) => { setAnswerForKey(key, v); }} options={extended} />
      );
    }
    case 'ask_multiselect': {
      const options = args.options as Array<{ value: string; label: string }>;
      const extended = args.allowUnknown ? [...options, { value: 'unknown', label: 'Weet ik niet / N.v.t.' }] : options;
      return (
  <MultiSelectQuestion label={args.label} values={Array.isArray(current) ? current as string[] : []} onChange={(v) => { setAnswerForKey(key, v); }} options={extended} />
      );
    }
    case 'ask_number':
      return (
        <NumberInputQuestion label={args.label} value={typeof current === 'number' ? current : ''} onChange={(v) => setAnswerForKey(key, v as number | '')} />
      );
    case 'ask_text':
      return (
  <TextInputQuestion label={args.label} value={typeof current === 'string' ? current : ''} onChange={(v) => setAnswerForKey(key, v)} onEnter={(val) => { setAnswerForKey(key, val);const btn = document.getElementById('submit-next'); btn?.click(); }} />
      );
    case 'ask_pain_scale':
      return (
        <PainScale label={args.label} value={typeof current === 'number' ? current : 0} onChange={(v) => setAnswerForKey(key, v)} min={args.min ?? 0} max={args.max ?? 10} anchors={args.anchors ?? ['geen', 'ergst']} />
      );
    default:
      return <div>Onbekende tool: {tool.name}</div>;
  }
}
