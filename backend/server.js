import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import hpp from 'hpp'
import xssClean from 'xss-clean'
import { 
  securityMiddleware,
  bruteForceProtection,
  dosProtection,
  spamProtection,
  sanitizeInput,
  malwareProtection,
  securityLogger,
  socialEngineeringProtection,
  phishingProtection,
  iotProtection,
  ransomwareProtection
} from './security-config.js'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import cron from 'node-cron'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import createCsvWriter from 'csv-writer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import archiver from 'archiver'
import { getAuthUrl, getTokens, searchBoletos } from './utils/gmail.js'
import { body, param, validationResult } from 'express-validator'
import User from './models/User.js'
import Bill from './models/Bill.js'
import Notification from './models/Notification.js'
import Category from './models/Category.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.disable('x-powered-by')

// ==================== MIDDLEWARES DE SEGURANÇA ====================
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}))
app.use(hpp())
app.use(xssClean())

// Aplicar middlewares de segurança personalizados
app.use(securityMiddleware)
app.use(express.json({ limit: '100kb' }))
// CORS: Em produção no Render, permitir qualquer origem do Render
const isProduction = process.env.NODE_ENV === 'production'
const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME
const allowedOrigins = (process.env.CORS_ORIGINS || (isProduction && renderHost ? `https://${renderHost}` : 'http://localhost:3001')).split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Em produção no Render, permitir qualquer requisição do mesmo domínio
    if (isProduction && renderHost && origin && origin.includes(renderHost)) {
      return callback(null, true)
    }
    // Permitir requisições sem origin (ex: Postman, curl)
    if (!origin) return callback(null, true)
    // Verificar se está na lista de origens permitidas
    if (allowedOrigins.includes(origin)) return callback(null, true)
    // Em produção, permitir requisições do mesmo host
    if (isProduction) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../frontend/build')))

// ==================== RATE LIMITING AVANÇADO ====================
// Proteção geral contra DoS
app.use('/api/', dosProtection)

// Proteção contra spam
app.use('/api/', spamProtection)

// Rate limiters específicos
const apiLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 100, // Reduzido de 300 para 100
  standardHeaders: true, 
  legacyHeaders: false,
  message: {
    error: 'Muitas requisições. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60
  }
})

// Proteção contra força bruta em autenticação
app.use('/api/auth/login', bruteForceProtection)
app.use('/api/auth/register', bruteForceProtection)

// Rate limiting para ações sensíveis
app.use('/api/auth', socialEngineeringProtection.sensitiveActionLimit)
app.use('/api/categories', socialEngineeringProtection.categoryActionLimit) // Rate limiting específico para categorias
app.use('/api/user', socialEngineeringProtection.sensitiveActionLimit)

const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'secret'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial-system'

async function initDb() {
  // Criar pastas de upload se não existirem
  const uploadDirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads', 'boletos'),
    path.join(__dirname, 'uploads', 'comprovantes'),
    path.join(__dirname, 'uploads', 'reports')
  ]
  
  for (const dir of uploadDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`📁 Pasta criada: ${dir}`)
    }
  }

  // Conectar ao MongoDB
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log('✅ MongoDB conectado com sucesso!')
  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error.message)
    process.exit(1)
  }
}

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Dados inválidos', details: errors.array().map(e => ({ field: e.param, msg: e.msg })) })
  }
  next()
}

function generateToken(user) {
  return jwt.sign({ 
    id: user._id || user.id, 
    email: user.email, 
    name: user.name 
  }, JWT_SECRET, { expiresIn: '7d' })
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  
  if (!token) {
    securityLogger.logSuspiciousActivity(req, 'Tentativa de acesso sem token')
    return res.status(401).json({ error: 'Token ausente' })
  }

  // Verificar origem da requisição
  if (!socialEngineeringProtection.validateRequestOrigin(req)) {
    securityLogger.logBlockedAttack(req, 'Requisição de origem não autorizada')
    return res.status(403).json({ error: 'Origem não autorizada' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      securityLogger.logSuspiciousActivity(req, 'Token JWT inválido')
      return res.status(403).json({ error: 'Token inválido' })
    }
    
    // Verificar se o token não está expirado
    if (user.exp && Date.now() >= user.exp * 1000) {
      securityLogger.logSuspiciousActivity(req, 'Tentativa de uso de token expirado')
      return res.status(403).json({ error: 'Token expirado' })
    }
    
    req.user = user
    next()
  })
}

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = file.fieldname === 'boleto' ? 'boletos' : 'comprovantes'
    const uploadPath = path.join(__dirname, 'uploads', uploadType)
    fs.mkdirSync(uploadPath, { recursive: true })
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  }
})

const fileFilter = (req, file, cb) => {
  // Verificar tipos MIME permitidos
  if (!malwareProtection.allowedMimeTypes.includes(file.mimetype)) {
    securityLogger.logBlockedAttack(req, `Upload de arquivo com tipo MIME suspeito: ${file.mimetype}`)
    return cb(new Error('Tipo de arquivo não permitido. Permitidos: imagens, PDF, DOC, DOCX, TXT'))
  }

  // Verificar extensão do arquivo
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  
  if (!extname) {
    securityLogger.logBlockedAttack(req, `Upload de arquivo com extensão suspeita: ${file.originalname}`)
    return cb(new Error('Extensão de arquivo não permitida'))
  }

  // Verificar tamanho do arquivo
  if (file.size > malwareProtection.maxFileSize) {
    securityLogger.logBlockedAttack(req, `Upload de arquivo muito grande: ${file.size} bytes`)
    return cb(new Error('Arquivo muito grande. Máximo 10MB'))
  }

  // Verificar User-Agent suspeito
  if (!iotProtection.validateUserAgent(req.get('User-Agent'))) {
    securityLogger.logSuspiciousActivity(req, 'User-Agent suspeito em upload')
    return cb(new Error('Cliente não autorizado'))
  }

  cb(null, true)
}

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
})

function mailTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
}

app.post(
  '/api/auth/register',
  [
    // Validação de segurança avançada
    body('name').trim().escape().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('email').isEmail().withMessage('Email inválido').normalizeEmail().custom((email) => {
      if (phishingProtection.detectSuspiciousEmail(email)) {
        throw new Error('Email com padrão suspeito detectado')
      }
      return true
    }),
    body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
      .withMessage('Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { name, email, password } = req.body
    
    // Verificar se usuário já existe
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: 'Email já registrado' })
    }
    
    // Criar novo usuário
    const user = new User({
      name,
      email,
      password_hash: password // O middleware do modelo fará o hash
    })
    
    await user.save()
    
    const token = generateToken(user)
    res.json({ token, user: user.toPublicJSON() })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Email já registrado' })
    }
    res.status(500).json({ error: 'Erro no registro' })
  }
}
)

app.post(
  '/api/auth/login',
  [
    body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
    body('password').isLength({ min: 6, max: 128 }).withMessage('Senha inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { email, password } = req.body
    
    // Buscar usuário
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }
    
    // Verificar senha
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }
    
    const token = generateToken(user)
    res.json({ token, user: user.toPublicJSON() })
  } catch (error) {
    res.status(500).json({ error: 'Erro no login' })
  }
  }
)

