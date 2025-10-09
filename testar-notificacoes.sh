#!/bin/bash

echo "🧪 TESTANDO SISTEMA DE NOTIFICAÇÕES"
echo "===================================="
echo ""

if [ ! -f "backend/.env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "   Execute: ./setup-notificacoes.sh primeiro"
    exit 1
fi

if grep -q "seu-email@gmail.com" "backend/.env"; then
    echo "❌ EMAIL_USER não foi configurado!"
    echo "   Edite backend/.env e configure seu email real"
    echo ""
    exit 1
fi

if ! pgrep -x "mongod" > /dev/null; then
    echo "❌ MongoDB não está rodando!"
    echo "   Inicie com: brew services start mongodb-community"
    echo ""
    exit 1
fi

if ! pgrep -f "node.*server.js" > /dev/null; then
    echo "❌ Servidor backend não está rodando!"
    echo "   Inicie com: cd backend && npm start"
    echo ""
    exit 1
fi

echo "✅ Pré-requisitos verificados!"
echo ""
echo "Para testar as notificações:"
echo ""
echo "OPÇÃO 1 - Via Interface Web (Recomendado):"
echo "  1. Acesse: http://localhost:3001"
echo "  2. Faça login"
echo "  3. Clique em 'Testar Notificações'"
echo "  4. Verifique os logs abaixo"
echo "  5. Verifique seu email"
echo ""
echo "OPÇÃO 2 - Via API (Avançado):"
echo ""

read -p "Você tem um token de autenticação? (s/n): " has_token

if [ "$has_token" = "s" ] || [ "$has_token" = "S" ]; then
    echo ""
    read -p "Cole o token JWT aqui: " token
    echo ""
    echo "Chamando API de teste..."
    echo ""
    
    response=$(curl -s -X POST http://localhost:3001/api/notifications/test \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json")
    
    echo "Resposta da API:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    echo ""
else
    echo ""
    echo "Use a OPÇÃO 1 pela interface web."
fi

echo ""
echo "===================================="
echo "📝 Verificando logs do servidor..."
echo "===================================="
echo ""
echo "Os logs do servidor backend devem mostrar algo como:"
echo ""
echo "🔍 ===== VERIFICAÇÃO DE NOTIFICAÇÕES ====="
echo "📅 Data/hora de hoje: ..."
echo "👥 Total de usuários: ..."
echo "📋 Contas pendentes encontradas: ..."
echo ""
echo "Abra o terminal onde o backend está rodando para ver os logs completos!"
echo ""

