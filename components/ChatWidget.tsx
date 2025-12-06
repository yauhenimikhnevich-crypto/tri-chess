
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, OnlineUser } from '../types';

interface ChatWidgetProps {
  messages: ChatMessage[];
  currentUser: OnlineUser;
  onSendMessage: (text: string) => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ messages, currentUser, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = typeof timestamp.toMillis === 'function' 
        ? new Date(timestamp.toMillis()) 
        : new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp);
        
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full bg-gray-800/50 rounded-lg shadow-xl flex flex-col h-64 border border-gray-700">
      <div className="p-2 border-b border-gray-700 bg-gray-900/30 rounded-t-lg">
        <h3 className="text-sm font-bold text-gray-300">Game Chat</h3>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-gray-500 text-xs italic text-center mt-4">No messages yet. Say hi!</p>
        )}
        {messages.map((msg, index) => {
            const isMe = msg.senderId === currentUser.id;
            return (
                <div key={`${msg.timestamp}-${index}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-3 py-1.5 rounded-lg text-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                        {!isMe && <span className="block text-xs font-bold text-indigo-300 mb-0.5">{msg.senderName}</span>}
                        <span>{msg.text}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 mt-0.5 px-1">{formatTime(msg.timestamp)}</span>
                </div>
            );
        })}
      </div>

      <form onSubmit={handleSubmit} className="p-2 border-t border-gray-700 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-gray-900 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500"
          maxLength={140}
        />
        <button 
          type="submit" 
          disabled={!inputText.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-bold transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatWidget;
