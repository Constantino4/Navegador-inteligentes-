import React from 'react';
import {
  Plus,
  Compass,
  Activity,
  Globe,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { AgentState } from '../types/agent';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onToggleBrowser: () => void;
  isBrowserOpen: boolean;
  agentState: AgentState;
  historyTopics: string[];
  onSelectTopic: (topic: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  onNewChat,
  onToggleBrowser,
  isBrowserOpen,
  agentState,
  historyTopics,
  onSelectTopic,
}) => {
  const isRunning = agentState !== 'IDLE' && agentState !== 'COMPLETED' && agentState !== 'FAILED';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-[#171717] border-r border-[#2f2f2f] flex flex-col transition-all duration-300 select-none ${
          isOpen ? 'w-64' : 'w-0 md:w-16 overflow-hidden'
        }`}
      >
        {/* Top Header / New Chat */}
        <div className="p-3 border-b border-[#2f2f2f] flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={onNewChat}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#212121] hover:bg-[#2f2f2f] text-neutral-200 hover:text-white border border-[#2f2f2f] text-xs font-medium transition-colors ${
              !isOpen ? 'justify-center p-2' : ''
            }`}
            title="Novo Chat"
          >
            <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
            {isOpen && <span>Novo Chat</span>}
          </button>

          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-[#212121] transition-colors"
            title={isOpen ? 'Recolher menu' : 'Expandir menu'}
          >
            {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* History Sessions List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {isOpen && (
            <div className="text-[10px] uppercase font-bold text-neutral-500 px-2 py-1 font-mono">
              Pesquisas Recentes
            </div>
          )}

          {historyTopics.length === 0 ? (
            isOpen && (
              <div className="text-xs text-neutral-500 px-2 py-4 text-center">
                Sem histórico recente
              </div>
            )
          ) : (
            historyTopics.map((topic, idx) => (
              <button
                key={idx}
                onClick={() => onSelectTopic(topic)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#212121] text-neutral-300 hover:text-white text-xs text-left truncate transition-colors ${
                  !isOpen ? 'justify-center' : ''
                }`}
                title={topic}
              >
                <MessageSquare className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                {isOpen && <span className="truncate">{topic}</span>}
              </button>
            ))
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-[#2f2f2f] space-y-1 shrink-0">
          {/* Live Browser Trigger (Visualizar) */}
          <button
            onClick={onToggleBrowser}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#212121] text-xs font-medium transition-colors ${
              isBrowserOpen ? 'bg-[#212121] text-emerald-400' : 'text-neutral-300 hover:text-white'
            } ${!isOpen ? 'justify-center' : ''}`}
            title="Visualizar Navegador"
          >
            <div className="relative">
              <Globe className="w-4 h-4 shrink-0" />
              {isRunning && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            {isOpen && <span>Visualizar</span>}
          </button>

          {/* App Info */}
          {isOpen && (
            <div className="pt-2 px-2 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>Morph AI v2.1</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                agentState === 'COMPLETED' ? 'text-emerald-400 bg-emerald-950' : isRunning ? 'text-purple-400 bg-purple-950 animate-pulse' : 'text-neutral-400'
              }`}>
                {agentState}
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
