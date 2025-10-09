#!/bin/bash

echo "=================================="
echo "SETUP DE NOTIFICAÇÕES POR EMAIL"
echo "=================================="
echo ""

ENV_FILE="backend/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo ""
    echo "Criando arquivo .env.example como modelo..."
    
    cat > backend/.env.example << 'EOF'
PORT=3001
JWT_SECRET=sua-chave-secreta-aqui-troque-por-uma-segura
MONGODB_URI=mongodb://localhost:27017/financial-system

EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-de-app-do-gmail

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/gmail/oauth2/callback

CORS_ORIGINS=http://localhost:3000,http://localhost:3001
EOF
    
    echo "✅ Arquivo .env.example criado!"
    echo ""
    echo "⚠️  AÇÃO NECESSÁRIA:"
    echo "1. Copie o arquivo .env.example para .env:"
    echo "   cp backend/.env.example backend/.env"
    echo ""
    echo "2. Edite o arquivo backend/.env e configure:"
    echo "   - EMAIL_USER: seu email do Gmail"
    echo "   - EMAIL_PASS: senha de aplicativo do Gmail"
    echo ""
    echo "3. Para gerar senha de aplicativo do Gmail:"
    echo "   https://myaccount.google.com/apppasswords"
    echo ""
else
    echo "✅ Arquivo .env encontrado!"
    echo ""
    
    if grep -q "seu-email@gmail.com" "$ENV_FILE"; then
        echo "⚠️  ATENÇÃO: EMAIL_USER ainda não foi configurado!"
        echo "   Edite backend/.env e configure seu email real"
        echo ""
    else
        echo "✅ EMAIL_USER parece estar configurado"
    fi
    
    if grep -q "sua-senha-de-app-do-gmail" "$ENV_FILE"; then
        echo "⚠️  ATENÇÃO: EMAIL_PASS ainda não foi configurado!"
        echo "   Configure a senha de aplicativo do Gmail em backend/.env"
        echo "   Gere em: https://myaccount.google.com/apppasswords"
        echo ""
    else
        echo "✅ EMAIL_PASS parece estar configurado"
    fi
fi

echo ""
echo "Verificando MongoDB..."
if pgrep -x "mongod" > /dev/null; then
    echo "✅ MongoDB está rodando"
else
    echo "❌ MongoDB NÃO está rodando!"
    echo "   Inicie com: brew services start mongodb-community"
    echo "   Ou: mongod --dbpath ~/data/db"
fi

echo ""
echo "Verificando Backend..."
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Servidor backend está rodando"
else
    echo "❌ Servidor backend NÃO está rodando!"
    echo "   Inicie com: cd backend && npm start"
fi

echo ""
echo "=================================="
echo "RESUMO DAS MELHORIAS"
echo "=================================="
echo "✅ Cron agora roda a cada 2 horas (era só às 8h)"
echo "✅ Sistema evita notificações duplicadas"
echo "✅ Logs detalhados para debugging"
echo "✅ Email formatado em HTML"
echo "✅ Melhor tratamento de erros"
echo ""

echo "=================================="
echo "PRÓXIMOS PASSOS"
echo "=================================="
echo "1. Configure o arquivo .env (se ainda não fez)"
echo "2. Reinicie o servidor backend"
echo "3. Acesse o sistema e vá em Configurações"
echo "4. Configure o email e dias antes da notificação"
echo "5. Clique em 'Testar Notificações' para testar"
echo ""
echo "📖 Leia INSTRUCOES_NOTIFICACOES.md para mais detalhes"
echo ""

