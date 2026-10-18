import * as cheerio from 'cheerio';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

// Known official platform mappings to prevent navigating to encyclopedia/Wikipedia articles
const POPULAR_PLATFORMS: Array<{
  keywords: string[];
  title: string;
  url: string;
  snippet: string;
  source: string;
}> = [
  {
    keywords: ['grok imagine', 'grok image', 'grok gerador', 'grok imagem'],
    title: 'Grok Imagine - Gerador de Imagens por IA (xAI)',
    url: 'https://grok.com/',
    snippet: 'Plataforma oficial do Grok da xAI para geração de imagens fotorrealistas (Aurora / Flux), conversação avançada e raciocínio multimodal em tempo real.',
    source: 'Plataforma Oficial (xAI)',
  },
  {
    keywords: ['grok', 'xai', 'x.ai'],
    title: 'Grok - Assistente de IA da xAI',
    url: 'https://grok.com/',
    snippet: 'Acede ao Grok, a inteligência artificial da xAI desenvolvida com compreensão do universo, visão multimodal e pesquisa em tempo real no X.',
    source: 'Plataforma Oficial (xAI)',
  },
  {
    keywords: ['chatgpt', 'openai', 'gpt 4', 'gpt-4o'],
    title: 'ChatGPT - OpenAI',
    url: 'https://chatgpt.com/',
    snippet: 'Plataforma oficial da OpenAI para interação com modelos ChatGPT, GPT-4o, análise de ficheiros e geração de código.',
    source: 'Plataforma Oficial (OpenAI)',
  },
  {
    keywords: ['midjourney', 'mid journey'],
    title: 'Midjourney - AI Image Generation Platform',
    url: 'https://www.midjourney.com/',
    snippet: 'Plataforma oficial de criação e exploração artística com modelos de difusão de última geração da Midjourney.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['claude', 'anthropic'],
    title: 'Claude AI - Anthropic',
    url: 'https://claude.ai/',
    snippet: 'Plataforma de IA conversacional da Anthropic focada em segurança, código avançado e raciocínio detalhado com Claude 3.5 Sonnet.',
    source: 'Plataforma Oficial (Anthropic)',
  },
  {
    keywords: ['canva'],
    title: 'Canva - Design Visual, Apresentações e Imagens',
    url: 'https://www.canva.com/pt_pt/',
    snippet: 'Ferramenta online de design gráfico, edição de fotos, criação de posts e materiais visuais para redes sociais.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['notion'],
    title: 'Notion - O seu espaço de trabalho conectado',
    url: 'https://www.notion.so/',
    snippet: 'Documentos, wikis e gestão de projetos integrados com inteligência artificial para equipas e produtividade.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['figma'],
    title: 'Figma - Ferramenta de Design de Interface Colaborativo',
    url: 'https://www.figma.com/',
    snippet: 'Plataforma baseada no navegador para UI/UX design, prototipagem interativa e sistemas de design de equipa.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['runway', 'runwayml', 'gen 3'],
    title: 'Runway - AI Video Creation and Generative Tools',
    url: 'https://runwayml.com/',
    snippet: 'Plataforma profissional de geração e edição de vídeo por inteligência artificial (Gen-2 e Gen-3 Alpha).',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['elevenlabs', 'eleven labs'],
    title: 'ElevenLabs - Clonagem e Síntese de Voz por IA',
    url: 'https://elevenlabs.io/',
    snippet: 'Plataforma líder em vozes de inteligência artificial ultrarrealistas, dublagem automática e efeitos sonoros.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['suno', 'suno ai'],
    title: 'Suno - Criação de Música com IA',
    url: 'https://suno.com/',
    snippet: 'Cria músicas completas com voz, instrumentos e melodia a partir de descrições textuais.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['perplexity', 'perplexity ai'],
    title: 'Perplexity AI - Motor de Resposta e Pesquisa Conversacional',
    url: 'https://www.perplexity.ai/',
    snippet: 'Pesquisa na web em tempo real com citações verificadas e respostas detalhadas.',
    source: 'Plataforma Oficial',
  },
  {
    keywords: ['github'],
    title: 'GitHub - Onde o mundo constrói software',
    url: 'https://github.com/',
    snippet: 'A maior plataforma de hospedagem de código e controle de versões com Git e colaboração de desenvolvedores.',
    source: 'Plataforma Oficial',
  },
];

export class SearchEngine {
  public static async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const lowerQuery = trimmed.toLowerCase();
    const results: SearchResultItem[] = [];
    const seenUrls = new Set<string>();

