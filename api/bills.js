// Vercel API Route para contas
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
    const { client, db } = await connectToDatabase();

    if (req.method === 'GET') {
      // Listar contas do usuário autenticado
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
      }

      const bills = await db.collection('bills').find({ user_id: user.id }).toArray();
      
      // Converter ObjectId para string
      const formattedBills = bills.map(bill => ({
        ...bill,
        id: bill._id.toString(),
        user_id: bill.user_id.toString(),
        _id: bill._id.toString()
      }));

      res.status(200).json(formattedBills);
    } else if (req.method === 'POST') {
      // Criar nova conta
      const user = authenticateToken(req);
      if (!user) {
        return res.status(401).json({ error: 'Token de acesso necessário' });
      }

      const bill = req.body;
      bill.user_id = user.id;
      bill.createdAt = new Date();
      bill.updatedAt = new Date();
      
      const result = await db.collection('bills').insertOne(bill);
      
      const newBill = {
        ...bill,
        id: result.insertedId.toString(),
        _id: result.insertedId.toString()
      };

      res.status(201).json(newBill);
    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
