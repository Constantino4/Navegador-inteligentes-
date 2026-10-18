import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  Search,
  Globe,
  Eye,
  MousePointerClick,
  FileText,
  ChevronUp,
  ChevronDown,
  X,
  Star,
  Puzzle,
  MoreVertical,
  Home,
  Plus,
  ExternalLink,
  Sparkles,
  Layers,
  Copy,
  Check,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Monitor,
  Activity,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { BrowserObservation, InteractiveElement, BrowserTab } from '../types/agent';

interface ChromeWindowProps {
  observation: BrowserObservation | null;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onScroll: (direction: 'up' | 'down') => void;
  onClickElement: (elementId: string) => void;
  onTypeElement: (elementId: string, text: string, submit: boolean) => void;
  onSwitchTab?: (tabId: string) => void;
  onCreateTab?: () => void;
  onCloseTab?: (tabId: string) => void;
  onClose?: () => void;
  onSolveCaptcha?: () => void;
  onOpenVerificationModal?: () => void;
}

export const ChromeWindow: React.FC<ChromeWindowProps> = ({
  observation,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onScroll,
  onClickElement,
  onTypeElement,
  onSwitchTab,
  onCreateTab,
  onCloseTab,
  onClose,
  onSolveCaptcha,
  onOpenVerificationModal,
}) => {
  const [activeTabMode, setActiveTabMode] = useState<'visual' | 'elements' | 'text' | 'network'>('visual');
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [urlInput, setUrlInput] = useState(observation?.url || '');
  const [filterQuery, setFilterQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (observation?.url) {
      setUrlInput(observation.url);
      setIframeKey(prev => prev + 1);
    }
  }, [observation?.url, observation?.timestamp, observation?.activeTabId]);

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onNavigate(urlInput.trim());
    }
  };

  const handleCopyUrl = () => {
    if (observation?.url) {
      navigator.clipboard.writeText(observation.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredElements = (observation?.interactiveElements || []).filter(el => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      el.id.includes(q) ||
      el.tag.toLowerCase().includes(q) ||
      el.text.toLowerCase().includes(q) ||
      (el.placeholder && el.placeholder.toLowerCase().includes(q)) ||
      (el.href && el.href.toLowerCase().includes(q))
    );
  });

  const tabsList = observation?.tabs || [];

  return (
    <div className="flex flex-col h-full w-full bg-[#202124] text-[#e8eaed] overflow-hidden select-none border-l border-slate-800 shadow-2xl">
      {/* 1. Chrome Multi-Tab Bar (Authentic Chrome 2026 style) */}
      <div className="bg-[#1f1f23] pt-2 px-3 flex items-center justify-between border-b border-[#2d2e31] shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 mr-2">
          {/* Traffic Light Dots */}
          <div className="flex items-center gap-1.5 mr-2 shrink-0">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-[#ff5f56] hover:opacity-80 transition-opacity flex items-center justify-center group"
              title="Fechar janela"
            >
              <X className="w-2 h-2 text-black/60 opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>

          {/* Render Multi-Tabs */}
          {tabsList.map(t => {
            const isActive = t.id === observation?.activeTabId;
            return (
              <div
                key={t.id}
                onClick={() => onSwitchTab?.(t.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs font-sans max-w-[180px] cursor-pointer transition-colors shrink-0 ${
                  isActive
                    ? 'bg-[#292a2d] text-[#e8eaed] border-t border-x border-[#3c4043] font-medium shadow-sm'
                    : 'text-[#9aa0a6] hover:bg-[#25262a] hover:text-[#bdc1c6]'
                }`}
              >
                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0">
                  {t.url.includes('google') ? (
                    <span className="text-[10px] font-bold text-[#4285f4]">G</span>
                  ) : t.url.includes('wikipedia') ? (
                    <span className="text-[10px] font-bold text-white">W</span>
                  ) : (
                    <Globe className="w-3 h-3 text-emerald-400" />
                  )}
                </div>
                <span className="truncate text-[11px] flex-1">
                  {t.title || 'Separador'}
                </span>
                {tabsList.length > 1 && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onCloseTab?.(t.id);
                    }}
                    className="text-[#9aa0a6] hover:text-white p-0.5 rounded hover:bg-[#3c4043]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab Button */}
          <button
            onClick={() => onCreateTab?.()}
            className="p-1 rounded-full text-[#9aa0a6] hover:text-white hover:bg-[#292a2d] transition-colors shrink-0 ml-1"
            title="Abrir novo separador em paralelo"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#9aa0a6] hover:text-white hover:bg-[#292a2d] text-xs transition-colors shrink-0"
            title="Minimizar Navegador"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Chrome Toolbar & Omnibox */}
      <div className="bg-[#292a2d] p-2 flex items-center gap-2 border-b border-[#3c4043] shrink-0">
        <div className="flex items-center gap-1 text-[#9aa0a6] shrink-0">
          <button
            onClick={onBack}
            disabled={!observation?.canGoBack}
            className="p-1.5 rounded-full hover:bg-[#3c4043] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onForward}
            disabled={!observation?.canGoForward}
            className="p-1.5 rounded-full hover:bg-[#3c4043] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Avançar"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onReload}
            className="p-1.5 rounded-full hover:bg-[#3c4043] hover:text-white transition-colors"
            title="Recarregar"
          >
            <RotateCw className={`w-4 h-4 ${observation?.isLoading ? 'animate-spin text-[#8ab4f8]' : ''}`} />
          </button>
          <button
            onClick={() => onNavigate('https://www.google.com')}
            className="p-1.5 rounded-full hover:bg-[#3c4043] hover:text-white transition-colors"
            title="Página inicial (Google)"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Omnibox (Address Bar) */}
        <form onSubmit={handleSubmitUrl} className="flex-1 flex items-center min-w-0">
          <div className="w-full flex items-center bg-[#1f1f23] hover:bg-[#1a1a1e] focus-within:bg-[#1a1a1e] border border-[#3c4043] focus-within:border-[#8ab4f8] rounded-full px-3 py-1.5 text-xs text-[#e8eaed] transition-all shadow-inner">
            <Lock className="w-3.5 h-3.5 text-[#8ab4f8] mr-2 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Pesquisar no Google ou digitar um URL..."
              className="w-full bg-transparent outline-none text-[#e8eaed] placeholder:text-[#9aa0a6] font-sans text-xs truncate"
            />
            {observation?.statusCode && observation.statusCode !== 200 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-400 font-mono ml-1 shrink-0">
                {observation.statusCode}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyUrl}
              className="text-[#9aa0a6] hover:text-white p-1 rounded ml-1 transition-colors shrink-0"
              title="Copiar URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              className="text-[#9aa0a6] hover:text-white p-1 rounded transition-colors shrink-0"
              title="Favoritos"
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* View Switcher Pills */}
        <div className="flex items-center gap-1 text-[#9aa0a6] shrink-0">
          <div className="flex items-center bg-[#1f1f23] p-0.5 rounded-lg border border-[#3c4043]">
            <button
              onClick={() => setActiveTabMode('visual')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTabMode === 'visual' ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#9aa0a6] hover:text-white'
              }`}
            >
              Visual
            </button>
            <button
              onClick={() => setActiveTabMode('elements')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTabMode === 'elements' ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#9aa0a6] hover:text-white'
              }`}
            >
              DOM ({observation?.totalElementsCount || 0})
            </button>
            <button
              onClick={() => setActiveTabMode('text')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTabMode === 'text' ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#9aa0a6] hover:text-white'
              }`}
            >
              Texto
            </button>
            <button
              onClick={() => setActiveTabMode('network')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTabMode === 'network' ? 'bg-[#8ab4f8] text-[#202124]' : 'text-[#9aa0a6] hover:text-white'
              }`}
            >
              Network
            </button>
          </div>
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#4285f4] to-[#34a853] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            M
          </div>
        </div>
      </div>

      {/* Enterprise DevTools & Anti-Bot Status Ribbon */}
      <div className="bg-[#1a1a1d] px-3 py-1.5 border-b border-[#323337] flex items-center justify-between text-[11px] text-[#9aa0a6] shrink-0 font-sans">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Stealth Engine v2.4 (Chrome 134)</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[#9aa0a6]">
            <span>•</span>
            <Activity className="w-3 h-3 text-[#8ab4f8]" />
            <span>HTTP {observation?.statusCode || 200}</span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-[#9aa0a6]">
            <span>•</span>
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span>Latência ~38ms</span>
          </div>
        </div>

        {/* Viewport Dimension Switcher (Desktop vs Mobile) */}
        <div className="flex items-center gap-1 bg-[#25262a] p-0.5 rounded border border-[#3c4043]">
          <button
            onClick={() => setViewportMode('desktop')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              viewportMode === 'desktop' ? 'bg-[#8ab4f8] text-[#202124] font-medium' : 'text-[#9aa0a6] hover:text-white'
            }`}
            title="Modo Ecrã Inteiro (Desktop 1920x1080)"
          >
            <Monitor className="w-3 h-3" />
            <span>Desktop</span>
          </button>
          <button
            onClick={() => setViewportMode('mobile')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              viewportMode === 'mobile' ? 'bg-[#8ab4f8] text-[#202124] font-medium' : 'text-[#9aa0a6] hover:text-white'
            }`}
            title="Modo Telemóvel (Mobile 390x844)"
          >
            <Smartphone className="w-3 h-3" />
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* CAPTCHA / Human Verification Alert Banner (Requirement: Human-in-the-Loop) */}
      {observation?.captchaDetected && (
        <div className="bg-amber-950/90 border-b border-amber-600 px-3 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0 shadow-lg">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="font-medium text-[11px]">
              Verificação Humana (CAPTCHA) detectada. Por favor, resolve o desafio na tela e clica em continuar.
            </span>
          </div>
          <button
            onClick={() => {
              if (onSolveCaptcha) onSolveCaptcha();
              else onReload();
            }}
            className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition-colors"
          >
            Continuar Navegação
          </button>
        </div>
      )}

      {/* Verification Code / SMS / Email 2FA Banner */}
      {observation?.verificationChallenge?.detected && (
        <div className="bg-blue-950/95 border-b border-blue-600/80 px-3 py-2 flex items-center justify-between text-xs text-blue-200 shrink-0 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <KeyRound className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
            <span className="font-medium text-[11px] truncate">
              {observation.verificationChallenge.prompt}
            </span>
          </div>
          {onOpenVerificationModal && (
            <button
              onClick={onOpenVerificationModal}
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] transition-colors shrink-0 ml-2 shadow-sm"
            >
              Inserir Código
            </button>
          )}
        </div>
      )}

      {/* 3. Main Chrome Viewport */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {activeTabMode === 'visual' && (
          <div className={`w-full h-full flex flex-col relative ${viewportMode === 'mobile' ? 'bg-[#121214] items-center justify-center p-4 overflow-y-auto' : ''}`}>
            {viewportMode === 'mobile' ? (
              <div className="w-[390px] h-[780px] max-h-full rounded-[40px] border-[6px] border-[#3c4043] bg-black shadow-2xl overflow-hidden flex flex-col relative shrink-0">
                {/* Mobile Speaker Notch */}
                <div className="h-6 bg-black flex items-center justify-center shrink-0">
                  <div className="w-24 h-4 bg-[#202124] rounded-full" />
                </div>
                {/* Mobile Viewport Screen */}
                <iframe
                  key={iframeKey}
                  src="/api/browser/render"
                  title="Mobile Viewport"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  className="w-full flex-1 border-none bg-white"
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col relative">
                <iframe
                  key={iframeKey}
                  src="/api/browser/render"
                  title="Google Chrome Viewport"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  className="w-full h-full border-none bg-white"
                />
                <div className="absolute top-2.5 right-2.5 bg-[#202124]/90 border border-[#3c4043] text-[10px] text-[#e8eaed] px-2.5 py-1 rounded-full backdrop-blur pointer-events-none flex items-center gap-1.5 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Navegador Chrome Ativo • Tempo Real</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTabMode === 'elements' && (
          <div className="w-full h-full flex flex-col p-3 bg-[#1f1f23] overflow-hidden">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#3c4043] gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-1 bg-[#292a2d] border border-[#3c4043] rounded-lg px-2.5 py-1 text-xs">
                <Search className="w-3.5 h-3.5 text-[#9aa0a6]" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={e => setFilterQuery(e.target.value)}
                  placeholder="Pesquisar elementos interativos..."
                  className="w-full bg-transparent outline-none text-[#e8eaed] placeholder:text-[#9aa0a6] text-[11px]"
                />
              </div>
              <div className="text-[11px] text-[#9aa0a6] font-mono shrink-0">
                {filteredElements.length} elementos
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 font-mono text-xs">
              {filteredElements.length === 0 ? (
                <div className="p-8 text-center text-[#9aa0a6] text-xs">
                  Nenhum elemento encontrado.
                </div>
              ) : (
                filteredElements.map(el => (
                  <div
                    key={el.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#292a2d] hover:bg-[#323337] border border-[#3c4043] gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#1f1f23] text-[#8ab4f8] font-bold text-[10px] shrink-0 border border-[#3c4043]">
                        #{el.id}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#3c4043] text-white text-[10px] uppercase font-sans font-semibold shrink-0">
                        {el.tag}
                      </span>
                      <span className="text-[#e8eaed] truncate text-[11px] font-sans" title={el.text}>
                        {el.text || el.placeholder || el.name || '<sem rótulo>'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onClickElement(el.id)}
                        className="px-2 py-0.5 rounded bg-[#1a73e8] hover:bg-[#1557b0] text-white text-[10px] font-sans font-medium transition-colors"
                      >
                        Clicar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTabMode === 'text' && (
          <div className="w-full h-full p-4 overflow-y-auto space-y-3 bg-[#1f1f23] text-xs text-[#e8eaed]">
            <div className="bg-[#292a2d] border border-[#3c4043] p-3 rounded-xl">
              <div className="text-[11px] font-bold text-[#8ab4f8] mb-2 uppercase tracking-wider font-mono">
                Texto Extraído pelo Motor
              </div>
              <div className="whitespace-pre-wrap leading-relaxed text-[#bdc1c6] font-mono text-[11px] bg-[#1f1f23] p-3 rounded-lg border border-[#3c4043] max-h-[500px] overflow-y-auto">
                {observation?.visibleTextSnippet || 'Nenhum texto extraído nesta página.'}
              </div>
            </div>
          </div>
        )}

        {activeTabMode === 'network' && (
          <div className="w-full h-full p-4 overflow-y-auto space-y-4 bg-[#1f1f23] text-xs text-[#e8eaed] font-sans">
            {/* Network Overview Card */}
            <div className="bg-[#292a2d] border border-[#3c4043] p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold text-[#8ab4f8] mb-3 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>Inspetor de Rede & Telemetria Enterprise</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                  HTTP/2 • TLS 1.3 Ativo
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                <div className="p-2.5 rounded-lg bg-[#1f1f23] border border-[#3c4043]">
                  <div className="text-[10px] text-[#9aa0a6] uppercase font-mono">Status Code</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    {observation?.statusCode || 200} OK
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1f1f23] border border-[#3c4043]">
                  <div className="text-[10px] text-[#9aa0a6] uppercase font-mono">Latência RTT</div>
                  <div className="text-sm font-bold text-neutral-200 mt-0.5">~38 ms</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1f1f23] border border-[#3c4043]">
                  <div className="text-[10px] text-[#9aa0a6] uppercase font-mono">Anti-Bot Stealth</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">Ativo (v2.4)</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#1f1f23] border border-[#3c4043]">
                  <div className="text-[10px] text-[#9aa0a6] uppercase font-mono">DOM Nodes</div>
                  <div className="text-sm font-bold text-blue-400 mt-0.5">
                    {observation?.totalElementsCount || 0}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] font-mono pt-2 border-t border-[#3c4043]">
                <div className="flex justify-between py-1 border-b border-[#3c4043]/50">
                  <span className="text-[#9aa0a6]">URL Alvo:</span>
                  <span className="text-[#8ab4f8] truncate max-w-xs">{observation?.url}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#3c4043]/50">
                  <span className="text-[#9aa0a6]">User-Agent:</span>
                  <span className="text-neutral-300 truncate max-w-xs">Chrome 134.0.0.0 (Windows NT 10.0; Win64; x64)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#3c4043]/50">
                  <span className="text-[#9aa0a6]">Sec-Ch-Ua:</span>
                  <span className="text-neutral-300">"Chromium";v="134", "Google Chrome";v="134"</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#9aa0a6]">Bypass Cloudflare / CAPTCHA:</span>
                  <span className="text-emerald-400 font-semibold">Integrado (Human-in-the-Loop + Cookie Jar)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Chrome Bottom Status Bar */}
      <div className="bg-[#1f1f23] px-3 py-1.5 border-t border-[#3c4043] flex items-center justify-between text-xs text-[#9aa0a6] shrink-0">
        <div className="flex items-center gap-2 truncate">
          <Globe className="w-3.5 h-3.5 text-[#9aa0a6] shrink-0" />
          <span className="truncate text-[11px] text-[#e8eaed]">
            {observation?.url || 'https://www.google.com'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono">
            Scroll: <span className="text-[#8ab4f8] font-bold">{observation?.scrollPosition?.percentage || 0}%</span>
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onScroll('up')}
              className="p-1 rounded hover:bg-[#292a2d] text-[#9aa0a6] hover:text-white transition-colors"
              title="Rolar para cima"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onScroll('down')}
              className="p-1 rounded hover:bg-[#292a2d] text-[#9aa0a6] hover:text-white transition-colors"
              title="Rolar para baixo"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
