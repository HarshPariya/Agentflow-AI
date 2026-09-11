'use client';

import ChatWindow from '../../components/ChatWindow';

export default function HistoryPage() {
  return (
    <main style={{ minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
      <ChatWindow initialView="history" />
    </main>
  );
}
