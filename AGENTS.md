# TIGERS FAMILY

- Mantenha a hospedagem existente: Vercel para o painel e Cloudflare Workers/D1 para a coleta. O Worker e o banco continuam com o identificador interno `clan-monitor`.
- Nunca publique `.dev.vars`, credenciais, inscrições de notificações ou chaves privadas. Configurações públicas devem ser selecionadas explicitamente.
- Para cada funcionalidade nova ou mudança visível para os usuários, acrescente uma entrada no início de `public/releases.js`. Use uma versão `AAAA.MM.DD.N`, data/hora ISO reais e linguagem simples em português, explicando o benefício e onde encontrar o recurso. Não use termos de implementação sem necessidade.
- As datas exibidas no histórico são horários de registro das mudanças, em America/Cuiaba. Não apresente o horário de um commit como o instante exato da publicação. Preserve o histórico anterior e não invente funcionalidades ou datas.
- War privado, coleta antiga ou incompleta não confirma ataques pendentes. Alertas e cobranças devem ser revalidados antes de gerar texto ou enviar push.
- Verifique as mudanças com `npm run check`, `npm test` e `npm run build`. Para navegação, instalação e notificações, faça verificações de navegador adequadas e informe qualquer limite de validação em aparelhos reais.
- Se alterar os arquivos da página sem conexão ou os ícones em cache, atualize a versão do cache em `public/sw.js`. Nunca guarde respostas de guerra ou listas de cobrança como dados atuais offline.