    const addResult = (title: string, url: string, snippet: string, source: string) => {
      if (!url || seenUrls.has(url)) return;
      // Do not accept invalid links
      if (!url.startsWith('http://') && !url.startsWith('https://')) return;

      seenUrls.add(url);
      results.push({
        title: title.trim(),
        url,
        snippet: snippet.replace(/<[^>]+>/g, '').trim(),
        source,
      });
    };

    // 1. Direct Platform / Tool matching: If searching for a web platform/app, put official platform first!
    for (const platform of POPULAR_PLATFORMS) {
      if (platform.keywords.some(k => lowerQuery.includes(k))) {
        addResult(platform.title, platform.url, platform.snippet, platform.source);
        break;
      }
    }

    // 2. Query DuckDuckGo HTML Search for real live web results
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Sec-Ch-Ua': '"Chromium";v="134", "Google Chrome";v="134"',
        },
      });

      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('.result').each((_, el) => {
          const $el = $(el);
          const title = $el.find('.result__title a, a.result__url').first().text().trim();
          const rawHref = $el.find('.result__title a, a.result__url').first().attr('href') || '';
          const snippet = $el.find('.result__snippet').text().trim();

          let targetUrl = rawHref;
          if (rawHref.includes('uddg=')) {
            try {
              const parsed = new URL(rawHref, 'https://duckduckgo.com');
              const uddg = parsed.searchParams.get('uddg');
              if (uddg) {
                targetUrl = decodeURIComponent(uddg);
              }
            } catch {}
          } else if (rawHref.startsWith('//')) {
            targetUrl = 'https:' + rawHref;
          }

          if (targetUrl && title) {
            // If the query is about a platform, tool or app, deprioritize or skip Wikipedia
            const isWiki = targetUrl.includes('wikipedia.org');
            const isLookingForPlatform = lowerQuery.includes('imagine') || lowerQuery.includes('grok') || lowerQuery.includes('app') || lowerQuery.includes('plataforma') || lowerQuery.includes('ferramenta') || lowerQuery.includes('login') || lowerQuery.includes('site');
            
            if (isWiki && isLookingForPlatform) {
              return; // Skip Wikipedia when looking for an interactive platform
            }

            let source = 'Web';
            try {
              source = new URL(targetUrl).hostname.replace('www.', '');
            } catch {}

            addResult(title, targetUrl, snippet || title, source);
          }
        });
      }
    } catch (err) {
      console.error('[SearchEngine] DuckDuckGo HTML search error:', err);
    }

    // 3. DuckDuckGo Instant Answers API for official site metadata
    try {
      const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_html=1&skip_disambig=0`;
      const res = await fetch(ddgApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.AbstractURL && data.Heading) {
          const isWiki = data.AbstractURL.includes('wikipedia.org');
          const isLookingForPlatform = lowerQuery.includes('imagine') || lowerQuery.includes('grok') || lowerQuery.includes('app') || lowerQuery.includes('plataforma');
          if (!isWiki || !isLookingForPlatform) {
            addResult(data.Heading, data.AbstractURL, data.AbstractText || data.Heading, 'DuckDuckGo Knowledge');
          }
        }

        const related = data.RelatedTopics || [];
        for (const topic of related) {
          if (topic.FirstURL && topic.Text) {
            const isWiki = topic.FirstURL.includes('wikipedia.org');
            if (!isWiki || !lowerQuery.includes('imagine')) {
              addResult(topic.Text.slice(0, 70), topic.FirstURL, topic.Text, 'DuckDuckGo Web');
            }
          }
        }
      }
    } catch (err) {
      console.error('[SearchEngine] DuckDuckGo API error:', err);
    }

    // 4. Fallback: Only if results are empty and user explicitly asked for definition/history, check Wikipedia
    if (results.length === 0 && (lowerQuery.includes('o que é') || lowerQuery.includes('história') || lowerQuery.includes('definição') || lowerQuery.includes('quem é'))) {
      try {
        const wikiSearchUrl = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(trimmed)}&utf8=&format=json&srlimit=3`;
        const res = await fetch(wikiSearchUrl, {
          headers: { 'User-Agent': 'MorphAIBrowser/2.0' },
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          for (const hit of (data.query?.search || [])) {
            addResult(
              hit.title,
              `https://pt.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`,
              hit.snippet || hit.title,
              'Wikipédia'
            );
          }
        }
      } catch {}
    }

    return results.slice(0, 10);
  }
}
