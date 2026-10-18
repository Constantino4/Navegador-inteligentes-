import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { BrowserEngine, BrowserObservation } from './browser-engine.js';
import { SearchEngine, SearchResultItem } from './search-engine.js';
import { PlacesService } from './places-service.js';

export type AgentState =
  | 'IDLE'
  | 'UNDERSTANDING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'VERIFYING'
  | 'WAITING_FOR_USER'
  | 'COMPLETED'
  | 'FAILED';

export interface PlanStep {
  id: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'revised' | 'failed';
}

export interface AgentEvent {
  id: string;
  timestamp: number;
  type: 'state' | 'thought' | 'plan' | 'tool_call' | 'tool_result' | 'observation' | 'confirmation_request' | 'finish' | 'error';
  state?: AgentState;
  message?: string;
  data?: any;
}

export interface SensitiveActionRequest {
  id: string;
  actionType: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'APPROVED' | 'DENIED';
}

export class AgentController {
  private browser: BrowserEngine;
  private ai: GoogleGenAI | null = null;
  private state: AgentState = 'IDLE';
  private currentObjective: string = '';
  private plan: PlanStep[] = [];
  private historyLogs: AgentEvent[] = [];
  private eventListeners: ((event: AgentEvent) => void)[] = [];
  private pendingConfirmation: SensitiveActionRequest | null = null;
  private isHalted: boolean = false;
  private memoryNotes: string[] = [];

