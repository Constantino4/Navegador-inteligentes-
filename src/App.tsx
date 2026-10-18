import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { ChromeWindow } from './components/ChromeWindow';
import { ConfirmationModal } from './components/ConfirmationModal';
import { VerificationModal } from './components/VerificationModal';
import { MapPanel } from './components/MapPanel';
import {
  AgentState,
  PlanStep,
  AgentEvent,
  BrowserObservation,
  TaskFindings,
  SensitiveActionRequest,
  ExtractedQuote,
  ChatMessage,
  BusinessPlace,
  MapSearchResult,
  CalendarEvent,
} from './types/agent';
import { Globe, Menu } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [activePlan, setActivePlan] = useState<PlanStep[]>([]);
  const [activeQuotes, setActiveQuotes] = useState<ExtractedQuote[]>([]);
  const [latestFindings, setLatestFindings] = useState<TaskFindings | null>(null);
  const [browserObservation, setBrowserObservation] = useState<BrowserObservation | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<SensitiveActionRequest | null>(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [historyTopics, setHistoryTopics] = useState<string[]>([]);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [lastVerificationField, setLastVerificationField] = useState<string | null>(null);

  // Google Maps state
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapPlaces, setMapPlaces] = useState<BusinessPlace[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 38.7223, lng: -9.1393 });
  const [mapQuery, setMapQuery] = useState<string>('');
  const [selectedMapPlaceId, setSelectedMapPlaceId] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const currentAssistantMsgIdRef = useRef<string | null>(null);

  // Multi-tenant session identifier helper
  const getSessionId = (): string => {
    try {
      let sid = localStorage.getItem('morph_session_id');
      if (!sid) {
        sid = 'sess_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        localStorage.setItem('morph_session_id', sid);
      }
      document.cookie = `morph_session_id=${encodeURIComponent(sid)}; path=/; SameSite=Lax`;
      return sid;
    } catch {
      return 'default';
    }
  };

  const apiFetch = (url: string, init?: RequestInit): Promise<Response> => {
    const sid = getSessionId();
    const headers = new Headers(init?.headers || {});
    headers.set('x-session-id', sid);
    return fetch(url, {
      ...init,
      headers,
    });
  };

  // Global listener for seamless iframe navigation & real form proxying
  useEffect(() => {
    const handleFrameMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'MORPH_NAVIGATE' && e.data.href) {
        handleNavigate(e.data.href);
      } else if (e.data && e.data.type === 'MORPH_SUBMIT_FORM' && e.data.action) {
        handleFormSubmit(e.data.action, e.data.method, e.data.fields);
      }
    };
    window.addEventListener('message', handleFrameMessage);
    return () => window.removeEventListener('message', handleFrameMessage);
  }, []);

  // Fetch initial browser observation
  const refreshBrowserState = async () => {
    try {
      const res = await apiFetch('/api/browser/state');
      if (res.ok) {
        const obs = await res.json();
        setBrowserObservation(obs);
      }
    } catch (err) {
      console.error('Failed to fetch browser state:', err);
    }
  };

  // Connect to Server-Sent Events with session isolation
  useEffect(() => {
    refreshBrowserState();

    const connectSSE = () => {
      const sid = getSessionId();
      const es = new EventSource(`/api/agent/stream?sessionId=${encodeURIComponent(sid)}`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);

          if (payload.type === 'sync' && payload.data) {
            setAgentState(payload.data.state || 'IDLE');
            if (payload.data.plan) setActivePlan(payload.data.plan);
            if (payload.data.pendingConfirmation) setPendingConfirmation(payload.data.pendingConfirmation);
            if (payload.data.browserObservation) setBrowserObservation(payload.data.browserObservation);
            return;
          }

          const event: AgentEvent = payload;

          if (event.type === 'state' && event.state) {
            setAgentState(event.state);
            updateAssistantBrowsingState({
              state: event.state,
              statusText: event.message || `Estado: ${event.state}`,
            });
          } else if (event.type === 'plan' && event.data) {
            setActivePlan(event.data);
            updateAssistantBrowsingState({ steps: event.data });
          } else if (event.type === 'tool_call') {
            const toolName = event.data?.tool;
            let label = `A executar ${toolName}...`;
            if (toolName === 'open_url') label = `A aceder a ${event.data?.args?.url}...`;
            if (toolName === 'web_search') label = `A pesquisar "${event.data?.args?.query}"...`;
            if (toolName === 'search_google_maps' || toolName === 'search_places') label = `A pesquisar empresas por "${event.data?.args?.query}"...`;
            if (toolName === 'get_place_details') label = `A obter detalhes da empresa...`;
            if (toolName === 'click_element') label = `A clicar no elemento #${event.data?.args?.element_id}...`;
            if (toolName === 'type_text') label = `A preencher campo de pesquisa...`;
            updateAssistantBrowsingState({ statusText: label });
          } else if (event.type === 'tool_result') {
            if (event.data?.places && Array.isArray(event.data.places)) {
              const mapResult: MapSearchResult = event.data;
              setMapPlaces(mapResult.places);
              if (mapResult.center) setMapCenter(mapResult.center);
              setMapQuery(mapResult.query || '');
              attachPlacesToAssistant(mapResult);
            }
            if (event.data?.event && (event.data.event.googleCalendarUrl || event.data.event.date)) {
              attachCalendarToAssistant(event.data.event);
            }
          } else if (event.type === 'observation') {
            refreshBrowserState();
            if (event.data?.places && Array.isArray(event.data.places)) {
              const mapResult: MapSearchResult = event.data;
              setMapPlaces(mapResult.places);
              if (mapResult.center) setMapCenter(mapResult.center);
              setMapQuery(mapResult.query || '');
              setIsMapOpen(true);
              attachPlacesToAssistant(mapResult);
            }
            if (event.data?.url && event.data?.visibleTextSnippet) {
              const newQuote: ExtractedQuote = {
                sourceTitle: event.data.title || 'Página Web',
                sourceUrl: event.data.url,
                text: event.data.visibleTextSnippet,
              };
              setActiveQuotes(prev => [...prev.slice(-3), newQuote]);
              appendQuoteToAssistant(newQuote);
            }
          } else if (event.type === 'confirmation_request' && event.data) {
            setPendingConfirmation(event.data);
          } else if (event.type === 'finish' && event.data) {
            setAgentState('COMPLETED');
            setActivePlan(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
            setLatestFindings(event.data);
            finalizeAssistantMessage(event.data);
          }
        } catch (err) {
          console.error('Error handling SSE event:', err);
        }
      };

      es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const updateAssistantBrowsingState = (updates: Partial<ChatMessage['browsing']>) => {
    const assistantId = currentAssistantMsgIdRef.current;
    if (!assistantId) return;

    setMessages(prev =>
      prev.map(msg => {
        if (msg.id === assistantId && msg.browsing) {
          return {
            ...msg,
            browsing: {
              ...msg.browsing,
              ...updates,
            },
          };
        }
        return msg;
      })
    );
  };

  const appendQuoteToAssistant = (quote: ExtractedQuote) => {
    const assistantId = currentAssistantMsgIdRef.current;
    if (!assistantId) return;

    setMessages(prev =>
      prev.map(msg => {
        if (msg.id === assistantId && msg.browsing) {
          const quotes = msg.browsing.extractedQuotes || [];
          if (!quotes.some(q => q.sourceUrl === quote.sourceUrl)) {
            return {
              ...msg,
              browsing: {
                ...msg.browsing,
                extractedQuotes: [...quotes, quote],
              },
            };
          }
        }
        return msg;
      })
    );
  };

  const attachPlacesToAssistant = (placesData: MapSearchResult) => {
    const assistantId = currentAssistantMsgIdRef.current;
    if (!assistantId) return;

    setMessages(prev =>
      prev.map(msg => {
        if (msg.id === assistantId) {
          return {
            ...msg,
            placesResult: placesData,
          };
        }
        return msg;
      })
    );
  };

  const attachCalendarToAssistant = (calEvent: CalendarEvent) => {
    const assistantId = currentAssistantMsgIdRef.current;
    setMessages(prev =>
      prev.map(msg => {
        if (msg.role === 'assistant' && (msg.id === assistantId || !msg.content || msg.browsing?.state !== 'COMPLETED')) {
          return {
            ...msg,
            calendarEvent: calEvent,
          };
        }
        return msg;
      })
    );
  };

  const finalizeAssistantMessage = (findings: TaskFindings) => {
    setAgentState('COMPLETED');
    setActivePlan(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
    const assistantId = currentAssistantMsgIdRef.current;

    setMessages(prev =>
      prev.map(msg => {
        if (msg.role === 'assistant' && (msg.id === assistantId || !msg.content || msg.browsing?.state !== 'COMPLETED')) {
          return {
            ...msg,
            content: findings.summary,
            browsing: msg.browsing
              ? {
                  ...msg.browsing,
                  state: 'COMPLETED',
                  statusText: 'Navegação e verificação concluídas com sucesso',
                  steps: (msg.browsing.steps.length > 0 ? msg.browsing.steps : activePlan).map(s => ({
                    ...s,
                    status: 'completed' as const,
                  })),
                  findings,
                }
              : undefined,
          };
        }
        return msg;
      })
    );
    currentAssistantMsgIdRef.current = null;
  };

  // User Actions
  const handleSendMessage = async (prompt: string) => {
    const userMsgId = 'user_' + Date.now();
    const assistantMsgId = 'asst_' + Date.now();
    currentAssistantMsgIdRef.current = assistantMsgId;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      browsing: {
        state: 'UNDERSTANDING',
        statusText: 'A analisar objetivo e a planear navegação...',
        steps: [],
        extractedQuotes: [],
      },
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setActiveQuotes([]);
    setActivePlan([]);
    setLatestFindings(null);

    if (!historyTopics.includes(prompt.slice(0, 45))) {
      setHistoryTopics(prev => [prompt.slice(0, 45), ...prev.slice(0, 9)]);
    }

    try {
      const res = await apiFetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: prompt }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao iniciar agente');
      }
    } catch (err: any) {
      alert(`Falha na requisição: ${err.message}`);
    }
  };

  const handleStopAgent = async () => {
    try {
      await apiFetch('/api/agent/stop', { method: 'POST' });
      setAgentState('IDLE');
      if (currentAssistantMsgIdRef.current) {
        updateAssistantBrowsingState({
          state: 'IDLE',
          statusText: 'Execução interrompida pelo utilizador.',
        });
      }
    } catch (err) {
      console.error('Failed to stop agent:', err);
    }
  };

  const handleNewChat = () => {
    handleStopAgent();
    setMessages([]);
    setActivePlan([]);
    setActiveQuotes([]);
    setLatestFindings(null);
    setMapPlaces([]);
    setIsMapOpen(false);
    setSelectedMapPlaceId(null);
    handleNavigate('about:blank');
  };

  const handleConfirmAction = async (approved: boolean) => {
    if (!pendingConfirmation) return;
    try {
      await apiFetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pendingConfirmation.id, approved }),
      });
      setPendingConfirmation(null);
    } catch (err) {
      console.error('Failed to confirm action:', err);
    }
  };

  // Browser Navigation Actions
  const handleNavigate = async (url: string) => {
    try {
      const res = await apiFetch('/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const obs = await res.json();
        setBrowserObservation(obs);
        if (obs?.verificationChallenge?.detected && obs.verificationChallenge.fieldId !== lastVerificationField) {
          setIsVerificationModalOpen(true);
          setLastVerificationField(obs.verificationChallenge.fieldId || 'code');
        }
      }
    } catch (err) {
      console.error('Failed to navigate:', err);
    }
  };

  const handleFormSubmit = async (action: string, method?: 'GET' | 'POST', fields?: Record<string, any>) => {
    try {
      const res = await apiFetch('/api/browser/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          method,
          fields,
          tabId: browserObservation?.activeTabId,
        }),
      });
      if (res.ok) {
        const obs = await res.json();
        setBrowserObservation(obs);
        if (obs?.verificationChallenge?.detected && obs.verificationChallenge.fieldId !== lastVerificationField) {
          setIsVerificationModalOpen(true);
          setLastVerificationField(obs.verificationChallenge.fieldId || 'code');
        }
      }
    } catch (err) {
      console.error('Failed to submit form:', err);
    }
  };

  const handleSubmitVerificationCode = async (code: string) => {
    try {
      const res = await apiFetch('/api/browser/submit-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          tabId: browserObservation?.activeTabId,
        }),
      });
      if (res.ok) {
        const obs = await res.json();
        setBrowserObservation(obs);
        if (!obs?.verificationChallenge?.detected) {
          setIsVerificationModalOpen(false);
        }
      }
    } catch (err) {
      console.error('Failed to submit verification code:', err);
    }
  };

  const handleBack = async () => {
    try {
      const res = await apiFetch('/api/browser/back', { method: 'POST' });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleForward = async () => {
    try {
      const res = await apiFetch('/api/browser/forward', { method: 'POST' });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleReload = async () => {
    try {
      const res = await apiFetch('/api/browser/reload', { method: 'POST' });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleScroll = async (direction: 'up' | 'down') => {
    try {
      const res = await apiFetch('/api/browser/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, amount: 400 }),
      });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleClickElement = async (elementId: string) => {
    try {
      const res = await apiFetch('/api/browser/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.observation) setBrowserObservation(data.observation);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTypeElement = async (elementId: string, text: string, submit: boolean) => {
    try {
      const res = await apiFetch('/api/browser/type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, text, submit }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.observation) setBrowserObservation(data.observation);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateTab = async () => {
    try {
      const res = await apiFetch('/api/browser/tab/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.google.com' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.observation) setBrowserObservation(data.observation);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwitchTab = async (tabId: string) => {
    try {
      const res = await apiFetch('/api/browser/tab/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId }),
      });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleCloseTab = async (tabId: string) => {
    try {
      const res = await apiFetch('/api/browser/tab/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId }),
      });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleSolveCaptcha = async () => {
    try {
      const res = await apiFetch('/api/browser/solve-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId: browserObservation?.activeTabId }),
      });
      if (res.ok) setBrowserObservation(await res.json());
    } catch (err) {
      console.error('Failed to solve captcha:', err);
    }
  };

  const isRunning = agentState !== 'IDLE' && agentState !== 'COMPLETED' && agentState !== 'FAILED';

  return (
    <div className="flex h-screen w-screen bg-[#171717] text-[#ececec] overflow-hidden font-sans">
      {/* 1. ChatGPT-like Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onNewChat={handleNewChat}
        onToggleBrowser={() => setIsBrowserOpen(!isBrowserOpen)}
        isBrowserOpen={isBrowserOpen}
        agentState={agentState}
        historyTopics={historyTopics}
        onSelectTopic={handleSendMessage}
      />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Minimal ChatGPT Top Header */}
        <header className="h-12 border-b border-[#2f2f2f] px-4 flex items-center justify-between shrink-0 bg-[#171717]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#212121] transition-colors md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white flex items-center gap-1.5">
                Morph AI Browser
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Browser Button: "Visualizar" */}
            <button
              onClick={() => setIsBrowserOpen(!isBrowserOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm cursor-pointer ${
                isBrowserOpen
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#212121] hover:bg-[#2f2f2f] text-neutral-200 border border-[#2f2f2f]'
              }`}
              title="Visualizar o navegador"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Visualizar</span>
              {isRunning && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>
        </header>

        {/* Workspace Split / Drawer: Chat + Google Maps + Chrome Window */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Main ChatGPT-like Chat Feed */}
          <div className="flex-1 h-full min-w-0">
            <ChatView
              messages={messages}
              agentState={agentState}
              activePlan={activePlan}
              activeQuotes={activeQuotes}
              latestFindings={latestFindings}
              onSendMessage={handleSendMessage}
              onStopAgent={handleStopAgent}
              onToggleBrowser={() => setIsBrowserOpen(!isBrowserOpen)}
              isBrowserOpen={isBrowserOpen}
              onOpenUrl={url => {
                handleNavigate(url);
                setIsBrowserOpen(true);
              }}
              captchaDetected={browserObservation?.captchaDetected}
              verificationChallenge={browserObservation?.verificationChallenge}
              onOpenVerificationModal={() => setIsVerificationModalOpen(true)}
              onOpenMap={() => setIsMapOpen(true)}
              onSelectMapPlace={id => {
                setSelectedMapPlaceId(id);
                setIsMapOpen(true);
              }}
              isMapOpen={isMapOpen}
            />
          </div>

          {/* Google Maps Panel */}
          {isMapOpen && (
            <div className="w-full md:w-[460px] lg:w-[500px] xl:w-[560px] h-full z-20 shrink-0 border-l border-[#2f2f2f] shadow-2xl animate-in slide-in-from-right duration-200">
              <MapPanel
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                places={mapPlaces}
                center={mapCenter}
                query={mapQuery}
                selectedPlaceId={selectedMapPlaceId}
                onSelectPlace={setSelectedMapPlaceId}
                onInvestigateWebsite={(url) => {
                  handleNavigate(url);
                  setIsBrowserOpen(true);
                }}
              />
            </div>
          )}

          {/* Chrome Window (Drawer or Split View) */}
          {isBrowserOpen && (
            <div className="w-full md:w-[480px] lg:w-[540px] xl:w-[600px] h-full z-20 shrink-0 border-l border-[#2f2f2f] shadow-2xl animate-in slide-in-from-right duration-200">
              <ChromeWindow
                observation={browserObservation}
                onNavigate={handleNavigate}
                onBack={handleBack}
                onForward={handleForward}
                onReload={handleReload}
                onScroll={handleScroll}
                onClickElement={handleClickElement}
                onTypeElement={handleTypeElement}
                onSwitchTab={handleSwitchTab}
                onCreateTab={handleCreateTab}
                onCloseTab={handleCloseTab}
                onSolveCaptcha={handleSolveCaptcha}
                onOpenVerificationModal={() => setIsVerificationModalOpen(true)}
                onClose={() => setIsBrowserOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Sensitive Action Approval Modal (Requirement 23) */}
      <ConfirmationModal
        request={pendingConfirmation}
        onConfirm={handleConfirmAction}
      />

      {/* Verification Challenge Modal (Email / SMS / 2FA) */}
      {isVerificationModalOpen && browserObservation?.verificationChallenge?.detected && (
        <VerificationModal
          challenge={browserObservation.verificationChallenge}
          onSubmitCode={handleSubmitVerificationCode}
          onOpenBrowser={() => {
            setIsVerificationModalOpen(false);
            setIsBrowserOpen(true);
          }}
          onDismiss={() => setIsVerificationModalOpen(false)}
        />
      )}
    </div>
  );
}
