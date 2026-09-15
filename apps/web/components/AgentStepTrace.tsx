'use client';

import React, { useState } from 'react';
import { AgentStepTraceProps } from '../types/trace';

export default function AgentStepTrace({ steps, isStreaming }: AgentStepTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  if (!steps || steps.length === 0) return null;

  // Human-friendly strategy labels
  const formatDecisionName = (decision: string) => {
    switch (decision) {
      case 'retrieve_only':
        return 'Policy & Documentation Retrieval';
      case 'tool_only':
        return 'Enterprise Tool Execution';
      case 'retrieve_and_tool':
        return 'Chained Retrieval & Operations Tool';
      case 'answer_directly':
        return 'Direct Conversational Response';
      case 'insufficient_info':
        return 'Context Clarification';
      default:
        return decision.replace(/_/g, ' ');
    }
  };

  // Build sleek, non-robotic summary sequence
  const traceSegments: { label: string; icon: string; type: string }[] = [];

  steps.forEach((s) => {
    if (s.step === 'plan' && s.detail) {
      traceSegments.push({
        label: formatDecisionName(s.detail.decision || ''),
        icon: '🎯',
        type: 'plan'
      });
    } else if (s.step === 'retrieval' && s.detail) {
      const count = s.detail.chunks?.length || 0;
      const topScore = s.detail.chunks?.[0]?.score;
      traceSegments.push({
        label: `Retrieved ${count} context ${count === 1 ? 'source' : 'sources'}${topScore ? ` (${Math.round(topScore * 100)}% match)` : ''}`,
        icon: '📚',
        type: 'retrieval'
      });
    } else if (s.step === 'tool_call' && s.detail) {
      const toolName = (s.detail.tool || '').replace(/_/g, ' ');
      traceSegments.push({
        label: `Executed ${toolName}`,
        icon: '⚡',
        type: 'tool'
      });
    } else if (s.step === 'clarify') {
      traceSegments.push({
        label: 'Requested details',
        icon: '❓',
        type: 'clarify'
      });
    }
  });

  if (!isStreaming) {
    traceSegments.push({ label: 'Synthesized', icon: '✓', type: 'final' });
  }

  return (
    <div style={{
      marginTop: '12px',
      marginBottom: '8px',
      borderRadius: '14px',
      border: '1px solid rgba(203, 213, 225, 0.75)',
      backgroundColor: 'rgba(248, 250, 252, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      overflow: 'hidden',
      fontSize: '12px',
      boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03), 0 0 1px 1px rgba(255, 255, 255, 0.9) inset',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      {/* Sleek Humanized Collapsed Bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '12px'
        }}
        aria-label="Toggle autonomous reasoning trace"
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flex: 1,
          overflow: 'hidden'
        }}>
          {/* Status Badge */}
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: isStreaming ? '#eff6ff' : '#f1f5f9',
            color: isStreaming ? '#2563eb' : '#475569',
            border: isStreaming ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0
          }}>
            {isStreaming && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                display: 'inline-block',
                animation: 'pulseGlow 1.5s infinite'
              }} />
            )}
            <span>{isStreaming ? 'Reasoning Active' : '✦ AI Reasoning Trace'}</span>
          </span>

          {/* Collapsed Trace Sequence Pills */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            fontSize: '12px'
          }}>
            {traceSegments.map((seg, idx) => (
              <React.Fragment key={idx}>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: seg.type === 'final' ? '#059669' : seg.type === 'tool' ? '#0d9488' : '#334155',
                  fontWeight: seg.type === 'final' ? 700 : 500
                }}>
                  <span style={{ fontSize: '11px' }}>{seg.icon}</span>
                  <span>{seg.label}</span>
                </span>
                {idx < traceSegments.length - 1 && (
                  <span style={{ color: '#cbd5e1', fontWeight: 400, userSelect: 'none' }}>→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Expand/Collapse Chevron */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          color: '#64748b',
          fontSize: '11px',
          fontWeight: 600,
          flexShrink: 0
        }}>
          <span>{isExpanded ? 'Hide Trace' : 'Inspect Trace'}</span>
          <span style={{
            fontSize: '10px',
            transform: isExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded Human-Centered Reasoning Panel */}
      {isExpanded && (
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(203, 213, 225, 0.7)',
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          {steps.map((s, idx) => (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              borderLeft: `2px solid ${s.step === 'plan' ? '#6366f1' : s.step === 'retrieval' ? '#2563eb' : s.step === 'tool_call' ? '#0d9488' : '#d97706'}`,
              paddingLeft: '14px',
              position: 'relative'
            }}>
              {/* Step Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {s.step === 'plan' && '🎯 Execution Strategy Planning'}
                  {s.step === 'retrieval' && '📚 Knowledge Retrieval & Grounding'}
                  {s.step === 'tool_call' && '⚡ Enterprise Tool Execution'}
                  {s.step === 'clarify' && '❓ Context Clarification Check'}
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#64748b',
                  backgroundColor: 'rgba(241, 245, 249, 0.8)',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid #e2e8f0'
                }}>
                  Step {idx + 1}
                </span>
              </div>

              {/* Plan Payload */}
              {s.step === 'plan' && s.detail && (
                <div style={{
                  backgroundColor: 'rgba(248, 250, 252, 0.95)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  lineHeight: '1.5'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Chosen Path:</span>
                    <span style={{
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      fontSize: '11px'
                    }}>
                      {formatDecisionName(s.detail.decision || '')}
                    </span>
                  </div>
                  <div style={{ color: '#334155' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Reasoning: </span>
                    {s.detail.reasoning}
                  </div>
                </div>
              )}

              {/* Retrieval Payload */}
              {s.step === 'retrieval' && s.detail && (
                <div style={{
                  backgroundColor: 'rgba(248, 250, 252, 0.95)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px'
                }}>
                  <div style={{ color: '#475569', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#64748b' }}>Search Query: </span>
                    <em>"{s.detail.query}"</em>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {s.detail.chunks?.map((c: any, i: number) => (
                      <div key={i} style={{
                        padding: '8px 10px',
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '11px'
                      }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe'
                        }}>
                          {c.docId}
                        </span>

                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: c.score >= 0.65 ? '#ecfdf5' : '#fffbeb',
                          color: c.score >= 0.65 ? '#065f46' : '#92400e',
                          border: `1px solid ${c.score >= 0.65 ? '#a7f3d0' : '#fde68a'}`
                        }}>
                          {Math.round(c.score * 100)}% Match
                        </span>

                        <span style={{
                          color: '#475569',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {c.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tool Execution Payload */}
              {s.step === 'tool_call' && s.detail && (
                <div style={{
                  backgroundColor: 'rgba(248, 250, 252, 0.95)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Invoked Tool:</span>
                    <span style={{
                      backgroundColor: '#f0fdf4',
                      color: '#15803d',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      border: '1px solid #bbf7d0',
                      fontSize: '11px'
                    }}>
                      {s.detail.tool}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '8px',
                    fontSize: '11px'
                  }}>
                    <div style={{
                      backgroundColor: '#ffffff',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Input: </span>
                      <code>{JSON.stringify(s.detail.input)}</code>
                    </div>
                    <div style={{
                      backgroundColor: '#ffffff',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Output: </span>
                      <code>{JSON.stringify(s.detail.output)}</code>
                    </div>
                  </div>
                </div>
              )}

              {/* Clarify Payload */}
              {s.step === 'clarify' && s.detail && (
                <div style={{
                  backgroundColor: '#fffbeb',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #fde68a',
                  fontSize: '12px'
                }}>
                  <div style={{ color: '#b45309', fontWeight: 600 }}>{s.detail.reason}</div>
                  <div style={{ marginTop: '4px', color: '#92400e' }}>
                    <strong>Prompt: </strong>{s.detail.question_asked}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Developer Toggle for Raw JSON Telemetry */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingTop: '8px',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {showRawJson ? 'Hide State Telemetry JSON' : 'Show State Telemetry JSON (Evaluation / Audit)'}
            </button>
          </div>

          {showRawJson && (
            <pre style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '11px',
              overflowX: 'auto',
              maxHeight: '200px'
            }}>
              {JSON.stringify(steps, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