// Rota para atualizar configurações de notificação
app.patch(
  '/api/user/notification-settings',
  authenticateToken,
  [
    body('notification_email').optional().isEmail().withMessage('Email de notificação inválido').normalizeEmail(),
    body('notification_days_before').optional().isInt({ min: 1, max: 30 }).withMessage('Dias deve ser entre 1 e 30')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { notification_email, notification_days_before } = req.body
    const userId = req.user.id
    
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }
    
    if (notification_email !== undefined) {
      user.notification_email = notification_email || null
    }
    if (notification_days_before !== undefined) {
      user.notification_days_before = notification_days_before
    }
    
    await user.save()
    
    res.json({ message: 'Configurações de notificação atualizadas', user: user.toPublicJSON() })
  } catch (error) {
    console.error('Erro ao atualizar configurações de notificação:', error)
    res.status(500).json({ error: 'Erro ao atualizar configurações de notificação' })
  }
})

// ==================== ROTAS DE CATEGORIAS ====================

// Listar categorias do usuário
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await Category.find({ user_id: req.user.id }).sort({ name: 1 })
    res.json(categories.map(cat => cat.toPublicJSON()))
  } catch (error) {
    console.error('❌ Erro ao listar categorias:', error)
    res.status(500).json({ error: 'Erro ao listar categorias', details: error.message })
  }
})

// Criar nova categoria
app.post(
  '/api/categories',
  authenticateToken,
  [
    body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Nome deve ter entre 2 e 50 caracteres'),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um código hexadecimal válido'),
    body('icon').optional().isLength({ min: 1, max: 10 }).withMessage('Ícone deve ter entre 1 e 10 caracteres')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, color = '#3b82f6', icon = '📁' } = req.body
      
      // Verificar se categoria já existe para o usuário
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') }, 
        user_id: req.user.id 
      })
      
      if (existingCategory) {
        return res.status(409).json({ error: 'Categoria com este nome já existe' })
      }
      
      const category = new Category({
        name,
        color,
        icon,
        user_id: req.user.id
      })
      
      await category.save()
      res.status(201).json(category.toPublicJSON())
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Categoria com este nome já existe' })
      }
      console.error('❌ Erro ao criar categoria:', error)
      res.status(500).json({ error: 'Erro ao criar categoria', details: error.message })
    }
  }
)

// Atualizar categoria
app.patch(
  '/api/categories/:id',
  authenticateToken,
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Nome deve ter entre 2 e 50 caracteres'),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um código hexadecimal válido'),
    body('icon').optional().isLength({ min: 1, max: 10 }).withMessage('Ícone deve ter entre 1 e 10 caracteres')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params
      const { name, color, icon } = req.body
      
      const category = await Category.findOne({ _id: id, user_id: req.user.id })
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada' })
      }
      
      // Se está alterando o nome, verificar se já existe
      if (name && name !== category.name) {
        const existingCategory = await Category.findOne({ 
          name: { $regex: new RegExp(`^${name}$`, 'i') }, 
          user_id: req.user.id,
          _id: { $ne: id }
        })
        
        if (existingCategory) {
          return res.status(409).json({ error: 'Categoria com este nome já existe' })
        }
      }
      
      // Atualizar campos fornecidos
      if (name !== undefined) category.name = name
      if (color !== undefined) category.color = color
      if (icon !== undefined) category.icon = icon
      
      await category.save()
      res.json(category.toPublicJSON())
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Categoria com este nome já existe' })
      }
      console.error('❌ Erro ao atualizar categoria:', error)
      res.status(500).json({ error: 'Erro ao atualizar categoria', details: error.message })
    }
  }
)

// Deletar categoria
app.delete(
  '/api/categories/:id',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id } = req.params
      
      const category = await Category.findOne({ _id: id, user_id: req.user.id })
      if (!category) {
        return res.status(404).json({ error: 'Categoria não encontrada' })
      }
      
      // Verificar se há contas usando esta categoria
      const billsUsingCategory = await Bill.countDocuments({ 
        category: category.name, 
        user_id: req.user.id 
      })
      
      if (billsUsingCategory > 0) {
        return res.status(400).json({ 
          error: `Não é possível deletar. Existem ${billsUsingCategory} conta(s) usando esta categoria.`,
          details: 'Remova ou altere as contas antes de deletar a categoria.'
        })
      }
      
      await Category.findByIdAndDelete(id)
      res.json({ message: 'Categoria deletada com sucesso' })
    } catch (error) {
      console.error('❌ Erro ao deletar categoria:', error)
      res.status(500).json({ error: 'Erro ao deletar categoria', details: error.message })
    }
  }
)

app.get('/api/bills', authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find({ user_id: req.user.id })
      .sort({ due_date: 1 })
      .lean()
    
    // Converter ObjectId para string para compatibilidade com frontend
    const formattedBills = bills.map(bill => ({
      ...bill,
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }))
    
    res.json(formattedBills)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar contas' })
  }
})

app.post(
  '/api/bills',
  authenticateToken,
  [
    body('name').trim().isLength({ min: 1, max: 120 }).withMessage('Nome obrigatório').escape(),
    body('category').optional({ nullable: true }).trim().isLength({ max: 120 }).escape(),
    body('amount').isFloat({ gt: 0 }).withMessage('Valor inválido'),
    body('due_date').isDate().withMessage('Data inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { name, category, amount, due_date } = req.body
    console.log('📝 Dados recebidos para criar conta:', { name, category, amount, due_date })
    
    // Corrigir problema de timezone - criar data local preservando dia/mês/ano
    const dateParts = due_date.split('-')
    const localDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    
    const bill = new Bill({
      user_id: new mongoose.Types.ObjectId(req.user.id),
      name,
      category: category || null,
      amount,
      due_date: localDate
    })
    
    console.log('📝 Criando conta com user_id:', req.user.id, 'tipo:', typeof req.user.id)
    
    await bill.save()
    
    // Formatar resposta para compatibilidade com frontend
    const formattedBill = {
      ...bill.toObject(),
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }
    
    res.status(201).json(formattedBill)
  } catch (error) {
    console.error('❌ Erro ao criar conta:', error)
    res.status(500).json({ error: 'Erro ao criar conta', details: error.message })
  }
}
)

app.patch(
  '/api/bills/:id',
  authenticateToken,
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('name').optional().trim().isLength({ min: 1, max: 120 }).withMessage('Nome inválido').escape(),
    body('category').optional({ nullable: true }).trim().isLength({ max: 120 }).escape(),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Valor inválido'),
    body('due_date').optional().isDate().withMessage('Data inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params
    const { name, category, amount, due_date } = req.body
    
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    if (name !== undefined) bill.name = name
    if (category !== undefined) bill.category = category || null
    if (amount !== undefined) bill.amount = amount
    if (due_date !== undefined) {
      const dateParts = due_date.split('-')
      const localDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
      bill.due_date = localDate
    }
    
    await bill.save()
    
    const formattedBill = {
      ...bill.toObject(),
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }
    
    res.json(formattedBill)
  } catch (error) {
    console.error('Erro ao atualizar conta:', error)
    res.status(500).json({ error: 'Erro ao atualizar conta' })
  }
})

