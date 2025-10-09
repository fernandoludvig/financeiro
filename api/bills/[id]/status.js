// Vercel API Route para marcar conta como paga
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  const db = client.db('financeiro');
  
  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

function authenticateToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    const { id } = req.query;
    const { status } = req.body;

    if (!['pending', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { client, db } = await connectToDatabase();

    // Atualizar status da conta - EXATAMENTE igual ao localhost
    console.log('🔄 Atualizando status da conta:', id, 'para:', status);
    
    const updateData = { status };
    
    // Adicionar paid_at se status for 'paid'
    if (status === 'paid') {
      updateData.paid_at = new Date();
    } else if (status === 'pending') {
      updateData.paid_at = null;
    }
    
    updateData.updatedAt = new Date();

    const result = await db.collection('bills').updateOne(
      { 
        _id: new ObjectId(id), 
        user_id: new ObjectId(user.id) 
      },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    // Buscar conta atualizada - igual ao localhost
    const updatedBill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    if (!updatedBill) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    // Formatar resposta - EXATAMENTE igual ao localhost
    const formattedBill = {
      ...updatedBill,
      id: updatedBill._id.toString(),
      user_id: updatedBill.user_id.toString(),
      _id: updatedBill._id.toString()
    };

    console.log('✅ Status atualizado com sucesso:', formattedBill.id, 'status:', formattedBill.status);
    res.status(200).json(formattedBill);

  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
