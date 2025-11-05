import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    const { id } = req.query;

    const form = formidable({
      maxFileSize: 10 * 1024 * 1024,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.boleto?.[0];

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalFilename || '').toLowerCase());
    
    if (!extname) {
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Extensão de arquivo não permitida' });
    }

    const { client, db } = await connectToDatabase();

    const bill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    if (!bill) {
      fs.unlinkSync(file.filepath);
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const uploadsDir = path.join('/tmp', 'uploads', 'boletos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalFilename || '');
    const filename = `boleto-${uniqueSuffix}${ext}`;
    const destination = path.join(uploadsDir, filename);

    fs.copyFileSync(file.filepath, destination);
    fs.unlinkSync(file.filepath);

    if (bill.boleto_file) {
      const oldPath = path.join(uploadsDir, bill.boleto_file);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const updateData = {
      boleto_file: filename,
      boleto_filename: file.originalFilename || filename,
      updatedAt: new Date()
    };

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

    res.status(200).json({ message: 'Boleto enviado com sucesso', bill: formattedBill });
  } catch (error) {
    console.error('Erro ao enviar boleto:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