app.patch(
  '/api/bills/:id/status',
  authenticateToken,
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('status').isIn(['pending', 'paid']).withMessage('Status inválido'),
    body('paid_at').optional().isISO8601().withMessage('Data de pagamento inválida')
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    // Pegar diretamente do req.body para evitar problemas com validação
    const status = req.body.status
    const paid_at = req.body.paid_at
    const { id } = req.params
    
    console.log('📥 Recebido no backend:', { status, paid_at, id, paid_at_type: typeof paid_at })
    console.log('📥 req.body completo:', JSON.stringify(req.body, null, 2))
    console.log('📥 req.body.paid_at:', req.body.paid_at, 'tipo:', typeof req.body.paid_at)
    
    const updateData = { status }
    if (status === 'paid') {
      if (paid_at) {
        // Se paid_at é uma string ISO, converter para Date local (evitar problemas de timezone)
        let paidAtDate
        if (typeof paid_at === 'string') {
          // Se é ISO string, converter preservando o dia/mês/ano
          const date = new Date(paid_at)
          paidAtDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
        } else {
          paidAtDate = paid_at
        }
        updateData.paid_at = paidAtDate
        console.log('✅ paid_at fornecido, convertendo para Date:', updateData.paid_at, 'ISO:', paidAtDate.toISOString())
      } else {
        // Se não foi fornecido paid_at, usar data de hoje
        updateData.paid_at = new Date()
        console.log('⚠️ paid_at não fornecido, usando data de hoje:', updateData.paid_at)
      }
    } else if (status === 'pending') {
      updateData.paid_at = null
    }
    
    console.log('📤 updateData antes do findOneAndUpdate:', updateData)
    console.log('📤 updateData.paid_at:', updateData.paid_at, 'tipo:', typeof updateData.paid_at)
    
    // Usar $set explicitamente para garantir que paid_at seja salvo
    const updateQuery = { $set: updateData }
    console.log('📤 updateQuery:', JSON.stringify(updateQuery, null, 2))
    
    const bill = await Bill.findOneAndUpdate(
      { _id: id, user_id: req.user.id },
      updateQuery,
      { new: true, runValidators: true }
    )
    
    console.log('📥 Bill após update:', {
      id: bill?._id,
      status: bill?.status,
      paid_at: bill?.paid_at,
      paid_at_type: typeof bill?.paid_at
    })
    
    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    // Formatar resposta para compatibilidade com frontend
    const billObj = bill.toObject()
    console.log('📥 billObj antes de formatar:', {
      paid_at: billObj.paid_at,
      paid_at_type: typeof billObj.paid_at,
      paid_at_isDate: billObj.paid_at instanceof Date
    })
    
    const formattedBill = {
      ...billObj,
      id: bill._id.toString(),
      user_id: bill.user_id.toString(),
      paid_at: bill.paid_at ? (bill.paid_at instanceof Date ? bill.paid_at.toISOString() : new Date(bill.paid_at).toISOString()) : null
    }
    
    console.log('📤 Enviando conta atualizada:', {
      id: formattedBill.id,
      status: formattedBill.status,
      paid_at: formattedBill.paid_at,
      paid_at_original: bill.paid_at
    })
    
    res.json(formattedBill)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status' })
  }
}
)

app.delete(
  '/api/bills/:id',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params
    
    // Buscar conta para deletar arquivos associados
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    // Deletar arquivos se existirem
    if (bill.boleto_file) {
      const boletoPath = path.join(__dirname, 'uploads', 'boletos', bill.boleto_file)
      if (fs.existsSync(boletoPath)) {
        fs.unlinkSync(boletoPath)
      }
    }
    
    if (bill.comprovante_file) {
      const comprovantePath = path.join(__dirname, 'uploads', 'comprovantes', bill.comprovante_file)
      if (fs.existsSync(comprovantePath)) {
        fs.unlinkSync(comprovantePath)
      }
    }
    
    const result = await Bill.deleteOne({ _id: id, user_id: req.user.id })
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar conta' })
  }
}
)

// Rota para upload de boleto
app.post(
  '/api/bills/:id/boleto',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  upload.single('boleto'),
  async (req, res) => {
  try {
    const { id } = req.params
    
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }
    
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      // Deletar arquivo se conta não existir
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    // Deletar boleto anterior se existir
    if (bill.boleto_file) {
      const oldPath = path.join(__dirname, 'uploads', 'boletos', bill.boleto_file)
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath)
      }
    }
    
    // Atualizar conta com novo arquivo
    bill.boleto_file = req.file.filename
    bill.boleto_filename = req.file.originalname
    await bill.save()
    
    // Formatar resposta
    const formattedBill = {
      ...bill.toObject(),
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }
    
    res.json({ message: 'Boleto enviado com sucesso', bill: formattedBill })
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'Erro ao enviar boleto', details: error.message })
  }
}
)

// Rota para upload de comprovante
app.post(
  '/api/bills/:id/comprovante',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  upload.single('comprovante'),
  async (req, res) => {
  try {
    const { id } = req.params
    
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    }
    
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    // Deletar comprovante anterior se existir
    if (bill.comprovante_file) {
      const oldPath = path.join(__dirname, 'uploads', 'comprovantes', bill.comprovante_file)
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath)
      }
    }
    
    // Atualizar conta com novo arquivo
    bill.comprovante_file = req.file.filename
    bill.comprovante_filename = req.file.originalname
    await bill.save()
    
    // Formatar resposta
    const formattedBill = {
      ...bill.toObject(),
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }
    
    res.json({ message: 'Comprovante enviado com sucesso', bill: formattedBill })
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'Erro ao enviar comprovante', details: error.message })
  }
}
)

// Rota para download de arquivos
app.get(
  '/api/bills/:id/:type',
  authenticateToken,
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id, type } = req.params
    
    if (!['boleto', 'comprovante'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de arquivo inválido' })
    }
    
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    const fileField = type === 'boleto' ? 'boleto_file' : 'comprovante_file'
    const filenameField = type === 'boleto' ? 'boleto_filename' : 'comprovante_filename'
    const filePath = type === 'boleto' ? 'boletos' : 'comprovantes'
    
    if (!bill[fileField]) {
      return res.status(404).json({ error: `${type} não encontrado` })
    }
    
    const fullPath = path.join(__dirname, 'uploads', filePath, bill[fileField])
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' })
    }
    
    const originalFilename = bill[filenameField] || `${type}.pdf`
    
    res.download(fullPath, originalFilename)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao baixar arquivo', details: error.message })
  }
}
)

// Rota para download de arquivos via token simples (para links do PDF)
app.get(
  '/api/bills/:id/:type/download',
  [param('id').isMongoId().withMessage('ID inválido')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { id, type } = req.params
      const { token } = req.query
      
      if (!token) {
        return res.status(401).json({ error: 'Token ausente' })
      }
      
      if (!['boleto', 'comprovante'].includes(type)) {
        return res.status(400).json({ error: 'Tipo de arquivo inválido' })
      }
      
      const bill = await Bill.findOne({ _id: id, user_id: token })
      if (!bill) {
        return res.status(404).json({ error: 'Conta não encontrada' })
      }
      
      const fileField = type === 'boleto' ? 'boleto_file' : 'comprovante_file'
      const filenameField = type === 'boleto' ? 'boleto_filename' : 'comprovante_filename'
      const filePath = type === 'boleto' ? 'boletos' : 'comprovantes'
      
      if (!bill[fileField]) {
        return res.status(404).json({ error: `${type} não encontrado` })
      }
      
      const fullPath = path.join(__dirname, 'uploads', filePath, bill[fileField])
      
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado no servidor' })
      }
      
      const originalFilename = bill[filenameField] || `${type}.pdf`
      
      res.download(fullPath, originalFilename)
    } catch (error) {
      res.status(500).json({ error: 'Erro ao baixar arquivo', details: error.message })
    }
  }
)

