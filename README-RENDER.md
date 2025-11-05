# 🚀 Deploy no Render

## Passos para Deploy:

1. **No Render Dashboard, ao criar novo serviço:**
   - **Tipo:** Web Service
   - **Nome:** financeiro (ou o nome que preferir)
   - **Repository:** Conecte seu repositório GitHub
   - **Branch:** main
   - **Root Directory:** (deixe em branco)
   - **Environment:** Node
   - **Build Command:**
     ```
     npm install && cd frontend && npm install && npm run build && cd .. && npm install --prefix backend
     ```
   - **Start Command:**
     ```
     cd backend && npm start
     ```

2. **Variáveis de Ambiente (Environment Variables):**
   Adicione as seguintes variáveis no Render:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (ou deixe o Render definir automaticamente)
   - `MONGODB_URI` = Sua string de conexão do MongoDB
   - `JWT_SECRET` = Um secret aleatório para JWT
   - `CORS_ORIGINS` = URL do seu app no Render (ex: `https://seu-app.onrender.com`)
   - `EMAIL_USER` = Email para notificações (opcional)
   - `EMAIL_PASS` = Senha do email (opcional)

3. **Aguarde o build e deploy**

4. **Acesse:** `https://seu-app.onrender.com`

## ✅ Vantagens do Render:
- Suporta Express completo (não serverless)
- Arquivos temporários funcionam normalmente
- PDFs funcionam exatamente como no localhost
- Build automático do frontend
- Deploy contínuo do GitHub

## 📝 Notas:
- O Render pode levar alguns minutos para fazer o primeiro build
- O serviço pode hibernar após 15 minutos de inatividade (plano gratuito)
- Para evitar hibernação, use o plano pago ou configure um ping automático

