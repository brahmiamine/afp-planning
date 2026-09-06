'use client';

import { ChatView } from '@/app/components/chat/ChatView';

// Wrapper espace club : la logique vit dans ChatView (issue #93).
export default function ChatPage() {
  return (
    <div className="max-w-7xl">
      <ChatView />
    </div>
  );
}
