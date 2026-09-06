'use client';

import { useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { ChatView } from '@/app/components/chat/ChatView';

// Wrapper espace personnel : la logique vit dans ChatView (issue #93).
export default function ChatPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => setRefreshKey((key) => key + 1)} />
      <main className="container mx-auto max-w-7xl px-3 py-5 sm:px-4">
        <ChatView refreshKey={refreshKey} />
      </main>
    </div>
  );
}