// Rota para salvar informações do PIX
app.patch('/api/bills/:id/pix', authenticateToken, [
  param('id').isMongoId().withMessage('ID inválido'),
  body('pix_info').trim().isLength({ max: 500 }).withMessage('Informações do PIX devem ter no máximo 500 caracteres')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params
    const { pix_info } = req.body
    
    const bill = await Bill.findOne({ _id: id, user_id: req.user.id })
    if (!bill) {
      return res.status(404).json({ error: 'Conta não encontrada' })
    }
    
    bill.pix_info = pix_info || null
    await bill.save()
    
    const formattedBill = {
      ...bill.toObject(),
      id: bill._id.toString(),
      user_id: bill.user_id.toString()
    }
    
    res.json(formattedBill)
  } catch (error) {
    console.error('Erro ao salvar PIX:', error)
    res.status(500).json({ error: 'Erro ao salvar informações do PIX' })
  }
})

// Middleware para tratamento de erros do multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo 10MB' })
    }
    return res.status(400).json({ error: 'Erro no upload: ' + error.message })
  }
  
  if (error.message === 'Tipo de arquivo não permitido. Permitidos: imagens, PDF, DOC, DOCX, TXT') {
    return res.status(400).json({ error: error.message })
  }
  
  next(error)
})

async function sendNotification(user, bill, isUrgent = false) {
  try {
    console.log('📧 Iniciando envio de notificação...')
    console.log(`   ${isUrgent ? '🔥 URGENTE - Vence HOJE!' : 'ℹ️ Notificação regular'}`)
    
    const notificationEmail = user.notification_email || user.email
    if (!notificationEmail) {
      console.log('⚠️ Usuário não tem email configurado para notificações')
      return
    }
    
    const billDueDate = new Date(bill.due_date)
    const formattedDate = billDueDate.toLocaleDateString('pt-BR')
    const daysBefore = user.notification_days_before || 3
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('⚠️ EMAIL_USER ou EMAIL_PASS não configurados no .env')
      console.log('⚠️ Apenas salvando notificação no banco de dados')
      
      const notification = new Notification({
        user_id: user._id,
        bill_id: bill._id,
        type: 'email',
        message: `Lembrete: ${bill.name} vence em ${formattedDate}`
      })
      await notification.save()
      console.log(`📝 Notificação salva no banco (email não enviado)`)
      return
    }
    
    const transporter = mailTransport()
    
    const diffDays = Math.ceil((billDueDate - new Date()) / (1000 * 60 * 60 * 24))
    const timeMessage = diffDays === 0 ? 'HOJE' : 
                        diffDays === 1 ? 'AMANHÃ' : 
                        `em ${diffDays} dias`
    
    const urgentPrefix = isUrgent ? '🔥 URGENTE - ' : ''
    const urgentStyle = isUrgent ? 'background-color: #fee2e2; border-left: 4px solid #ef4444;' : 'background-color: #f3f4f6;'
    
    const mail = {
      from: `Sistema Financeiro <${process.env.EMAIL_USER}>`,
      to: notificationEmail,
      subject: `${urgentPrefix}⚠️ Lembrete: ${bill.name} vence ${timeMessage}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${isUrgent ? '#dc2626' : '#1e40af'};">
            ${isUrgent ? '🔥 LEMBRETE URGENTE - Vence Hoje!' : 'Lembrete de Vencimento'}
          </h2>
          <p>Olá <strong>${user.name}</strong>,</p>
          <p>${isUrgent ? 'Esta conta vence HOJE! Não se esqueça de pagar.' : 'Este é um lembrete de que sua conta está próxima do vencimento:'}</p>
          
          <div style="${urgentStyle} padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Conta:</strong> ${bill.name}</p>
            <p style="margin: 5px 0;"><strong>Valor:</strong> R$ ${Number(bill.amount).toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${formattedDate}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${isUrgent ? '#dc2626' : '#f59e0b'};">Vence ${timeMessage}</span></p>
            ${bill.category ? `<p style="margin: 5px 0;"><strong>Categoria:</strong> ${bill.category}</p>` : ''}
          </div>
          
          ${bill.boleto_file ? `
          <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 5px 0; color: #1e40af;"><strong>📎 Boleto Anexado</strong></p>
            <p style="margin: 5px 0; font-size: 12px; color: #1e40af;">O boleto desta conta está anexado a este email.</p>
          </div>
          ` : ''}
          
          ${bill.pix_info ? `
          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #22c55e;">
            <p style="margin: 5px 0; color: #15803d;"><strong>📱 Informações do PIX</strong></p>
            <div style="background-color: white; padding: 10px; border-radius: 4px; border: 1px solid #d1fae5; margin: 10px 0;">
              <pre style="margin: 0; color: #15803d; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; word-wrap: break-word;">${bill.pix_info}</pre>
            </div>
            <p style="margin: 5px 0; font-size: 12px; color: #15803d;">💡 Copie as informações acima e cole no app do seu banco para pagar via PIX</p>
          </div>
          ` : ''}
          
          <p>${isUrgent ? '<strong>Atenção:</strong> Este é um lembrete urgente. A conta vence hoje!' : 'Não se esqueça de realizar o pagamento para evitar juros e multas.'}</p>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            ${isUrgent ? 'Você receberá lembretes a cada 3 horas enquanto a conta estiver pendente no dia do vencimento.' : `Este é um email automático. Você configurou para receber notificações ${daysBefore} dia(s) antes do vencimento.`}
          </p>
        </div>
      `,
      text: `Olá ${user.name},\n\n${isUrgent ? '🔥 URGENTE - ' : ''}Este é um lembrete de que sua conta "${bill.name}" vence ${timeMessage}.\n\nValor: R$ ${Number(bill.amount).toFixed(2)}\nVencimento: ${formattedDate}\n${bill.category ? `Categoria: ${bill.category}\n` : ''}${bill.boleto_file ? '\n📎 Boleto anexado a este email.\n' : ''}${bill.pix_info ? `\n📱 Informações do PIX:\n${bill.pix_info}\n\n💡 Copie as informações acima e cole no app do seu banco para pagar via PIX\n` : ''}\n${isUrgent ? '\nATENÇÃO: Esta conta vence HOJE! Não se esqueça de pagar.\n' : '\nNão se esqueça de realizar o pagamento para evitar juros e multas.'}`
    }
    
    // Anexar boleto se existir
    if (bill.boleto_file) {
      const boletoPath = path.join(__dirname, 'uploads', 'boletos', bill.boleto_file)
      if (fs.existsSync(boletoPath)) {
        mail.attachments = [{
          filename: bill.boleto_filename || 'boleto.pdf',
          path: boletoPath
        }]
        console.log(`📎 Boleto anexado ao email: ${bill.boleto_filename}`)
      } else {
        console.log(`⚠️ Boleto não encontrado no servidor: ${boletoPath}`)
      }
    }
    
    // Log das informações do PIX se existirem
    if (bill.pix_info) {
      console.log(`📱 Informações do PIX incluídas no email (${bill.pix_info.length} caracteres)`)
    }
    
    console.log(`📤 Enviando email para: ${notificationEmail}`)
    console.log(`   De: ${mail.from}`)
    console.log(`   Assunto: ${mail.subject}`)
    
    await transporter.sendMail(mail)
    
    const notification = new Notification({
      user_id: user._id,
      bill_id: bill._id,
      type: 'email',
      message: mail.subject
    })
    await notification.save()
    
    console.log(`✅ Email enviado com sucesso para ${notificationEmail}`)
    console.log(`✅ Notificação salva no banco de dados`)
  } catch (error) {
    console.error('❌ Erro ao enviar notificação:', error.message)
    console.error('   Stack:', error.stack)
    
    if (error.code === 'EAUTH') {
      console.error('   ⚠️  Problema de autenticação com Gmail')
      console.error('   ⚠️  Verifique EMAIL_USER e EMAIL_PASS no arquivo .env')
      console.error('   ⚠️  Use uma senha de aplicativo do Gmail: https://myaccount.google.com/apppasswords')
    } else if (error.code === 'ECONNECTION') {
      console.error('   ⚠️  Problema de conexão com servidor de email')
      console.error('   ⚠️  Verifique sua conexão com a internet')
    }
    
    throw error
  }
}

