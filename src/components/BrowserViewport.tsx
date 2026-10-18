import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  Globe,
  Sliders,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Layers,
  MousePointerClick,
  Sparkles,
} from 'lucide-react';
import { BrowserObservation, InteractiveElement } from '../types/agent';

interface BrowserViewportProps {
  observation: BrowserObservation | null;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onScroll: (direction: 'up' | 'down') => void;
  onClickElement: (elementId: string) => void;
  onTypeElement: (elementId: string, text: string, submit: boolean) => void;
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  observation,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onScroll,
  onClickElement,
  onTypeElement,
}) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'elements' | 'text'>('visual');
  const [urlInput, setUrlInput] = useState(observation?.url || '');
  const [filterElementQuery, setFilterElementQuery] = useState('');
  const [typingModal, setTypingModal] = useState<{ element: InteractiveElement; text: string; submit: boolean } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (observation?.url) {
      setUrlInput(observation.url);
      setIframeKey(prev => prev + 1);
    }
  }, [observation?.url, observation?.timestamp]);

  // Listen to postMessage from the proxied iframe when user clicks a link inside it
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'MORPH_NAVIGATE') {
        if (e.data.morphId && e.data.morphId !== 'undefined') {
          onClickElement(e.data.morphId);
        } else if (e.data.href) {
          onNavigate(e.data.href);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClickElement, onNavigate]);

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onNavigate(urlInput.trim());
    }
  };

  const filteredElements = (observation?.interactiveElements || []).filter(el => {
    if (!filterElementQuery) return true;
    const q = filterElementQuery.toLowerCase();
    return (
      el.id.includes(q) ||
      el.tag.toLowerCase().includes(q) ||
      el.text.toLowerCase().includes(q) ||
      (el.placeholder && el.placeholder.toLowerCase().includes(q)) ||
      (el.href && el.href.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 overflow-hidden">
      {/* Browser Controls / Address Bar */}
      <div className="bg-slate-950/70 p-2.5 border-b border-slate-800 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            disabled={!observation?.canGoBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onForward}
            disabled={!observation?.canGoForward}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Avançar"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onReload}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Recarregar"
          >
            <RotateCw className={`w-4 h-4 ${observation?.isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>

        {/* URL Bar */}
        <form onSubmit={handleSubmitUrl} className="flex-1 flex items-center">
          <div className="w-full flex items-center bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus-within:border-emerald-500 transition-all shadow-inner">
            <Lock className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Digite uma URL real ou deixe o agente navegar..."
              className="w-full bg-transparent outline-none text-slate-100 placeholder:text-slate-500 font-mono text-[11px]"
            />
            {observation?.statusCode && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ml-2 font-medium shrink-0 ${
                observation.statusCode === 200 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {observation.statusCode}
              </span>
            )}
          </div>
        </form>

        {/* View Mode Tabs */}
        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'visual'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Renderização visual real da página"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Visual</span>
          </button>
          <button
            onClick={() => setActiveTab('elements')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'elements'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Inspetor de elementos interativos detectados pelo agente"
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">DOM ({observation?.totalElementsCount || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'text'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Conteúdo textual estruturado extraído"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Texto</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative overflow-hidden bg-slate-950">
        {activeTab === 'visual' && (
          <div className="w-full h-full flex flex-col relative">
            {/* Visual Viewport Iframe */}
            <iframe
              key={iframeKey}
              src="/api/browser/render"
              title="Browser Viewport"
              sandbox="allow-same-origin allow-scripts"
              className="w-full h-full border-none bg-white"
            />

            {/* Float badge explaining markers */}
            <div className="absolute top-2 right-2 bg-slate-950/80 border border-slate-800 text-[10px] text-slate-400 px-2.5 py-1 rounded-md backdrop-blur pointer-events-none flex items-center gap-1.5 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Elementos interativos reais mapeados pelo Agent Engine</span>
            </div>
          </div>
        )}

        {activeTab === 'elements' && (
          <div className="w-full h-full flex flex-col p-3 overflow-hidden">
            {/* Element Filter Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={filterElementQuery}
                  onChange={e => setFilterElementQuery(e.target.value)}
                  placeholder="Filtrar por ID, tag, texto, placeholder..."
                  className="w-full bg-transparent outline-none text-slate-200 placeholder:text-slate-500 font-mono text-[11px]"
                />
              </div>
              <div className="text-[11px] text-slate-400 font-mono shrink-0">
                {filteredElements.length} de {observation?.totalElementsCount || 0} elementos
              </div>
            </div>

            {/* Elements List Table */}
            <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 font-mono text-xs">
              {filteredElements.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Nenhum elemento interativo encontrado com este filtro.
                </div>
              ) : (
                filteredElements.map(el => (
                  <div
                    key={el.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 gap-3 group transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800/80 text-emerald-400 font-bold text-[10px] shrink-0">
                        #{el.id}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase shrink-0 font-sans font-semibold">
                        {el.tag}
                      </span>
                      <span className="text-slate-200 truncate text-[11px] font-sans" title={el.text}>
                        {el.text || el.placeholder || el.name || '<sem rótulo>'}
                      </span>
                      {el.href && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={el.href}>
                          {el.href}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onClickElement(el.id)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 text-[10px] font-sans font-medium transition-colors"
                        title="Simular clique como o agente"
                      >
                        Clicar
                      </button>
                      {(el.tag === 'input' || el.tag === 'textarea' || el.role === 'search') && (
                        <button
                          onClick={() => setTypingModal({ element: el, text: '', submit: true })}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 text-[10px] font-sans font-medium transition-colors"
                          title="Digitar texto neste campo"
                        >
                          Digitar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="w-full h-full p-4 overflow-y-auto space-y-4 font-sans text-xs text-slate-300">
            {/* Headings */}
            {observation?.extractedHeadings && observation.extractedHeadings.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 mb-2 font-mono flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Estrutura de Cabeçalhos (H1/H2/H3)
                </div>
                <ul className="space-y-1 list-disc list-inside text-slate-300 text-[11px]">
                  {observation.extractedHeadings.map((h, i) => (
                    <li key={i} className="truncate">{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Extracted clean readable text */}
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
              <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 mb-2 font-mono flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Texto Visível Extraído pelo Motor
              </div>
              <div className="whitespace-pre-wrap leading-relaxed text-slate-300 text-[11px] font-mono bg-slate-950 p-3 rounded border border-slate-800/80 max-h-[500px] overflow-y-auto">
                {observation?.visibleTextSnippet || 'Nenhum texto extraído nesta página.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Browser Footer Status & Scroll Bar */}
      <div className="bg-slate-950 px-3 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2 truncate">
          <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="truncate text-[11px] text-slate-300 font-medium">
            {observation?.title || 'Morph AI Browser Engine'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-[11px] font-mono text-slate-400">
            Scroll: <span className="text-emerald-400 font-semibold">{observation?.scrollPosition?.percentage || 0}%</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onScroll('up')}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Rolar para cima"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onScroll('down')}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Rolar para baixo"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Typing helper modal */}
      {typingModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-4 shadow-2xl">
            <div className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Digitar no Elemento #{typingModal.element.id}
            </div>
            <p className="text-xs text-slate-400 mb-3 font-mono">
              Tag: {typingModal.element.tag} | Name: {typingModal.element.name || 'none'}
            </p>
            <input
              type="text"
              autoFocus
              value={typingModal.text}
              onChange={e => setTypingModal({ ...typingModal, text: e.target.value })}
              placeholder="Texto a enviar..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 mb-3"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={typingModal.submit}
                onChange={e => setTypingModal({ ...typingModal, submit: e.target.checked })}
                className="rounded border-slate-700 text-emerald-600 focus:ring-0"
              />
              <span>Pressionar Enter / Submeter formulário</span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTypingModal(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onTypeElement(typingModal.element.id, typingModal.text, typingModal.submit);
                  setTypingModal(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
              >
                Executar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
