import { StepEvent } from './chat';

export interface TraceSummary {
  nodeName: string;
  badge: string;
  badgeColor: string;
  summaryText: string;
  rawDetail: any;
}

export interface AgentStepTraceProps {
  steps: StepEvent[];
  isStreaming?: boolean;
}
