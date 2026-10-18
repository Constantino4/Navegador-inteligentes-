# Sistema Independente de Mapa e Descoberta de Locais (OpenStreetMap & Leaflet)

Substituição total de qualquer dependência do Google Maps por uma solução nativa, aberta e imediata baseada em OpenStreetMap e Leaflet. O sistema funciona sem necessidade de chaves de API externas ou cartões de crédito, remove todas as menções a "Google Maps" no frontend e mantém a pesquisa inteligente de empresas com pinos interativos, detalhes de contacto e navegação autónoma de websites.

## User Review & Critical Decisions

> [!IMPORTANT]
> Decisões confirmadas na fase de esclarecimento:
> - **Motor de Mapas**: OpenStreetMap com renderizador Leaflet interativo, carregando mosaicos (tiles) globais públicos sem depender de chaves de API externas nem faturas.
> - **Motor de Pesquisa e Geolocalização**: Combinação do serviço público OpenStreetMap Nominatim com o motor de pesquisa web do backend para encontrar empresas, coordenadas exatas, contactos e moradas.
> - **Identidade e Nomenclatura no Frontend**: Remoção rigorosa e absoluta de qualquer menção, botão, logótipo ou texto referente a "Google Maps". A interface passa a usar **"Mapa & Locais"** de forma limpa e neutra.
> - **Ações Autónomas**: O botão **"Investigar Site"** continua ativo em cada empresa encontrada, permitindo que o navegador virtual autónomo abra a página web da empresa para extrair serviços, preços ou contactos.

---

## 1. Overview & Core Concept

- **O que faz**: Permite ao utilizador e ao assistente de IA pesquisar e visualizar empresas, escritórios, restaurantes, fornecedores ou locais em qualquer parte do mundo num mapa interativo, sem qualquer dependência ou menção a serviços proprietários como o Google Maps.
- **Público-alvo**: Utilizadores que procuram empresas locais, realizam prospeção B2B ou comparam prestadores de serviços de forma instantânea e descomplicada.
- **Valor Principal**: Independência total de chaves pagas, funcionamento imediato sem configurações e interface limpa e integrada.

---

## 2. User Experience & Visual Design

### Fluxos do Utilizador
1. **Pedido no Chat**: O utilizador escreve: *"Procura agências de marketing no Porto"* ou *"Encontra restaurantes italianos em Lisboa"*.
2. **Execução da Ferramenta**: O assistente invoca a ferramenta `search_places` / `search_local_companies`, recolhendo dados geográficos reais via Nominatim e pesquisa web.
3. **Cartões no Chat**: O chat exibe cartões elegantes com o selo neutro **"Mapa & Locais"**, mostrando nome, morada, tipo de atividade, website e telefone.
4. **Visualização no Mapa**: Ao clicar em **"Abrir no Mapa"** ou no botão do cabeçalho **"Mapa & Locais"**, abre-se o painel lateral com o mapa Leaflet/OpenStreetMap interativo, pins vermelhos/azuis, zoom e popups informativos.
5. **Investigação do Website**: Clicar em **"Investigar Site"** abre o navegador virtual autónomo diretamente no website da empresa.

### Identidade Visual e Interface
- **Tema**: Escuro de alta produtividade (Slate escuro `#0F172A` / `#171717`), alinhado com o estilo do ChatGPT e do Morph AI Browser.
- **Botões e Indicadores**:
  - Cabeçalho: Botão neutro com ícone de mapa e texto **"Mapa & Locais"**, com contador numérico de locais encontrados.
  - Cartões: Tipografia limpa (`Plus Jakarta Sans`), números tabulares para telefones e coordenadas, sem badges poluídos.
  - Pinos do Mapa: Marcadores vetoriais com destaque de seleção e popups rápidos com links diretos.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Leaflet + OpenStreetMap Carto Tiles**
  - *Abordagem*: Utilizar biblioteca Leaflet para React / Leaflet vanilla com tiles públicos `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`.
  - *Vantagem*: Funciona imediatamente sem conta de programador, sem cartão de crédito, sem quota de faturação e sem chaves de API.
  - *Alternativas*: MapLibre exigiria servidor de vector tiles ou chave Mapbox/Stadia; Google Maps exigiria ativação de faturamento e aprovações de ToS.

- **Decisão 2: Busca Híbrida (Nominatim + Search Engine)**
  - *Abordagem*: O servidor faz a busca estruturada via Nominatim Search API (`https://nominatim.openstreetmap.org/search?format=json&q=...`) complementada com a pesquisa web existente para enriquecer telefones e websites oficiais.
  - *Vantagem*: Resiliência total e independência de fornecedores proprietários.

- **Decisão 3: Higienização Completa de Termos no Frontend**
  - *Abordagem*: Remoção de todas as strings "Google Maps" no código, variáveis de estado, tooltips, botões e mensagens do assistente.

---

## 4. Technical Architecture & Data Strategy

### Diagrama do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                              INTERFACE                                 │
├─────────────────┬──────────────────────┬───────────────────────────────┤
│    CHAT VIEW    │    MAPA & LOCAIS     │       NAVEGADOR MORPH         │
│                 │                      │                               │
│ • Pedido chat   │ • Leaflet / OSM      │ • Inspeção DOM e Leitura      │
│ • Cartões de    │ • Pins Interativos   │ • Sessões e Cookies           │
│   Empresas      │ • Popups com Info    │ • Navegação em Websites       │
│ • Botão "Mapa"  │ • Centralização Auto │ • Extração de Dados           │
└────────┬────────┴──────────┬───────────┴───────────────┬───────────────┘
         │                   │                           │
         ▼                   ▼                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SERVIDOR BACKEND                                │
├────────────────────────────────────────────────────────────────────────┤
│  POST /api/places/search       GET /api/places/details                 │
│  • Nominatim Geocoding API     • Contactos, morada e website           │
│  • Enriquecimento de entidades • Formato neutro JSON                   │
├────────────────────────────────────────────────────────────────────────┤
│  CONTROLADOR DO AGENTE                                                 │
│  • Ferramenta: search_local_places(query)                              │
│  • Instruções do sistema sem menções a marcas proprietárias            │
└────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Dados Neutro

```typescript
export interface BusinessPlace {
  id: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  category?: string;
  phoneNumber?: string;
  website?: string;
  openNow?: boolean;
}

export interface MapSearchResult {
  query: string;
  places: BusinessPlace[];
  center: { lat: number; lng: number };
}
```

### Roteiro de Implementação
1. **Pacotes**: Instalar `leaflet` e `@types/leaflet` (ou integrar container Leaflet leve sem dependências complexas).
2. **Backend**: Atualizar `server/places-service.ts` para consultar Nominatim da OpenStreetMap com `User-Agent` adequado e pesquisa enriquecida.
3. **Agente**: Atualizar `server/agent-controller.ts` para usar a ferramenta `search_local_places`, orientando o LLM em português a encontrar empresas e consultar os seus websites.
4. **Componentes Frontend**:
   - `MapPanel.tsx`: Renderizar mapa interativo via Leaflet/OpenStreetMap com marcadores e popups, sem menção a Google Maps.
   - `PlacesCardList.tsx`: Cartões com título "Mapa & Locais", rotas e botões neutros.
   - `App.tsx` e `ChatView.tsx`: Atualizar cabeçalhos, botões e tooltips para "Mapa & Locais".
5. **Verificação**: Compilar e testar a renderização interativa e a busca de empresas.