async function checkUpcomingBills() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    console.log('\n🔍 ===== VERIFICAÇÃO DE NOTIFICAÇÕES =====')
    console.log('📅 Data/hora de hoje:', new Date().toLocaleString('pt-BR'))
    console.log('📅 Data de hoje (sem hora):', today.toISOString().split('T')[0])
    
    const users = await User.find({})
    console.log(`👥 Total de usuários: ${users.length}`)
    
    const userIds = users.map(u => u._id)
    
    const bills = await Bill.find({
      status: 'pending',
      user_id: { $in: userIds }
    }).populate('user_id', 'name email notification_email notification_days_before')
    
    console.log(`📋 Contas pendentes encontradas: ${bills.length}`)
    
    const notificationsSentList = []
    const notificationsAlreadySent = await Notification.find({
      bill_id: { $in: bills.map(b => b._id) }
    }).lean()
    
    const notifiedBillIds = new Set(notificationsAlreadySent.map(n => n.bill_id.toString()))
    
    for (const bill of bills) {
      const user = bill.user_id
      const daysBefore = user.notification_days_before || 3
      
      const billDueDate = new Date(bill.due_date)
      billDueDate.setHours(0, 0, 0, 0)
      
      const notificationDate = new Date(billDueDate)
      notificationDate.setDate(notificationDate.getDate() - daysBefore)
      notificationDate.setHours(0, 0, 0, 0)
      
      const diffDays = Math.ceil((billDueDate - today) / (1000 * 60 * 60 * 24))
      
      console.log(`\n📝 Conta: ${bill.name}`)
      console.log(`   👤 Usuário: ${user.name} (${user.email})`)
      console.log(`   📧 Email notificação: ${user.notification_email || user.email}`)
      console.log(`   📅 Vencimento: ${billDueDate.toISOString().split('T')[0]}`)
      console.log(`   ⏰ Dias antes configurados: ${daysBefore}`)
      console.log(`   📆 Data para notificar: ${notificationDate.toISOString().split('T')[0]}`)
      console.log(`   ⏳ Dias restantes: ${diffDays}`)
      console.log(`   ✅ Notificação já enviada: ${notifiedBillIds.has(bill._id.toString()) ? 'SIM' : 'NÃO'}`)
      
      const shouldNotify = !notifiedBillIds.has(bill._id.toString()) && 
                          (today >= notificationDate && today <= billDueDate)
      
      if (shouldNotify) {
        console.log(`   🚀 ENVIANDO NOTIFICAÇÃO!`)
        try {
          await sendNotification(user, bill)
          notificationsSentList.push({
            user: user.name,
            bill: bill.name,
            email: user.notification_email || user.email
          })
        } catch (error) {
          console.error(`   ❌ Erro ao enviar: ${error.message}`)
        }
      } else {
        if (notifiedBillIds.has(bill._id.toString())) {
          console.log(`   ⏭️  Pulando: notificação já enviada anteriormente`)
        } else if (today < notificationDate) {
          console.log(`   ⏭️  Pulando: ainda não é hora de notificar`)
        } else {
          console.log(`   ⏭️  Pulando: período de notificação já passou`)
        }
      }
    }
    
    console.log(`\n📊 RESUMO:`)
    console.log(`   Total de contas processadas: ${bills.length}`)
    console.log(`   Notificações enviadas: ${notificationsSentList.length}`)
    
    if (notificationsSentList.length > 0) {
      console.log(`\n✅ Notificações enviadas:`)
      notificationsSentList.forEach(n => {
        console.log(`   - ${n.user}: ${n.bill} → ${n.email}`)
      })
    }
    
    console.log('🔍 ===== FIM DA VERIFICAÇÃO =====\n')
    
    return notificationsSentList.length
  } catch (error) {
    console.error('❌ Erro em checkUpcomingBills:', error)
    throw error
  }
}

async function checkBillsDueToday() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today)
    todayEnd.setHours(23, 59, 59, 999)
    
    console.log('\n🔥 ===== VERIFICAÇÃO DE CONTAS QUE VENCEM HOJE =====')
    console.log('📅 Data/hora:', new Date().toLocaleString('pt-BR'))
    
    const billsDueToday = await Bill.find({
      status: 'pending',
      due_date: {
        $gte: today,
        $lte: todayEnd
      }
    }).populate('user_id', 'name email notification_email')
    
    console.log(`📋 Contas que vencem HOJE: ${billsDueToday.length}`)
    
    const urgentNotificationsSent = []
    
    for (const bill of billsDueToday) {
      const user = bill.user_id
      
      console.log(`\n🔥 Conta URGENTE: ${bill.name}`)
      console.log(`   👤 Usuário: ${user.name}`)
      console.log(`   💰 Valor: R$ ${Number(bill.amount).toFixed(2)}`)
      console.log(`   📎 Tem boleto: ${bill.boleto_file ? 'SIM' : 'NÃO'}`)
      
      // Verificar se já enviou lembrete nas últimas 3 horas
      const threeHoursAgo = new Date()
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3)
      
      const recentNotification = await Notification.findOne({
        user_id: user._id,
        bill_id: bill._id,
        sent_at: {
          $gte: threeHoursAgo
        }
      })
      
      if (recentNotification) {
        const timeSince = Math.round((Date.now() - recentNotification.sent_at) / (1000 * 60))
        console.log(`   ⏭️  Lembrete já enviado há ${timeSince} minutos`)
        continue
      }
      
      console.log(`   🚀 ENVIANDO LEMBRETE URGENTE!`)
      try {
        await sendNotification(user, bill, true) // true = isUrgent
        urgentNotificationsSent.push({
          user: user.name,
          bill: bill.name,
          email: user.notification_email || user.email,
          hasBoleto: !!bill.boleto_file,
          hasPix: !!bill.pix_info
        })
      } catch (error) {
        console.error(`   ❌ Erro ao enviar: ${error.message}`)
      }
    }
    
    console.log(`\n📊 RESUMO:`)
    console.log(`   Contas que vencem hoje: ${billsDueToday.length}`)
    console.log(`   Lembretes urgentes enviados: ${urgentNotificationsSent.length}`)
    
    if (urgentNotificationsSent.length > 0) {
      console.log(`\n✅ Lembretes urgentes enviados:`)
      urgentNotificationsSent.forEach(n => {
        console.log(`   - ${n.user}: ${n.bill} → ${n.email} ${n.hasBoleto ? '📎 (com boleto)' : ''}`)
      })
    }
    
    console.log('🔥 ===== FIM DA VERIFICAÇÃO =====\n')
    
    return urgentNotificationsSent.length
  } catch (error) {
    console.error('❌ Erro em checkBillsDueToday:', error)
    throw error
  }
}

