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
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
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
      const bills = await db.collection('bills').find({ user_id: new ObjectId(user.id) }).sort({ due_date: 1 }).toArray();
      const formattedBills = bills.map(bill => ({
        ...bill,
        id: bill._id.toString(),
        user_id: bill.user_id.toString(),
        _id: bill._id.toString()
      }));
      res.status(200).json(formattedBills);

    } else if (req.method === 'POST') {
      const { name, category, amount, due_date } = req.body;
      
      // EXATAMENTE igual ao localhost
      const dateParts = due_date.split('-');
      const localDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      
      const bill = {
        user_id: new ObjectId(user.id),
        name,
        category: category || null,
        amount,
        due_date: localDate,
        status: 'pending',
        paid_at: null,
        boleto_file: null,
        boleto_filename: null,
        comprovante_file: null,
        comprovante_filename: null,
        pix_info: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('bills').insertOne(bill);
      const formattedBill = {
        ...bill,
        id: result.insertedId.toString(),
        _id: result.insertedId.toString(),
        user_id: bill.user_id.toString()
      };
      res.status(201).json(formattedBill);
    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
