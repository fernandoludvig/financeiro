// Vercel API Route para contas específicas
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

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
    const { id } = req.query;

    if (req.method === 'GET') {
      // Buscar conta específica
      const bill = await db.collection('bills').findOne({ _id: new ObjectId(id) });
      
      if (!bill) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      res.status(200).json(bill);
    } else if (req.method === 'PATCH') {
      // Atualizar conta
      const updates = req.body;
      updates.updatedAt = new Date();

      const result = await db.collection('bills').updateOne(
        { _id: new ObjectId(id) },
        { $set: updates }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      const updatedBill = await db.collection('bills').findOne({ _id: new ObjectId(id) });
      res.status(200).json(updatedBill);
    } else if (req.method === 'DELETE') {
      // Deletar conta
      const result = await db.collection('bills').deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      res.status(200).json({ message: 'Conta deletada com sucesso' });
    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