// Cron para notificações regulares (contas que vencem amanhã - apenas 1x por dia às 18:00)
cron.schedule('0 18 * * *', async () => {
  try {
    const count = await checkUpcomingBills()
    console.log(`🔔 Notificações regulares processadas: ${count}`)
  } catch (e) {
    console.error('Erro no cron de notificações regulares:', e.message)
  }
})

// Cron para lembretes urgentes de contas que vencem hoje (06:00, 12:00, 15:00, 18:00)
cron.schedule('0 6,12,15,18 * * *', async () => {
  try {
    const count = await checkBillsDueToday()
    console.log(`🔥 Lembretes urgentes enviados: ${count}`)
  } catch (e) {
    console.error('Erro no cron de lembretes urgentes:', e.message)
  }
})

// Cron job para backup automático (proteção contra ransomware)
cron.schedule('0 2 * * *', async () => { // Todo dia às 2h
  console.log('💾 Executando backup automático...')
  try {
    const bills = await Bill.find({}).lean()
    const users = await User.find({}).lean()
    const categories = await Category.find({}).lean()
    
    const backupData = {
      bills,
      users: users.map(user => ({
        ...user,
        password_hash: '[REDACTED]' // Não incluir senhas no backup
      })),
      categories,
      timestamp: new Date().toISOString()
    }
    
    await ransomwareProtection.createBackup(backupData)
    console.log('✅ Backup automático concluído')
  } catch (error) {
    console.error('❌ Erro no backup automático:', error)
    securityLogger.log('ERROR', `Falha no backup automático: ${error.message}`)
  }
})

app.post('/api/notifications/test', authenticateToken, async (req, res) => {
  try {
    console.log('🧪 Teste de notificações iniciado...')
    const count = await checkUpcomingBills()
    console.log(`✅ Teste concluído: ${count} notificações processadas`)
    res.json({ processed: count })
  } catch (error) {
    console.error('❌ Erro no teste de notificações:', error)
    res.status(500).json({ error: 'Erro ao executar notificações', details: error.message })
  }
})

async function generatePDFReport(bills, year, month, req) {
  // Buscar categorias para obter cores
  const categories = await Category.find({ user_id: req.user.id }).lean()
  const categoryColors = {}
  categories.forEach(cat => {
    categoryColors[cat.name] = cat.color || '#3b82f6'
  })
  // Calcular altura necessária baseada no número de contas
  const headerHeight = 120 // Cabeçalho + resumo com melhor espaçamento
  const tableHeaderHeight = 45 // Cabeçalho da tabela
  const rowHeight = 18 // Altura por linha de conta
  const footerHeight = 50 // Rodapé com espaçamento
  const totalContentHeight = headerHeight + tableHeaderHeight + (bills.length * rowHeight) + footerHeight
  
  // Usar tamanho A4 landscape ou altura customizada para evitar múltiplas páginas
  // Largura aumentada para acomodar mais colunas
  const doc = new PDFDocument({ 
    margin: 30,
    size: [900, Math.max(595, totalContentHeight + 50)], // Largura aumentada para 900 (era 842)
    info: {
      Title: `Relatório Mensal - ${year}/${month}`,
      Author: 'Sistema Financeiro',
      Subject: 'Relatório de Contas'
    }
  })
  
  const reportsDir = path.join(__dirname, 'uploads', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const filePath = path.join(reportsDir, `relatorio-${year}-${String(month).padStart(2, '0')}.pdf`)
  const stream = fs.createWriteStream(filePath)
  doc.pipe(stream)
  
  // Cabeçalho com melhor espaçamento
  doc.fontSize(20)
    .fillColor('#1e40af')
    .text('Relatório Mensal de Contas', { align: 'center' })
  
  doc.moveDown(0.8)
  doc.fontSize(12)
    .fillColor('#374151')
    .text(`Período: ${String(month).padStart(2, '0')}/${year}`, { align: 'center' })
  
  doc.moveDown(1.2)
  
  // Resumo com melhor espaçamento
  const total = bills.reduce((acc, b) => acc + Number(b.amount), 0)
  const paid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount), 0)
  const pending = total - paid
  
  doc.fontSize(11)
    .fillColor('#1f2937')
    .text('RESUMO FINANCEIRO', { underline: true })
  
  doc.moveDown(0.6)
  
  const resumoY = doc.y
  doc.fontSize(10)
    .fillColor('#374151')
    .text(`Total de Contas: R$ ${total.toFixed(2)}`, 30, resumoY)
    .text(`Contas Pagas: R$ ${paid.toFixed(2)}`, 250, resumoY)
    .text(`Contas Pendentes: R$ ${pending.toFixed(2)}`, 470, resumoY)
  
  if (bills.length > 0) {
    // Legenda de cores das categorias - lado esquerdo
    doc.moveDown(1.5)
    doc.fontSize(10)
      .fillColor('#1f2937')
      .text('LEGENDA DE CATEGORIAS:', 30, doc.y, { underline: true })
    
    doc.moveDown(0.5)
    const legendY = doc.y
    const uniqueCategories = [...new Set(bills.map(b => b.category).filter(Boolean))]
    
    let legendX = 30
    let legendRow = 0
    uniqueCategories.forEach((catName, idx) => {
      if (idx > 0 && idx % 4 === 0) {
        legendRow++
        legendX = 30
      }
      const color = categoryColors[catName] || '#9ca3af'
      const yPos = legendY + (legendRow * 18)
      
      // Quadrado colorido
      doc.rect(legendX, yPos, 10, 10)
        .fill(color)
      
      // Nome da categoria
      doc.fontSize(8)
        .fillColor('#374151')
        .text(catName || 'Sem categoria', legendX + 15, yPos + 1)
      
      legendX += 120
    })
    
    doc.moveDown(2)
    doc.fontSize(13)
      .fillColor('#1f2937')
      .text('DETALHAMENTO DAS CONTAS', 0, doc.y, { align: 'center', underline: true })
    
    doc.moveDown(0.8)
    
    // Cabeçalho da tabela com melhor espaçamento - colunas ajustadas para evitar sobreposição
    const tableTop = doc.y
    const col1 = 30     // Data
    const col2 = 100    // Descrição (aumentada)
    const col3 = 280    // Categoria (movida para dar mais espaço à descrição)
    const col4 = 360    // Status
    const col5 = 410    // Valor
    const col6 = 470    // Boleto
    const col7 = 510    // Comprovante
    const col8 = 580    // PIX
    
    doc.fontSize(9)
      .fillColor('#6b7280')
      .text('Data', col1, tableTop)
      .text('Descrição', col2, tableTop)
      .text('Categoria', col3, tableTop)
      .text('Status', col4, tableTop)
      .text('Valor', col5, tableTop)
      .text('Boleto', col6, tableTop)
      .text('Comprovante', col7, tableTop)
      .text('PIX', col8, tableTop)
    
    // Linha separadora - ajustada para a nova largura
    doc.moveTo(col1, tableTop + 12)
      .lineTo(col8 + 60, tableTop + 12)
      .stroke('#e5e7eb')
    
    let currentY = tableTop + 20
    
    bills.forEach((bill, index) => {
      const dueDate = new Date(bill.due_date).toLocaleDateString('pt-BR')
      const status = bill.status === 'paid' ? 'Pago' : 'Pendente'
      const statusColor = bill.status === 'paid' ? '#10b981' : '#f59e0b'
      
      // Cor de fundo da linha baseada na categoria
      const categoryColor = categoryColors[bill.category] || '#f3f4f6'
      const rowHeight = 18
      const rowWidth = col8 + 60 - col1
      
      // Desenhar retângulo colorido de fundo
      doc.rect(col1, currentY - 2, rowWidth, rowHeight)
        .fillOpacity(0.2)
        .fill(categoryColor)
        .fillOpacity(1)
      
      doc.fontSize(9)
        .fillColor('#374151')
        .text(dueDate, col1, currentY)
        .text(bill.name, col2, currentY, { width: col3 - col2 - 5 }) // Nome completo com largura limitada para evitar sobreposição
        .text(bill.category || 'Sem categoria', col3, currentY, { width: col4 - col3 - 5 })
        .fillColor(statusColor)
        .text(status, col4, currentY)
        .fillColor('#374151')
        .text(`R$ ${Number(bill.amount).toFixed(2)}`, col5, currentY)
      
      // Boleto - clicável se existir
      if (bill.boleto_file) {
        doc.fillColor('#1e40af')
          .text('Sim', col6, currentY, { 
            link: `${req.protocol}://${req.get('host')}/api/bills/${bill._id}/boleto/download?token=${req.user.id}`,
            underline: true 
          })
      } else {
        doc.fillColor('#ef4444')
          .text('Não', col6, currentY)
      }
      
      // Comprovante - clicável se existir
      if (bill.comprovante_file) {
        doc.fillColor('#1e40af')
          .text('Sim', col7, currentY, { 
            link: `${req.protocol}://${req.get('host')}/api/bills/${bill._id}/comprovante/download?token=${req.user.id}`,
            underline: true 
          })
      } else {
        doc.fillColor('#ef4444')
          .text('Não', col7, currentY)
      }
      
      // PIX - mostrar informações se existir
      if (bill.pix_info) {
        doc.fillColor('#10b981')
          .text('Sim', col8, currentY)
      } else {
        doc.fillColor('#ef4444')
          .text('Não', col8, currentY)
      }
      
      currentY += 18
    })
  }
  
  // Rodapé com melhor espaçamento
  doc.moveDown(2)
  const footerY = doc.y
  doc.fontSize(8)
    .fillColor('#9ca3af')
    .text(`Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`, 30, footerY)
    .text('Sistema Financeiro - Relatórios Automáticos', { align: 'center' }, footerY)
  
  doc.end()
  return new Promise((resolve) => {
    stream.on('finish', () => resolve(filePath))
  })
}

