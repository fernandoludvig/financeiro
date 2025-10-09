# 🚀 Deploy no Vercel - Sistema Financeiro

## ⚠️ IMPORTANTE: Frontend Only

Este projeto está configurado para deploy apenas do **frontend** no Vercel. O backend precisa ser hospedado separadamente (Heroku, Railway, etc.).

## 📋 Configuração do Vercel

### 1. Conectar Repositório
1. Acesse [vercel.com](https://vercel.com)
2. Faça login com sua conta GitHub
3. Clique em "New Project"
4. Importe o repositório: `fernandoludvig/financeiro`

### 2. Configurações do Build
O Vercel já está configurado com:
- **Framework**: Create React App
- **Build Command**: `cd frontend && npm install && npm run build`
- **Output Directory**: `frontend/build`
- **Install Command**: `cd frontend && npm install`

### 3. Variáveis de Ambiente
Adicione no painel do Vercel:
```
REACT_APP_API_URL=https://seu-backend-url.com/api
GENERATE_SOURCEMAP=false
```

## 🔧 Configuração do Backend

### Opção 1: Heroku (Recomendado)
```bash
# No diretório backend/
heroku create seu-app-financeiro-backend
git subtree push --prefix backend heroku main
```

### Opção 2: Railway
1. Conecte o repositório no Railway
2. Configure para usar a pasta `backend/`
3. Adicione as variáveis de ambiente

### Opção 3: Render
1. Crie um novo Web Service
2. Conecte o repositório
3. Configure:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && node server.js`
   - **Root Directory**: `backend`

## 🌐 URLs Finais

Após o deploy:
- **Frontend**: `https://seu-app.vercel.app`
- **Backend**: `https://seu-backend.herokuapp.com`

## 📝 Variáveis de Ambiente Necessárias

### Frontend (Vercel)
```
REACT_APP_API_URL=https://seu-backend.herokuapp.com/api
```

### Backend (Heroku/Railway/Render)
```
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/database
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-app
JWT_SECRET=sua-chave-secreta-jwt
NODE_ENV=production
```

## 🔄 Workflow de Deploy

1. **Push no GitHub** → Frontend atualiza automaticamente no Vercel
2. **Push no GitHub** → Backend atualiza no Heroku/Railway (se configurado)

## 🐛 Troubleshooting

### Erro 404 no Vercel
- Verifique se o `outputDirectory` está correto
- Confirme que o build está gerando a pasta `frontend/build`

### Erro de CORS
- Configure o CORS no backend para aceitar o domínio do Vercel
- Adicione `https://seu-app.vercel.app` nas origens permitidas

### API não conecta
- Verifique a variável `REACT_APP_API_URL`
- Confirme que o backend está rodando e acessível

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs no painel do Vercel
2. Confirme as variáveis de ambiente
3. Teste o backend separadamente
