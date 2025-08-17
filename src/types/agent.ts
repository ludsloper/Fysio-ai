// Types for the agentic intake flow and tool-calls

export type PatienceMode = "short" | "normal" | "deep";

export interface Patience {
  mode: PatienceMode;
  budget: number; // max questions to ask
  asked: number; // count of tool questions already asked
  wrapUp: boolean; // user requested fewer questions / finish soon
}

export type ToolName =
  | "ask_yesno"
  | "ask_select"
  | "ask_multiselect"
  | "ask_number"
  | "ask_text"
  | "ask_pain_scale"
  | "summarize";

export interface BaseToolArgs {
  id: string; // unique per question turn
  key: string; // dot-notated storage key for answers map, e.g., "pain.severity"
  label: string;
  helpText?: string;
}

export type YesNoArgs = BaseToolArgs;

export interface SelectOption { value: string; label: string }

export interface SelectArgs extends BaseToolArgs {
  options: SelectOption[];
  placeholder?: string;
  allowUnknown?: boolean; // if true, include "Weet ik niet / N.v.t."
}

export interface MultiSelectArgs extends BaseToolArgs {
  options: SelectOption[];
  allowUnknown?: boolean;
}

export interface NumberArgs extends BaseToolArgs {
  min?: number;
  max?: number;
  unit?: string;
}

export interface TextArgs extends BaseToolArgs {
  placeholder?: string;
  maxLen?: number;
}

export interface PainScaleArgs extends BaseToolArgs {
  min?: number; // default 0
  max?: number; // default 10
  anchors?: [string, string]; // labels for extremes
}

export type ToolArgs =
  | YesNoArgs
  | SelectArgs
  | MultiSelectArgs
  | NumberArgs
  | TextArgs
  | PainScaleArgs;

export interface ToolCall {
  name: ToolName;
  args: ToolArgs;
}

export type AnswerValue = string | number | boolean | string[];

export interface ToolResult {
  id: string;
  key: string;
  value: AnswerValue;
  askedAt: string; // ISO
  answeredAt: string; // ISO
  notes?: string; // optional extra remarks from the user for this Q/A
}

export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentMessageRole;
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: string; // ISO
}

export interface SummaryOutput {
  reportText: string;
  highlights: string[];
  redFlags: string[];
  missingEssentials: string[];
}

export type AgentOutcome =
  | { type: "question"; toolCall: ToolCall }
  | { type: "summary"; summary: SummaryOutput }
  | { type: "ended"; reason?: string };

export interface AgentState {
  messages: AgentMessage[];
  answers: Record<string, AnswerValue>;
  patience: Patience;
  outcome?: AgentOutcome;
}
