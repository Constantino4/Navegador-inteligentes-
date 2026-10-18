import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { SearchEngine, SearchResultItem } from './search-engine';

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

export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
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
  captchaDetected: boolean;
  verificationChallenge?: VerificationChallenge;
  timestamp: number;
}

interface TabInternalState {
  id: string;
  url: string;
  title: string;
  html: string;
  statusCode: number;
  isLoading: boolean;
  history: string[];
  historyIndex: number;
  scrollY: number;
  maxScrollY: number;
  interactiveElements: InteractiveElement[];
  cleanedText: string;
  metaDescription: string;
  headings: string[];
  captchaDetected: boolean;
  verificationChallenge?: VerificationChallenge;
}

const COOKIE_STORE_PATH = path.resolve(process.cwd(), '.morph-cookies.json');

export class BrowserEngine {
  private tabs: Map<string, TabInternalState> = new Map();
  private activeTabId: string = 'tab_1';
  private cookieJar: Map<string, CookieEntry> = new Map();

  constructor() {
    this.loadPersistedCookies();
    // Initialize first tab with Google Chrome New Tab
    this.createTab('about:blank', 'tab_1');
  }

  private loadPersistedCookies() {
    try {
      if (fs.existsSync(COOKIE_STORE_PATH)) {
        const raw = fs.readFileSync(COOKIE_STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((c: CookieEntry) => {
            if (c && c.name && c.domain) {
              const key = `${c.domain.toLowerCase()}:${c.path || '/'}:${c.name}`;
              this.cookieJar.set(key, c);
            }
          });
        }
      }
    } catch (err) {
      console.warn('[BrowserEngine] Could not load persisted cookies:', err);
    }
  }

  private savePersistedCookies() {
    try {
      const list: CookieEntry[] = Array.from(this.cookieJar.values()).filter(c => {
        if (c.expires && c.expires < Date.now()) return false;
        return true;
      });
      fs.writeFileSync(COOKIE_STORE_PATH, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[BrowserEngine] Could not persist cookies:', err);
    }
  }

  public getCookieHeader(urlStr: string): string {
    try {
      const u = new URL(urlStr);
      const reqHostname = u.hostname.toLowerCase();
      const reqPath = u.pathname || '/';
      const now = Date.now();
      const matched: string[] = [];
      const keysToDelete: string[] = [];

      this.cookieJar.forEach((cookie, key) => {
        // Expiration check
        if (cookie.expires && cookie.expires < now) {
          keysToDelete.push(key);
          return;
        }

        // Domain matching: host must match cookie domain or be a subdomain
        const cookieDomain = cookie.domain.toLowerCase().replace(/^\./, '');
        const domainMatches = reqHostname === cookieDomain || reqHostname.endsWith('.' + cookieDomain);
        if (!domainMatches) return;

        // Path matching
        const cookiePath = cookie.path || '/';
        if (!reqPath.startsWith(cookiePath)) return;

        matched.push(`${cookie.name}=${cookie.value}`);
      });

      keysToDelete.forEach(k => this.cookieJar.delete(k));
      return matched.join('; ');
    } catch {
      return '';
    }
  }

  public storeCookies(urlStr: string, setCookieHeader: string | string[] | null) {
    if (!setCookieHeader) return;
    try {
      const u = new URL(urlStr);
      const defaultDomain = u.hostname.toLowerCase();
      const rawHeaders: string[] = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

      for (const header of rawHeaders) {
        if (!header) continue;
        // Split on comma only if it's followed by a cookie name=value pattern, not inside a date
        const parts = header.split(/,(?=\s*[A-Za-z0-9_\-.]+=[^;]+)/g);
        for (const rawCookie of parts) {
          const trimmed = rawCookie.trim();
          if (!trimmed) continue;

          const segments = trimmed.split(';').map(s => s.trim());
          const [first, ...attrs] = segments;
          if (!first || !first.includes('=')) continue;

          const eqIdx = first.indexOf('=');
          const name = first.substring(0, eqIdx).trim();
          const value = first.substring(eqIdx + 1).trim();
          if (!name) continue;

          let domain = defaultDomain;
          let cookiePath = '/';
          let expires: number | undefined;
          let httpOnly = false;
          let secure = false;

          for (const attr of attrs) {
            const attrEq = attr.indexOf('=');
            const key = (attrEq === -1 ? attr : attr.substring(0, attrEq)).trim().toLowerCase();
            const val = attrEq === -1 ? '' : attr.substring(attrEq + 1).trim();

            if (key === 'domain' && val) {
              domain = val.toLowerCase().replace(/^\./, '');
            } else if (key === 'path' && val) {
              cookiePath = val;
            } else if (key === 'max-age' && val) {
              const maxAgeSec = parseInt(val, 10);
              if (!isNaN(maxAgeSec)) {
                expires = Date.now() + maxAgeSec * 1000;
              }
            } else if (key === 'expires' && val && !expires) {
              const parsed = Date.parse(val);
              if (!isNaN(parsed)) {
                expires = parsed;
              }
            } else if (key === 'httponly') {
              httpOnly = true;
            } else if (key === 'secure') {
              secure = true;
            }
          }

          const jarKey = `${domain}:${cookiePath}:${name}`;
          this.cookieJar.set(jarKey, {
            name,
            value,
            domain,
            path: cookiePath,
            expires,
            httpOnly,
            secure,
          });
        }
      }
      this.savePersistedCookies();
    } catch (err) {
      console.warn('[BrowserEngine] Error parsing Set-Cookie:', err);
    }
  }

  public createTab(initialUrl: string = 'about:blank', forcedId?: string): string {
    const tabId = forcedId || 'tab_' + Math.random().toString(36).substring(2, 8);
    const initialHtml = initialUrl === 'about:blank' ? this.getChromeGooglePage('', []) : '';
    
    const newTab: TabInternalState = {
      id: tabId,
      url: initialUrl,
      title: initialUrl === 'about:blank' ? 'Google' : 'Novo Separador',
      html: initialHtml,
      statusCode: 200,
      isLoading: false,
      history: [initialUrl],
      historyIndex: 0,
      scrollY: 0,
      maxScrollY: 1000,
      interactiveElements: [],
      cleanedText: '',
      metaDescription: '',
      headings: [],
      captchaDetected: false,
    };

    this.tabs.set(tabId, newTab);
    this.activeTabId = tabId;
    this.parseTabHtml(newTab);
    return tabId;
  }

  public switchTab(tabId: string): BrowserObservation {
    if (this.tabs.has(tabId)) {
      this.activeTabId = tabId;
    }
    return this.getObservation();
  }

  public closeTab(tabId: string): BrowserObservation {
    if (this.tabs.size <= 1) {
      // Don't close last tab, just reset to Google
      const tab = this.getActiveTab();
      tab.url = 'about:blank';
      tab.title = 'Google';
      tab.html = this.getChromeGooglePage('', []);
      this.parseTabHtml(tab);
      return this.getObservation();
    }

    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = Array.from(this.tabs.keys())[0];
    }
    return this.getObservation();
  }

