'use client';

import React, { useState, useEffect } from 'react';
import { Message } from '../types/chat';
import AgentStepTrace from './AgentStepTrace';

interface MessageBubbleProps {
  message: Message;
  onConfirmAction?: (confirmed: boolean) => void;
}

export default function MessageBubble({ message, onConfirmAction }: MessageBubbleProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isUser = message.role === 'user';
  const isConfirmation = Boolean(
    !isUser &&
    (message.isConfirmationPrompt ||
      message.content.toLowerCase().includes('confirm?') ||
      message.content.toLowerCase().includes('confirm if you'))
  );

  // Helper to parse and render bold text, inline code, and clean linebreaks
  const renderInlineFormatted = (text: string) => {
    // Replace <br> or <br/> with line breaks
    const cleanText = text.replace(/<br\s*\/?>/gi, '\n');
    const lines = cleanText.split('\n');

    return lines.map((line, lIdx) => {
      // Parse bold **text** and code `code`
      const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} style={{ color: isUser ? '#ffffff' : '#0f172a', fontWeight: 700 }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={pIdx}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                backgroundColor: isUser ? 'rgba(255, 255, 255, 0.2)' : 'rgba(226, 232, 240, 0.8)',
                padding: '1px 5px',
                borderRadius: '4px',
                color: isUser ? '#ffffff' : '#1d4ed8'
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });

      return (
        <React.Fragment key={lIdx}>
          {renderedParts}
          {lIdx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  // Structured Markdown parser that handles Tables, Headers, Bullet Lists, and Paragraphs
  const renderRichContent = (content: string) => {
    const rawLines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // 1. Check for Markdown Table (Line starting and containing '|')
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < rawLines.length && rawLines[i + 1].includes('---')) {
        const tableLines: string[] = [];
        while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
          tableLines.push(rawLines[i].trim());
          i++;
        }

        if (tableLines.length >= 2) {
          const headerCells = tableLines[0].split('|').map((c) => c.trim()).filter(Boolean);
          // row 1 is delimiter (|---|---|)
          const dataRows = tableLines.slice(2).map((r) =>
            r.split('|').map((c) => c.trim()).filter(Boolean)
          );

          elements.push(
            <div
              key={`tbl-${i}`}
              style={{
                margin: '12px 0',
                overflowX: 'auto',
                borderRadius: '10px',
                border: '1px solid rgba(203, 213, 225, 0.85)',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                backgroundColor: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(235, 241, 250, 0.95)', borderBottom: '2px solid #cbd5e1' }}>
                    {headerCells.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontWeight: 700,
                          color: '#1e3a8a',
                          borderRight: hIdx < headerCells.length - 1 ? '1px solid #e2e8f0' : 'none'
                        }}
                      >
                        {renderInlineFormatted(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        backgroundColor: rIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(248, 250, 252, 0.85)',
                        borderBottom: rIdx < dataRows.length - 1 ? '1px solid #e2e8f0' : 'none'
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '10px 14px',
                            color: '#334155',
                            lineHeight: '1.5',
                            verticalAlign: 'top',
                            borderRight: cIdx < row.length - 1 ? '1px solid #e2e8f0' : 'none'
                          }}
                        >
                          {renderInlineFormatted(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // 2. Headers (# Header, ## Header, ### Header)
      if (trimmed.startsWith('### ')) {
        elements.push(
          <div key={`h3-${i}`} style={{ fontSize: '14px', fontWeight: 800, color: isUser ? '#ffffff' : '#0f172a', margin: '10px 0 4px 0' }}>
            {renderInlineFormatted(trimmed.slice(4))}
          </div>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        const text = trimmed.replace(/^#+\s*/, '');
        elements.push(
          <div key={`h2-${i}`} style={{ fontSize: '15px', fontWeight: 800, color: isUser ? '#ffffff' : '#0f172a', margin: '12px 0 6px 0' }}>
            {renderInlineFormatted(text)}
          </div>
        );
        i++;
        continue;
      }

      // 3. Bullet points (- item, * item, • item)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        const itemText = trimmed.replace(/^[-*•]\s*/, '');
        elements.push(
          <div key={`bullet-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '3px 0' }}>
            <span style={{ color: isUser ? '#ffffff' : '#2563eb', fontWeight: 700, lineHeight: '1.4' }}>•</span>
            <div style={{ flex: 1 }}>{renderInlineFormatted(itemText)}</div>
          </div>
        );
        i++;
        continue;
      }

      // 4. Horizontal Separator (---)
      if (trimmed === '---') {
        elements.push(
          <hr
            key={`hr-${i}`}
            style={{
              border: 'none',
              borderTop: isUser ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(226, 232, 240, 0.9)',
              margin: '10px 0'
            }}
          />
        );
        i++;
        continue;
      }

      // 5. Standard Paragraph / Line
      if (trimmed === '') {
        elements.push(<div key={`sp-${i}`} style={{ height: '6px' }} />);
      } else {
        elements.push(
          <div key={`p-${i}`} style={{ margin: '3px 0' }}>
            {renderInlineFormatted(line)}
          </div>
        );
      }
      i++;
    }

    return elements;
  };

  // Safe time formatting without hydration mismatch
  const formattedTime = mounted
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : message.createdAt.slice(11, 16);

  return (
    <div
      className="message-animate"
      style={{
        display: 'flex',
        gap: '12px',
        margin: '16px 0',
        width: '100%',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        alignItems: 'flex-start'
      }}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #1e40af, #4f46e5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '16px',
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.22)',
          border: '1px solid rgba(255, 255, 255, 0.85)'
        }}>
          ✦
        </div>
      )}

      {/* Bubble Column */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: isUser ? '75%' : '88%'
      }}>
        {/* Header Metadata */}
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#64748b',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ color: isUser ? '#1e40af' : '#0f172a', fontWeight: 700 }}>
            {isUser ? 'You' : 'Agentflow Operations Copilot'}
          </span>
          {!isUser && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#059669',
              backgroundColor: '#ecfdf5',
              padding: '1px 6px',
              borderRadius: '9999px',
              border: '1px solid #a7f3d0'
            }}>
              Autonomous
            </span>
          )}
          <span suppressHydrationWarning style={{ fontSize: '10px', color: '#94a3b8' }}>
            {formattedTime}
          </span>

          {message.needsClarification && (
            <span style={{
              background: '#fef3c7',
              color: '#b45309',
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: 700,
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              Awaiting clarification
            </span>
          )}
        </div>

        {/* Graded Step Trace Drawer - Positioned above final synthesized answer */}
        {!isUser && message.steps && message.steps.length > 0 && (
          <div style={{ width: '100%', marginBottom: '10px' }}>
            <AgentStepTrace steps={message.steps} isStreaming={message.isStreaming} />
          </div>
        )}

        {/* Bubble Body with Porcelain Glass & Rich Markdown */}
        <div style={{
          padding: '16px 20px',
          borderRadius: isUser ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
          backgroundColor: isUser ? '#2563eb' : 'rgba(255, 255, 255, 0.92)',
          backgroundImage: isUser ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'none',
          color: isUser ? '#ffffff' : '#0f172a',
          backdropFilter: isUser ? 'none' : 'blur(16px)',
          WebkitBackdropFilter: isUser ? 'none' : 'blur(16px)',
          boxShadow: isUser
            ? '0 6px 18px rgba(37, 99, 235, 0.22)'
            : '0 8px 24px -4px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(255, 255, 255, 0.85) inset',
          border: isUser ? 'none' : '1px solid rgba(203, 213, 225, 0.85)',
          fontSize: '14px',
          lineHeight: '1.65',
          wordBreak: 'break-word',
          width: '100%'
        }}>
          {message.content && message.content.trim().length > 0 ? (
            renderRichContent(message.content)
          ) : message.isStreaming ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 0',
              color: '#475569',
              fontSize: '13px'
            }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid #cbd5e1',
                  borderTopColor: '#2563eb',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
              <span style={{ fontWeight: 500 }}>
                Synthesizing verified response with policy citations...
              </span>
            </div>
          ) : (
            <div style={{ color: '#334155' }}>
              <p style={{ margin: 0, fontWeight: 500 }}>
                Inquiry processed successfully according to organizational policy and system state.
              </p>
            </div>
          )}

          {/* Guardrail Checkpoint Interactive Card */}
          {isConfirmation && onConfirmAction && (
            <div style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: 'rgba(254, 243, 199, 0.8)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#92400e',
                letterSpacing: '0.02em'
              }}>
                <span>🛡️ Guardrail Safety Checkpoint: Confirm State Creation</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f', lineHeight: '1.5' }}>
                Creating a support ticket will generate a permanent record in the ticketing system. Do you authorize this action?
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  onClick={() => onConfirmAction(true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#16a34a',
                    backgroundImage: 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 3px 8px rgba(22, 163, 74, 0.28)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                >
                  ✓ Confirm & Create Ticket
                </button>
                <button
                  onClick={() => onConfirmAction(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                >
                  ✕ Cancel Request
                </button>
              </div>
            </div>
          )}

          {/* Sources & Tools Cited Badges */}
          {!isUser && ((message.sources_used && message.sources_used.length > 0) || (message.tools_used && message.tools_used.length > 0)) && (
            <div style={{
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(226, 232, 240, 0.8)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px'
            }}>
              {message.sources_used?.map((src, i) => (
                <span key={`src-${i}`} style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  fontSize: '11px',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  📄 Policy: {src}
                </span>
              ))}
              {message.tools_used?.map((tool, i) => (
                <span key={`tool-${i}`} style={{
                  background: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                  fontSize: '11px',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  ⚙️ Tool: {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #475569, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.02em',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
          border: '1px solid rgba(255, 255, 255, 0.8)'
        }}>
          You
        </div>
      )}
    </div>
  );
}
