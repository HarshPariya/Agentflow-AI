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
  syncUserProfile,
} from '../lib/api';

const FEATURED_CAPABILITIES = [
  {
    icon: '🔗',
    title: 'Chained Query (Section 4)',
    prompt: "What's our refund policy, and is order 4521 eligible?",
    desc: 'Consults policy-042 and runs order_lookup via MCP'
  },
  {
    icon: '⚙️',
    title: 'Live MCP Tool Lookup',
    prompt: "Check status of support ticket TIK-101",
    desc: 'Direct MCP query for live ticket state and assignee'
  },
  {
    icon: '🛡️',
    title: 'Guardrail Checkpoint',
    prompt: "Create an urgent ticket for database server outage",
    desc: 'Demonstrates human-in-the-loop confirmation before action'
  },
  {
    icon: '📚',
    title: 'Enterprise Policy RAG',
    prompt: "What are the requirements for damaged goods claims?",
    desc: 'Vector similarity search over 25 enterprise policy docs'
  },
  {
    icon: '📄',
    title: 'Capstone PDF Search',
    prompt: "What are the 5 non-negotiable requirements in the Capstone Technical Documentation?",
    desc: 'RAG search over the Capstone Project PDF document'
  }
];

const KB_POLICIES = [
  { id: 'policy-042', title: 'Refunds & Returns Policy', query: "What is our refund and return window policy?" },
  { id: 'policy-011', title: 'Damaged Goods Claims', query: "How do I file a claim for damaged goods?" },
  { id: 'policy-003', title: 'Shipping SLAs & Delivery', query: "What are our guaranteed shipping delivery windows?" },
  { id: 'policy-005', title: 'Warranty & Replacement', query: "What warranty coverage is provided for electronic hardware?" },
  { id: 'capstone-pdf', title: 'Capstone Technical Spec PDF', query: "What are the grading criteria and evaluation rubric in the technical specification?" }
];

const PRESET_USERS: UserProfile[] = [
  {
    user_id: 'user-harsh',
    name: 'Harsh Sharma',
    email: 'harsh@agentflow.internal',
    role: 'Enterprise Admin',
    department: 'Core Operations'
  },
  {
    user_id: 'user-priya',
    name: 'Priya Patel',
    email: 'priya@agentflow.internal',
    role: 'Support Lead',
    department: 'Customer Success'
  },
  {
    user_id: 'user-alex',
    name: 'Alex Reed',
    email: 'alex@agentflow.internal',
    role: 'Operations Analyst',
    department: 'Logistics & Claims'
  }
];

interface ChatWindowProps {
  initialView?: 'chat' | 'history';
}

