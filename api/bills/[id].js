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

async function handleStatus(req, res, id, user) {
  try {
    let body = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body;
      }
    }
    const { status } = body;

    if (!['pending', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { client, db } = await connectToDatabase();

    const updateData = { status };
    if (status === 'paid') {
      updateData.paid_at = new Date();
    } else if (status === 'pending') {
      updateData.paid_at = null;
    }
    updateData.updatedAt = new Date();

    const result = await db.collection('bills').updateOne(
      { _id: new ObjectId(id), user_id: new ObjectId(user.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

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
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

async function handleFileUpload(req, res, id, user, fileType) {
  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files[fileType]?.[0];

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

    const uploadsDir = path.join('/tmp', 'uploads', fileType === 'boleto' ? 'boletos' : 'comprovantes');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalFilename || '');
    const filename = `${fileType}-${uniqueSuffix}${ext}`;
    const destination = path.join(uploadsDir, filename);

    fs.copyFileSync(file.filepath, destination);
    fs.unlinkSync(file.filepath);

    const fileField = fileType === 'boleto' ? 'boleto_file' : 'comprovante_file';
    const filenameField = fileType === 'boleto' ? 'boleto_filename' : 'comprovante_filename';

    if (bill[fileField]) {
      const oldPath = path.join(uploadsDir, bill[fileField]);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const updateData = {
      [fileField]: filename,
      [filenameField]: file.originalFilename || filename,
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

    res.status(200).json({ message: `${fileType === 'boleto' ? 'Boleto' : 'Comprovante'} enviado com sucesso`, bill: formattedBill });
  } catch (error) {
    console.error(`Erro ao enviar ${fileType}:`, error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

async function handleDownload(req, res, id, user, fileType) {
  try {
    const { client, db } = await connectToDatabase();

    const bill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const fileField = fileType === 'boleto' ? 'boleto_file' : 'comprovante_file';
    const filenameField = fileType === 'boleto' ? 'boleto_filename' : 'comprovante_filename';

    if (!bill[fileField]) {
      return res.status(404).json({ error: `${fileType} não encontrado` });
    }

    const uploadsDir = path.join('/tmp', 'uploads', fileType === 'boleto' ? 'boletos' : 'comprovantes');
    const fullPath = path.join(uploadsDir, bill[fileField]);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    }

    const originalFilename = bill[filenameField] || `${fileType}.pdf`;

    res.setHeader('Content-Disposition', `attachment; filename="${originalFilename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error(`Erro ao baixar ${fileType}:`, error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

async function handleUpdate(req, res, id, user) {
  try {
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

    const updateData = { ...body };
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

async function handleDelete(req, res, id, user) {
  try {
    const { client, db } = await connectToDatabase();

    const bill = await db.collection('bills').findOne({ 
      _id: new ObjectId(id),
      user_id: new ObjectId(user.id)
    });

    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

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

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar conta:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
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

    let id = req.query.id;
    if (!id && req.url) {
      const urlParts = req.url.split('/').filter(Boolean);
      const idIndex = urlParts.indexOf('bills');
      if (idIndex !== -1 && urlParts[idIndex + 1]) {
        id = urlParts[idIndex + 1];
      }
    }

    if (!id) {
      return res.status(400).json({ error: 'ID não fornecido' });
    }

    const url = req.url || '';
    const urlParts = url.split('/').filter(Boolean);
    const billsIndex = urlParts.indexOf('bills');
    let action = null;
    
    if (billsIndex !== -1 && urlParts.length > billsIndex + 1) {
      const potentialId = urlParts[billsIndex + 1];
      if (potentialId === id && urlParts.length > billsIndex + 2) {
        action = urlParts[billsIndex + 2];
      } else if (potentialId === id && urlParts.length === billsIndex + 2) {
        action = null;
      }
    }

    console.log('🔍 [DEBUG] Roteamento:', { url, id, action, method: req.method, urlParts });

    if (!action || action === id) {
      if (req.method === 'PATCH') {
        return await handleUpdate(req, res, id, user);
      } else if (req.method === 'DELETE') {
        return await handleDelete(req, res, id, user);
      } else if (req.method === 'GET') {
        const { client, db } = await connectToDatabase();
        const bill = await db.collection('bills').findOne({ 
          _id: new ObjectId(id),
          user_id: new ObjectId(user.id)
        });
        if (!bill) {
          return res.status(404).json({ error: 'Conta não encontrada' });
        }
        const formattedBill = {
          ...bill,
          id: bill._id.toString(),
          user_id: bill.user_id.toString(),
          _id: bill._id.toString()
        };
        return res.status(200).json(formattedBill);
      }
    } else if (action === 'status') {
      if (req.method === 'PATCH') {
        return await handleStatus(req, res, id, user);
      }
      return res.status(405).json({ error: `Método não permitido. Esperado: PATCH, Recebido: ${req.method}` });
    } else if (action === 'comprovante' || action === 'boleto') {
      if (req.method === 'POST') {
        return await handleFileUpload(req, res, id, user, action);
      } else if (req.method === 'GET') {
        return await handleDownload(req, res, id, user, action);
      }
      return res.status(405).json({ error: `Método não permitido. Esperado: POST ou GET, Recebido: ${req.method}` });
    } else if (action === 'pix') {
      if (req.method === 'PATCH') {
        return await handleUpdate(req, res, id, user);
      }
      return res.status(405).json({ error: `Método não permitido. Esperado: PATCH, Recebido: ${req.method}` });
    }

    return res.status(404).json({ error: `Rota não encontrada. URL: ${url}, Action: ${action}, Method: ${req.method}` });
  } catch (error) {
    console.error('Erro no handler:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
}

