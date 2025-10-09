// Vercel API Route para categoria específica
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

    const { id } = req.query;
    const { client, db } = await connectToDatabase();

    if (req.method === 'PATCH') {
      // Atualizar categoria
      const { name, color, icon } = req.body;

      const updateData = {
        updatedAt: new Date()
      };

      if (name !== undefined) {
        if (!name || name.trim().length < 2) {
          return res.status(400).json({ error: 'Nome da categoria é obrigatório (mínimo 2 caracteres)' });
        }
        updateData.name = name.trim();
      }

      if (color !== undefined) {
        updateData.color = color;
      }

      if (icon !== undefined) {
        updateData.icon = icon;
      }

      const result = await db.collection('categories').updateOne(
        { 
          _id: new ObjectId(id), 
          user_id: new ObjectId(user.id) 
        },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Categoria não encontrada' });
      }

      // Buscar categoria atualizada
      const updatedCategory = await db.collection('categories').findOne({
        _id: new ObjectId(id),
        user_id: new ObjectId(user.id)
      });

      const formattedCategory = {
        ...updatedCategory,
        id: updatedCategory._id.toString(),
        user_id: updatedCategory.user_id.toString(),
        _id: updatedCategory._id.toString()
      };

      res.status(200).json(formattedCategory);

    } else if (req.method === 'DELETE') {
      // Deletar categoria
      const result = await db.collection('categories').deleteOne({
        _id: new ObjectId(id),
        user_id: new ObjectId(user.id)
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Categoria não encontrada' });
      }

      res.status(200).json({ message: 'Categoria deletada com sucesso' });

    } else {
      res.status(405).json({ error: 'Método não permitido' });
    }

  } catch (error) {
    console.error('❌ Erro na categoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}