async function generateExcelReport(bills, year, month) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Relatório Mensal')
  
  // Configurações da planilha
  worksheet.properties.defaultRowHeight = 20
  
  // Cabeçalho
  worksheet.mergeCells('A1:F1')
  worksheet.getCell('A1').value = 'Relatório Mensal de Contas'
  worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1e40af' } }
  worksheet.getCell('A1').alignment = { horizontal: 'center' }
  
  worksheet.mergeCells('A2:F2')
  worksheet.getCell('A2').value = `Período: ${String(month).padStart(2, '0')}/${year}`
  worksheet.getCell('A2').font = { size: 12, color: { argb: 'FF374151' } }
  worksheet.getCell('A2').alignment = { horizontal: 'center' }
  
  // Resumo
  const total = bills.reduce((acc, b) => acc + Number(b.amount), 0)
  const paid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount), 0)
  const pending = total - paid
  
  worksheet.getCell('A4').value = 'RESUMO FINANCEIRO'
  worksheet.getCell('A4').font = { size: 14, bold: true, color: { argb: 'FF1f2937' } }
  
  worksheet.getCell('A5').value = `Total de Contas: R$ ${total.toFixed(2)}`
  worksheet.getCell('A6').value = `Contas Pagas: R$ ${paid.toFixed(2)}`
  worksheet.getCell('A7').value = `Contas Pendentes: R$ ${pending.toFixed(2)}`
  
  // Cabeçalho da tabela
  const headerRow = 9
  worksheet.getCell(`A${headerRow}`).value = 'Data'
  worksheet.getCell(`B${headerRow}`).value = 'Descrição'
  worksheet.getCell(`C${headerRow}`).value = 'Categoria'
  worksheet.getCell(`D${headerRow}`).value = 'Status'
  worksheet.getCell(`E${headerRow}`).value = 'Valor'
  worksheet.getCell(`F${headerRow}`).value = 'Boleto'
  worksheet.getCell(`G${headerRow}`).value = 'Comprovante'
  worksheet.getCell(`H${headerRow}`).value = 'PIX'
  
  // Formatação do cabeçalho
  for (let col = 1; col <= 8; col++) {
    const cell = worksheet.getCell(headerRow, col)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e40af' } }
    cell.alignment = { horizontal: 'center' }
  }
  
  // Dados
  bills.forEach((bill, index) => {
    const row = headerRow + 1 + index
    const dueDate = new Date(bill.due_date).toLocaleDateString('pt-BR')
    const status = bill.status === 'paid' ? 'Pago' : 'Pendente'
    const boletoStatus = bill.boleto_file ? 'Sim' : 'Não'
    const comprovanteStatus = bill.comprovante_file ? 'Sim' : 'Não'
    const pixStatus = bill.pix_info ? 'Sim' : 'Não'
    
    worksheet.getCell(`A${row}`).value = dueDate
    worksheet.getCell(`B${row}`).value = bill.name
    worksheet.getCell(`C${row}`).value = bill.category || 'Sem categoria'
    worksheet.getCell(`D${row}`).value = status
    worksheet.getCell(`E${row}`).value = Number(bill.amount)
    worksheet.getCell(`F${row}`).value = boletoStatus
    worksheet.getCell(`G${row}`).value = comprovanteStatus
    worksheet.getCell(`H${row}`).value = pixStatus
    
    // Formatação da linha
    if (index % 2 === 0) {
      for (let col = 1; col <= 8; col++) {
        worksheet.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
      }
    }
    
    // Cor do status
    const statusCell = worksheet.getCell(`D${row}`)
    statusCell.font = { color: { argb: bill.status === 'paid' ? 'FF10b981' : 'FFf59e0b' } }
    
    // Formatação do valor
    worksheet.getCell(`E${row}`).numFmt = 'R$ #,##0.00'
    
    // Formatação dos anexos
    const boletoCell = worksheet.getCell(`F${row}`)
    const comprovanteCell = worksheet.getCell(`G${row}`)
    boletoCell.font = { color: { argb: bill.boleto_file ? 'FF10b981' : 'FFef4444' } }
    comprovanteCell.font = { color: { argb: bill.comprovante_file ? 'FF10b981' : 'FFef4444' } }
  })
  
  // Ajustar largura das colunas
  worksheet.columns = [
    { width: 12 },
    { width: 25 },
    { width: 15 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 12 }
  ]
  
  const reportsDir = path.join(__dirname, 'uploads', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const filePath = path.join(reportsDir, `relatorio-${year}-${String(month).padStart(2, '0')}.xlsx`)
  
  await workbook.xlsx.writeFile(filePath)
  return filePath
}