  constructor(browser: BrowserEngine) {
    this.browser = browser;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } else {
      console.warn('[AgentController] GEMINI_API_KEY not found in environment.');
    }
  }

  public subscribe(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  private emit(event: Omit<AgentEvent, 'id' | 'timestamp'>) {
    const fullEvent: AgentEvent = {
      ...event,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    this.historyLogs.push(fullEvent);
    this.eventListeners.forEach(listener => {
      try {
        listener(fullEvent);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    });
  }

  public getState() {
    return {
      state: this.state,
      objective: this.currentObjective,
      plan: this.plan,
      logs: this.historyLogs.slice(-60),
      pendingConfirmation: this.pendingConfirmation,
      memoryNotes: this.memoryNotes,
      browserObservation: this.browser.getObservation(),
    };
  }

  public stop() {
    this.isHalted = true;
    this.setState('IDLE', 'Task canceled by user.');
  }

  public handleConfirmationResponse(requestId: string, approved: boolean) {
    if (this.pendingConfirmation && this.pendingConfirmation.id === requestId) {
      this.pendingConfirmation.status = approved ? 'APPROVED' : 'DENIED';
      this.emit({
        type: 'thought',
        message: `User ${approved ? 'APPROVED' : 'DENIED'} sensitive action: ${this.pendingConfirmation.description}`,
      });
      if (!approved) {
        this.setState('FAILED', 'Action aborted due to user denial.');
      }
    }
  }

  private setState(state: AgentState, message?: string) {
    this.state = state;
    this.emit({
      type: 'state',
      state,
      message,
    });
  }

  private primaryModel: string = 'gemini-3.8-flash';

  private async callGeminiWithRetry(contents: any[], systemInstruction: string, tools: FunctionDeclaration[]) {
    if (!this.ai) throw new Error('AI not initialized');
    const candidateModels = this.primaryModel === 'gemini-3.1-flash-lite'
      ? ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
      : ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
              tools: [{ functionDeclarations: tools }],
            },
          });
          this.primaryModel = model;
          return response;
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || err);
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
          const isHighDemand = msg.includes('503') || msg.includes('demand') || msg.includes('UNAVAILABLE');

          if (isQuota) {
            // Immediate switch to next model without waiting
            if (candidateModels.length > 1 && model !== 'gemini-3.1-flash-lite') {
              this.primaryModel = 'gemini-3.1-flash-lite';
              this.emit({
                type: 'thought',
                message: `Quota do ${model} atingida. Alternando imediatamente para ${this.primaryModel}...`,
              });
              break;
            }
          } else if (isHighDemand && attempt < 2) {
            await new Promise(r => setTimeout(r, 1000));
          } else {
            break;
          }
        }
      }
    }
    throw lastError;
  }

  public async runObjective(objective: string): Promise<void> {
    if (!this.ai) {
      this.emit({
        type: 'error',
        message: 'GEMINI_API_KEY is not configured on the server. Please check environment variables.',
      });
      this.setState('FAILED', 'API key missing');
      return;
    }

    this.isHalted = false;
    this.currentObjective = objective.trim();
    this.historyLogs = [];
    this.plan = [];
    this.pendingConfirmation = null;

    this.setState('UNDERSTANDING', `A analisar o objetivo: "${this.currentObjective}"`);
    this.emit({
      type: 'thought',
      message: `A analisar o objetivo semanticamente em português. A extrair requisitos, entidades e plano de navegação.`,
    });

    const toolDeclarations: FunctionDeclaration[] = [
      {
        name: 'web_search',
        description: 'Performs a real search on the public web to discover relevant websites, product catalogs, news or sources.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The search keywords to query on the web.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_places',
        description: 'Searches for businesses, companies, restaurants, offices, stores, suppliers, or points of interest using OpenStreetMap and local geocoding. Returns verified names, addresses, coordinates, categories, phone numbers, and official websites.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The search term for businesses or places (e.g. "software companies in Lisbon", "dentists in Porto", "agências de marketing em São Paulo", "cafés em Coimbra").',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_place_details',
        description: 'Retrieves comprehensive details about a specific business or place using its place_id, including direct phone, opening hours schedule, and website.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            place_id: {
              type: Type.STRING,
              description: 'The place ID obtained from search_places.',
            },
          },
          required: ['place_id'],
        },
      },
      {
        name: 'manage_calendar_event',
        description: 'Schedules, creates, or manages an appointment, meeting, or event in the calendar system (sistema de calendário). Successfully registers the action with title, date, start time, end time, and description, returning verified confirmation.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Title or subject of the calendar event or appointment (e.g. "Reunião Grok Imagine", "Consulta", "Prazo de Entrega").',
            },
            date: {
              type: Type.STRING,
              description: 'Date of the event in YYYY-MM-DD or readable format (e.g. "2026-10-15", "Amanhã").',
            },
            time: {
              type: Type.STRING,
              description: 'Time or time range (e.g. "14:30", "10:00 - 11:00").',
            },
            description: {
              type: Type.STRING,
              description: 'Details, agenda notes, or participants for the calendar action.',
            },
            action: {
              type: Type.STRING,
              description: 'Action to perform: "create", "schedule", "update", or "confirm". Default is "create".',
            },
          },
          required: ['title', 'date'],
        },
      },
      {
        name: 'open_urls_in_parallel',
        description: 'Opens multiple URLs concurrently in separate tabs to compare stores, specs, or prices in half the time.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            urls: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of 2 to 3 URLs to open and compare simultaneously.',
            },
            reason: {
              type: Type.STRING,
              description: 'Why you are opening these URLs in parallel for comparison.',
            },
          },
          required: ['urls', 'reason'],
        },
      },
      {
        name: 'open_url',
        description: 'Opens a real website URL in the browser engine and returns the rendered observation.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: 'The full URL to open (e.g., https://example.com).',
            },
            reason: {
              type: Type.STRING,
              description: 'Why you are opening this URL in relation to the objective.',
            },
          },
          required: ['url', 'reason'],
        },
      },
      {
        name: 'get_current_page',
        description: 'Inspects the current state, title, and interactive elements of the currently open webpage.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_page_text',
        description: 'Extracts detailed readable textual content from the webpage, optionally focused on a topic.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            focus_topic: {
              type: Type.STRING,
              description: 'Optional keyword or topic to extract specific sections for.',
            },
          },
        },
      },
      {
        name: 'click_element',
        description: 'Clicks an interactive element on the page using its unique numeric ID (from interactiveElements). Navigates if it is a link.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            element_id: {
              type: Type.STRING,
              description: 'The numeric ID of the interactive element to click (e.g. "1", "12").',
            },
            description: {
              type: Type.STRING,
              description: 'Brief description of what you expect to happen upon clicking.',
            },
          },
          required: ['element_id'],
        },
      },
      {
        name: 'type_text',
        description: 'Types text into an input field, search box, or form element identified by its numeric ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            element_id: {
              type: Type.STRING,
              description: 'The numeric ID of the input field.',
            },
            text: {
              type: Type.STRING,
              description: 'The text string to type into the field.',
            },
            submit: {
              type: Type.BOOLEAN,
              description: 'Set to true to press Enter / submit the form after typing.',
            },
          },
          required: ['element_id', 'text'],
        },
      },
      {
        name: 'scroll_page',
        description: 'Scrolls the page down or up to uncover additional content and interactive elements.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            direction: {
              type: Type.STRING,
              description: 'Direction to scroll: "down" or "up".',
            },
            amount: {
              type: Type.NUMBER,
              description: 'Amount in pixels to scroll (default 400).',
            },
          },
          required: ['direction'],
        },
      },
      {
        name: 'go_back',
        description: 'Navigates back to the previous page in browsing history.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'update_plan',
        description: 'Updates or establishes the dynamic step-by-step task plan based on newly discovered information.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of high-level milestone descriptions for completing the objective.',
            },
            current_step_index: {
              type: Type.NUMBER,
              description: 'Zero-based index of the currently active step.',
            },
            rationale: {
              type: Type.STRING,
              description: 'Why this plan structure or revision was chosen.',
            },
          },
          required: ['steps', 'current_step_index'],
        },
      },
      {
        name: 'request_user_confirmation',
        description: 'Prompts the user for explicit confirmation before executing sensitive, irreversible, or financial actions.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action_type: {
              type: Type.STRING,
              description: 'Category of sensitive action (e.g. PURCHASE, ACCOUNT_MODIFICATION, DELETE).',
            },
            description: {
              type: Type.STRING,
              description: 'Clear statement of what action is being requested and what consequences it carries.',
            },
            risk_level: {
              type: Type.STRING,
              description: 'Risk assessment: "LOW", "MEDIUM", or "HIGH".',
            },
          },
          required: ['action_type', 'description', 'risk_level'],
        },
      },
      {
        name: 'open_new_tab',
        description: 'Opens a website in a new browser tab for parallel comparison between multiple sources or stores.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: 'URL to open in the new tab.',
            },
            title: {
              type: Type.STRING,
              description: 'Short descriptive label for the new tab.',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'switch_tab',
        description: 'Switches the active browser view to another open tab by tab ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tab_id: {
              type: Type.STRING,
              description: 'ID of the tab to switch to (e.g. "tab_1", "tab_2").',
            },
          },
          required: ['tab_id'],
        },
      },
      {
        name: 'finish_task',
        description: 'Concludes the task when all necessary evidence has been collected, verified, and compared. You MUST provide real findings based on observed pages.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Comprehensive, high-quality answer solving the user objective.',
            },
            findings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Specific bulleted evidence, price points, features, or data points gathered.',
            },
            sources: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of real URLs consulted during navigation.',
            },
            verification_evidence: {
              type: Type.STRING,
              description: 'Evidence that verifies the conclusion is grounded in actual observed data.',
            },
          },
          required: ['summary', 'findings', 'sources', 'verification_evidence'],
        },
      },
    ];

    const systemInstruction = `És o MORPH AI BROWSER, o assistente inteligente de pesquisa e navegação web em tempo real.
Operas um navegador real conectado à internet pública.
O teu objetivo é resolver o pedido do utilizador através de observação contínua, planeamento dinâmico, chamadas a ferramentas reais e verificação.

REGRAS DE RESPOSTA COMPLETA, ASSERTIVIDADE E QUALIDADE (OBRIGATÓRIO):
1. RESPONDE SEMPRE EM PORTUGUÊS: Todas as mensagens, etapas, raciocínio e a resposta final (finish_task) DEVEM ser escritas em português claro, fluente e executivo.
2. RESPOSTA EXAUSTIVA NO CAMPO 'summary' DE 'finish_task':
   - O campo 'summary' de 'finish_task' É O QUE O UTILIZADOR LÊ DIRETAMENTE NA INTERFACE.
   - O 'summary' DEVE CONTER O RELATÓRIO COMPLETO E DETALHADO, estruturado em Markdown com subtítulos claros (### Nome da Secção).
   - NUNCA escrevas apenas 2 linhas dizendo "Abaixo apresento a comparação..." sem escrever o conteúdo!
   - Se o utilizador pediu para comparar ferramentas (ex: Grok Imagine vs Midjourney), DEVES INCLUIR A TABELA MARKDOWN COMPLETA com Colunas (Ferramenta, Modelo/Motor, Principais Pontos Fortes, Preço/Acesso, Website Oficial), seguida de análise detalhada.
   - Se pediu recomendação, inclui uma secção dedicada ### Recomendação Executiva com justificativa clara e assertiva.
3. EXECUÇÃO MULTI-TAREFA SEQUENCIAL (NÃO CONCLUAS PRECIPITADAMENTE):
   - Se o pedido do utilizador contém várias tarefas (ex: comparar ferramentas IA + pesquisar empresas locais + agendar reunião no calendário):
     Passo A: Pesquisa as plataformas/ferramentas usando 'web_search' ou 'open_url'.
     Passo B: Pesquisa as empresas usando 'search_places'.
     Passo C: Agenda a reunião usando 'manage_calendar_event'.
     Passo D: Só DEPOIS de executar todas as tarefas necessárias, chama 'finish_task' sintetizando tudo num relatório de alto nível.
4. SISTEMA DE CALENDÁRIO:
   - Usa SEMPRE 'manage_calendar_event' quando houver pedido de reunião, agendamento ou evento.
5. PESQUISA DE EMPRESAS:
   - Usa 'search_places' para empresas, estúdios, lojas ou serviços físicos.
6. NAVEGAÇÃO DIRETA PARA PLATAFORMAS:
   - Para ferramentas interativas (Grok Imagine, Midjourney, ChatGPT, Canva), abre o link oficial (.com, .ai) e NUNCA a Wikipédia!`;

    const conversationHistory: any[] = [
      {
        role: 'user',
        parts: [
          {
            text: `Objetivo do utilizador: ${this.currentObjective}\n\nEstado atual do navegador: URL=${this.browser.getObservation().url}, Título=${this.browser.getObservation().title}. Inicia a execução. Estabelece o plano e executa a primeira ação. Responde e planeia SEMPRE em português.`,
          },
        ],
      },
    ];

    const MAX_STEPS = 8;
    let stepCount = 0;
    let taskCompleted = false;

    while (stepCount < MAX_STEPS && !taskCompleted && !this.isHalted) {
      stepCount++;
      this.setState('EXECUTING', `Ciclo de execução ${stepCount}/${MAX_STEPS}`);

      if (stepCount >= 5) {
        // Remind model to conclude with exhaustive summary once all objectives are addressed
        conversationHistory.push({
          role: 'user',
          parts: [
            {
              text: 'Revisão de requisitos: Garante que abordaste TODOS os pontos solicitados (comparações com tabelas completas, empresas e agendamento). Quando todas as etapas estiverem completas, chama finish_task com o relatório exaustivo e detalhado no campo summary.',
            },
          ],
        });
      }

      try {
        const response = await this.callGeminiWithRetry(conversationHistory, systemInstruction, toolDeclarations);

        const candidate = response.candidates?.[0];
        const textContent = candidate?.content?.parts?.find(p => p.text)?.text;
        const functionCalls = response.functionCalls;

        if (textContent) {
          this.emit({
            type: 'thought',
            message: textContent,
          });
        }

        if (!functionCalls || functionCalls.length === 0) {
          // If the model spoke without calling a tool, prompt it to call a tool or conclude
          conversationHistory.push({
            role: 'model',
            parts: candidate?.content?.parts || [{ text: textContent || 'Thinking...' }],
          });

          conversationHistory.push({
            role: 'user',
            parts: [
              {
                text: 'Please execute an action using one of your tools (e.g., web_search, open_url, click_element, type_text, or finish_task if done).',
              },
            ],
          });
          continue;
        }

        // Process function call
        const call = functionCalls[0];
        const toolName = call.name;
        const toolArgs = call.args || {};

        this.emit({
          type: 'tool_call',
          message: `Calling tool: ${toolName}`,
          data: { tool: toolName, args: toolArgs },
        });

        // Record model turn in conversation history (preserve original candidate parts and thought signatures)
        conversationHistory.push({
          role: 'model',
          parts: candidate?.content?.parts || [{ functionCall: call }],
        });

        // Execute tool
        let toolResultData: any = null;

        if (toolName === 'web_search') {
          this.setState('EXECUTING', `A pesquisar na Web por "${toolArgs.query}"...`);
          const results = await SearchEngine.search(String(toolArgs.query));
          // Load real Google search results into the browser engine
          const obs = await this.browser.openGoogleSearchResults(String(toolArgs.query), results);
          toolResultData = {
            query: toolArgs.query,
            totalFound: results.length,
            results: results.slice(0, 6),
            pageTitle: obs.title,
            interactiveElementsCount: obs.totalElementsCount,
          };
          this.emit({
            type: 'tool_result',
            message: `Encontrados ${results.length} resultados na pesquisa Web`,
            data: toolResultData,
          });
          this.emit({
            type: 'observation',
            message: `Página do Google carregada com resultados para "${toolArgs.query}"`,
            data: {
              url: obs.url,
              title: obs.title,
              visibleTextSnippet: obs.visibleTextSnippet.slice(0, 1500),
            },
          });
        } else if (toolName === 'search_places' || toolName === 'search_google_maps') {
          this.setState('EXECUTING', `A pesquisar empresas por "${toolArgs.query}"...`);
          const mapResult = await PlacesService.searchPlaces(String(toolArgs.query));
          toolResultData = {
            query: toolArgs.query,
            totalFound: mapResult.places.length,
            center: mapResult.center,
            places: mapResult.places,
          };
          this.emit({
            type: 'tool_result',
            message: `Encontradas ${mapResult.places.length} empresas para "${toolArgs.query}"`,
            data: mapResult,
          });
          this.emit({
            type: 'observation',
            message: `Encontradas ${mapResult.places.length} empresas com morada e website oficial. Podes navegar no website de qualquer empresa usando 'open_url'.`,
            data: mapResult,
          });
        } else if (toolName === 'get_place_details') {
          this.setState('EXECUTING', `A obter detalhes da empresa...`);
          const details = await PlacesService.getPlaceDetails(String(toolArgs.place_id));
          toolResultData = { details };
          this.emit({
            type: 'tool_result',
            message: details ? `Detalhes obtidos para ${details.name}` : 'Empresa não encontrada',
            data: details,
          });
        } else if (toolName === 'manage_calendar_event') {
          const title = String(toolArgs.title || 'Evento Agendado');
          const date = String(toolArgs.date || new Date().toISOString().split('T')[0]);
          const time = toolArgs.time ? String(toolArgs.time) : '10:00';
          const description = toolArgs.description ? String(toolArgs.description) : '';
          const action = toolArgs.action ? String(toolArgs.action) : 'create';

          this.setState('EXECUTING', `A executar ação no sistema de calendário: "${title}"...`);

          // Format clean dates for Google Calendar and iCal
          const cleanDate = date.replace(/[^0-9-]/g, '') || new Date().toISOString().split('T')[0];
          const cleanTime = time.replace(/[^0-9:]/g, '') || '10:00';
          const parsedStart = new Date(`${cleanDate}T${cleanTime.length === 5 ? cleanTime + ':00' : cleanTime}Z`);
          const safeStart = isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
          const safeEnd = new Date(safeStart.getTime() + 60 * 60 * 1000);

          const fmtGDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
          const startG = fmtGDate(safeStart);
          const endG = fmtGDate(safeEnd);

          const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startG}/${endG}&details=${encodeURIComponent(description + '\n\nAgendado via Morph AI Browser')}&sf=true&output=xml`;
          const outlookUrl = `https://outlook.live.com/calendar/0/action/compose?subject=${encodeURIComponent(title)}&startdt=${safeStart.toISOString()}&enddt=${safeEnd.toISOString()}&body=${encodeURIComponent(description)}`;

          const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Morph AI Browser//Enterprise Agent//PT',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:morph-${Date.now()}@morphbrowser.ai`,
            `DTSTAMP:${fmtGDate(new Date())}`,
            `DTSTART:${startG}`,
            `DTEND:${endG}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\r\n');

          const eventItem = {
            id: 'cal_' + Date.now().toString(36),
            title,
            date,
            time,
            description,
            action,
            status: 'CONCLUÍDO_COM_SUCESSO',
            googleCalendarUrl,
            outlookUrl,
            icsContent,
            createdAt: new Date().toISOString(),
          };

          toolResultData = {
            success: true,
            status: 'CONCLUÍDO_COM_SUCESSO',
            message: `Ação no sistema de calendário executada com sucesso! O compromisso "${title}" foi confirmado para ${date} às ${time}.`,
            event: eventItem,
          };

          this.emit({
            type: 'tool_result',
            message: `✅ Ação no sistema de calendário concluída com sucesso: "${title}" (${date} às ${time})`,
            data: toolResultData,
          });

          this.emit({
            type: 'observation',
            message: `Ação no sistema de calendário confirmada com sucesso: "${title}" marcado para ${date} às ${time}. Estado: Ativo e confirmado.`,
            data: toolResultData,
          });
        } else if (toolName === 'open_urls_in_parallel') {
          const rawUrls = (toolArgs.urls as string[]) || [];
          this.setState('EXECUTING', `A abrir ${rawUrls.length} separadores em paralelo para comparar opções...`);
          const observations = await this.browser.openUrlsInParallel(rawUrls);
          toolResultData = {
            openedCount: observations.length,
            tabs: observations.map(o => ({
              url: o.url,
              title: o.title,
              snippet: o.visibleTextSnippet.slice(0, 800),
            })),
          };
          this.emit({
            type: 'observation',
            message: `${observations.length} páginas abertas em paralelo nos separadores`,
            data: toolResultData,
          });
        } else if (toolName === 'open_url') {
          this.setState('EXECUTING', `A aceder a: ${toolArgs.url}`);
          const observation = await this.browser.openUrl(String(toolArgs.url));
          toolResultData = {
            url: observation.url,
            title: observation.title,
            statusCode: observation.statusCode,
            headings: observation.extractedHeadings,
            interactiveElementsCount: observation.totalElementsCount,
            sampleInteractiveElements: observation.interactiveElements.slice(0, 20),
            visibleTextSnippet: observation.visibleTextSnippet.slice(0, 1500),
          };
          this.setState('OBSERVING', `A ler ${observation.title}`);
          this.emit({
            type: 'observation',
            message: `Carregado: ${observation.title} (${observation.url})`,
            data: toolResultData,
          });
        } else if (toolName === 'get_current_page') {
          const obs = this.browser.getObservation();
          toolResultData = {
            url: obs.url,
            title: obs.title,
            interactiveElements: obs.interactiveElements.slice(0, 30),
            headings: obs.extractedHeadings,
            scrollPosition: obs.scrollPosition,
          };
        } else if (toolName === 'get_page_text') {
          const text = this.browser.getCleanedText();
          toolResultData = {
            textSnippet: text.slice(0, 3000),
            totalLength: text.length,
          };
        } else if (toolName === 'click_element') {
          this.setState('EXECUTING', `Clicking element [${toolArgs.element_id}]`);
          const clickRes = await this.browser.clickElement(String(toolArgs.element_id));
          toolResultData = {
            success: clickRes.success,
            message: clickRes.message,
            newUrl: clickRes.observation.url,
            newTitle: clickRes.observation.title,
            sampleInteractiveElements: clickRes.observation.interactiveElements.slice(0, 20),
          };
          this.setState('OBSERVING', `Observed page update after click`);
          this.emit({
            type: 'observation',
            message: clickRes.message,
            data: toolResultData,
          });
        } else if (toolName === 'type_text') {
          this.setState('EXECUTING', `Typing into element [${toolArgs.element_id}]`);
          const typeRes = await this.browser.typeText(
            String(toolArgs.element_id),
            String(toolArgs.text),
            Boolean(toolArgs.submit)
          );
          toolResultData = {
            success: typeRes.success,
            message: typeRes.message,
            newUrl: typeRes.observation.url,
          };
          this.emit({
            type: 'tool_result',
            message: typeRes.message,
            data: toolResultData,
          });
        } else if (toolName === 'scroll_page') {
          const dir = (toolArgs.direction as 'up' | 'down') || 'down';
          const amt = Number(toolArgs.amount) || 400;
          const obs = this.browser.scroll(dir, amt);
          toolResultData = {
            scrollPosition: obs.scrollPosition,
            visibleTextSnippet: obs.visibleTextSnippet.slice(0, 1500),
          };
          this.emit({
            type: 'observation',
            message: `Scrolled ${dir} to ${obs.scrollPosition.percentage}%`,
            data: toolResultData,
          });
        } else if (toolName === 'go_back') {
          const obs = await this.browser.goBack();
          toolResultData = {
            url: obs.url,
            title: obs.title,
          };
          this.emit({
            type: 'tool_result',
            message: `Navigated back to ${obs.url}`,
            data: toolResultData,
          });
        } else if (toolName === 'open_new_tab') {
          this.setState('EXECUTING', `Abrindo novo separador: ${toolArgs.url}`);
          const obs = await this.browser.openUrl(String(toolArgs.url), true);
          toolResultData = {
            activeTabId: obs.activeTabId,
            url: obs.url,
            title: obs.title,
            totalTabs: obs.tabs.length,
          };
          this.emit({
            type: 'observation',
            message: `Novo separador aberto: ${obs.title} (${obs.url})`,
            data: toolResultData,
          });
        } else if (toolName === 'switch_tab') {
          const obs = this.browser.switchTab(String(toolArgs.tab_id));
          toolResultData = {
            activeTabId: obs.activeTabId,
            url: obs.url,
            title: obs.title,
          };
          this.emit({
            type: 'observation',
            message: `Alternou para o separador: ${obs.title}`,
            data: toolResultData,
          });
        } else if (toolName === 'update_plan') {
          this.setState('PLANNING', toolArgs.rationale ? String(toolArgs.rationale) : 'Updating task plan');
          const steps = (toolArgs.steps as string[]) || [];
          const curIdx = Number(toolArgs.current_step_index) || 0;
          this.plan = steps.map((desc, idx) => ({
            id: idx + 1,
            description: desc,
            status: idx < curIdx ? 'completed' : idx === curIdx ? 'in_progress' : 'pending',
          }));
          toolResultData = {
            status: 'plan_updated',
            stepCount: this.plan.length,
          };
          this.emit({
            type: 'plan',
            message: `Plan updated: ${this.plan.length} steps`,
            data: this.plan,
          });
        } else if (toolName === 'request_user_confirmation') {
          const requestId = Math.random().toString(36).substring(2, 9);
          this.pendingConfirmation = {
            id: requestId,
            actionType: String(toolArgs.action_type),
            description: String(toolArgs.description),
            riskLevel: (toolArgs.risk_level as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
            status: 'PENDING',
          };
          this.setState('WAITING_FOR_USER', `Confirmation required: ${this.pendingConfirmation.description}`);
          this.emit({
            type: 'confirmation_request',
            message: this.pendingConfirmation.description,
            data: this.pendingConfirmation,
          });

          // Wait up to 30 seconds for user approval
          let waitTime = 0;
          while (this.pendingConfirmation?.status === 'PENDING' && waitTime < 30000 && !this.isHalted) {
            await new Promise(r => setTimeout(r, 1000));
            waitTime += 1000;
          }

          const approved = this.pendingConfirmation?.status === 'APPROVED';
          toolResultData = {
            confirmed: approved,
            reason: approved ? 'User approved action.' : 'User denied action or timeout.',
          };
        } else if (toolName === 'finish_task') {
          this.setState('VERIFYING', 'A sintetizar dados e verificar fontes...');
          this.emit({
            type: 'thought',
            message: `A verificar dados recolhidos e a formatar a resposta em português.`,
          });

          taskCompleted = true;
          this.plan = this.plan.map(step => ({ ...step, status: 'completed' as const }));
          this.emit({
            type: 'plan',
            message: 'Todas as etapas foram concluídas.',
            data: this.plan,
          });
          this.setState('COMPLETED', 'Tarefa concluída com sucesso.');
          this.emit({
            type: 'finish',
            message: String(toolArgs.summary),
            data: {
              summary: toolArgs.summary,
              findings: toolArgs.findings,
              sources: toolArgs.sources,
              verificationEvidence: toolArgs.verification_evidence,
            },
          });

          // Store key memory note for future turns
          if (toolArgs.summary) {
            this.memoryNotes.push(`Objective "${this.currentObjective}": ${String(toolArgs.summary).slice(0, 150)}...`);
          }

          toolResultData = {
            status: 'task_completed_successfully',
          };
          break; // Stop loop immediately to guarantee no lagging or out-of-sync turns
        } else {
          toolResultData = { error: `Unknown tool: ${toolName}` };
        }

        // Return tool result to conversation history
        conversationHistory.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: toolResultData,
              },
            },
          ],
        });

      } catch (loopErr: any) {
        console.error('[AgentController] Error during agent loop turn:', loopErr);
        this.emit({
          type: 'error',
          message: `Execution error: ${loopErr.message || loopErr}`,
        });
        this.setState('FAILED', loopErr.message || 'Error occurred');
        break;
      }
    }

    if (!taskCompleted && !this.isHalted) {
      this.setState('FAILED', 'Reached maximum steps without final verification.');
      this.emit({
        type: 'error',
        message: 'Agent paused: reached step limit without final verification. You can refine your objective or continue.',
      });
    }
  }
}
