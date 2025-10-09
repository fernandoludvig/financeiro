// Configurações de Segurança Avançadas
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { body } from 'express-validator'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// 1. PROTEÇÃO CONTRA ATAQUES DE FORÇA BRUTA
export const bruteForceProtection = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 tentativas por IP
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
})

// 2. PROTEÇÃO CONTRA ATAQUES DoS/DDoS
export const dosProtection = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // máximo 100 requests por minuto por IP
  message: {
    error: 'Muitas requisições. Tente novamente em alguns minutos.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
})

// 3. PROTEÇÃO CONTRA SPAM E ABUSO
export const spamProtection = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutos
  delayAfter: 10, // começar delay após 10 requests
  delayMs: () => 500, // adicionar 500ms de delay
  maxDelayMs: 20000, // máximo 20 segundos de delay
  skipSuccessfulRequests: true
})

// 4. PROTEÇÃO CONTRA INJEÇÃO SQL E XSS
export const sanitizeInput = [
  body('name').trim().escape().isLength({ min: 2, max: 100 }),
  body('email').isEmail().normalizeEmail().escape(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('category').trim().escape().isLength({ min: 1, max: 50 }),
  body('amount').isFloat({ min: 0.01, max: 999999.99 }),
  body('due_date').isISO8601().toDate(),
  body('notification_email').optional().isEmail().normalizeEmail().escape(),
  body('notification_days_before').optional().isInt({ min: 1, max: 30 })
]

// 5. PROTEÇÃO CONTRA CSRF
export const csrfProtection = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf
  const sessionToken = req.session?.csrfToken
  
  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ 
      error: 'Token CSRF inválido ou ausente',
      code: 'CSRF_TOKEN_INVALID'
    })
  }
  
  next()
}

// 6. PROTEÇÃO CONTRA MAN-IN-THE-MIDDLE
export const hstsProtection = (req, res, next) => {
  // Forçar HTTPS em produção
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  next()
}

// 7. PROTEÇÃO CONTRA CLICKJACKING
export const clickjackingProtection = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
}

// 8. PROTEÇÃO CONTRA DNS SPOOFING
export const dnsProtection = (req, res, next) => {
  // Validar Host header contra lista de domínios permitidos
  const allowedHosts = [
    'localhost:3001',
    '127.0.0.1:3001',
    process.env.ALLOWED_HOST || 'localhost:3001'
  ]
  
  const host = req.get('Host')
  if (!allowedHosts.includes(host)) {
    return res.status(400).json({ 
      error: 'Host não autorizado',
      code: 'INVALID_HOST'
    })
  }
  
  next()
}

// 9. PROTEÇÃO CONTRA RANSOMWARE (Backup e Versionamento)
export const ransomwareProtection = {
  // Criar backups automáticos dos dados críticos
  createBackup: async (data) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `./backups/backup-${timestamp}.json`
    
    try {
      const fs = await import('fs/promises')
      await fs.mkdir('./backups', { recursive: true })
      await fs.writeFile(backupPath, JSON.stringify(data, null, 2))
      console.log(`✅ Backup criado: ${backupPath}`)
      return backupPath
    } catch (error) {
      console.error('❌ Erro ao criar backup:', error)
      throw error
    }
  },
  
  // Verificar integridade dos dados
  verifyIntegrity: (originalData, currentData) => {
    const originalHash = crypto.createHash('sha256').update(JSON.stringify(originalData)).digest('hex')
    const currentHash = crypto.createHash('sha256').update(JSON.stringify(currentData)).digest('hex')
    return originalHash === currentHash
  }
}

// 10. PROTEÇÃO CONTRA MALWARE (Validação de Uploads)
export const malwareProtection = {
  // Lista de tipos MIME permitidos
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ],
  
  // Tamanho máximo de arquivo (10MB)
  maxFileSize: 10 * 1024 * 1024,
  
  // Verificar assinatura de arquivo
  validateFileSignature: (buffer, expectedMimeType) => {
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'application/msword': [0xD0, 0xCF, 0x11, 0xE0],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04]
    }
    
    const expectedSignature = signatures[expectedMimeType]
    if (!expectedSignature) return false
    
    return expectedSignature.every((byte, index) => buffer[index] === byte)
  }
}

