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
      const categories = await db.collection('categories').find({ user_id: new ObjectId(user.id) }).toArray();
      const formattedCategories = categories.map(category => ({
        ...category,
        id: category._id.toString(),
        user_id: category.user_id.toString(),
        _id: category._id.toString()
      }));
      res.status(200).json(formattedCategories);

    } else if (req.method === 'POST') {
      const { name, color, icon } = req.body;
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Nome da categoria é obrigatório (mínimo 2 caracteres)' });
      }

      const existingCategory = await db.collection('categories').findOne({
        user_id: new ObjectId(user.id),
        name: name.trim()
      });
      if (existingCategory) {
        return res.status(400).json({ error: 'Categoria já existe' });
      }

      const category = {
        user_id: new ObjectId(user.id),
        name: name.trim(),
        color: color || '#3b82f6',
        icon: icon || '📁',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('categories').insertOne(category);
      const formattedCategory = {
        ...category,
        id: result.insertedId.toString(),
        _id: result.insertedId.toString(),
        user_id: category.user_id.toString()
      };
      res.status(201).json(formattedCategory);
    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }
  } catch (error) {
    console.error('Erro nas categorias:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
