Financial System

Sistema completo de gestão financeira (Backend Node.js + Frontend React) com autenticação JWT, notificações por email, cron diário e geração de PDF.

Estrutura

```
financial-system/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── .gitignore
│   ├── utils/gmail.js
│   └── uploads/
└── frontend/
    ├── src/
    │   ├── components/ui/
    │   ├── lib/utils.js
    │   ├── App.jsx
    │   ├── index.css
    │   └── index.js
    ├── public/index.html
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── components.json
    └── package.json
```

Backend

- Porta padrão: 3001
- Banco: SQLite (arquivo `backend/database.db` criado automaticamente)
- Tabelas: `users`, `bills`, `notifications`
- Autenticação: JWT (header `Authorization: Bearer <token>`)
- Notificações: `nodemailer` (Gmail) + `node-cron` diário 08:00
- Relatórios: PDFKit
- Gmail API: `backend/utils/gmail.js`

Variáveis (.env)

```
PORT=3001
JWT_SECRET=troque-esta-chave
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-ou-app-password
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gmail/oauth2/callback
```

Scripts

```
cd backend
npm install
npm run start
```

Rotas

- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/bills`
- POST `/api/bills`
- PATCH `/api/bills/:id/status`
- DELETE `/api/bills/:id`
- POST `/api/notifications/test`
- GET `/api/reports/monthly/:year/:month`
- GET `/api/gmail/auth`
- GET `/api/gmail/oauth2/callback`
- GET `/api/gmail/boletos`

Frontend

- React (CRA) + Tailwind + shadcn/ui (implementação manual dos componentes)
- Persistência de token no localStorage
- Integração via `fetch` com header Authorization

Instalação

```
cd frontend
npm install
npm start
```

Instalação completa

```
cd backend && npm install && cd ../frontend && npm install
```

Segurança

- Utilize variáveis de ambiente e senhas de app no Gmail
- JWT com expiração (7d)
- OWASP Top 10: sanitização de entradas, uso de HTTPS em produção, variáveis seguras

Observações

- Para usar Gmail API, acesse `/api/gmail/auth` para obter a URL de autorização, siga o fluxo e salve os tokens.
- O cron executa a cada 2 horas (00:00, 02:00, 04:00, etc.)

Notificações por Email

O sistema possui notificações automáticas por email para contas a vencer:

- Configure suas preferências em "Configurações" no sistema
- Escolha quantos dias antes do vencimento quer ser notificado (1-30 dias)
- Configure um email específico para notificações (ou use o email de login)
- O sistema evita notificações duplicadas automaticamente
- Teste manualmente clicando em "Testar Notificações"

Scripts Úteis

```bash
./setup-notificacoes.sh      # Verificar status do sistema de notificações
./testar-notificacoes.sh     # Testar notificações manualmente
```

Documentação Adicional

- `INSTRUCOES_NOTIFICACOES.md` - Guia completo de configuração de notificações
- `RESUMO_CORRECOES.md` - Resumo das melhorias implementadas
- `.env.example` - Template de configuração


