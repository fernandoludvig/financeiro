const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

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

async function sendTestEmail(userEmail, userName) {
  try {
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    const mailOptions = {
      from: EMAIL_USER,
      to: userEmail,
      subject: '🧪 Teste de Notificações - Sistema Financeiro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">🧪 Teste de Notificações</h2>
          <p>Olá <strong>${userName}</strong>,</p>
          <p>Este é um email de teste para verificar se as notificações estão funcionando corretamente.</p>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af;"><strong>✅ Sistema funcionando!</strong></p>
            <p style="margin: 5px 0 0 0; color: #1e40af;">Suas notificações de contas estão ativas.</p>
          </div>
        </div>
      `,
      text: `Olá ${userName},\n\nEste é um email de teste para verificar se as notificações estão funcionando.\n\n✅ Sistema funcionando!\nSuas notificações de contas estão ativas.\n\nSistema Financeiro - Notificações Automáticas`
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Erro ao enviar email de teste:', error);
    return false;
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    const { client, db } = await connectToDatabase();
    const userData = await db.collection('users').findOne({ _id: new ObjectId(user.id) });
    if (!userData) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const emailSent = await sendTestEmail(
      userData.notification_email || userData.email,
      userData.name
    );

    if (emailSent) {
      res.status(200).json({ 
        message: 'Email de teste enviado com sucesso!',
        email: userData.notification_email || userData.email
      });
    } else {
      res.status(500).json({ 
        error: 'Erro ao enviar email de teste',
        details: 'Verifique as configurações de email'
      });
    }
  } catch (error) {
    console.error('Erro no teste de notificações:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
}