export default function ChatWindow({ initialView = 'chat' }: ChatWindowProps) {
  const [currentView, setCurrentView] = useState<'chat' | 'history'>(initialView);

  // User Profile & Authentication State (hydrated safely after mount)
  const [currentUser, setCurrentUser] = useState<UserProfile>(PRESET_USERS[0]);
  const [mounted, setMounted] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customDept, setCustomDept] = useState('Enterprise Operations');

  const [recentSessions, setRecentSessions] = useState<ConversationItem[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: "Welcome to **Agentflow-AI** — an enterprise operations copilot implementing the *Ask, Retrieve, Act* architecture.\n\nI dynamically plan whether your inquiry requires private knowledge base retrieval, live MCP tools, both in a multi-step chain, or direct synthesis.\n\nYou can also attach and query custom PDF documents directly from the input box below.\n\nSelect a sample workflow below or type your inquiry to begin.",
      createdAt: new Date().toISOString()
    }
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<{ name: string; chunks: number; docId: string } | null>(null);
  const [health, setHealth] = useState<{ status: string; db: string; redis: string; vector_store: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load health & sync user
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agentflow_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.name) {
            setCurrentUser(parsed);
          }
        } catch { }
      }
    }

    fetchHealthStatus().then(setHealth);
    const interval = setInterval(() => {
      fetchHealthStatus().then(setHealth);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Sync user profile with MongoDB & refresh sessions
  const loadSessions = async () => {
    try {
      const data = await fetchConversations(currentUser.user_id);
      setRecentSessions(data.slice(0, 8));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    syncUserProfile(currentUser);
    loadSessions();
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, currentView]);

  const handleSwitchUser = (user: UserProfile) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentflow_user', JSON.stringify(user));
    }
    setIsAuthModalOpen(false);
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) return;
    const newUser: UserProfile = {
      user_id: `user-${Date.now().toString(36)}`,
      name: customName.trim(),
      email: customEmail.trim(),
      role: 'Enterprise Member',
      department: customDept
    };
    handleSwitchUser(newUser);
  };

  const handleNewConversation = () => {
    const newConvId = `conv-${Date.now()}`;
    setConversationId(newConvId);
    setAttachedDoc(null);
    setCurrentView('chat');
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: "Started a fresh conversation session. How can I assist you with orders, support tickets, or company policies?",
        createdAt: new Date().toISOString()
      }
    ]);
    setInputMessage('');
    inputRef.current?.focus();
  };

  const handleSelectConversation = async (convId: string) => {
    setIsLoading(true);
    setConversationId(convId);
    setCurrentView('chat');
    try {
      const detail = await fetchConversationDetail(convId);
      if (detail && detail.messages && detail.messages.length > 0) {
        const loaded: Message[] = detail.messages.map((m: any) => ({
          id: m.id || `msg-${Date.now()}`,
          role: m.role,
          content: m.content && m.content.trim().length > 0
            ? m.content
            : (m.role === 'assistant' ? "Inquiry processed and verified against policy guidelines." : ""),
          createdAt: m.created_at,
          sources_used: m.sources_used || [],
          tools_used: m.tools_used || [],
          steps: m.role === 'assistant' ? detail.steps?.map((st: any) => ({
            type: 'step',
            step: st.step_type,
            detail: st.step_detail
          })) : undefined
        }));
        setMessages(loaded);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
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
          content: `📄 **Document Uploaded & Indexed**\n\nFile **${file.name}** has been processed and indexed into the RAG vector store (${res.chunks_indexed} chunks).\n\nYou can now ask any questions directly related to this document!`,
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
      content: 'Analyzing inquiry and planning autonomous execution graph...',
      createdAt: new Date().toISOString(),
      steps: [],
      isStreaming: true
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsLoading(true);

    const activeSteps: StepEvent[] = [];

    await streamChatQuery({
      conversationId: conversationId,
      message: query,
      attachedDoc: attachedDoc?.name || attachedDoc?.docId || null,
      userId: currentUser.user_id,
      userName: currentUser.name,
      onStep: (stepEvent) => {
        activeSteps.push(stepEvent);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                ...msg,
                content: stepEvent.step === 'clarify' ? (stepEvent.detail?.question_asked || msg.content) : msg.content,
                steps: [...activeSteps],
                needsClarification: stepEvent.step === 'clarify'
              }
              : msg
          )
        );
      },
      onFinal: (finalContent, sources, tools, serverConvId) => {
        if (serverConvId) {
          setConversationId(serverConvId);
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                ...msg,
                content: finalContent,
                sources_used: sources,
                tools_used: tools,
                steps: [...activeSteps],
                isStreaming: false,
                needsClarification: finalContent.toLowerCase().includes('could you') || finalContent.toLowerCase().includes('please provide')
              }
              : msg
          )
        );
        loadSessions();
      },
      onError: (err) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                ...msg,
                content: `⚠️ Error executing request: ${err.message}. Please verify the FastAPI backend is running on http://localhost:8000.`,
                isStreaming: false
              }
              : msg
          )
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
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Hidden File Input for PDF / Document Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Left Workspace Sidebar */}
      <aside style={{
        width: sidebarOpen ? '300px' : '0px',
        minWidth: sidebarOpen ? '300px' : '0px',
        backgroundColor: 'rgba(235, 241, 250, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(203, 213, 225, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 30,
        boxShadow: '4px 0 20px rgba(15, 23, 42, 0.03)'
      }}>
        {/* Top Header / Branding */}
        <div style={{ padding: '20px 18px', borderBottom: '1px solid rgba(203, 213, 225, 0.7)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #1e40af, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '18px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.8)'
            }}>
              ✦
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  Agentflow AI
                </h2>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe'
                }}>
                  Enterprise
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                Autonomous Operations Copilot
              </p>
            </div>
          </div>

          {/* Primary View Switcher Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            marginTop: '16px',
            backgroundColor: 'rgba(203, 213, 225, 0.45)',
            padding: '4px',
            borderRadius: '10px'
          }}>
            <button
              onClick={() => setCurrentView('chat')}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: currentView === 'chat' ? '#ffffff' : 'transparent',
                color: currentView === 'chat' ? '#1e40af' : '#475569',
                fontWeight: currentView === 'chat' ? 700 : 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: currentView === 'chat' ? '0 2px 6px rgba(15, 23, 42, 0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>💬</span>
              <span>Assistant</span>
            </button>

            <button
              onClick={() => setCurrentView('history')}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: currentView === 'history' ? '#ffffff' : 'transparent',
                color: currentView === 'history' ? '#1e40af' : '#475569',
                fontWeight: currentView === 'history' ? 700 : 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: currentView === 'history' ? '0 2px 6px rgba(15, 23, 42, 0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🕒</span>
              <span>History</span>
              {recentSessions.length > 0 && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8'
                }}>
                  {recentSessions.length}
                </span>
              )}
            </button>
          </div>

          {/* New Chat Action */}
          <button
            onClick={handleNewConversation}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(191, 219, 254, 0.9)',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.06)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#dbeafe';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#eff6ff';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>＋</span>
              <span>New Conversation</span>
            </span>
            <span style={{
              fontSize: '10px',
              color: '#3b82f6',
              padding: '1px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              fontFamily: 'monospace'
            }}>
              Ctrl+N
            </span>
          </button>
        </div>

        {/* Middle Scrollable Section */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Recent Sessions Quick List */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}>
                Recent Sessions
              </span>
              <button
                onClick={() => setCurrentView('history')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                View all →
              </button>
            </div>

            {recentSessions.length === 0 ? (
              <div style={{
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
                padding: '10px',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                No saved sessions yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentSessions.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectConversation(s.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: s.id === conversationId ? '1px solid #bfdbfe' : '1px solid transparent',
                      backgroundColor: s.id === conversationId ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (s.id !== conversationId) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                    onMouseLeave={(e) => {
                      if (s.id !== conversationId) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                  >
                    <span style={{ fontSize: '13px' }}>💬</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: s.id === conversationId ? 700 : 500,
                      color: s.id === conversationId ? '#1e40af' : '#334155',
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

          {/* Connected Infrastructure Status */}
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px'
            }}>
              Connected Infrastructure
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.75)',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(203, 213, 225, 0.8)',
              fontSize: '11px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569' }}>MongoDB Atlas</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  {health?.db === 'ok' ? 'Connected' : 'Active'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569' }}>Redis In-Memory TTL</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Active Cache
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569' }}>RAG Knowledge Base</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#2563eb', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                  PDF & Policies
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569' }}>MCP Tool Registry</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#7c3aed', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#8b5cf6' }} />
                  3 Live Tools
                </span>
              </div>
            </div>
          </div>

          {/* Quick Knowledge Base Policy Links */}
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px'
            }}>
              Knowledge Base Documents
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {KB_POLICIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSend(p.query)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.8)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                    {p.title}
                  </span>
                  <span style={{ fontSize: '10px', color: '#2563eb', fontFamily: 'monospace' }}>
                    #{p.id}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Footer: Compact User Profile & Login Bar */}
        <div style={{
          flexShrink: 0,
          padding: '12px 14px',
          borderTop: '1px solid rgba(203, 213, 225, 0.8)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <div
              suppressHydrationWarning
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: '#1e293b',
                backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.1)'
              }}
            >
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div
                suppressHydrationWarning
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#0f172a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {currentUser.name}
              </div>
              <div
                suppressHydrationWarning
                style={{
                  fontSize: '10px',
                  color: '#64748b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {currentUser.department || currentUser.role}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsAuthModalOpen(true)}
            style={{
              padding: '5px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#1d4ed8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
          >
            Switch
          </button>
        </div>
      </aside>

      {/* Main Workspace (Chat or History) */}
      {currentView === 'history' ? (
        <HistoryView
          userId={currentUser.user_id}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewConversation}
        />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Top Navigation Bar */}
          <header style={{
            padding: '12px 24px',
            backgroundColor: 'rgba(235, 241, 250, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(203, 213, 225, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Sidebar Toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#475569',
                  fontSize: '14px'
                }}
                title="Toggle Sidebar"
              >
                ☰
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    Operations & Policy Copilot
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #bbf7d0'
                  }}>
                    ● Live Orchestrator
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Ask, Retrieve, Act Enterprise Workspace • LangGraph Orchestration
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setCurrentView('history')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🕒</span>
                <span>Session History</span>
              </button>

              <button
                onClick={handleNewConversation}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)')}
              >
                Clear Conversation
              </button>
            </div>
          </header>

          {/* Message Stream Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Capability Cards when chat is fresh */}
            {messages.length === 1 && (
              <div style={{ margin: '10px 0 30px 0' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px'
                }}>
                  Tested Operational Workflows
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px'
                }}>
                  {FEATURED_CAPABILITIES.map((cap, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(cap.prompt)}
                      style={{
                        padding: '16px',
                        borderRadius: '14px',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(203, 213, 225, 0.85)',
                        boxShadow: '0 4px 14px -2px rgba(15, 23, 42, 0.04)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                        e.currentTarget.style.borderColor = '#93c5fd';
                        e.currentTarget.style.boxShadow = '0 10px 25px -4px rgba(37, 99, 235, 0.12)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                        e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.85)';
                        e.currentTarget.style.boxShadow = '0 4px 14px -2px rgba(15, 23, 42, 0.04)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{cap.icon}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          {cap.title}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                        {cap.desc}
                      </div>
                      <div style={{
                        marginTop: '4px',
                        fontSize: '11px',
                        color: '#2563eb',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        Try inquiry →
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render Messages */}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onConfirmAction={handleConfirmAction}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Floating Glass Input Dock */}
          <footer style={{
            padding: '12px 32px 20px 32px',
            backgroundColor: 'rgba(235, 241, 250, 0.9)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(203, 213, 225, 0.8)'
          }}>
            {/* Quick Suggestion Pills */}
            <div style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '8px',
              scrollbarWidth: 'none'
            }}>
              {FEATURED_CAPABILITIES.map((cap, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(cap.prompt)}
                  disabled={isLoading}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#334155',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(203, 213, 225, 0.8)',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#93c5fd';
                    e.currentTarget.style.color = '#1d4ed8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.8)';
                    e.currentTarget.style.color = '#334155';
                  }}
                >
                  <span>{cap.icon}</span>
                  <span>{cap.prompt}</span>
                </button>
              ))}
            </div>

            {/* Attached Document Indicator Chip */}
            {attachedDoc && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 14px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '10px',
                marginBottom: '8px',
                fontSize: '12px',
                color: '#1e40af',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📄</span>
                  <span>Attached to RAG: <strong>{attachedDoc.name}</strong> ({attachedDoc.chunks} chunks indexed)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedDoc(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Remove attached document reference"
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
                gap: '10px',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '14px',
                padding: '4px 6px 4px 12px',
                border: '1px solid rgba(203, 213, 225, 0.9)',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)'
              }}
            >
              {/* Attach PDF Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc || isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '9px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isUploadingDoc ? 'wait' : 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.borderColor = '#93c5fd';
                  e.currentTarget.style.color = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.color = '#334155';
                }}
                title="Attach custom PDF to RAG knowledge base"
              >
                <span>📎</span>
                <span>{isUploadingDoc ? 'Indexing...' : 'Attach PDF'}</span>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask about policies, query order status (#4521), or manage support tickets..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '14px',
                  backgroundColor: 'transparent',
                  color: '#0f172a'
                }}
              />

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: inputMessage.trim() && !isLoading ? '#2563eb' : '#94a3b8',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  boxShadow: inputMessage.trim() && !isLoading ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
                }}
              >
                <span>{isLoading ? 'Processing...' : 'Send'}</span>
                {!isLoading && <span>↵</span>}
              </button>
            </form>
          </footer>
        </div>
      )}

      {/* User Login / Profile Switcher Modal */}
      {isAuthModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '18px',
            border: '1px solid rgba(203, 213, 225, 0.9)',
            boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.2)',
            maxWidth: '480px',
            width: '100%',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Enterprise User Authentication
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Switch profiles to partition conversation history and audit logs in MongoDB Atlas.
                </p>
              </div>
              <button
                onClick={() => setIsAuthModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Preset Enterprise Accounts */}
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '10px'
                }}>
                  Select Enterprise Profile
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {PRESET_USERS.map((user) => {
                    const isSelected = user.user_id === currentUser.user_id;
                    return (
                      <div
                        key={user.user_id}
                        onClick={() => handleSwitchUser(user)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '12px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: isSelected ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#cbd5e1',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                              {user.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {user.email} • {user.department}
                            </div>
                          </div>
                        </div>

                        {isSelected ? (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#1d4ed8',
                            backgroundColor: '#dbeafe',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            Active
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                            Sign in →
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom User Login Divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#94a3b8',
                fontSize: '11px'
              }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                <span>OR SIGN IN WITH CUSTOM IDENTITY</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
              </div>

              {/* Custom Login Form */}
              <form onSubmit={handleCustomLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g., Alex Johnson"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Enterprise Email
                  </label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="e.g., alex@company.internal"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Department / Role
                  </label>
                  <input
                    type="text"
                    value={customDept}
                    onChange={(e) => setCustomDept(e.target.value)}
                    placeholder="e.g., Compliance & Audits"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    marginTop: '6px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0f172a'; }}
                >
                  Save & Switch Session
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
