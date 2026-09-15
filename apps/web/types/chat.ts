export type Role = 'user' | 'assistant' | 'system';

export interface PlanStepDetail {
  decision: 'retrieve_only' | 'tool_only' | 'retrieve_and_tool' | 'answer_directly' | 'insufficient_info' | string;
  reasoning: string;
}

export interface RetrievalChunk {
  docId: string;
  text: string;
  score: number;
}

export interface RetrievalStepDetail {
  query: string;
  chunks: RetrievalChunk[];
}

export interface ToolCallStepDetail {
  tool: string;
  input: Record<string, any>;
  output: Record<string, any>;
}

export interface ClarifyStepDetail {
  reason: string;
  question_asked: string;
}

export interface StepEvent {
  type: 'step' | 'final';
  step?: 'plan' | 'retrieval' | 'tool_call' | 'clarify';
  detail?: PlanStepDetail | RetrievalStepDetail | ToolCallStepDetail | ClarifyStepDetail | any;
  content?: string;
  sources_used?: string[];
  tools_used?: string[];
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  steps?: StepEvent[];
  sources_used?: string[];
  tools_used?: string[];
  needsClarification?: boolean;
  isConfirmationPrompt?: boolean;
  isStreaming?: boolean;
}

export interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  department?: string;
}

export interface ConversationItem {
  id: string;
  user_id: string;
  title: string;
  last_message?: string;
  message_count: number;
  attached_doc?: string;
  created_at: string;
  updated_at: string;
}

export interface FullConversationResponse {
  conversation: ConversationItem;
  messages: Array<{
    id: string;
    conversation_id: string;
    user_id: string;
    role: Role;
    content: string;
    sources_used?: string[];
    tools_used?: string[];
    attached_doc?: string;
    created_at: string;
  }>;
  steps: Array<{
    step_type: string;
    step_detail: any;
    created_at: string;
  }>;
}
