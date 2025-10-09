#!/bin/bash

echo "🚀 Iniciando Backend Local para Desenvolvimento..."

# Navegar para o diretório do backend
cd backend

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Configurar variáveis de ambiente para desenvolvimento
export MONGODB_URI="mongodb+srv://fernandoludvig:082004Fe@cluster0.k8gunhp.mongodb.net/"
export EMAIL_USER="fernandoludvig0804@gmail.com"
export EMAIL_PASS="igsr xral lmms shla"
export JWT_SECRET="chave-secreta-desenvolvimento-123"
export NODE_ENV="development"
export PORT=5000

echo "🔧 Variáveis de ambiente configuradas:"
echo "   MONGODB_URI: $MONGODB_URI"
echo "   EMAIL_USER: $EMAIL_USER"
echo "   JWT_SECRET: [CONFIGURADO]"
echo "   NODE_ENV: $NODE_ENV"
echo "   PORT: $PORT"

echo ""
echo "🌐 Backend será executado em: http://localhost:5000"
echo "📧 API estará disponível em: http://localhost:5000/api"
echo ""
echo "⚠️  IMPORTANTE: Configure o frontend para usar:"
echo "   REACT_APP_API_URL=http://localhost:5000/api"
echo ""
echo "🔄 Iniciando servidor..."

# Iniciar o servidor
node server.js
