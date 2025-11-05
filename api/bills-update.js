import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

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

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: `Método não permitido. Esperado: PATCH ou DELETE, Recebido: ${req.method}` });
  }

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    let id = req.query.id;
    
    if (!id && req.url) {
      const url = req.url.split('?')[0];
      const urlParts = url.split('/').filter(Boolean);
      const billsIndex = urlParts.indexOf('bills');
      
      if (billsIndex !== -1 && urlParts.length > billsIndex + 1) {
        id = urlParts[billsIndex + 1];
      }
    }

    if (!id) {
      return res.status(400).json({ error: 'ID não fornecido' });
    }

    let body = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }
    }

    const { client, db } = await connectToDatabase();

    const bill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    if (req.method === 'DELETE') {
      if (bill.boleto_file) {
        const boletoPath = path.join('/tmp', 'uploads', 'boletos', bill.boleto_file);
        if (fs.existsSync(boletoPath)) {
          fs.unlinkSync(boletoPath);
        }
      }

      if (bill.comprovante_file) {
        const comprovantePath = path.join('/tmp', 'uploads', 'comprovantes', bill.comprovante_file);
        if (fs.existsSync(comprovantePath)) {
          fs.unlinkSync(comprovantePath);
        }
      }

      const result = await db.collection('bills').deleteOne({ 
        _id: new ObjectId(id), 
        user_id: new ObjectId(user.id) 
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      return res.status(200).json({ success: true });
    }

    const updateData = {};
    
    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.due_date !== undefined) {
      const dateParts = body.due_date.split('-');
      updateData.due_date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    }
    if (body.pix_info !== undefined) updateData.pix_info = body.pix_info || null;
    
    updateData.updatedAt = new Date();

    await db.collection('bills').updateOne(
      { _id: new ObjectId(id), user_id: new ObjectId(user.id) },
      { $set: updateData }
    );

    const updatedBill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    const formattedBill = {
      ...updatedBill,
      id: updatedBill._id.toString(),
      user_id: updatedBill.user_id.toString(),
      _id: updatedBill._id.toString()
    };

    res.status(200).json(formattedBill);
  } catch (error) {
    console.error('Erro ao atualizar conta:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

