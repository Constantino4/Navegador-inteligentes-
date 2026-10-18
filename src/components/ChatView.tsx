import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  Sparkles,
  Globe,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Compass,
  FileText,
  Clock,
  Printer,
  Table,
  ShieldAlert,
  KeyRound,
  Calendar,
  Download,
} from 'lucide-react';
import { AgentState, PlanStep, TaskFindings, ExtractedQuote, ChatMessage, VerificationChallenge } from '../types/agent';
import { PlacesCardList } from './PlacesCardList';

interface ChatViewProps {
  messages: ChatMessage[];
  agentState: AgentState;
  activePlan: PlanStep[];
  activeQuotes: ExtractedQuote[];
  latestFindings: TaskFindings | null;
  onSendMessage: (prompt: string) => void;
  onStopAgent: () => void;
  onToggleBrowser: () => void;
  isBrowserOpen: boolean;
  onOpenUrl: (url: string) => void;
  captchaDetected?: boolean;
  verificationChallenge?: VerificationChallenge;
  onOpenVerificationModal?: () => void;
  onOpenMap?: () => void;
  onSelectMapPlace?: (placeId: string) => void;
  isMapOpen?: boolean;
}

const PRESET_PROMPTS = [
  {
    title: 'Comparar telemóveis Samsung < $300',
    desc: 'Pesquisar e comparar opções Samsung abaixo de 300 dólares com melhor relação qualidade/preço',
    prompt: 'Procura os melhores telemóveis Samsung abaixo de 300 dólares, compara várias opções e diz-me qual tem melhor relação qualidade/preço.',
  },
  {
    title: 'Avanços em Computação Quântica',
    desc: 'Descobrir novidades recentes e sintetizar as principais descobertas com fontes',
    prompt: 'Pesquisa os avanços mais recentes em computação quântica e processadores quânticos e resume as principais descobertas com fontes confiáveis.',
  },
  {
    title: 'TypeScript: Types vs Interfaces',
    desc: 'Consultar documentação oficial e sintetizar diferenças práticas',
    prompt: 'Explora a documentação oficial ou artigos técnicos fiáveis sobre TypeScript e compara Type Aliases vs Interfaces com exemplos práticos.',
  },
  {
    title: 'Previsão do Tempo Lisboa vs Porto',
    desc: 'Verificar meteorologia para os próximos dias e comparar temperaturas',
    prompt: 'Procura a previsão do tempo para Lisboa e compara com o Porto para os próximos dias, destacando temperaturas e probabilidade de chuva.',
  },
  {
    title: 'Empresas de Tecnologia em Lisboa',
    desc: 'Pesquisar empresas de software com contactos, moradas e websites oficiais',
    prompt: 'Procura empresas de software e tecnologia em Lisboa, mostra os contactos, moradas e websites oficiais.',
  },
];

