import { ConversationItem, Message, StepEvent } from '../types/chat';

const SESSIONS_KEY = 'agentflow_sessions_v1';
const CONV_PREFIX = 'agentflow_conv_v1_';

export function getLocalSessions(): ConversationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Error reading local sessions:', e);
    return [];
  }
}

export function saveLocalSession(item: ConversationItem): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalSessions();
    const existingIndex = current.findIndex((c) => c.id === item.id);
    let updated: ConversationItem[];
    if (existingIndex >= 0) {
      updated = [
        item,
        ...current.filter((c) => c.id !== item.id)
      ];
    } else {
      updated = [item, ...current];
    }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated.slice(0, 50)));
  } catch (e) {
    console.warn('Error saving local session:', e);
  }
}

export function saveLocalConversationData(
  convId: string,
  data: {
    conversation?: any;
    messages: Message[];
    steps?: any[];
    attachedDoc?: any;
  }
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONV_PREFIX + convId, JSON.stringify(data));
  } catch (e) {
    console.warn('Error saving conversation detail:', e);
  }
}

export function getLocalConversationData(convId: string): {
  conversation?: any;
  messages: Message[];
  steps?: any[];
  attachedDoc?: any;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONV_PREFIX + convId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Error loading local conversation detail:', e);
    return null;
  }
}

export function deleteLocalSession(convId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalSessions();
    const updated = current.filter((c) => c.id !== convId);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    localStorage.removeItem(CONV_PREFIX + convId);
  } catch (e) {
    console.warn('Error deleting local session:', e);
  }
}
