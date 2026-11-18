# Sentinela · Clash of Clans

Monitor do clã **#R0UPVVVY**, com painel público para Vercel, coleta agendada no Cloudflare Workers, histórico no D1 e avisos independentes para Telegram e Discord.

Painel: https://sentinela-clash.vercel.app

Monitor: https://clan-monitor.clan-monitor.workers.dev

O código está conectado ao projeto Vercel `sentinela-clash`. A variável de produção `PUBLIC_API_BASE` aponta para o monitor. As alterações no Worker continuam exigindo `npm run deploy:worker`; mudanças no GitHub publicam o painel pela integração da Vercel.

## O que já está implementado

- Membros, cargos, CVs, troféus, doações e recebimentos atuais.
- Busca e ordenação de membros; diferença do contador de doações em aproximadamente 24h.
- Guerra comum e rodadas da Liga, inclusive quando o clã está no lado oponente.
- Lista de ataques pendentes, placar e histórico das guerras observadas.
- Eventos de entradas/saídas, início e término de guerra.
- Lembretes de ataques nas janelas de 6h e 1h antes do término.
- Fila persistente com tentativas separadas por canal; lembretes vencidos não são enviados.
- Estado de conexão e data da coleta visíveis; dados antigos permanecem identificados em falhas.
- Painel de configuração sem dados fictícios quando a API não está conectada.

## Arquitetura e custo

```text
GitHub ──build──> Vercel (painel estático público)
                         │ GET /api/dashboard
                         ▼
                  Cloudflare Worker ──> D1
                    │ cron 5 minutos
                    ├─> RoyaleAPI proxy ──> API oficial Clash
                    ├─> Telegram Bot API
                    └─> Discord webhook
```

Usa as cotas gratuitas dos provedores, sem contratar plano pago. Cinco minutos são 288 execuções por dia. O histórico usa uma captura do clã por hora (retenção de 30 dias), eventos por 90 dias e guerras por 180 dias. O painel mostra as últimas 20 guerras e 30 ocorrências. Cotas e termos dos serviços podem mudar. O plano gratuito do Worker tem orçamento de CPU reduzido; acompanhe métricas após conectar os dados reais.

O proxy é um serviço de terceiros, sem garantia de disponibilidade: ele recebe a chave dedicada da API Clash em cada consulta. Não recebe tokens do Telegram ou Discord. Use uma chave exclusiva para este projeto. É possível migrar o acesso para API direta alterando CLASH_API_BASE e usando infraestrutura com IP autorizado.

## 1. Conectar o Clash antes de publicar

Pré-requisito: Node 22.13+ (Node 24 recomendado).

```sh
npm ci
cp .dev.vars.example .dev.vars
```