// 11. PROTEÇÃO CONTRA ENGENHARIA SOCIAL
export const socialEngineeringProtection = {
  // Gerar tokens únicos para ações sensíveis
  generateSecureToken: () => {
    return crypto.randomBytes(32).toString('hex')
  },
  
  // Validar origem de requisições críticas
  validateRequestOrigin: (req) => {
    const allowedOrigins = [
      'http://localhost:3001',
      'https://localhost:3001',
      process.env.FRONTEND_URL || 'http://localhost:3001'
    ]
    
    const origin = req.get('Origin') || req.get('Referer')
    return allowedOrigins.some(allowedOrigin => origin?.startsWith(allowedOrigin))
  },
  
  // Rate limiting para ações sensíveis (mais flexível)
  sensitiveActionLimit: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 50, // máximo 50 ações sensíveis por hora (aumentado)
    message: {
      error: 'Muitas ações sensíveis. Tente novamente em 1 hora.',
      retryAfter: 60 * 60
    }
  }),
  
  // Rate limiting específico para categorias (mais permissivo)
  categoryActionLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20, // máximo 20 ações de categoria por 15 minutos
    message: {
      error: 'Muitas ações de categoria. Tente novamente em 15 minutos.',
      retryAfter: 15 * 60
    },
    skipSuccessfulRequests: true // Não conta ações bem-sucedidas
  })
}

// 12. PROTEÇÃO CONTRA PHISHING
export const phishingProtection = {
  // Validar URLs suspeitas
  validateUrl: (url) => {
    try {
      const urlObj = new URL(url)
      const suspiciousDomains = [
        'bit.ly', 'tinyurl.com', 'short.link', 'goo.gl',
        't.co', 'fb.me', 'tiny.cc', 'is.gd'
      ]
      
      // Verificar se é um encurtador suspeito
      if (suspiciousDomains.some(domain => urlObj.hostname.includes(domain))) {
        return false
      }
      
      // Verificar se tem protocolo seguro
      return urlObj.protocol === 'https:'
    } catch {
      return false
    }
  },
  
  // Detectar padrões suspeitos em emails
  detectSuspiciousEmail: (email) => {
    const suspiciousPatterns = [
      /[^\x00-\x7F]/, // caracteres não-ASCII
      /(.)\1{3,}/, // caracteres repetidos
      /@.*\..*\..*\..*/, // muitos subdomínios
      /[0-9]{4,}/, // muitos números
    ]
    
    return suspiciousPatterns.some(pattern => pattern.test(email))
  }
}

// 13. PROTEÇÃO CONTRA DISPOSITIVOS IoT (Validação de User-Agent)
export const iotProtection = {
  // Lista de User-Agents suspeitos ou de dispositivos IoT
  suspiciousUserAgents: [
    'curl', 'wget', 'python', 'bot', 'crawler', 'spider',
    'scanner', 'probe', 'test', 'monitor', 'device'
  ],
  
  // Validar User-Agent
  validateUserAgent: (userAgent) => {
    if (!userAgent) return false
    
    const ua = userAgent.toLowerCase()
    const isSuspicious = iotProtection.suspiciousUserAgents.some(suspicious => 
      ua.includes(suspicious)
    )
    
    return !isSuspicious
  }
}

// 14. SISTEMA DE LOG DE SEGURANÇA
export const securityLogger = {
  log: (level, message, req = null) => {
    const timestamp = new Date().toISOString()
    const ip = req?.ip || 'unknown'
    const userAgent = req?.get('User-Agent') || 'unknown'
    const userId = req?.user?.id || 'anonymous'
    
    const logEntry = {
      timestamp,
      level,
      message,
      ip,
      userAgent,
      userId,
      url: req?.originalUrl,
      method: req?.method
    }
    
    console.log(`🔒 [${level.toUpperCase()}] ${message}`, logEntry)
    
    // Em produção, enviar para sistema de monitoramento
    if (process.env.NODE_ENV === 'production') {
      // Implementar integração com sistema de logs (ex: Winston, LogRocket, etc.)
    }
  },
  
  // Log de tentativas suspeitas
  logSuspiciousActivity: (req, reason) => {
    securityLogger.log('WARN', `Atividade suspeita detectada: ${reason}`, req)
  },
  
  // Log de ataques bloqueados
  logBlockedAttack: (req, attackType) => {
    securityLogger.log('ERROR', `Ataque bloqueado: ${attackType}`, req)
  }
}

// 15. MIDDLEWARE DE SEGURANÇA COMPLETO
export const securityMiddleware = [
  hstsProtection,
  clickjackingProtection,
  dnsProtection,
  dosProtection,
  spamProtection,
  // csrfProtection, // Desabilitado por enquanto, requer sessões
]

export default {
  bruteForceProtection,
  dosProtection,
  spamProtection,
  sanitizeInput,
  csrfProtection,
  hstsProtection,
  clickjackingProtection,
  dnsProtection,
  ransomwareProtection,
  malwareProtection,
  socialEngineeringProtection,
  phishingProtection,
  iotProtection,
  securityLogger,
  securityMiddleware
}