async function generateCSVReport(bills, year, month) {
  const reportsDir = path.join(__dirname, 'uploads', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const filePath = path.join(reportsDir, `relatorio-${year}-${String(month).padStart(2, '0')}.csv`)
  
  const csvWriter = createCsvWriter.createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'data', title: 'Data de Vencimento' },
      { id: 'descricao', title: 'Descrição' },
      { id: 'categoria', title: 'Categoria' },
      { id: 'status', title: 'Status' },
      { id: 'valor', title: 'Valor (R$)' },
      { id: 'boleto', title: 'Boleto' },
      { id: 'comprovante', title: 'Comprovante' },
      { id: 'pix', title: 'PIX' }
    ],
    encoding: 'utf8'
  })
  
  const csvData = bills.map(bill => ({
    data: new Date(bill.due_date).toLocaleDateString('pt-BR'),
    descricao: bill.name,
    categoria: bill.category || 'Sem categoria',
    status: bill.status === 'paid' ? 'Pago' : 'Pendente',
    valor: Number(bill.amount).toFixed(2),
    boleto: bill.boleto_file ? 'Sim' : 'Não',
    comprovante: bill.comprovante_file ? 'Sim' : 'Não',
    pix: bill.pix_info ? 'Sim' : 'Não'
  }))
  
  await csvWriter.writeRecords(csvData)
  return filePath
}

async function generateZipReport(bills, year, month, reportFilePath) {
  const reportsDir = path.join(__dirname, 'uploads', 'reports')
  const zipPath = path.join(reportsDir, `relatorio-completo-${year}-${String(month).padStart(2, '0')}.zip`)
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', () => {
      console.log(`📦 ZIP criado: ${archive.pointer()} bytes`)
      resolve(zipPath)
    })
    
    archive.on('error', (err) => {
      reject(err)
    })
    
    archive.pipe(output)
    
    // Adicionar o relatório principal
    const reportFileName = path.basename(reportFilePath)
    archive.file(reportFilePath, { name: reportFileName })
    
    // Adicionar anexos se existirem
    let attachmentCount = 0
    bills.forEach((bill, index) => {
      if (bill.boleto_file) {
        const boletoPath = path.join(__dirname, 'uploads', 'boletos', bill.boleto_file)
        if (fs.existsSync(boletoPath)) {
          const safeName = `anexos/boleto-${index + 1}-${bill.name.replace(/[^a-zA-Z0-9]/g, '_')}-${bill.boleto_filename}`
          archive.file(boletoPath, { name: safeName })
          attachmentCount++
        }
      }
      
      if (bill.comprovante_file) {
        const comprovantePath = path.join(__dirname, 'uploads', 'comprovantes', bill.comprovante_file)
        if (fs.existsSync(comprovantePath)) {
          const safeName = `anexos/comprovante-${index + 1}-${bill.name.replace(/[^a-zA-Z0-9]/g, '_')}-${bill.comprovante_filename}`
          archive.file(comprovantePath, { name: safeName })
          attachmentCount++
        }
      }
    })
    
    console.log(`📎 Adicionando ${attachmentCount} anexos ao ZIP`)
    
    archive.finalize()
  })
}

app.get('/api/reports/monthly/:year/:month/:format?', authenticateToken, async (req, res) => {
  try {
    const { year, month, format = 'pdf' } = req.params
    const { category, status, startDate, endDate } = req.query
    
    const y = parseInt(year, 10)
    const m = parseInt(month, 10)
    
    // Construir query de filtros
    const query = {
      user_id: req.user.id
    }
    
    // Filtro de data
    if (startDate && endDate) {
      query.due_date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    } else {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0)
      query.due_date = {
        $gte: start,
        $lte: end
      }
    }
    
    // Filtro de categoria
    if (category && category !== 'todas') {
      query.category = category
    }
    
    // Filtro de status
    if (status && status !== 'todos') {
      query.status = status
    }
    
    const bills = await Bill.find(query).sort({ due_date: 1 }).lean()
    
    let filePath
    let fileName
    let contentType
    
    switch (format.toLowerCase()) {
      case 'zip':
        // Gerar relatório PDF primeiro
        const pdfPath = await generatePDFReport(bills, y, m, req)
        filePath = await generateZipReport(bills, y, m, pdfPath)
        fileName = `relatorio-completo-${y}-${String(m).padStart(2, '0')}.zip`
        contentType = 'application/zip'
        break
      case 'excel':
      case 'xlsx':
        filePath = await generateExcelReport(bills, y, m)
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.xlsx`
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        break
      case 'csv':
        filePath = await generateCSVReport(bills, y, m)
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.csv`
        contentType = 'text/csv'
        break
      case 'pdf':
      default:
        filePath = await generatePDFReport(bills, y, m, req)
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.pdf`
        contentType = 'application/pdf'
        break
    }
    
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.download(filePath, fileName)
  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error)
    res.status(500).json({ error: 'Erro ao gerar relatório', details: error.message })
  }
})

app.get('/api/gmail/auth', (req, res) => {
  try {
    const url = getAuthUrl()
    res.json({ url })
  } catch (e) {
    res.status(500).json({ error: 'Erro ao gerar URL de auth' })
  }
})

app.get('/api/gmail/oauth2/callback', async (req, res) => {
  try {
    const { code } = req.query
    await getTokens(code)
    res.send('Tokens salvos. Você pode fechar esta janela.')
  } catch (e) {
    res.status(500).send('Erro ao salvar tokens')
  }
})

app.get('/api/gmail/boletos', authenticateToken, async (req, res) => {
  try {
    const msgs = await searchBoletos()
    res.json({ messages: msgs })
  } catch (e) {
    res.status(500).json({ error: 'Gmail não configurado' })
  }
})

// Rota catch-all para SPA (deve ser a última rota)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'))
})

// Tratamento global de erros
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message)
  console.error(err.stack)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

await initDb()

app.listen(PORT, () => {
  const banner = `\n\n\x1b[44m\x1b[37m  Financial API  \x1b[0m\nPorta: ${PORT}\n`
  console.log(banner)
  console.log('✅ Servidor iniciado com sucesso!')
  console.log('📁 Pastas de upload criadas automaticamente')
  console.log('🔐 Banco de dados inicializado')
  console.log('🌐 Frontend servido em:', `http://localhost:${PORT}`)
  console.log('📡 API disponível em:', `http://localhost:${PORT}/api`)
})