No [portal oficial](https://developer.clashofclans.com/), crie uma chave para este projeto e autorize **45.79.218.79**, IP publicado pelo [proxy RoyaleAPI](https://docs.royaleapi.com/proxy). Confirme o IP nessa documentação se houver falha.

Abra `.dev.vars` no editor e preencha somente `CLASH_API_TOKEN`. Não cole credenciais em commits, issues ou chat. Esse arquivo está ignorado pelo Git.

```sh
npm run connection:test
```

Esse comando consulta o clã por HTTPS, imprime apenas nome, tag, quantidade de membros e visibilidade do registro de guerras. Não imprime a chave nem corpos de erro.

## 2. Executar localmente

```sh
npm run db:local
npm run dev
```

Abra http://localhost:8787. O Worker também serve os arquivos estáticos durante o desenvolvimento. O banco local funciona com o ID provisório de `wrangler.jsonc`; o ID real só é exigido para publicação.

Para fazer uma coleta manual, gere `ADMIN_TOKEN` com pelo menos 32 caracteres aleatórios e salve em `.dev.vars`. A rota `POST /api/sync` exige `Authorization: Bearer <ADMIN_TOKEN>`. Nunca coloque esse segredo no painel. Alternativamente, use a execução do agendamento pelo painel Cloudflare. A atualização do navegador apenas relê o banco; ela não dispara consultas à API Clash.

```sh
npm test
npm run check
npm run build
```

Os testes usam SQLite real em memória e respostas HTTP controladas. Não enviam mensagens para canais reais.

## 3. Publicar o monitor gratuitamente no Cloudflare

Crie uma conta Cloudflare gratuita e execute:

```sh
npx wrangler login
npx wrangler d1 create clan-monitor
```

Copie o `database_id` retornado para `wrangler.jsonc`. Não é um segredo. Defina `PUBLIC_ORIGIN` com a origem exata do painel Vercel (ex.: `https://sentinela-clash.vercel.app`), sem barra final.

```sh
npm run db:remote
npx wrangler secret put CLASH_API_TOKEN
npx wrangler secret put ADMIN_TOKEN
npm run deploy:worker
```

Os comandos `secret put` solicitam o valor sem colocá-lo no código. O cron de cinco minutos já está declarado. A publicação inicia a coleta; notificações só são enviadas quando os respectivos segredos são configurados.

## 4. Publicar o painel na Vercel

Importe o repositório GitHub na Vercel:

| Campo | Valor |
| --- | --- |
| Framework | Other |
| Build command | `npm run build` |
| Output directory | `dist` |
| Variável de build | `PUBLIC_API_BASE=https://clan-monitor.SEU-SUBDOMINIO.workers.dev` |

`PUBLIC_API_BASE` não contém segredo: é a origem do Worker, sem barra final e sem `/api`. Não configure CLASH_API_TOKEN nem tokens dos canais na Vercel: o painel é inteiramente estático. Depois de conhecer a URL definitiva Vercel, ajuste PUBLIC_ORIGIN no Worker e publique novamente. Sem a URL do Worker, o painel exibe instruções de conexão.

## 5. Conectar Telegram e Discord

### Telegram

Crie um bot via **@BotFather** no Telegram. Inicie uma conversa com ele ou adicione-o ao grupo que receberá os avisos. Obtenha o identificador `chat_id` pelo método getUpdates da Bot API após uma mensagem de teste, sem publicar a URL que contém o token. Canais/grupos precisam permitir que o bot envie mensagens.

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### Discord

No canal desejado, use **Editar canal → Integrações → Webhooks**. Crie um webhook e copie a URL; ela é uma credencial.

```sh
npx wrangler secret put DISCORD_WEBHOOK_URL
```

O monitor desativa menções automáticas no Discord. As mensagens do Telegram são texto simples. Nenhuma associação automática entre tags Clash e usuários Telegram/Discord é realizada.

### Selecionar avisos

Variáveis públicas de configuração do Worker:

- `ALERT_CHANNELS`: `telegram,discord`, ou apenas um canal.
- `ALERT_TYPES`: lista global separada por vírgula de `member_join,member_leave,war_start,war_end,war_reminder`.
- `ALERT_TYPES_TELEGRAM` e `ALERT_TYPES_DISCORD`: filtros adicionais opcionais por canal. Para desativar um canal, remova-o de ALERT_CHANNELS.

As configurações são aplicadas após nova publicação. O painel de alertas mostra se existem credenciais e a última entrega confirmada, sem exibir destinos ou tokens. Configurar credenciais não comprova entrega: confirme o primeiro envio real no canal escolhido.

## Limites do acompanhamento

- O histórico começa na primeira coleta: eventos anteriores não são reconstruídos.
- Entradas e saídas entre duas consultas podem passar despercebidas. Os horários são de detecção, não horários exatos do jogo.
- A primeira coleta não anuncia membros ou guerras já existentes.
- Registro de guerra privado ou erros de permissão podem impedir acompanhamento de guerras. O painel informa a falha e mantém os dados anteriores com a data da última coleta válida.
- Lembretes são avaliados nas janelas de 15 minutos após os marcos de 6h e 1h restantes. Se o serviço ficar indisponível durante toda a janela, o lembrete é perdido, evitando mensagens atrasadas.
- Doações são contadores de temporada dos membros atuais. Uma redução é tratada como reinício, sem inventar diferenças negativas. Não medimos atividade online, último acesso ou ataques em tempo real.
- Liga: consultamos até as três últimas rodadas disponíveis. Interrupções prolongadas podem deixar lacunas no histórico.
- Trava com concessão de quatro minutos impede coletas concorrentes normais. Timeout de envio pode deixar confirmação ambígua: em casos raros uma nova tentativa pode duplicar uma mensagem. Não há garantia de entrega exatamente uma vez nas APIs externas.
- A fila tenta até quatro entregas por coleta para respeitar o plano gratuito. Mensagens são resumidas se ultrapassarem 1.800 caracteres; a lista completa fica no painel.
- O painel é público, incluindo dados do clã, participantes e eventos observados. Segredos, destinos dos avisos e rotas de alteração não são públicos. O endpoint público pode consumir cotas sob tráfego elevado; é possível restringir o acesso se necessário.

## Segurança do repositório

`.dev.vars`, `.env*`, `.wrangler`, `.vercel`, dependências e build não são versionados. Nenhum segredo vai para o navegador. `/api/sync` só aceita POST autenticado; a API pública só lê dados já coletados. Nomes dos jogadores são escapados na interface. Logs persistem apenas códigos internos de falha.

Projeto independente, sem vínculo com Supercell. Consulte a [Fan Content Policy](https://supercell.com/en/fan-content-policy/).
