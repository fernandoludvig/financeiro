// Configurações de Segurança para o Frontend

// 1. PROTEÇÃO CONTRA XSS (Cross-Site Scripting)
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/&/g, '&amp;')
}

// 2. PROTEÇÃO CONTRA CSRF
export const getCSRFToken = () => {
  const token = document.querySelector('meta[name="csrf-token"]')
  return token ? token.getAttribute('content') : null
}

// 3. VALIDAÇÃO DE SENHAS FORTES
export const validatePassword = (password) => {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[@$!%*?&]/.test(password)
  
  const requirements = {
    length: password.length >= minLength,
    upperCase: hasUpperCase,
    lowerCase: hasLowerCase,
    numbers: hasNumbers,
    specialChar: hasSpecialChar
  }
  
  const isValid = Object.values(requirements).every(req => req)
  
  return {
    isValid,
    requirements,
    score: Object.values(requirements).filter(req => req).length
  }
}

// 4. PROTEÇÃO CONTRA PHISHING (Detecção de URLs suspeitas)
export const validateUrl = (url) => {
  try {
    const urlObj = new URL(url)
    
    // Verificar protocolo seguro
    if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
      return false
    }
    
    // Verificar domínios suspeitos
    const suspiciousDomains = [
      'bit.ly', 'tinyurl.com', 'short.link', 'goo.gl',
      't.co', 'fb.me', 'tiny.cc', 'is.gd', 'ow.ly'
    ]
    
    const isSuspicious = suspiciousDomains.some(domain => 
      urlObj.hostname.includes(domain)
    )
    
    if (isSuspicious) {
      console.warn('URL suspeita detectada:', url)
      return false
    }
    
    return true
  } catch {
    return false
  }
}

// 5. PROTEÇÃO CONTRA MALWARE (Validação de arquivos)
export const validateFile = (file) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
  
  const maxSize = 10 * 1024 * 1024 // 10MB
  
  const validations = {
    type: allowedTypes.includes(file.type),
    size: file.size <= maxSize,
    name: /^[a-zA-Z0-9._-]+$/.test(file.name)
  }
  
  return {
    isValid: Object.values(validations).every(v => v),
    validations,
    errors: Object.entries(validations)
      .filter(([_, valid]) => !valid)
      .map(([key, _]) => key)
  }
}

// 6. PROTEÇÃO CONTRA INJEÇÃO DE DADOS
export const sanitizeFormData = (formData) => {
  const sanitized = {}
  
  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value.trim())
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

// 7. PROTEÇÃO CONTRA CLICKJACKING
export const preventClickjacking = () => {
  // X-Frame-Options deve ser configurado via HTTP header no servidor
  // Apenas detectar se a página está sendo carregada em iframe
  if (window.top !== window.self) {
    console.error('Tentativa de clickjacking detectada!')
    window.top.location = window.self.location
  }
}

// 8. PROTEÇÃO CONTRA SESSION HIJACKING
export const secureSession = {
  // Limpar dados sensíveis ao sair
  clearSensitiveData: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.clear()
  },
  
  // Verificar se o token está próximo do vencimento
  checkTokenExpiry: (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const now = Date.now() / 1000
      const timeUntilExpiry = payload.exp - now
      
      // Se expira em menos de 1 hora, renovar
      return timeUntilExpiry < 3600
    } catch {
      return true // Se não conseguir decodificar, assumir que expirou
    }
  }
}

// 9. PROTEÇÃO CONTRA MAN-IN-THE-MIDDLE
export const validateSSL = () => {
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.error('Conexão insegura detectada!')
    alert('⚠️ Este site requer conexão segura (HTTPS). Por favor, acesse via HTTPS.')
    return false
  }
  return true
}

// 10. SISTEMA DE LOG DE SEGURANÇA NO FRONTEND
export const securityLogger = {
  log: (level, message, data = null) => {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      userAgent: navigator.userAgent,
      url: window.location.href
    }
    
    console.log(`🔒 [${level.toUpperCase()}] ${message}`, logEntry)
    
    // Em produção, enviar para sistema de monitoramento
    if (process.env.NODE_ENV === 'production') {
      // Implementar integração com sistema de logs
    }
  },
  
  logSuspiciousActivity: (message, data) => {
    securityLogger.log('WARN', `Atividade suspeita: ${message}`, data)
  },
  
  logSecurityEvent: (event, data) => {
    securityLogger.log('INFO', `Evento de segurança: ${event}`, data)
  }
}

// 11. PROTEÇÃO CONTRA AUTOMAÇÃO (BOT DETECTION)
export const botDetection = {
  // Verificar se é um navegador real
  isRealBrowser: () => {
    const checks = {
      hasNavigator: typeof navigator !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      hasDocument: typeof document !== 'undefined',
      hasUserAgent: navigator.userAgent && navigator.userAgent.length > 10,
      hasPlugins: navigator.plugins && navigator.plugins.length > 0,
      hasLanguages: navigator.languages && navigator.languages.length > 0
    }
    
    return Object.values(checks).every(check => check)
  },
  
  // Detectar comportamento de bot
  detectBotBehavior: () => {
    // Verificar se há eventos de mouse/touch
    let hasMouseEvents = false
    let hasTouchEvents = false
    
    const mouseListener = () => { hasMouseEvents = true }
    const touchListener = () => { hasTouchEvents = true }
    
    document.addEventListener('mousemove', mouseListener, { once: true })
    document.addEventListener('touchstart', touchListener, { once: true })
    
    // Verificar após 5 segundos
    setTimeout(() => {
      if (!hasMouseEvents && !hasTouchEvents) {
        securityLogger.logSuspiciousActivity('Possível comportamento de bot detectado')
      }
      
      document.removeEventListener('mousemove', mouseListener)
      document.removeEventListener('touchstart', touchListener)
    }, 5000)
  }
}

// 12. INICIALIZAÇÃO DAS PROTEÇÕES
export const initializeSecurity = () => {
  // Aplicar proteções básicas
  preventClickjacking()
  validateSSL()
  botDetection.detectBotBehavior()
  
  // Verificar se é um navegador real
  if (!botDetection.isRealBrowser()) {
    securityLogger.logSuspiciousActivity('Navegador não detectado - possível bot')
    return false
  }
  
  securityLogger.logSecurityEvent('Proteções de segurança inicializadas')
  return true
}

export default {
  sanitizeInput,
  getCSRFToken,
  validatePassword,
  validateUrl,
  validateFile,
  sanitizeFormData,
  preventClickjacking,
  secureSession,
  validateSSL,
  securityLogger,
  botDetection,
  initializeSecurity
}