// Inline formatting for **bold** and `code`
function formatInlineEmphasis(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-300 font-mono text-[14px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Custom renderer for ChatGPT-like typography with prominent subtitles, larger font, and table support
function renderFormattedAnswer(text: string) {
  if (!text) return null;
  const lines = text.split('\n');

  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = (keyIdx: number) => {
    if (tableRows.length > 0) {
      const headerRow = tableRows[0];
      const bodyRows = tableRows.slice(1).filter(r => !r.every(c => c.match(/^:?-+:?$/)));

      elements.push(
        <div key={`table-${keyIdx}`} className="overflow-x-auto my-4 rounded-xl border border-neutral-700 bg-neutral-900/70 shadow-sm">
          <table className="w-full text-left border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-800/80">
                {headerRow.map((col, cIdx) => (
                  <th key={cIdx} className="p-3 font-semibold text-white">
                    {formatInlineEmphasis(col.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 text-neutral-200">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-neutral-800/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="p-3 text-[14.5px]">
                      {formatInlineEmphasis(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim();

    // Markdown Table Detection (starts and ends with |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cols = trimmed.slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cols);
      continue;
    } else if (inTable) {
      flushTable(idx);
    }

    // Level 2 heading: ## Subtitle
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="text-2xl font-extrabold text-white pt-6 pb-2 border-b border-neutral-700/60 font-sans tracking-tight">
          {trimmed.replace(/^##\s+/, '')}
        </h2>
      );
      continue;
    }

    // Level 3 heading: ### Subtitle (Prominent ChatGPT style)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="text-xl font-bold text-white pt-5 pb-1.5 flex items-center gap-2 font-sans tracking-tight">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          {trimmed.replace(/^###\s+/, '')}
        </h3>
      );
      continue;
    }

    // Bullet point: - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const content = trimmed.replace(/^[-*•]\s+/, '');
      elements.push(
        <div key={idx} className="flex items-start gap-3 pl-2 text-[16px] text-neutral-200 leading-relaxed my-1.5">
          <span className="text-emerald-400 font-bold mt-1 text-base leading-none">•</span>
          <span className="flex-1">{formatInlineEmphasis(content)}</span>
        </div>
      );
      continue;
    }

    // Numbered list: 1. or 2.
    if (/^\d+\.\s+/.test(trimmed)) {
      const num = trimmed.match(/^(\d+\.)\s+/)?.[1];
      const content = trimmed.replace(/^\d+\.\s+/, '');
      elements.push(
        <div key={idx} className="flex items-start gap-3 pl-2 text-[16px] text-neutral-200 leading-relaxed my-1.5">
          <span className="text-emerald-400 font-semibold font-mono text-sm mt-0.5">{num}</span>
          <span className="flex-1">{formatInlineEmphasis(content)}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (!trimmed) {
      elements.push(<div key={idx} className="h-2" />);
      continue;
    }

    // Regular paragraph: larger font (16px), clean leading (1.75)
    elements.push(
      <p key={idx} className="text-[16px] text-neutral-200 leading-[1.78] my-2 font-sans">
        {formatInlineEmphasis(trimmed)}
      </p>
    );
  }

  if (inTable) {
    flushTable(lines.length);
  }

  return <div className="space-y-1">{elements}</div>;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  agentState,
  activePlan,
  activeQuotes,
  latestFindings,
  onSendMessage,
  onStopAgent,
  onToggleBrowser,
  isBrowserOpen,
  onOpenUrl,
  captchaDetected,
  verificationChallenge,
  onOpenVerificationModal,
  onOpenMap,
  onSelectMapPlace,
  isMapOpen,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isRunning = agentState !== 'IDLE' && agentState !== 'COMPLETED' && agentState !== 'FAILED';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activePlan, activeQuotes, latestFindings]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputPrompt.trim() && !isRunning) {
      onSendMessage(inputPrompt.trim());
      setInputPrompt('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMarkdown = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintOrPdf = (title: string, text: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>${title || 'Relatório de Pesquisa - Morph AI'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
          h1, h2, h3 { color: #111; margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
          th { background: #f4f4f4; }
          ul { padding-left: 20px; }
          li { margin-bottom: 6px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${title || 'Relatório de Pesquisa - Morph AI Browser'}</h1>
        <hr style="border: 0; border-top: 1px solid #ddd; margin: 16px 0;" />
        <div style="white-space: pre-wrap; font-size: 15px; margin-top: 20px;">${text}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#171717] text-[#ececec] overflow-hidden relative font-sans">
      {/* Messages Scroll Feed */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.length === 0 ? (
            /* ChatGPT-like Empty State */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center pt-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black mb-5 shadow-xl shadow-emerald-950/40">
                <Compass className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
                No que posso navegar hoje?
              </h1>
              <p className="text-sm text-neutral-400 max-w-md mb-8 leading-relaxed">
                Descreve o teu objetivo em português. O navegador abrirá páginas reais, recolherá informação, comparará dados e apresentará a resposta diretamente aqui no chat.
              </p>

              {/* Preset Goal Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {PRESET_PROMPTS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputPrompt(preset.prompt);
                      if (textareaRef.current) textareaRef.current.focus();
                    }}
                    className="p-3.5 rounded-xl bg-[#212121] hover:bg-[#2f2f2f] border border-[#2f2f2f] hover:border-neutral-600 text-left transition-all group"
                  >
                    <div className="text-xs font-semibold text-neutral-200 group-hover:text-white mb-1">
                      {preset.title}
                    </div>
                    <div className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                      {preset.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages Stream */
            messages.map(msg => (
              <div key={msg.id} className="space-y-4">
                {msg.role === 'user' ? (
                  /* User Message */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] bg-[#2f2f2f] text-white px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant Message */
                  <div className="flex gap-4 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-md">
                      <Sparkles className="w-4 h-4" />
                    </div>

                    <div className="flex-1 space-y-4 min-w-0">
                      {/* CAPTCHA Alert in Chat (As requested: Se aparecer o CAPTCHA o app deve pedir para visualizar) */}
                      {captchaDetected && (
                        <div className="p-4 rounded-2xl bg-amber-950/90 border border-amber-600/80 text-amber-200 flex items-center justify-between gap-3 shadow-lg">
                          <div className="flex items-center gap-2.5 text-xs font-medium">
                            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                            <span>Verificação Humana (CAPTCHA) necessária. Clica em <strong>Visualizar</strong> para resolver no navegador.</span>
                          </div>
                          <button
                            onClick={onToggleBrowser}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm"
                          >
                            Visualizar
                          </button>
                        </div>
                      )}

                      {/* Verification Code / SMS / Email 2FA Challenge in Chat */}
                      {verificationChallenge?.detected && (
                        <div className="p-4 rounded-2xl bg-blue-950/90 border border-blue-600/80 text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                          <div className="flex items-center gap-2.5 text-xs font-medium">
                            <KeyRound className="w-5 h-5 text-blue-400 shrink-0 animate-pulse" />
                            <span>{verificationChallenge.prompt}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                            {onOpenVerificationModal && (
                              <button
                                onClick={onOpenVerificationModal}
                                className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition-colors shadow-sm"
                              >
                                Inserir Código
                              </button>
                            )}
                            <button
                              onClick={onToggleBrowser}
                              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium shrink-0 transition-colors border border-neutral-700"
                            >
                              Visualizar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Single Active Step Display (As requested: No processo de espera só deve mostrar a etapa que está a fazer) */}
                      {msg.browsing && msg.browsing.state !== 'COMPLETED' && (
                        <div className="border border-[#2f2f2f] bg-[#212121] rounded-2xl p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin shrink-0" />
                              <div className="min-w-0">
                                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                                  Etapa em andamento:
                                </div>
                                <div className="text-sm font-medium text-neutral-200 truncate">
                                  {msg.browsing.steps?.find(s => s.status === 'in_progress')?.description || msg.browsing.statusText}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={onToggleBrowser}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2f2f2f] hover:bg-[#3f3f3f] text-neutral-200 text-xs font-medium transition-colors shrink-0"
                            >
                              <Globe className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Visualizar</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Main Synthesized Answer: Divided into sections, NO generic badge at the top! */}
                      {msg.content && (
                        <div className="bg-[#212121]/80 border border-[#2f2f2f] rounded-2xl p-6 shadow-sm space-y-5">
                          {/* Formatted body with larger typography and prominent subtitles */}
                          {renderFormattedAnswer(msg.content)}

                          {/* Google Maps Places Results */}
                          {msg.placesResult && (
                            <PlacesCardList
                              data={msg.placesResult}
                              onOpenMap={onOpenMap || onToggleBrowser}
                              onSelectPlace={onSelectMapPlace || (() => {})}
                              onInvestigateWebsite={onOpenUrl}
                            />
                          )}

                          {/* Calendar Event Action Card */}
                          {msg.calendarEvent && (
                            <div className="mt-4 p-4 rounded-xl bg-neutral-900/90 border border-emerald-800/40 shadow-md">
                              <div className="flex items-center justify-between flex-wrap gap-2 mb-2 pb-2 border-b border-[#2f2f2f]">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                                    📅
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-white">
                                      Ação no Calendário Confirmada
                                    </div>
                                    <div className="text-[11px] text-emerald-400 font-medium">
                                      {msg.calendarEvent.status || 'Concluído com Sucesso'}
                                    </div>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-300 font-mono border border-emerald-800/50">
                                  {msg.calendarEvent.date} {msg.calendarEvent.time ? `às ${msg.calendarEvent.time}` : ''}
                                </span>
                              </div>

                              <div className="text-sm font-semibold text-neutral-100 mb-1">
                                {msg.calendarEvent.title}
                              </div>
                              {msg.calendarEvent.description && (
                                <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
                                  {msg.calendarEvent.description}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-2 pt-2">
                                {msg.calendarEvent.googleCalendarUrl && (
                                  <a
                                    href={msg.calendarEvent.googleCalendarUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>Adicionar ao Google Calendar</span>
                                    <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                                  </a>
                                )}
                                {msg.calendarEvent.icsContent && (
                                  <button
                                    onClick={() => {
                                      const blob = new Blob([msg.calendarEvent!.icsContent!], { type: 'text/calendar;charset=utf-8' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `${msg.calendarEvent!.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2f2f2f] hover:bg-[#3f3f3f] text-neutral-200 border border-[#3f3f3f] transition-all cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5 text-neutral-400" />
                                    <span>Descarregar ficheiro .ICS</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Sources list */}
                          {msg.browsing?.findings?.sources && msg.browsing.findings.sources.length > 0 && (
                            <div className="pt-4 border-t border-[#2f2f2f]">
                              <div className="text-[11px] uppercase font-bold text-neutral-400 mb-2 font-mono">
                                Fontes Consultadas:
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {msg.browsing.findings.sources
                                  .filter(src => src && !src.includes('search_places') && !src.toLowerCase().includes('google maps'))
                                  .map((src, sIdx) => (
                                    <button
                                      key={sIdx}
                                      onClick={() => onOpenUrl(src)}
                                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#2f2f2f] hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs border border-[#3f3f3f] transition-colors"
                                    >
                                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                                      <span className="max-w-[220px] truncate">{src}</span>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Action Toolbar: Copy Markdown, Print / PDF */}
                          <div className="flex items-center gap-3 pt-3 border-t border-[#2f2f2f] text-xs text-neutral-400">
                            <button
                              onClick={() => handleCopyMarkdown(msg.id, msg.content)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#2f2f2f] hover:text-white transition-colors"
                              title="Copiar texto em Markdown"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar Markdown</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handlePrintOrPdf('Relatório de Pesquisa Morph AI', msg.content)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#2f2f2f] hover:text-white transition-colors"
                              title="Descarregar como PDF ou Imprimir"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>PDF / Imprimir</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Bottom Prompt Input (ChatGPT style) */}
      <div className="p-4 bg-gradient-to-t from-[#171717] via-[#171717] to-transparent shrink-0">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center bg-[#212121] border border-[#2f2f2f] focus-within:border-neutral-500 rounded-3xl p-2 shadow-2xl transition-all"
          >
            {/* Live Browser Button: "Visualizar" */}
            <button
              type="button"
              onClick={onToggleBrowser}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 mr-1 ${
                isBrowserOpen
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#2f2f2f] hover:bg-[#3f3f3f] text-neutral-300'
              }`}
              title="Visualizar o navegador"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Visualizar</span>
              {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
            </button>

            {/* Prompt Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={e => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Descreve o teu objetivo (ex: 'Procura os melhores telemóveis Samsung abaixo de $300...')"
              className="w-full bg-transparent resize-none outline-none text-sm text-[#ececec] placeholder:text-neutral-500 px-3 py-1.5 max-h-32"
            />

            {/* Send or Stop Button */}
            {isRunning ? (
              <button
                type="button"
                onClick={onStopAgent}
                className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-colors shrink-0 shadow-md ml-1"
                title="Parar e Enviar Novo"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputPrompt.trim()}
                className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shrink-0 shadow-md ml-1"
                title="Enviar"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </form>

          <div className="text-center text-[11px] text-neutral-500 mt-2">
            Morph AI Browser • Navegação e pesquisa na Web pública via Gemini 3.8 Flash.
          </div>
        </div>
      </div>
    </div>
  );
};
