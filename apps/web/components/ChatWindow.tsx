'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Message, StepEvent, UserProfile, ConversationItem } from '../types/chat';
import MessageBubble from './MessageBubble';
import HistoryView from './HistoryView';
import {
  streamChatQuery,
  fetchHealthStatus,
  uploadDocumentToRAG,
  fetchConversations,
  fetchConversationDetail,
} from '../lib/api';
import {
  getLocalSessions,
  saveLocalSession,
  getLocalConversationData,
  saveLocalConversationData
} from '../lib/storage';

const STARTER_PROMPTS = [
  {
    icon: '📦',
    title: 'Order Status & Returns',
    subtitle: 'Check order #4521 status and return eligibility against policies',
    prompt: "What's our refund policy, and is order 4521 eligible?",
    badge: 'Order + Policy'
  },
  {
    icon: '🔍',
    title: 'Support Ticket Lookup',
    subtitle: 'Check assignee, current status, and updates for ticket TIK-101',
    prompt: 'Check status of support ticket TIK-101',
    badge: 'Live MCP'
  },
  {
    icon: '🎫',
    title: 'Open Priority Ticket',
    subtitle: 'Create a high-priority support ticket with safety confirmation',
    prompt: 'Create an urgent ticket for database server outage',
    badge: 'Guardrail'
  },
  {
    icon: '📋',
    title: 'Company Policy Search',
    subtitle: 'Instant answers for return windows, shipping SLAs, or warranty',
    prompt: 'What is our refund and return window policy?',
    badge: 'Knowledge Base'
  }
];

const DEFAULT_USER: UserProfile = {
  user_id: 'user-default',
  name: 'Enterprise Operator',
  email: 'operator@agentflow.internal',
  role: 'Enterprise Admin',
  department: 'Operations'
};

interface ChatWindowProps {
  initialView?: 'chat' | 'history';
}

