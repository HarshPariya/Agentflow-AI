import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agentflow-AI | Ask, Retrieve, Act Autonomous Platform',
  description: 'Enterprise autonomous agent powered by LangGraph, MCP tools, and private RAG knowledge base with MongoDB Atlas.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#f1f5f9',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#0f172a',
        WebkitFontSmoothing: 'antialiased'
      }}>
        {children}
      </body>
    </html>
  );
}
