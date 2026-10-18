# Guia de Deploy e Hospedagem: Morph AI Browser

Este documento explica como publicar o **Morph AI Browser** no **GitHub** e colocá-lo no ar para que outras pessoas usem.

---

## 1. Como Enviar o Projeto para o GitHub

1. No seu computador ou terminal do projeto, inicialize o repositório Git (se ainda não tiver feito):
   ```bash
   git init
   git add .
   git commit -m "feat: Morph AI Browser pronto para producao com sessoes multi-usuario"
   ```

2. Crie um repositório no [GitHub](https://github.com/new) (por exemplo com o nome `morph-ai-browser`).

3. Vincule e envie o código:
   ```bash
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/morph-ai-browser.git
   git push -u origin main
   ```

---

## 2. O App Funciona na Vercel? (Importante!)

### O que a Vercel suporta:
A Vercel é excelente para **sites estáticos (Frontend React/Vite)**.

### Por que um App de Agente Autônomo com Navegador requer atenção na Vercel:
1. **Timeouts de 10-15 segundos:** Na conta gratuita da Vercel (Hobby), qualquer rota de API/Serverless function é derrubada após **10 a 15 segundos**. Como o agente de IA navega por várias páginas web em sequência para pesquisar e extrair dados, tarefas completas levam de 15 a 45 segundos e sofreriam erro de `504 Gateway Timeout`.
2. **Conexões SSE (Server-Sent Events):** O streaming em tempo real do pensamento do agente (`/api/agent/stream`) precisa de uma conexão HTTP contínua, que Serverless functions costumam interromper.
3. **Estado de Navegação em Memória:** As instâncias isoladas de abas de navegação de cada usuário residem no processo do servidor. Na Vercel, cada clique pode ir para uma função Lambda diferente em outro servidor.

---

## 3. As Melhores Plataformas para Hospedar este App a partir do GitHub (1 Clique)

Para rodar este app de forma 100% contínua, rápida e sem quedas de conexão, recomendamos:

### Opção A: Railway (Mais recomendada e simples)
1. Acesse [railway.app](https://railway.app) e faça login com seu GitHub.
2. Clique em **"New Project"** -> **"Deploy from GitHub repo"**.
3. Selecione o repositório `morph-ai-browser`.
4. Em **Variables** (Variáveis de Ambiente), adicione:
   - `GEMINI_API_KEY`: sua chave da Google Gemini API.
   - `NODE_ENV`: `production`
5. O Railway detecta automaticamente o comando `npm run build` e `npm start`. Em 2 minutos seu app estará no ar com URL pública HTTPS!

### Opção B: Render (render.com)
1. Crie uma conta em [render.com](https://render.com).
2. Clique em **"New +"** -> **"Web Service"** e conecte o repositório do GitHub.
3. Defina:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. Em **Environment Variables**, adicione a `GEMINI_API_KEY`.

### Opção C: Vercel (Caso queira usar apenas o Frontend lá)
Se desejar usar a Vercel, a melhor arquitetura é:
- Subir o servidor (`server.ts`) no Railway ou Render.
- Apontar as rotas da Vercel para o seu backend através de rewrites no `vercel.json`.

---

## 4. O que Já Foi Implementado no Código para o Mercado

- [x] **Isolamento de Sessões Multi-inquilino (Multi-tenant):** Cada usuário que abre o aplicativo recebe seu próprio ID de sessão (`morph_session_id`), abas de navegador separadas e agente dedicado.
- [x] **Roteamento Inteligente de Plataformas:** Sem desvios incorretos para a Wikipédia ao buscar ferramentas e apps.
- [x] **Navegador com Chrome 134 e Modo Escuro/Claro Nativo:** As páginas não ficam desconfiguradas.
- [x] **Sistema de Calendário:** Confirmação de compromissos com Google Calendar e download de `.ics`.
- [x] **Limpeza Automática:** Sessões inativas há mais de 2 horas são liberadas da memória automaticamente.