export default function ChatWindow({ initialView = 'chat' }: ChatWindowProps) {
  const [currentView, setCurrentView] = useState<'chat' | 'history'>(initialView);
  const [currentUser] = useState<UserProfile>(DEFAULT_USER);
  const [recentSessions, setRecentSessions] = useState<ConversationItem[]>(() => getLocalSessions().slice(0, 10));
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<{ name: string; chunks: number; docId: string } | null>(null);
  const [health, setHealth] = useState<{ status: string; db: string; redis: string; vector_store: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize status & clear legacy local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('agentflow_user');
    }

    fetchHealthStatus().then(setHealth);
    const interval = setInterval(() => {
      fetchHealthStatus().then(setHealth);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent conversation history (Local storage first, then backend sync)
  const loadSessions = async () => {
    const local = getLocalSessions();
    if (local.length > 0) {
      setRecentSessions(local.slice(0, 10));
    }
    try {
      const timeoutFallback = new Promise<ConversationItem[]>((resolve) =>
        setTimeout(() => resolve([]), 2500)
      );
      const data = await Promise.race([
        fetchConversations(currentUser.user_id),
        timeoutFallback
      ]);

      if (data && data.length > 0) {
        const seen = new Set<string>();
        const merged: ConversationItem[] = [];
        for (const item of [...data, ...local]) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
            saveLocalSession(item);
          }
        }
        setRecentSessions(merged.slice(0, 10));
      }
    } catch (e) {
      console.warn('Conversations load notice:', e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, currentView]);

  const handleNewConversation = () => {
    const newConvId = `conv-${Date.now()}`;
    setConversationId(newConvId);
    setAttachedDoc(null);
    setCurrentView('chat');
    setMessages([]);
    setInputMessage('');
    if (isMobile) setSidebarOpen(false);
  };

  const handleSelectConversation = async (convId: string) => {
    setIsLoading(true);
    setConversationId(convId);
    setCurrentView('chat');
    if (isMobile) setSidebarOpen(false);

    // 1. Instant local restore (0ms delay)
    const localData = getLocalConversationData(convId);
    if (localData && localData.messages && localData.messages.length > 0) {
      setMessages(localData.messages);
      if (localData.attachedDoc) setAttachedDoc(localData.attachedDoc);
      setIsLoading(false);
    }

    try {
      const detail = await fetchConversationDetail(convId);
      if (detail && detail.messages && detail.messages.length > 0) {
        const loaded: Message[] = detail.messages.map((m: any) => ({
          id: m.id || `msg-${Math.random()}`,
          role: m.role,
          content: m.content || '',
          createdAt: m.created_at || new Date().toISOString(),
          sources_used: m.sources_used || [],
          tools_used: m.tools_used || [],
          steps: m.role === 'assistant' ? detail.steps?.map((st: any) => ({
            type: 'step',
            step: st.step_type,
            detail: st.step_detail
          })) : undefined
        }));
        setMessages(loaded);

        // Restore attached document context if this conversation had one
        const activeDoc = detail.conversation?.attached_doc ||
          detail.messages.find((m: any) => m.attached_doc)?.attached_doc;
        if (activeDoc) {
          setAttachedDoc({ name: activeDoc, chunks: 1, docId: activeDoc.replace(/\.[^/.]+$/, "") });
        } else if (!localData?.attachedDoc) {
          setAttachedDoc(null);
        }

        saveLocalConversationData(convId, {
          conversation: detail.conversation,
          messages: loaded,
          steps: detail.steps,
          attachedDoc: activeDoc ? { name: activeDoc, chunks: 1, docId: activeDoc.replace(/\.[^/.]+$/, "") } : null
        });
      } else if (!localData) {
        setMessages([]);
        setAttachedDoc(null);
      }
    } catch (err) {
      console.warn('Backend conversation detail notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    try {
      const res = await uploadDocumentToRAG(file);
      setAttachedDoc({ name: file.name, chunks: res.chunks_indexed, docId: res.docId });

      setMessages((prev) => [
        ...prev,
        {
          id: `upload-${Date.now()}`,
          role: 'assistant',
          content: `📄 **Document Attached & Indexed**\n\n**${file.name}** has been processed into the knowledge base (${res.chunks_indexed} chunks).\n\nYou can now ask questions about this document.`,
          createdAt: new Date().toISOString()
        }
      ]);
    } catch (err: any) {
      alert(`Error uploading document: ${err.message}`);
    } finally {
      setIsUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    if (currentView !== 'chat') {
      setCurrentView('chat');
    }

    setInputMessage('');

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: query,
      createdAt: new Date().toISOString()
    };

    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      steps: [],
      isStreaming: true
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsLoading(true);

    // Save session item to local storage immediately so sidebar updates at 0ms
    const immediateSessionItem: ConversationItem = {
      id: conversationId,
      user_id: currentUser.user_id,
      title: query.length > 35 ? query.slice(0, 35) + '...' : query,
      last_message: query,
      message_count: messages.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attached_doc: attachedDoc?.name
    };
    saveLocalSession(immediateSessionItem);
    setRecentSessions((prev) => [immediateSessionItem, ...prev.filter((s) => s.id !== conversationId)].slice(0, 10));
    saveLocalConversationData(conversationId, {
      conversation: immediateSessionItem,
      messages: [...messages, userMessage],
      attachedDoc: attachedDoc
    });

    const activeSteps: StepEvent[] = [];

    await streamChatQuery({
      conversationId,
      message: query,
      attachedDoc: attachedDoc?.name || attachedDoc?.docId || null,
      userId: currentUser.user_id,
      userName: currentUser.name,
      onStep: (stepEvent: StepEvent) => {
        activeSteps.push(stepEvent);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === assistantMsgId) {
              return {
                ...msg,
                content: stepEvent.step === 'clarify' ? (stepEvent.detail?.question_asked || msg.content) : msg.content,
                steps: [...activeSteps],
                needsClarification: stepEvent.step === 'clarify'
              };
            }
            return msg;
          })
        );
      },
      onFinal: (finalContent: string, sources: string[], tools: string[], serverConvId?: string) => {
        const targetConvId = serverConvId || conversationId;
        if (serverConvId) {
          setConversationId(serverConvId);
        }
        const finalAsstMessage: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: finalContent,
          createdAt: new Date().toISOString(),
          sources_used: sources,
          tools_used: tools,
          steps: [...activeSteps],
          isStreaming: false,
          needsClarification: finalContent.toLowerCase().includes('could you') || finalContent.toLowerCase().includes('please provide')
        };

        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantMsgId ? finalAsstMessage : msg))
        );

        // Update local session with final response
        const updatedSessionItem: ConversationItem = {
          id: targetConvId,
          user_id: currentUser.user_id,
          title: query.length > 35 ? query.slice(0, 35) + '...' : query,
          last_message: finalContent.length > 70 ? finalContent.slice(0, 70) + '...' : finalContent,
          message_count: messages.length + 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          attached_doc: attachedDoc?.name
        };
        saveLocalSession(updatedSessionItem);
        setRecentSessions((prev) => [updatedSessionItem, ...prev.filter((s) => s.id !== targetConvId)].slice(0, 10));
        saveLocalConversationData(targetConvId, {
          conversation: updatedSessionItem,
          messages: [...messages, userMessage, finalAsstMessage],
          steps: [...activeSteps],
          attachedDoc: attachedDoc
        });

        loadSessions();
      },
      onError: (err: Error) => {
        setIsLoading(false);
        const isFetchError = !err.message || err.message.toLowerCase().includes('failed to fetch');
        const errorMessage = isFetchError
          ? `⚠️ **Backend Gateway Offline**: Unable to reach the API server at \`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}\`.\n\n- **On Vercel**: Add **\`NEXT_PUBLIC_API_URL\`** in your Vercel Project Settings under Environment Variables with your deployed backend HTTPS URL.\n- **Local Dev**: Ensure your backend is running (\`npm run backend\`).`
          : `⚠️ **Service Notice**: ${err.message}`;
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === assistantMsgId) {
              return {
                ...msg,
                content: errorMessage,
                isStreaming: false
              };
            }
            return msg;
          })
        );
      },
      onComplete: () => {
        setIsLoading(false);
      }
    });
  };

  const handleConfirmAction = (confirmed: boolean) => {
    if (confirmed) {
      handleSend("yes, proceed and create the support ticket now");
    } else {
      handleSend("no, cancel the ticket request");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
      {/* Hidden File Input for PDF / Knowledge Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Mobile Drawer Backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 40,
            transition: 'opacity 0.2s ease'
          }}
        />
      )}

      {/* Clean, Modern Sidebar (Responsive Drawer on Mobile) */}
      <aside
        style={{
          position: isMobile ? 'fixed' : 'relative',
          top: 0,
          left: 0,
          bottom: 0,
          width: isMobile ? '280px' : (sidebarOpen ? '260px' : '0px'),
          minWidth: isMobile ? (sidebarOpen ? '280px' : '0px') : (sidebarOpen ? '260px' : '0px'),
          transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          height: '100%',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          zIndex: isMobile ? 50 : 30,
          boxShadow: sidebarOpen ? '4px 0 24px rgba(15, 23, 42, 0.12)' : 'none'
        }}
      >
        {/* Brand Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #1e40af, #2563eb)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3" />
                <circle cx="5" cy="19" r="3" />
                <circle cx="19" cy="19" r="3" />
                <path d="M12 8v4" />
                <path d="M7.5 17.5l3-3" />
                <path d="M16.5 17.5l-3-3" />
                <circle cx="12" cy="13" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Agentflow
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                Enterprise Assistant
              </div>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '15px',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Collapse Sidebar"
          >
            ✕
          </button>
        </div>

        {/* Primary New Chat Button */}
        <div style={{ padding: '14px 16px 8px 16px' }}>
          <button
            onClick={handleNewConversation}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #2563eb',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1d4ed8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
          >
            <span style={{ fontSize: '16px' }}>+</span>
            <span>New Chat</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ padding: '4px 16px', display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setCurrentView('chat')}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: currentView === 'chat' ? '#f1f5f9' : 'transparent',
              color: currentView === 'chat' ? '#0f172a' : '#64748b',
              fontWeight: currentView === 'chat' ? 700 : 500,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>💬</span>
            <span>Chat</span>
          </button>
          <button
            onClick={() => setCurrentView('history')}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: currentView === 'history' ? '#f1f5f9' : 'transparent',
              color: currentView === 'history' ? '#0f172a' : '#64748b',
              fontWeight: currentView === 'history' ? 700 : 500,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🕒</span>
            <span>History</span>
            {recentSessions.length > 0 && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '9999px',
                backgroundColor: '#e2e8f0',
                color: '#334155'
              }}>
                {recentSessions.length}
              </span>
            )}
          </button>
        </div>

        {/* Recent Conversations List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            padding: '0 4px'
          }}>
            Recent Chats
          </div>

          {recentSessions.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 6px', fontStyle: 'italic' }}>
              No recent conversations
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {recentSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectConversation(s.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: s.id === conversationId ? '#eff6ff' : 'transparent',
                    color: s.id === conversationId ? '#1d4ed8' : '#334155',
                    fontWeight: s.id === conversationId ? 600 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    if (s.id !== conversationId) e.currentTarget.style.backgroundColor = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (s.id !== conversationId) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '13px', opacity: 0.7 }}>💬</span>
                  <span style={{
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {s.title || 'Conversation'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clean Status Footer */}
        <div style={{
          padding: '14px 18px',
          borderTop: '1px solid #f1f5f9',
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#64748b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: health?.status === 'healthy' ? '#10b981' : '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)'
            }} />
            <span style={{ fontWeight: 600, color: '#334155' }}>Operational</span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>v1.0.0</span>
        </div>
      </aside>

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Top Minimal Navigation Bar */}
        <header
          className="responsive-header"
          style={{
            height: '56px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(isMobile || !sidebarOpen) && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '9px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)'
                }}
                title="Open Sidebar"
              >
                ☰
              </button>
            )}

            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
              {currentView === 'history' ? 'Conversation History' : 'Operations Copilot'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setCurrentView(currentView === 'chat' ? 'history' : 'chat')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
            >
              <span>{currentView === 'chat' ? '🕒 History' : '💬 Chat'}</span>
            </button>

            {currentView === 'chat' && messages.length > 0 && (
              <button
                onClick={handleNewConversation}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: '#64748b',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >
                New Chat
              </button>
            )}
          </div>
        </header>

        {/* View Switcher: History vs Chat */}
        {
          currentView === 'history' ? (
            <HistoryView
              userId={currentUser.user_id}
              onSelectConversation={handleSelectConversation}
              onNewChat={handleNewConversation}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)', overflow: 'hidden' }}>
              {/* Scrollable Message Area */}
              <div
                className="responsive-chat-container"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '24px 32px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Clean, intuitive Starter Hero when chat is fresh */}
                {messages.length === 0 ? (
                  <div style={{
                    maxWidth: '740px',
                    margin: 'auto',
                    width: '100%',
                    padding: '20px 0',
                    textAlign: 'center'
                  }}>
                    {/* Clean Professional Enterprise Icon */}
                    <div style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 18px auto',
                      boxShadow: '0 8px 24px -4px rgba(30, 64, 175, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.25)'
                    }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="5" r="3" />
                        <circle cx="5" cy="19" r="3" />
                        <circle cx="19" cy="19" r="3" />
                        <path d="M12 8v4" />
                        <path d="M7.5 17.5l3-3" />
                        <path d="M16.5 17.5l-3-3" />
                        <circle cx="12" cy="13" r="1.5" fill="currentColor" />
                      </svg>
                    </div>

                    <h1 style={{
                      fontSize: '24px',
                      fontWeight: 800,
                      color: '#0f172a',
                      marginBottom: '8px',
                      letterSpacing: '-0.02em'
                    }}>
                      How can I assist you today?
                    </h1>

                    <p style={{
                      fontSize: '14px',
                      color: '#64748b',
                      maxWidth: '460px',
                      margin: '0 auto 36px auto',
                      lineHeight: '1.5'
                    }}>
                      Ask questions about company policies, check real-time order status, or manage support tickets.
                    </p>

                    {/* 2x2 Clean Starter Grid (Clickable immediately) */}
                    <div
                      className="starter-cards-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
                        gap: '12px',
                        textAlign: 'left'
                      }}
                    >
                      {STARTER_PROMPTS.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(item.prompt)}
                          style={{
                            padding: '16px',
                            borderRadius: '12px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#93c5fd';
                            e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(37, 99, 235, 0.1)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                            e.currentTarget.style.transform = 'none';
                          }}
                        >
                          <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>{item.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                                {item.title}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: '#2563eb',
                                backgroundColor: '#eff6ff',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                {item.badge}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
                              {item.subtitle}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ maxWidth: '820px', width: '100%', margin: '0 auto' }}>
                    {messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        onConfirmAction={handleConfirmAction}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Bottom Input Dock */}
              <div
                className="responsive-input-bar"
                style={{
                  padding: '16px 32px 24px 32px',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #f1f5f9',
                  flexShrink: 0
                }}
              >
                <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%' }}>
                  {/* Attached Document Pill */}
                  {attachedDoc && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '8px',
                      marginBottom: '10px',
                      fontSize: '12px',
                      color: '#1e40af'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📄</span>
                        <span>Attached: <strong>{attachedDoc.name}</strong> ({attachedDoc.chunks} chunks indexed)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedDoc(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                        title="Remove attachment"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Main Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      padding: '6px 8px 6px 12px',
                      border: '1px solid #cbd5e1',
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingDoc || isLoading}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: isUploadingDoc ? '#2563eb' : '#64748b',
                        fontSize: '16px',
                        cursor: isUploadingDoc ? 'wait' : 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Attach document to knowledge base"
                    >
                      📎
                    </button>

                    <input
                      ref={inputRef}
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask about policies, check order status (#4521), or manage support tickets..."
                      disabled={isLoading}
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: '14px',
                        color: '#0f172a',
                        backgroundColor: 'transparent'
                      }}
                    />

                    <button
                      type="submit"
                      disabled={!inputMessage.trim() || isLoading}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: inputMessage.trim() && !isLoading ? '#2563eb' : '#e2e8f0',
                        color: inputMessage.trim() && !isLoading ? '#ffffff' : '#94a3b8',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{isLoading ? 'Thinking...' : 'Send'}</span>
                      {!isLoading && <span style={{ fontSize: '12px' }}>↑</span>}
                    </button>
                  </form>

                  <div style={{
                    textAlign: 'center',
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginTop: '8px'
                  }}>
                    Agentflow AI answers questions using enterprise knowledge and live operational tools.
                  </div>
                </div>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}
