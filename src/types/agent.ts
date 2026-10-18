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

export interface InteractiveElement {
  id: string;
  tag: string;
  text: string;
  role?: string;
  type?: string;
  href?: string;
  placeholder?: string;
  name?: string;
  value?: string;
  ariaLabel?: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  statusCode: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface VerificationChallenge {
  detected: boolean;
  type: 'email' | 'sms' | '2fa' | 'generic';
  prompt: string;
  fieldId?: string;
  fieldName?: string;
}

export interface BrowserObservation {
  tabs: BrowserTab[];
  activeTabId: string;
  url: string;
  title: string;
  statusCode: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  scrollPosition: { y: number; maxY: number; percentage: number };
  visibleTextSnippet: string;
  interactiveElements: InteractiveElement[];
  totalElementsCount: number;
  extractedHeadings: string[];
  metaDescription: string;
  captchaDetected?: boolean;
  verificationChallenge?: VerificationChallenge;
  timestamp: number;
}

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

export interface TaskFindings {
  summary: string;
  findings: string[];
  sources: string[];
  verificationEvidence: string;
}

export interface SensitiveActionRequest {
  id: string;
  actionType: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'APPROVED' | 'DENIED';
}

export interface DiagnosticsReport {
  timestamp: number;
  components: {
    geminiApi: { status: 'CONNECTED' | 'ERROR' | 'UNCONFIGURED'; latencyMs?: number; details?: string };
    functionCalling: { status: 'CONNECTED' | 'ERROR'; details?: string };
    agentController: { status: 'CONNECTED' | 'ERROR'; details?: string };
    browserController: { status: 'CONNECTED' | 'ERROR'; details?: string };
    browserEngine: { status: 'CONNECTED' | 'ERROR'; details?: string };
    internet: { status: 'CONNECTED' | 'DISCONNECTED'; latencyMs?: number; details?: string };
  };
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE';
  architecturePipeline: string[];
}

export interface ExtractedQuote {
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

export interface BusinessPlace {
  id: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  openNow?: boolean;
  weekdayHours?: string[];
  directionsUrl?: string;
  osmUrl?: string;
  topReviews?: {
    author: string;
    rating: number;
    text: string;
    relativeTime: string;
  }[];
}

export interface MapSearchResult {
  query: string;
  places: BusinessPlace[];
  center: { lat: number; lng: number };
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  description?: string;
  location?: string;
  status: string;
  googleCalendarUrl?: string;
  outlookUrl?: string;
  icsContent?: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  placesResult?: MapSearchResult;
  calendarEvent?: CalendarEvent;
  browsing?: {
    state: AgentState;
    statusText: string;
    activeUrl?: string;
    activeTitle?: string;
    steps: PlanStep[];
    extractedQuotes: ExtractedQuote[];
    findings?: TaskFindings;
  };
}
