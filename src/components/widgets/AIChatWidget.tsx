"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-4 right-4 z-50 p-4 rounded-full shadow-lg transition-all duration-300",
          "bg-blue-600 hover:bg-blue-700 text-white",
          "hover:scale-110",
          isOpen && "scale-0"
        )}
        aria-label="Open AI Chat"
      >
        <MessageCircle size={24} />
      </button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 w-[90vw] md:w-96 h-[600px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl transition-all duration-300 flex flex-col overflow-hidden",
          "border border-zinc-200 dark:border-zinc-800",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-blue-600">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} className="text-white" />
            <h3 className="font-semibold text-white">AI Assistant</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white hover:bg-blue-700 p-1 rounded transition-colors"
            aria-label="Close chat"
          >
            <X size={20} />
          </button>
        </div>

        {/* Chat Content - Placeholder */}
        <div className="flex-1 p-4 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
          <div className="text-center text-zinc-500 dark:text-zinc-400 mt-8">
            <MessageCircle size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">AI Chat integration coming soon!</p>
            <p className="text-xs mt-2">
              This widget will connect to your AI assistant.
            </p>
          </div>
        </div>

        {/* Input Area - Placeholder */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 outline-none focus:ring-2 focus:ring-blue-600"
              disabled
            />
            <button
              className="px-6 py-2 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
