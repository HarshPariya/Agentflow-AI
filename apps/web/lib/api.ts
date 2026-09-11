import { StepEvent, ConversationItem, FullConversationResponse, UserProfile } from '../types/chat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface StreamChatOptions {
  conversationId: string | null;
  message: string;
  attachedDoc?: string | null;
  userId?: string | null;
  userName?: string | null;
  onStep: (step: StepEvent) => void;
  onFinal: (content: string, sources: string[], tools: string[], conversationId?: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export async function uploadDocumentToRAG(file: File): Promise<{
  status: string;
  filename: string;
  docId: string;
  chunks_indexed: number;
  message: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE_URL}/rag/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload document: ${response.statusText}`);
  }
  return await response.json();
}

export async function streamChatQuery({
  conversationId,
  message,
  attachedDoc,
  userId,
  userName,
  onStep,
  onFinal,
  onError,
  onComplete,
}: StreamChatOptions): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message: message,
        attached_doc: attachedDoc || undefined,
        user_id: userId || 'user-default',
        user_name: userName || 'Enterprise Admin',
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported by response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const event: StepEvent = JSON.parse(jsonStr);
            if (event.type === 'step') {
              onStep(event);
            } else if (event.type === 'final') {
              onFinal(
                event.content || '',
                event.sources_used || [],
                event.tools_used || [],
                (event as any).conversation_id
              );
            }
          } catch (err) {
            console.error('Error parsing SSE event chunk:', err, jsonStr);
          }
        }
      }
    }

    onComplete();
  } catch (error: any) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchHealthStatus(): Promise<{
  status: string;
  db: string;
  redis: string;
  vector_store: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return await res.json();
  } catch (err) {
    return {
      status: 'error',
      db: 'offline',
      redis: 'offline',
      vector_store: 'offline',
    };
  }
}

export async function fetchConversations(userId?: string): Promise<ConversationItem[]> {
  try {
    const url = userId ? `${API_BASE_URL}/conversations?user_id=${encodeURIComponent(userId)}` : `${API_BASE_URL}/conversations`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return [];
  }
}

export async function fetchConversationDetail(conversationId: string): Promise<FullConversationResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Error fetching conversation detail:', err);
    return null;
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('Error deleting conversation:', err);
    return false;
  }
}

export async function syncUserProfile(profile: UserProfile): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || profile;
  } catch (err) {
    console.error('Error syncing user profile:', err);
    return null;
  }
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/user/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return null;
  }
}
