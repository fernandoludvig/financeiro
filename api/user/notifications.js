// Vercel API Route para configurações de notificação
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

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    const { client, db } = await connectToDatabase();

    if (req.method === 'GET') {
      // Buscar configurações de notificação do usuário
      const userData = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
      
      if (!userData) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.status(200).json({
        notification_email: userData.notification_email || userData.email,
        notification_days_before: userData.notification_days_before || 1
      });

    } else if (req.method === 'PATCH') {
      // Atualizar configurações de notificação
      const { notification_email, notification_days_before } = req.body;

      const updateData = {
        updatedAt: new Date()
      };

      if (notification_email !== undefined) {
        updateData.notification_email = notification_email || null;
      }

      if (notification_days_before !== undefined) {
        if (notification_days_before < 1 || notification_days_before > 30) {
          return res.status(400).json({ error: 'Dias antes deve ser entre 1 e 30' });
        }
        updateData.notification_days_before = notification_days_before;
      }

      const result = await db.collection('users').updateOne(
        { _id: new ObjectId(user.id) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Buscar dados atualizados
      const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(user.id) });

      res.status(200).json({
        notification_email: updatedUser.notification_email || updatedUser.email,
        notification_days_before: updatedUser.notification_days_before || 1
      });

    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }

  } catch (error) {
    console.error('❌ Erro nas configurações de notificação:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