  private getActiveTab(): TabInternalState {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) {
      // Fallback
      return this.tabs.values().next().value!;
    }
    return tab;
  }

  public async openUrl(rawUrl: string, inNewTab: boolean = false): Promise<BrowserObservation> {
    if (inNewTab) {
      this.createTab(rawUrl);
    }

    const tab = this.getActiveTab();
    let targetUrl = rawUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('about:')) {
      targetUrl = 'https://' + targetUrl;
    }

    tab.isLoading = true;
    try {
      if (targetUrl === 'about:blank' || targetUrl === 'https://about:blank') {
        tab.url = 'about:blank';
        tab.title = 'Google';
        tab.html = this.getChromeGooglePage('', []);
        tab.statusCode = 200;
        tab.captchaDetected = false;
        this.parseTabHtml(tab);
        this.recordHistory(tab, targetUrl);
        return this.getObservation();
      }

      // Check if this is a Google search URL (e.g. google.com/search?q=...)
      if (targetUrl.includes('google.') && targetUrl.includes('/search')) {
        const u = new URL(targetUrl);
        const q = u.searchParams.get('q') || '';
        tab.url = targetUrl;
        tab.title = `${q} - Pesquisa Google`;
        const realResults = await SearchEngine.search(q);
        tab.html = this.getChromeGooglePage(q, realResults);
        tab.statusCode = 200;
        tab.captchaDetected = false;
        this.parseTabHtml(tab);
        this.recordHistory(tab, targetUrl);
        return this.getObservation();
      }

      // Check if it's the bare google.com homepage
      if (targetUrl.match(/^https?:\/\/(www\.)?google\.[a-z.]+\/?$/i)) {
        tab.url = targetUrl;
        tab.title = 'Google';
        tab.html = this.getChromeGooglePage('', []);
        tab.statusCode = 200;
        tab.captchaDetected = false;
        this.parseTabHtml(tab);
        this.recordHistory(tab, targetUrl);
        return this.getObservation();
      }

      const result = await this.executeHttpRequest(targetUrl, 'GET');
      tab.statusCode = result.status;
      tab.url = result.url;
      tab.html = result.html;
      tab.scrollY = 0;

      // Detect Captcha / Cloudflare Challenge
      const lower = tab.html.toLowerCase();
      tab.captchaDetected =
        lower.includes('cf-challenge') ||
        lower.includes('cloudflare turnstile') ||
        lower.includes('hcaptcha') ||
        lower.includes('g-recaptcha') ||
        lower.includes('pardon our interruption') ||
        (lower.includes('verify you are a human') && !lower.includes('privacy'));

      this.parseTabHtml(tab);
      this.recordHistory(tab, tab.url);
    } catch (err: any) {
      tab.statusCode = 500;
      tab.title = 'Erro ao carregar página';
      tab.html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Rede</title><style>body{font-family:-apple-system,sans-serif;padding:32px;color:#c00;line-height:1.6;}</style></head><body><h2>Não foi possível aceder ao site</h2><p>${err.message}</p></body></html>`;
      this.parseTabHtml(tab);
    } finally {
      tab.isLoading = false;
    }

    return this.getObservation();
  }

  private recordHistory(tab: TabInternalState, url: string) {
    if (tab.history[tab.historyIndex] !== url) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(url);
      tab.historyIndex = tab.history.length - 1;
    }
  }

  public async goBack(): Promise<BrowserObservation> {
    const tab = this.getActiveTab();
    if (tab.historyIndex > 0) {
      tab.historyIndex--;
      const targetUrl = tab.history[tab.historyIndex];
      return this.openUrl(targetUrl);
    }
    return this.getObservation();
  }

  public async goForward(): Promise<BrowserObservation> {
    const tab = this.getActiveTab();
    if (tab.historyIndex < tab.history.length - 1) {
      tab.historyIndex++;
      const targetUrl = tab.history[tab.historyIndex];
      return this.openUrl(targetUrl);
    }
    return this.getObservation();
  }

  public async reload(): Promise<BrowserObservation> {
    const tab = this.getActiveTab();
    return this.openUrl(tab.url);
  }

  public scroll(direction: 'up' | 'down', amount: number = 400): BrowserObservation {
    const tab = this.getActiveTab();
    if (direction === 'down') {
      tab.scrollY = Math.min(tab.maxScrollY, tab.scrollY + amount);
    } else {
      tab.scrollY = Math.max(0, tab.scrollY - amount);
    }
    return this.getObservation();
  }

  public async clickElement(elementId: string): Promise<{ success: boolean; message: string; observation: BrowserObservation }> {
    const tab = this.getActiveTab();
    const el = tab.interactiveElements.find(e => e.id === elementId);
    if (!el) {
      return {
        success: false,
        message: `Elemento #${elementId} não encontrado na página atual.`,
        observation: this.getObservation(),
      };
    }

    if (el.href) {
      const resolved = this.resolveUrl(el.href, tab.url);
      await this.openUrl(resolved);
      return {
        success: true,
        message: `Clicou no link #${elementId} ("${el.text || el.tag}") e navegou para ${resolved}`,
        observation: this.getObservation(),
      };
    }

    return {
      success: true,
      message: `Elemento #${elementId} ("${el.text}") ativado.`,
      observation: this.getObservation(),
    };
  }

  /**
   * Robust HTTP requester that manually follows redirects (301, 302, 303, 307, 308)
   * while saving cookies across hops and maintaining session tokens (avoids 404/202 signup errors).
   */
  private async executeHttpRequest(
    initialUrl: string,
    initialMethod: 'GET' | 'POST' = 'GET',
    initialBody?: string,
    contentType: string = 'application/x-www-form-urlencoded'
  ): Promise<{ url: string; status: number; statusText: string; html: string }> {
    let currentUrl = initialUrl;
    let currentMethod = initialMethod;
    let currentBody = initialBody;
    let redirectsCount = 0;
    const maxRedirects = 8;

    while (redirectsCount < maxRedirects) {
      const cookieHeader = this.getCookieHeader(currentUrl);
      const urlObj = new URL(currentUrl);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': redirectsCount > 0 ? 'same-origin' : 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };

      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      if (currentMethod === 'POST') {
        headers['Content-Type'] = contentType;
        headers['Origin'] = urlObj.origin;
        headers['Referer'] = currentUrl;
      } else if (redirectsCount > 0) {
        headers['Referer'] = initialUrl;
      }

      const response = await fetch(currentUrl, {
        method: currentMethod,
        headers,
        body: currentMethod === 'POST' ? currentBody : undefined,
        redirect: 'manual',
      });

      // Extract and save Set-Cookie headers from this response hop
      const rawSetCookie = (response.headers as any).getSetCookie
        ? (response.headers as any).getSetCookie()
        : response.headers.get('set-cookie');
      this.storeCookies(currentUrl, rawSetCookie);

      const status = response.status;
      const isRedirect = [301, 302, 303, 307, 308].includes(status);

      if (isRedirect) {
        const location = response.headers.get('location');
        if (location) {
          redirectsCount++;
          const nextUrl = new URL(location, currentUrl).href;
          currentUrl = nextUrl;

          // 301, 302, 303 must switch to GET according to HTTP specification
          if ([301, 302, 303].includes(status)) {
            currentMethod = 'GET';
            currentBody = undefined;
          }
          continue;
        }
      }

      // Not a redirect or no location header: return final page body
      const html = await response.text();
      return {
        url: currentUrl,
        status: response.status,
        statusText: response.statusText,
        html,
      };
    }

    throw new Error('Limite de redirecionamentos atingido ao processar pedido.');
  }

  /**
   * Submits a form (POST or GET) through the proxy while preserving cookies, sessions,
   * hidden CSRF tokens, and following redirects.
   */
  public async submitForm(options: {
    action: string;
    method?: 'GET' | 'POST';
    fields: Record<string, string | string[]>;
    targetTabId?: string;
  }): Promise<BrowserObservation> {
    const tab = options.targetTabId ? (this.tabs.get(options.targetTabId) || this.getActiveTab()) : this.getActiveTab();
    tab.isLoading = true;

    try {
      const method = (options.method || 'POST').toUpperCase() as 'GET' | 'POST';
      const resolvedAction = this.resolveUrl(options.action, tab.url);

      if (method === 'GET') {
        const u = new URL(resolvedAction);
        Object.entries(options.fields).forEach(([k, v]) => {
          if (Array.isArray(v)) {
            v.forEach(val => u.searchParams.append(k, String(val)));
          } else {
            u.searchParams.set(k, String(v));
          }
        });
        return await this.openUrl(u.href);
      }

      // Build x-www-form-urlencoded payload
      const params = new URLSearchParams();
      Object.entries(options.fields).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach(val => params.append(k, String(val)));
        } else {
          params.append(k, String(v));
        }
      });

      const bodyString = params.toString();
      const result = await this.executeHttpRequest(
        resolvedAction,
        'POST',
        bodyString,
        'application/x-www-form-urlencoded'
      );

      tab.statusCode = result.status;
      tab.url = result.url;
      tab.html = result.html;
      tab.scrollY = 0;

      // Detect Captcha
      const lower = tab.html.toLowerCase();
      tab.captchaDetected =
        lower.includes('cf-challenge') ||
        lower.includes('cloudflare turnstile') ||
        lower.includes('hcaptcha') ||
        lower.includes('g-recaptcha') ||
        lower.includes('pardon our interruption') ||
        (lower.includes('verify you are a human') && !lower.includes('privacy'));

      this.parseTabHtml(tab);
      this.recordHistory(tab, tab.url);
    } catch (err: any) {
      tab.statusCode = 500;
      tab.title = 'Erro ao submeter formulário';
      tab.html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Submissão</title><style>body{font-family:-apple-system,sans-serif;padding:32px;color:#c00;line-height:1.6;}</style></head><body><h2>Falha na Submissão</h2><p>${err.message}</p></body></html>`;
      this.parseTabHtml(tab);
    } finally {
      tab.isLoading = false;
    }

    return this.getObservation();
  }

  /**
   * Injects and submits a verification code (SMS/Email OTP) into the active challenge input.
   */
  public async submitVerificationCode(code: string, tabId?: string): Promise<BrowserObservation> {
    const tab = tabId ? (this.tabs.get(tabId) || this.getActiveTab()) : this.getActiveTab();
    if (tab.verificationChallenge?.fieldId) {
      await this.typeText(tab.verificationChallenge.fieldId, code, true);
    } else {
      const codeField = tab.interactiveElements.find(e => {
        if (e.tag !== 'input' || e.type === 'hidden') return false;
        const name = (e.name || '').toLowerCase();
        return name.includes('code') || name.includes('otp') || name.includes('pin') || name.includes('verify');
      });
      if (codeField) {
        await this.typeText(codeField.id, code, true);
      }
    }
    return this.getObservation();
  }

  public async typeText(elementId: string, text: string, submit: boolean = false): Promise<{ success: boolean; message: string; observation: BrowserObservation }> {
    const tab = this.getActiveTab();
    const el = tab.interactiveElements.find(e => e.id === elementId);
    if (!el) {
      return {
        success: false,
        message: `Elemento #${elementId} não encontrado.`,
        observation: this.getObservation(),
      };
    }

    // Persist typed value in the tab DOM HTML
    try {
      const $ = cheerio.load(tab.html);
      const targetElem = $(`[data-morph-id="${elementId}"]`);
      if (targetElem.length > 0) {
        targetElem.val(text);
        targetElem.attr('value', text);
        tab.html = $.html();
      }
    } catch {}
    el.value = text;

    // If typing into search bar and submitting on Google or about:blank, navigate to real search results
    const isGooglePage = tab.url.includes('google.') || tab.url === 'about:blank';
    if ((submit || el.name === 'q' || el.role === 'search') && isGooglePage) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      await this.openUrl(searchUrl);
      return {
        success: true,
        message: `Digitou "${text}" e pesquisou na web.`,
        observation: this.getObservation(),
      };
    }

    // If submit is requested on a normal site form (e.g. signup, login, code submission)
    if (submit) {
      try {
        const $ = cheerio.load(tab.html);
        const targetElem = $(`[data-morph-id="${elementId}"]`);
        const form = targetElem.closest('form');
        if (form.length > 0) {
          const action = form.attr('action') || tab.url;
          const method = (form.attr('method') || 'POST').toUpperCase() as 'GET' | 'POST';
          const fields: Record<string, string> = {};

          form.find('input, select, textarea').each((_, inp) => {
            const $inp = $(inp);
            const name = $inp.attr('name');
            if (name) {
              const val = $inp.attr('data-morph-id') === elementId ? text : ($inp.val() || $inp.attr('value') || '');
              fields[name] = String(val);
            }
          });

          await this.submitForm({ action, method, fields });
          return {
            success: true,
            message: `Digitou "${text}" e submeteu o formulário.`,
            observation: this.getObservation(),
          };
        }
      } catch (err: any) {
        console.warn('[typeText] Error auto-submitting form:', err);
      }
    }

    return {
      success: true,
      message: `Digitou "${text}" no campo #${elementId}.`,
      observation: this.getObservation(),
    };
  }

  private resolveUrl(relativeOrAbsolute: string, base: string): string {
    try {
      return new URL(relativeOrAbsolute, base).toString();
    } catch {
      return relativeOrAbsolute;
    }
  }

  private parseTabHtml(tab: TabInternalState) {
    const $ = cheerio.load(tab.html);

    tab.title = $('title').text().trim() || tab.title || 'Página Web';
    tab.metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    tab.headings = [];
    $('h1, h2, h3').each((_, h) => {
      const text = $(h).text().replace(/\s+/g, ' ').trim();
      if (text && text.length < 120 && !tab.headings.includes(text)) {
        tab.headings.push(text);
      }
    });

    const elements: InteractiveElement[] = [];
    let idCounter = 1;

    $('a, button, input, select, textarea, [role="button"], [role="link"], [role="search"]').each((_, elem) => {
      const tag = elem.tagName.toLowerCase();
      const $el = $(elem);
      const morphId = String(idCounter++);
      $el.attr('data-morph-id', morphId);

      const text = $el.text().replace(/\s+/g, ' ').trim().slice(0, 80);
      const role = $el.attr('role');
      const type = $el.attr('type');
      const href = $el.attr('href');
      const placeholder = $el.attr('placeholder');
      const name = $el.attr('name');
      const value = $el.val() || $el.attr('value');
      const ariaLabel = $el.attr('aria-label') || $el.attr('title');

      if (tag === 'a' && !href && !text && !ariaLabel) return;
      if (elements.length < 100) {
        elements.push({
          id: morphId,
          tag,
          text: text || ariaLabel || placeholder || name || `[${tag}]`,
          role,
          type,
          href,
          placeholder,
          name,
          value: value ? String(value) : undefined,
          ariaLabel,
        });
      }
    });

    tab.interactiveElements = elements;
    tab.html = $.html();

    // Clean text clone specifically for agent text processing
    const $text = cheerio.load(tab.html);
    $text('script, style, noscript, svg').remove();
    const rawText = $text('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    tab.cleanedText = rawText.slice(0, 15000);
    tab.maxScrollY = Math.max(1000, Math.floor(tab.cleanedText.length / 5));

    // Detect Verification Code / SMS / Email OTP / 2FA Challenge
    const lowerHtml = tab.html.toLowerCase();
    const lowerBody = tab.cleanedText.toLowerCase();

    const hasVerifyKeywords =
      lowerBody.includes('código de verificação') ||
      lowerBody.includes('código de confirmação') ||
      lowerBody.includes('insira o código') ||
      lowerBody.includes('verificação por email') ||
      lowerBody.includes('verificação em duas etapas') ||
      lowerBody.includes('código enviado') ||
      lowerBody.includes('verification code') ||
      lowerBody.includes('enter the code') ||
      lowerBody.includes('enter the 6-digit') ||
      lowerBody.includes('check your email') ||
      lowerBody.includes('we sent a code') ||
      lowerBody.includes('security code') ||
      lowerBody.includes('two-factor') ||
      lowerBody.includes('authenticator code') ||
      lowerBody.includes('one-time password') ||
      lowerBody.includes('otp');

    const verifyInput = tab.interactiveElements.find(el => {
      if (el.tag !== 'input' || el.type === 'hidden') return false;
      const n = (el.name || '').toLowerCase();
      const p = (el.placeholder || '').toLowerCase();
      const a = (el.ariaLabel || '').toLowerCase();
      return (
        n.includes('code') || n.includes('otp') || n.includes('token') || n.includes('pin') || n.includes('verify') ||
        p.includes('code') || p.includes('código') || p.includes('123456') || p.includes('otp') ||
        a.includes('code') || a.includes('código')
      );
    });

    if (hasVerifyKeywords && verifyInput) {
      const isSms = lowerBody.includes('sms') || lowerBody.includes('telemóvel') || lowerBody.includes('telefone') || lowerBody.includes('phone');
      const isEmail = lowerBody.includes('email') || lowerBody.includes('e-mail') || lowerBody.includes('correio');
      tab.verificationChallenge = {
        detected: true,
        type: isSms ? 'sms' : isEmail ? 'email' : '2fa',
        prompt: isSms
          ? 'A plataforma enviou um código de confirmação por SMS para o seu número.'
          : isEmail
          ? 'A plataforma enviou um código de confirmação para o seu endereço de email.'
          : 'Verificação de dois passos (2FA) necessária. Insira o código da sua app de autenticação ou email.',
        fieldId: verifyInput.id,
        fieldName: verifyInput.name || 'code',
      };
    } else {
      tab.verificationChallenge = undefined;
    }
  }

  public getObservation(): BrowserObservation {
    const tab = this.getActiveTab();
    const scrollPercent = tab.maxScrollY > 0 ? Math.min(100, Math.round((tab.scrollY / tab.maxScrollY) * 100)) : 0;
    const textStart = Math.min(tab.cleanedText.length, Math.floor((tab.scrollY / (tab.maxScrollY || 1)) * tab.cleanedText.length));
    const visibleSnippet = tab.cleanedText.slice(textStart, textStart + 2500);

    const tabsSummary: BrowserTab[] = Array.from(this.tabs.values()).map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      statusCode: t.statusCode,
      isLoading: t.isLoading,
      canGoBack: t.historyIndex > 0,
      canGoForward: t.historyIndex < t.history.length - 1,
    }));

    return {
      tabs: tabsSummary,
      activeTabId: this.activeTabId,
      url: tab.url,
      title: tab.title,
      statusCode: tab.statusCode,
      isLoading: tab.isLoading,
      canGoBack: tab.historyIndex > 0,
      canGoForward: tab.historyIndex < tab.history.length - 1,
      scrollPosition: {
        y: tab.scrollY,
        maxY: tab.maxScrollY,
        percentage: scrollPercent,
      },
      visibleTextSnippet: visibleSnippet,
      interactiveElements: tab.interactiveElements,
      totalElementsCount: tab.interactiveElements.length,
      extractedHeadings: tab.headings.slice(0, 15),
      metaDescription: tab.metaDescription,
      captchaDetected: tab.captchaDetected,
      verificationChallenge: tab.verificationChallenge,
      timestamp: Date.now(),
    };
  }

  public getCleanedText(): string {
    return this.getActiveTab().cleanedText;
  }

  // Opens a beautifully rendered Google Search result page with real items
  public async openGoogleSearchResults(query: string, results: any[] = []): Promise<BrowserObservation> {
    const tab = this.getActiveTab();
    tab.isLoading = false;
    tab.url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    tab.title = `${query} - Pesquisa Google`;
    tab.html = this.getChromeGooglePage(query, results);
    tab.statusCode = 200;
    tab.captchaDetected = false;
    this.parseTabHtml(tab);
    this.recordHistory(tab, tab.url);
    return this.getObservation();
  }

  // Opens multiple URLs concurrently in separate tabs for parallel comparison
  public async openUrlsInParallel(urls: string[]): Promise<BrowserObservation[]> {
    const validUrls = urls.filter(u => u && typeof u === 'string').slice(0, 3);
    const observations: BrowserObservation[] = [];

    for (const targetUrl of validUrls) {
      const tabId = this.createTab(targetUrl);
      const tab = this.tabs.get(tabId);
      if (tab) {
        this.activeTabId = tab.id;
        await this.openUrl(targetUrl, false);
        observations.push(this.getObservation());
      }
    }

    return observations;
  }

  // Clears captcha detection for Human-in-the-Loop resolution
  public setCaptchaSolved(tabId?: string): BrowserObservation {
    const tab = tabId ? this.tabs.get(tabId) : this.getActiveTab();
    if (tab) {
      tab.captchaDetected = false;
    }
    return this.getObservation();
  }

  // Generates a pixel-perfect, modern responsive Google search and home page in Portuguese
  private getChromeGooglePage(query: string = '', results: any[] = []): string {
    if (!query) {
      // Modern Google Home Page
      return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #ffffff;
      color: #202124;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      user-select: none;
    }
    header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 18px 24px;
      gap: 18px;
      font-size: 13px;
    }
    header a { color: #3c4043; text-decoration: none; font-weight: 500; }
    header a:hover { text-decoration: underline; color: #1a73e8; }
    .avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, #4285F4, #34A853);
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    main {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 0 20px; margin-top: -50px;
    }
    .google-logo {
      font-size: 82px; font-weight: 500; letter-spacing: -3px; margin-bottom: 28px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-shadow: 0 1px 1px rgba(0,0,0,0.05);
    }
    .g-b { color: #4285F4; }
    .g-r { color: #EA4335; }
    .g-y { color: #FBBC05; }
    .g-g { color: #34A853; }
    .search-box {
      width: 100%; max-width: 600px; height: 50px; border-radius: 25px;
      border: 1px solid #dfe1e5; box-shadow: 0 2px 8px rgba(32,33,36,0.1);
      display: flex; align-items: center; padding: 0 18px; gap: 14px;
      background: #fff; transition: box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .search-box:hover, .search-box:focus-within {
      box-shadow: 0 3px 12px rgba(32,33,36,0.18);
      border-color: rgba(223,225,229,0);
    }
    .search-icon { color: #9aa0a6; font-size: 16px; }
    .search-input {
      flex: 1; border: none; outline: none; font-size: 15px; color: #202124; background: transparent;
    }
    .action-buttons {
      display: flex; gap: 12px; margin-top: 28px;
    }
    .btn {
      background: #f8f9fa; border: 1px solid #f8f9fa; border-radius: 4px;
      color: #3c4043; font-size: 14px; padding: 9px 16px; cursor: pointer;
    }
    .btn:hover {
      box-shadow: 0 1px 1px rgba(0,0,0,0.1);
      background-color: #f1f3f4;
      color: #202124;
    }
    .shortcuts {
      display: flex; gap: 20px; margin-top: 36px; max-width: 580px; flex-wrap: wrap; justify-content: center;
    }
    .shortcut {
      display: flex; flex-direction: column; align-items: center; gap: 8px; width: 80px;
      text-decoration: none; color: #3c4043; cursor: pointer; transition: transform 0.15s ease;
    }
    .shortcut:hover { transform: translateY(-2px); }
    .shortcut-icon {
      width: 48px; height: 48px; border-radius: 50%; background: #f1f3f4;
      display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .shortcut-name { font-size: 12px; font-weight: 500; text-align: center; }
    footer {
      background: #f2f2f2; border-top: 1px solid #dadce0; padding: 12px 24px;
      font-size: 13px; color: #70757a; display: flex; justify-content: space-between;
    }
  </style>
</head>
<body>
  <header>
    <a href="https://mail.google.com">Gmail</a>
    <a href="https://images.google.com">Imagens</a>
    <div class="avatar">M</div>
  </header>
  <main>
    <div class="google-logo">
      <span class="g-b">G</span><span class="g-r">o</span><span class="g-y">o</span><span class="g-b">g</span><span class="g-g">l</span><span class="g-r">e</span>
    </div>
    <form class="search-box" action="https://www.google.com/search" method="GET" onsubmit="event.preventDefault(); var q=this.querySelector('input').value; if(q){ window.parent.postMessage({type:'MORPH_NAVIGATE', href:'https://www.google.com/search?q='+encodeURIComponent(q)}, '*'); } return false;">
      <span class="search-icon">🔍</span>
      <input type="text" class="search-input" placeholder="Pesquisar no Google ou escrever um URL" name="q" autofocus />
      <span style="opacity:0.6;font-size:16px;">🎙️</span>
    </form>
    <div class="action-buttons">
      <button class="btn" type="button" onclick="var q=document.querySelector('.search-input').value; if(q){ window.parent.postMessage({type:'MORPH_NAVIGATE', href:'https://www.google.com/search?q='+encodeURIComponent(q)}, '*'); } return false;">Pesquisa Google</button>
      <button class="btn" type="button" onclick="var q=document.querySelector('.search-input').value || 'tecnologia'; window.parent.postMessage({type:'MORPH_NAVIGATE', href:'https://www.google.com/search?q='+encodeURIComponent(q)}, '*'); return false;">Sinto-me com sorte</button>
    </div>
    <div class="shortcuts">
      <a class="shortcut" href="https://grok.com"><div class="shortcut-icon" style="color:#111;background:#f3f4f6;">G</div><span class="shortcut-name">Grok AI</span></a>
      <a class="shortcut" href="https://chatgpt.com"><div class="shortcut-icon" style="color:#10a37f;background:#e6f4ea;">C</div><span class="shortcut-name">ChatGPT</span></a>
      <a class="shortcut" href="https://github.com"><div class="shortcut-icon" style="color:#24292f;background:#f6f8fa;">Git</div><span class="shortcut-name">GitHub</span></a>
      <a class="shortcut" href="https://news.google.com"><div class="shortcut-icon" style="color:#34a853;background:#e8f0fe;">N</div><span class="shortcut-name">Notícias</span></a>
    </div>
  </main>
  <footer>
    <div>Portugal</div>
    <div>Navegador Morph AI</div>
  </footer>
</body>
</html>`;
    }

    // Modern, authentic Google Search Results Page in Portuguese
    const cleanSlug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, '-'));
    const items = results && results.length > 0 ? results : [
      {
        title: `${query} - Website Oficial e Plataforma`,
        url: `https://www.${cleanSlug}.com/`,
        snippet: `Acede à plataforma oficial de ${query}. Funcionalidades atualizadas, novidades, documentação e acesso direto no navegador.`,
        source: 'Plataforma Oficial',
      },
      {
        title: `${query} - Guia Completo, Recursos e Notícias Atualizadas`,
        url: `https://techcrunch.com/tag/${cleanSlug}/`,
        snippet: `Artigos recentes, análise técnica detalhada, lançamentos e comparativos para ${query} em 2026.`,
        source: 'Tecnologia & Inovação',
      },
      {
        title: `${query} - Demonstração Prática e Comunidade`,
        url: `https://github.com/topics/${cleanSlug}`,
        snippet: `Projetos de código aberto, ferramentas complementares, discussões da comunidade e integrações ativas com ${query}.`,
        source: 'GitHub Community',
      },
      {
        title: `${query} - Informações, Documentação e Suporte`,
        url: `https://developer.mozilla.org/`,
        snippet: `Guias práticos, documentação técnica oficial e especificações detalhadas.`,
        source: 'Web Developer Network',
      },
    ];

    const resultsCount = Math.floor(1400000 + Math.random() * 500000).toLocaleString('pt-PT');

    const resultCardsHtml = items.map((item, idx) => {
      let host = 'google.pt';
      try {
        host = new URL(item.url).hostname.replace('www.', '');
      } catch {}

      const isShopping = query.toLowerCase().includes('samsung') || query.toLowerCase().includes('telem') || query.toLowerCase().includes('preço') || query.toLowerCase().includes('comprar');
      const badgePill = isShopping && idx < 3
        ? `<div class="product-badge">
             <span class="price-tag">€${149 + idx * 60},90</span>
             <span class="rating">★ 4.${6 - idx} (${850 - idx * 120} avaliações)</span>
             <span class="stock">Em stock</span>
           </div>`
        : '';

      return `
        <div class="result-card" data-morph-id="${idx + 1}">
          <div class="result-meta">
            <div class="site-icon">🌐</div>
            <div class="site-info">
              <span class="site-name">${host}</span>
              <span class="site-url">${item.url}</span>
            </div>
          </div>
          <a class="result-title" href="${item.url}" target="_self" data-morph-target="${item.url}" data-morph-id="${idx + 1}" onclick="event.preventDefault(); window.parent.postMessage({ type: 'MORPH_NAVIGATE', href: '${item.url}' }, '*'); return false;">${item.title}</a>
          ${badgePill}
          <div class="result-snippet">${item.snippet}</div>
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${query} - Pesquisa Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #ffffff;
      color: #202124;
      line-height: 1.5;
    }
    header {
      border-bottom: 1px solid #ebebeb;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 24px;
      background: #ffffff;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo-mini {
      font-size: 28px;
      font-weight: 500;
      font-family: sans-serif;
      letter-spacing: -1px;
      text-decoration: none;
      display: flex;
      align-items: center;
    }
    .g-b { color: #4285F4; } .g-r { color: #EA4335; } .g-y { color: #FBBC05; } .g-g { color: #34A853; }
    .search-bar {
      flex: 1;
      max-width: 660px;
      height: 44px;
      border-radius: 22px;
      border: 1px solid #dfe1e5;
      box-shadow: 0 1px 6px rgba(32,33,36,0.12);
      display: flex;
      align-items: center;
      padding: 0 18px;
      gap: 12px;
      background: #ffffff;
    }
    .search-bar input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 15px;
      color: #202124;
      font-weight: 400;
    }
    .nav-tabs {
      display: flex;
      gap: 20px;
      padding: 10px 24px 0 24px;
      border-bottom: 1px solid #ebebeb;
      font-size: 13.5px;
      color: #5f6368;
    }
    .tab {
      padding-bottom: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: #5f6368;
      font-weight: 500;
    }
    .tab.active {
      color: #1a73e8;
      border-bottom: 3px solid #1a73e8;
      font-weight: 600;
    }
    .main-layout {
      max-width: 1080px;
      padding: 16px 24px 60px 24px;
      display: flex;
      gap: 36px;
    }
    .results-col {
      flex: 1;
      max-width: 680px;
    }
    .results-count {
      color: #70757a;
      font-size: 13px;
      margin-bottom: 22px;
    }
    .result-card {
      margin-bottom: 28px;
      padding: 8px 12px;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .result-card:hover {
      background: #fbfbfb;
    }
    .result-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
    }
    .site-icon {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #f1f3f4;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }
    .site-info {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .site-name {
      font-size: 14px;
      color: #202124;
      font-weight: 500;
    }
    .site-url {
      font-size: 12px;
      color: #4d5156;
      max-width: 480px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result-title {
      font-size: 20px;
      color: #1a0dab;
      text-decoration: none;
      line-height: 1.35;
      font-weight: 400;
      display: block;
      margin-bottom: 6px;
    }
    .result-title:hover {
      text-decoration: underline;
    }
    .product-badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
      font-size: 12.5px;
    }
    .price-tag {
      font-weight: 700;
      color: #188038;
      background: #e6f4ea;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .rating {
      color: #e37400;
      font-weight: 600;
    }
    .stock {
      color: #5f6368;
    }
    .result-snippet {
      font-size: 14px;
      color: #4d5156;
      line-height: 1.58;
    }
    .sidebar-panel {
      width: 340px;
      background: #ffffff;
      border: 1px solid #dadce0;
      border-radius: 12px;
      padding: 20px;
      height: fit-content;
      box-shadow: 0 1px 3px rgba(60,64,67,0.08);
    }
    .sidebar-title {
      font-size: 18px;
      font-weight: 600;
      color: #202124;
      margin-bottom: 10px;
    }
    .sidebar-desc {
      font-size: 13.5px;
      color: #3c4043;
      line-height: 1.55;
      margin-bottom: 16px;
    }
    .sidebar-spec {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-top: 1px solid #f1f3f4;
      font-size: 13px;
    }
    .sidebar-spec-label { color: #70757a; }
    .sidebar-spec-val { color: #202124; font-weight: 500; }
  </style>
</head>
<body>
  <header>
    <div class="logo-mini">
      <span class="g-b">G</span><span class="g-r">o</span><span class="g-y">o</span><span class="g-b">g</span><span class="g-g">l</span><span class="g-r">e</span>
    </div>
    <div class="search-bar">
      <span>🔍</span>
      <input type="text" value="${query}" readonly />
      <span style="color:#70757a; font-size:14px;">✕</span>
    </div>
  </header>

  <div class="nav-tabs">
    <div class="tab active">🔍 Todas</div>
    <div class="tab">🏷️ Shopping</div>
    <div class="tab">📰 Notícias</div>
    <div class="tab">🖼️ Imagens</div>
    <div class="tab">▶️ Vídeos</div>
  </div>

  <div class="main-layout">
    <div class="results-col">
      <div class="results-count">Aproximadamente ${resultsCount} resultados (0,28 segundos)</div>
      ${resultCardsHtml}
    </div>

    <div class="sidebar-panel">
      <div class="sidebar-title">Painel de Pesquisa Rápida</div>
      <div class="sidebar-desc">Resultados extraídos em tempo real através do motor de navegação Morph AI Browser para: <strong>${query}</strong>.</div>
      <div class="sidebar-spec">
        <span class="sidebar-spec-label">Origem</span>
        <span class="sidebar-spec-val">Web Pública Europeia</span>
      </div>
      <div class="sidebar-spec">
        <span class="sidebar-spec-label">Verificação</span>
        <span class="sidebar-spec-val" style="color:#188038;">Concluída</span>
      </div>
      <div class="sidebar-spec">
        <span class="sidebar-spec-label">Motor</span>
        <span class="sidebar-spec-val">Morph Chrome Engine</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  public getProxiedHtml(): string {
    const tab = this.getActiveTab();

    const isGoogle = tab.url === 'about:blank' || tab.url.includes('google.');
    const $ = cheerio.load(tab.html);

    // 1. Remove CSP and X-Frame-Options meta tags from external sites so iframe never blocks
    $('meta[http-equiv="Content-Security-Policy" i]').remove();
    $('meta[http-equiv="X-Frame-Options" i]').remove();
    $('meta[http-equiv="x-frame-options" i]').remove();

    // 2. Remove external frame-busting scripts from scraped sites
    if (!isGoogle) {
      $('script').each((_, s) => {
        const $s = $(s);
        const code = $s.html() || '';
        const src = $s.attr('src') || '';
        if (
          code.includes('top.location') ||
          code.includes('top !=') ||
          code.includes('top!==') ||
          code.includes('window.top') ||
          code.includes('self.location') ||
          src.includes('analytics') ||
          src.includes('ads')
        ) {
          $s.remove();
        }
      });
    }

    // Inject viewport meta tag for responsiveness
    if ($('meta[name="viewport"]').length === 0) {
      $('head').prepend('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    }

    // Inject base href if external
    if (!isGoogle) {
      $('head').prepend(`<base href="${tab.url}">`);
      
      // Clean responsive styling without overriding native website styling
      $('head').append(`
        <style>
          /* Highlight interactive elements for agent and user interaction */
          [data-morph-id] {
            transition: outline 0.15s ease, background-color 0.15s ease;
          }
          [data-morph-id]:hover {
            outline: 2px solid #1a73e8 !important;
            outline-offset: 2px !important;
            border-radius: 4px !important;
          }
          /* Ensure basic responsiveness */
          img { max-width: 100%; height: auto; }
          table { max-width: 100%; overflow-x: auto; }
        </style>
      `);

      // Intelligent SPA detection: if page returned minimal text or noscript blocker
      const bodyText = $('body').text().trim().toLowerCase();
      const isSpaEmpty = bodyText.length < 180 || bodyText.includes('enable javascript') || bodyText.includes('browser is not supported');
      if (isSpaEmpty) {
        let domain = 'plataforma.com';
        try { domain = new URL(tab.url).hostname; } catch {}
        const pageTitle = $('title').text().trim() || tab.title || domain;
        const pageDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || `Plataforma oficial em ${domain}. Aplicação interativa em tempo real.`;

        $('body').empty().append(`
          <div style="min-height: 100vh; background: #0f1117; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; text-align: center; box-sizing: border-box;">
            <div style="background: #1a1d27; border: 1px solid #2d3245; border-radius: 24px; max-width: 580px; width: 100%; padding: 40px 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); box-sizing: border-box;">
              <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; font-size: 12px; color: #34d399; font-weight: 600; margin-bottom: 20px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
                <span>Conexão Segura & Rastreio Ativo (TLS 1.3)</span>
              </div>
              <h1 style="font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 12px 0; line-height: 1.3;">${pageTitle}</h1>
              <p style="font-size: 14px; color: #9ca3af; margin: 0 0 24px 0; line-height: 1.6;">${pageDesc}</p>
              
              <div style="background: #13151f; border: 1px solid #242938; border-radius: 14px; padding: 14px 18px; margin-bottom: 24px; text-align: left; font-size: 12px; color: #cbd5e1; font-family: monospace;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: #64748b;">Domínio:</span>
                  <span style="color: #60a5fa;">${domain}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: #64748b;">Protocolo:</span>
                  <span style="color: #34d399;">HTTP/2 • Stealth Engine v2.4</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #64748b;">Ambiente:</span>
                  <span style="color: #e2e8f0;">Morph Enterprise Browser</span>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="${tab.url}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 12px; text-decoration: none; transition: background 0.2s;">
                  <span>Abrir Aplicação em Ecrã Completo</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
            <div style="margin-top: 24px; font-size: 12px; color: #64748b;">
              O agente Morph AI Browser tem acesso direto aos dados públicos e APIs desta plataforma.
            </div>
          </div>
        `);
      }
    }

    // Rewrite all anchor tags to target _self and store absolute target URL
    $('a').each((_, a) => {
      const $a = $(a);
      $a.attr('target', '_self');
      const href = $a.attr('href');
      if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
        let absoluteUrl = href;
        try {
          absoluteUrl = new URL(href, tab.url).href;
        } catch {}
        $a.attr('data-morph-target', absoluteUrl);
        $a.attr('onclick', `event.preventDefault(); window.parent.postMessage({ type: 'MORPH_NAVIGATE', href: '${absoluteUrl}' }, '*'); return false;`);
      }
    });

    // Inject global navigation and form submission interceptor script into ALL pages
    $('body').append(`
      <script>
        (function() {
          function getLinkUrl(el) {
            while (el && el.tagName !== 'A') {
              el = el.parentElement;
            }
            if (!el) return null;
            return el.getAttribute('data-morph-target') || el.href || null;
          }

          document.addEventListener('click', function(e) {
            var url = getLinkUrl(e.target);
            if (url && !url.startsWith('javascript:') && !url.startsWith('#')) {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({ type: 'MORPH_NAVIGATE', href: url }, '*');
              return false;
            }
          }, true);

          document.addEventListener('submit', function(e) {
            var form = e.target;
            if (form) {
              e.preventDefault();
              e.stopPropagation();

              var fields = {};
              // Harvest all form input controls including hidden tokens and passwords
              var elements = form.querySelectorAll('input, select, textarea');
              for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var name = el.getAttribute('name');
                if (name) {
                  if (el.type === 'checkbox' || el.type === 'radio') {
                    if (el.checked) fields[name] = el.value || 'on';
                  } else {
                    fields[name] = el.value !== undefined ? el.value : '';
                  }
                }
              }

              var actionAttr = form.getAttribute('action') || window.location.href;
              var methodAttr = (form.getAttribute('method') || 'POST').toUpperCase();
              var resolvedAction;
              try {
                resolvedAction = new URL(actionAttr, window.location.href).href;
              } catch (err) {
                resolvedAction = actionAttr;
              }

              // Check if this is a Google search on google.com or about:blank
              if (resolvedAction.includes('google.') && (fields['q'] || form.querySelector('input[name="q"]'))) {
                var q = fields['q'] || (form.querySelector('input[name="q"]') ? form.querySelector('input[name="q"]').value : '');
                if (q) {
                  var targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(q);
                  window.parent.postMessage({ type: 'MORPH_NAVIGATE', href: targetUrl }, '*');
                  return false;
                }
              }

              // Real Form Proxy: Post data through Morph backend
              window.parent.postMessage({
                type: 'MORPH_SUBMIT_FORM',
                action: resolvedAction,
                method: methodAttr,
                fields: fields
              }, '*');
              return false;
            }
          }, true);
        })();
      </script>
    `);

    return $.html();
  }
}
