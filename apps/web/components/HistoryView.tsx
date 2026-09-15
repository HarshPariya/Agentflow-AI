'use client';

import React, { useState, useEffect } from 'react';
import { ConversationItem } from '../types/chat';
import { fetchConversations, deleteConversation } from '../lib/api';

interface HistoryViewProps {
  userId?: string;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
}

export default function HistoryView({ userId, onSelectConversation, onNewChat }: HistoryViewProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const timeoutFallback = new Promise<ConversationItem[]>((resolve) =>
        setTimeout(() => resolve([]), 3500)
      );
      const data = await Promise.race([
        fetchConversations(userId),
        timeoutFallback
      ]);
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversation history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this session history and its audit logs?')) return;
    setDeletingId(id);
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert('Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.last_message && c.last_message.toLowerCase().includes(q)) ||
      c.id.toLowerCase().includes(q)
    );
  });

  // Group by Date: Today, Yesterday, Last 7 Days, Older
  const groupConversations = () => {
    const today: ConversationItem[] = [];
    const yesterday: ConversationItem[] = [];
    const lastWeek: ConversationItem[] = [];
    const older: ConversationItem[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfLastWeek = startOfToday - 7 * 86400000;

    filtered.forEach((c) => {
      const t = new Date(c.updated_at || c.created_at).getTime();
      if (t >= startOfToday) {
        today.push(c);
      } else if (t >= startOfYesterday) {
        yesterday.push(c);
      } else if (t >= startOfLastWeek) {
        lastWeek.push(c);
      } else {
        older.push(c);
      }
    });

    return { today, yesterday, lastWeek, older };
  };

  const { today, yesterday, lastWeek, older } = groupConversations();

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const renderGroup = (title: string, items: ConversationItem[]) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>{title}</span>
          <span style={{
            fontSize: '10px',
            backgroundColor: 'rgba(203, 213, 225, 0.6)',
            color: '#334155',
            padding: '1px 7px',
            borderRadius: '9999px'
          }}>
            {items.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.88)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '14px',
                border: '1px solid rgba(203, 213, 225, 0.8)',
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#93c5fd';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 24px -4px rgba(37, 99, 235, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.88)';
                e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.8)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 2px 10px rgba(15, 23, 42, 0.03)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                  <span style={{ fontSize: '18px' }}>💬</span>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {conv.title || 'Untitled Session'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '2px 8px',
                    borderRadius: '9999px'
                  }}>
                    {conv.message_count} {conv.message_count === 1 ? 'msg' : 'msgs'}
                  </span>

                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    disabled={deletingId === conv.id}
                    title="Delete session"
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {conv.last_message && (
                <div style={{
                  fontSize: '12px',
                  color: '#64748b',
                  lineHeight: '1.5',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingLeft: '28px'
                }}>
                  {conv.last_message}
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px solid rgba(241, 245, 249, 0.9)',
                fontSize: '11px',
                color: '#94a3b8',
                paddingLeft: '28px'
              }}>
                <span>Session: <code style={{ fontSize: '10px' }}>{conv.id.slice(0, 16)}...</code></span>
                <span suppressHydrationWarning>Active: {formatTimestamp(conv.updated_at || conv.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Top Header Bar */}
      <div style={{
        padding: '20px 32px',
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(203, 213, 225, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Session & Audit History
          </h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
            Persistent state machines, conversation transcripts, and execution telemetry saved in MongoDB Atlas.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={loadHistory}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 Refresh
          </button>

          <button
            onClick={onNewChat}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              backgroundColor: '#2563eb',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
            }}
          >
            ＋ New Conversation
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={{
        padding: '16px 32px',
        backgroundColor: 'rgba(248, 250, 252, 0.65)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)'
      }}>
        <div style={{
          position: 'relative',
          maxWidth: '640px'
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past sessions by keyword, order #, policy topic..."
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              fontSize: '13px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              outline: 'none',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
            }}
          />
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '14px',
            color: '#94a3b8'
          }}>
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px 40px 32px'
      }}>
        {isLoading ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: '3px solid #bfdbfe',
              borderTopColor: '#2563eb',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading sessions from MongoDB Atlas...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '16px',
            border: '1px dashed #cbd5e1',
            maxWidth: '560px',
            margin: '40px auto 0 auto'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📭</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
              {searchQuery ? 'No matching conversations found' : 'No conversation history yet'}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
              {searchQuery ? `No sessions match "${searchQuery}". Try a different term.` : 'Start a chat session to ask about return policies, look up orders, or query attached documentation.'}
            </p>
            <button
              onClick={onNewChat}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                backgroundColor: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Start First Conversation
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: '900px' }}>
            {renderGroup('Today', today)}
            {renderGroup('Yesterday', yesterday)}
            {renderGroup('Past 7 Days', lastWeek)}
            {renderGroup('Earlier Sessions', older)}
          </div>
        )}
      </div>
    </div>
  );
}
