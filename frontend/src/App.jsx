import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Form, FormField, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { LogOut, Download, CheckCircle2, XCircle, FileDown, Bell, Settings, Paperclip, FileText, Receipt, Smartphone, Edit3, Trash2, Copy, Calendar, CreditCard, Banknote, AlertCircle, Clock } from 'lucide-react'
import { 
  initializeSecurity, 
  sanitizeInput, 
  validatePassword, 
  validateFile,
  sanitizeFormData,
  securityLogger,
  secureSession 
} from './security.js'

const API_URL = (process.env.REACT_APP_API_URL || '').trim() || `${window.location.origin}/api`

export default function App() {
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [bills, setBills] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', amount: '', due_date: '', start_date: '', end_date: '' })
  const [error, setError] = useState('')
  const [editingBill, setEditingBill] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixBill, setPixBill] = useState(null)
  const [pixInfo, setPixInfo] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [notificationDays, setNotificationDays] = useState(3)
  const [categories, setCategories] = useState([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6')
  const [newCategoryIcon, setNewCategoryIcon] = useState('📁')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [filters, setFilters] = useState({
    category: 'todas',
    status: 'todos',
    period: 'current_month',
    startDate: '',
    endDate: ''
  })
  const [activeFilters, setActiveFilters] = useState({
    pending: { category: 'todas', period: 'all' },
    paid: { category: 'todas', period: 'all' }
  })
  const [currentPagePending, setCurrentPagePending] = useState(1)
  const [currentPagePaid, setCurrentPagePaid] = useState(1)
  const ITEMS_PER_PAGE_PENDING = 5
  const ITEMS_PER_PAGE_PAID = 20

  useEffect(() => {
    // Inicializar proteções de segurança
    const securityInitialized = initializeSecurity()
    if (!securityInitialized) {
      console.error('Falha na inicialização de segurança')
      return
    }
    
    const saved = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    
    if (saved) {
      // Verificar se o token está próximo do vencimento
      if (secureSession.checkTokenExpiry(saved)) {
        securityLogger.logSuspiciousActivity('Token próximo do vencimento detectado')
        secureSession.clearSensitiveData()
        return
      }
      setToken(saved)
    }
    
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser)
        setUser(userData)
        setNotificationEmail(userData.notification_email || '')
        setNotificationDays(userData.notification_days_before || 3)
      } catch (error) {
        securityLogger.logSuspiciousActivity('Dados de usuário corrompidos detectados')
        secureSession.clearSensitiveData()
      }
    }
  }, [])

  useEffect(() => {
    if (token) {
      loadBills()
      loadCategories()
    }
  }, [token])

  // Resetar página ao mudar filtros
  useEffect(() => {
    setCurrentPagePending(1)
  }, [activeFilters.pending])

  useEffect(() => {
    setCurrentPagePaid(1)
  }, [activeFilters.paid])

  const stats = useMemo(() => {
    const total = bills.reduce((acc, b) => acc + Number(b.amount), 0)
    const paid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount), 0)
    const pending = total - paid
    return { total, paid, pending }
  }, [bills])

  // Função auxiliar para filtrar por período
  const filterByPeriod = (bill, period) => {
    if (period === 'all') return true
    
    const now = new Date()
    const billDate = new Date(bill.due_date)
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    
    switch (period) {
      case 'current_month':
        return billDate.getFullYear() === currentYear && billDate.getMonth() === currentMonth
      case 'last_month':
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
        return billDate.getFullYear() === lastMonthYear && billDate.getMonth() === lastMonth
      case 'next_month':
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
        const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear
        return billDate.getFullYear() === nextMonthYear && billDate.getMonth() === nextMonth
      default:
        return true
    }
  }

  const filteredPending = useMemo(() => {
    let filtered = bills.filter(b => b.status === 'pending')
    
    if (activeFilters.pending.category && activeFilters.pending.category !== 'todas') {
      filtered = filtered.filter(b => b.category === activeFilters.pending.category)
    }
    
    if (activeFilters.pending.period && activeFilters.pending.period !== 'all') {
      filtered = filtered.filter(b => filterByPeriod(b, activeFilters.pending.period))
    }
    
    // Ordenar por data de vencimento (mais próxima primeiro)
    filtered.sort((a, b) => {
      const dateA = new Date(a.due_date)
      const dateB = new Date(b.due_date)
      return dateA - dateB
    })
    
    return filtered
  }, [bills, activeFilters.pending])

  const filteredPaid = useMemo(() => {
    let filtered = bills.filter(b => b.status === 'paid')
    
    if (activeFilters.paid.category && activeFilters.paid.category !== 'todas') {
      filtered = filtered.filter(b => b.category === activeFilters.paid.category)
    }
    
    if (activeFilters.paid.period && activeFilters.paid.period !== 'all') {
      filtered = filtered.filter(b => filterByPeriod(b, activeFilters.paid.period))
    }
    
    // Ordenar por data de vencimento (mais recente primeiro)
    filtered.sort((a, b) => {
      const dateA = new Date(a.due_date)
      const dateB = new Date(b.due_date)
      return dateB - dateA
    })
    
    return filtered
  }, [bills, activeFilters.paid])

  const paginatedPending = useMemo(() => {
    const startIndex = (currentPagePending - 1) * ITEMS_PER_PAGE_PENDING
    const endIndex = startIndex + ITEMS_PER_PAGE_PENDING
    return filteredPending.slice(startIndex, endIndex)
  }, [filteredPending, currentPagePending])

  const paginatedPaid = useMemo(() => {
    const startIndex = (currentPagePaid - 1) * ITEMS_PER_PAGE_PAID
    const endIndex = startIndex + ITEMS_PER_PAGE_PAID
    return filteredPaid.slice(startIndex, endIndex)
  }, [filteredPaid, currentPagePaid])

  const totalPagesPending = Math.ceil(filteredPending.length / ITEMS_PER_PAGE_PENDING)
  const totalPagesPaid = Math.ceil(filteredPaid.length / ITEMS_PER_PAGE_PAID)

  // Contas que vencem hoje
  const billsDueToday = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    return bills.filter(b => {
      if (b.status !== 'pending') return false
      
      const dueDate = new Date(b.due_date)
      dueDate.setHours(0, 0, 0, 0)
      
      return dueDate.getTime() === today.getTime()
    })
  }, [bills])

  const billsOverdue = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const overdue = bills.filter(b => {
      if (b.status !== 'pending') return false
      
      const dueDate = new Date(b.due_date)
      dueDate.setHours(0, 0, 0, 0)
      
      return dueDate.getTime() < today.getTime()
    })
    
    // Ordenar por data (mais antiga primeiro)
    overdue.sort((a, b) => {
      const dateA = new Date(a.due_date)
      const dateB = new Date(b.due_date)
      return dateA - dateB
    })
    
    return overdue
  }, [bills])

  const totalDueToday = useMemo(() => {
    return billsDueToday.reduce((sum, b) => sum + Number(b.amount), 0)
  }, [billsDueToday])

  const totalOverdue = useMemo(() => {
    return billsOverdue.reduce((sum, b) => sum + Number(b.amount), 0)
  }, [billsOverdue])

  function formatDate(dateLike) {
    if (!dateLike) return ''
    const d = new Date(dateLike)
    if (Number.isNaN(d.getTime())) return String(dateLike)
    return d.toLocaleDateString('pt-BR')
  }

  // Função para obter cor da categoria
  const getCategoryColor = (categoryName) => {
    if (!categoryName) return '#6b7280' // Cinza padrão
    
    // Buscar categoria personalizada
    const customCategory = categories.find(cat => cat.name === categoryName)
    if (customCategory) {
      return customCategory.color
    }
    
    // Cores padrão para categorias fixas
    const defaultColors = {
      'Moradia': '#ef4444',      // Vermelho
      'Transporte': '#3b82f6',   // Azul
      'Alimentação': '#10b981',  // Verde
      'Saúde': '#f59e0b',        // Amarelo/Laranja
      'Educação': '#8b5cf6',     // Roxo
      'Outros': '#6b7280'        // Cinza
    }
    
    return defaultColors[categoryName] || '#6b7280'
  }

  // Função para obter cor de fundo clara baseada na categoria
  const getCategoryBgColor = (categoryName) => {
    return '#ffffff' // Sempre fundo branco
  }

  // Função para obter cor de texto baseada na categoria
  const getCategoryTextColor = (categoryName) => {
    // Sempre usar texto escuro para melhor legibilidade
    return '#1f2937' // Cinza escuro consistente
  }

  async function handleAuth(e) {
    e.preventDefault()
    setError('')
    
    try {
      // Sanitizar dados do formulário
      const sanitizedForm = sanitizeFormData(authForm)
      
      // Validar senha forte para registro
      if (authMode === 'register' && authForm.password) {
        const passwordValidation = validatePassword(authForm.password)
        if (!passwordValidation.isValid) {
          const missingRequirements = Object.entries(passwordValidation.requirements)
            .filter(([_, valid]) => !valid)
            .map(([req, _]) => {
              switch (req) {
                case 'length': return 'pelo menos 8 caracteres'
                case 'upperCase': return 'uma letra maiúscula'
                case 'lowerCase': return 'uma letra minúscula'
                case 'numbers': return 'um número'
                case 'specialChar': return 'um símbolo (@$!%*?&)'
                default: return req
              }
            })
          
          throw new Error(`Senha deve conter: ${missingRequirements.join(', ')}`)
        }
      }
      
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha na autenticação')
      
      setToken(data.token)
      setUser(data.user)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      securityLogger.logSecurityEvent('Login bem-sucedido', { endpoint })
    } catch (err) {
      setError(err.message)
      securityLogger.logSuspiciousActivity(`Falha na autenticação: ${err.message}`)
    }
  }

  function handleLogout() {
    securityLogger.logSecurityEvent('Logout realizado')
    secureSession.clearSensitiveData()
    setToken(null)
    setUser(null)
  }

  async function loadBills() {
    setError('')
    try {
      const res = await fetch(`${API_URL}/bills`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar')
      setBills(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function addNewBill(e) {
    e.preventDefault()
    setError('')
    try {
      // Verificar se é conta recorrente (tem data inicial e final)
      if (form.start_date && form.end_date) {
        const startDate = new Date(form.start_date)
        const endDate = new Date(form.end_date)
        
        if (startDate > endDate) {
          setError('Data inicial deve ser anterior à data final')
          return
        }
        
        const newBills = []
        let currentDate = new Date(startDate)
        
        // Criar uma conta para cada mês no período
        while (currentDate <= endDate) {
          const payload = {
            name: form.name,
            category: form.category,
            amount: Number(form.amount),
            due_date: currentDate.toISOString().split('T')[0]
          }
          
          const res = await fetch(`${API_URL}/bills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
          })
          
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Erro ao criar')
          newBills.push(data)
          
          // Avançar para o próximo mês
          currentDate.setMonth(currentDate.getMonth() + 1)
        }
        
        setBills(prev => [...prev, ...newBills])
        alert(`✅ ${newBills.length} conta(s) recorrente(s) criada(s) com sucesso!`)
        setShowForm(false)
        setForm({ name: '', category: '', amount: '', due_date: '', start_date: '', end_date: '' })
      } else {
        // Conta única
        const payload = { 
          name: form.name,
          category: form.category,
          amount: Number(form.amount),
          due_date: form.due_date
        }
        
        const res = await fetch(`${API_URL}/bills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao criar')
        setBills(prev => [...prev, data])
        setShowForm(false)
        setForm({ name: '', category: '', amount: '', due_date: '', start_date: '', end_date: '' })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  function cloneBill(bill) {
    // Calcular data de vencimento +1 mês
    const originalDate = new Date(bill.due_date)
    const newDate = new Date(originalDate)
    newDate.setMonth(newDate.getMonth() + 1)
    
    // Formatar data para input type="date" (YYYY-MM-DD)
    const formattedDate = newDate.toISOString().split('T')[0]
    
    // Preencher formulário com dados clonados
    setForm({
      name: bill.name,
      category: bill.category || '',
      amount: '', // Deixar vazio para usuário preencher
      due_date: formattedDate,
      start_date: '',
      end_date: ''
    })
    
    // Abrir formulário
    setShowForm(true)
    
    // Scroll suave para o formulário
    setTimeout(() => {
      const formElement = document.querySelector('#new-bill-form')
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  function openEditModal(bill) {
    setEditingBill({
      id: bill.id,
      name: bill.name,
      category: bill.category || '',
      amount: bill.amount,
      due_date: new Date(bill.due_date).toISOString().split('T')[0]
    })
    setShowEditModal(true)
  }

  async function updateBill(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        name: editingBill.name,
        category: editingBill.category,
        amount: Number(editingBill.amount),
        due_date: editingBill.due_date
      }
      
      const res = await fetch(`${API_URL}/bills/${editingBill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar')
      
      setBills(prev => prev.map(b => b.id === editingBill.id ? data : b))
      setShowEditModal(false)
      setEditingBill(null)
    } catch (err) {
      setError(err.message)
    }
  }

  function openPixModal(bill) {
    setPixBill(bill)
    setPixInfo(bill.pix_info || '')
    setShowPixModal(true)
  }

  async function savePixInfo(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch(`${API_URL}/bills/${pixBill.id}/pix`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pix_info: pixInfo })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar PIX')
      
      setBills(prev => prev.map(b => b.id === pixBill.id ? data : b))
      setShowPixModal(false)
      setPixBill(null)
      setPixInfo('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function markAsPaid(id) {
    setError('')
    try {
      const res = await fetch(`${API_URL}/bills/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'paid' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar')
      setBills(prev => prev.map(b => (b.id === id ? data : b)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteBill(id) {
    setError('')
    try {
      const res = await fetch(`${API_URL}/bills/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Erro ao deletar')
      setBills(prev => prev.filter(b => b.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function testNotifications() {
    setError('')
    try {
      const res = await fetch(`${API_URL}/notifications/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro')
      alert(`Processadas: ${data.processed}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function updateNotificationSettings() {
    setError('')
    try {
      const res = await fetch(`${API_URL}/user/notification-settings`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          notification_email: notificationEmail,
          notification_days_before: notificationDays
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar configurações')
      
      // Atualizar dados do usuário
      const updatedUser = { 
        ...user, 
        notification_email: notificationEmail,
        notification_days_before: notificationDays
      }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
      
      setShowSettings(false)
      alert('Configurações de notificação atualizadas com sucesso!')
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch(`${API_URL}/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Erro ao carregar categorias')
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error('Erro ao carregar categorias:', err)
    }
  }

  async function createCategory() {
    setError('')
    console.log('Criando categoria:', { name: newCategoryName, color: newCategoryColor, icon: newCategoryIcon })
    
    if (!newCategoryName.trim()) {
      setError('Nome da categoria é obrigatório')
      return
    }
    
    try {
      const res = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          color: newCategoryColor,
          icon: newCategoryIcon
        })
      })
      
      console.log('Resposta da API:', res.status)
      const data = await res.json()
      console.log('Dados recebidos:', data)
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar categoria')
      }
      
      await loadCategories()
      setNewCategoryName('')
      setNewCategoryColor('#3b82f6')
      setNewCategoryIcon('📁')
      setShowCategoryModal(false)
      setError('') // Limpar erros anteriores
      console.log('Categoria criada com sucesso!')
    } catch (err) {
      console.error('Erro ao criar categoria:', err)
      setError(err.message)
    }
  }

  async function updateCategory() {
    setError('')
    try {
      const res = await fetch(`${API_URL}/categories/${editingCategory.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          name: newCategoryName,
          color: newCategoryColor,
          icon: newCategoryIcon
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar categoria')
      
      await loadCategories()
      setEditingCategory(null)
      setNewCategoryName('')
      setNewCategoryColor('#3b82f6')
      setNewCategoryIcon('📁')
      setShowCategoryModal(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteCategory(categoryId) {
    setError('')
    if (!confirm('Tem certeza que deseja deletar esta categoria?')) return
    
    try {
      const res = await fetch(`${API_URL}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao deletar categoria')
      
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  function openCategoryModal(category = null) {
    console.log('Abrindo modal de categoria:', category)
    if (category) {
      setEditingCategory(category)
      setNewCategoryName(category.name)
      setNewCategoryColor(category.color)
      setNewCategoryIcon(category.icon)
    } else {
      setEditingCategory(null)
      setNewCategoryName('')
      setNewCategoryColor('#3b82f6')
      setNewCategoryIcon('📁')
    }
    setShowCategoryModal(true)
    console.log('Modal deve estar visível agora')
  }

  async function downloadReport(format = 'pdf') {
    setError('')
    try {
      let y, m, startDate, endDate
      
      // Determinar período baseado no filtro
      if (filters.period === 'current_month') {
        const now = new Date()
        y = now.getFullYear()
        m = now.getMonth() + 1
      } else if (filters.period === 'last_month') {
        const now = new Date()
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        y = lastMonth.getFullYear()
        m = lastMonth.getMonth() + 1
      } else if (filters.period === 'custom') {
        startDate = filters.startDate
        endDate = filters.endDate
        const start = new Date(startDate)
        y = start.getFullYear()
        m = start.getMonth() + 1
      } else {
        const now = new Date()
        y = now.getFullYear()
        m = now.getMonth() + 1
      }
      
      // Construir query params para filtros
      const queryParams = new URLSearchParams()
      if (filters.category && filters.category !== 'todas') {
        queryParams.append('category', filters.category)
      }
      if (filters.status && filters.status !== 'todos') {
        queryParams.append('status', filters.status)
      }
      if (startDate && endDate) {
        queryParams.append('startDate', startDate)
        queryParams.append('endDate', endDate)
      }
      
      const queryString = queryParams.toString()
      const apiUrl = `${API_URL}/reports/monthly/${y}/${m}/${format}${queryString ? '?' + queryString : ''}`
      
      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Erro ao gerar relatório')
      
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      
      // Nome do arquivo baseado no formato
      let fileName = ''
      switch (format) {
        case 'zip':
          fileName = `relatorio-completo-${y}-${String(m).padStart(2, '0')}.zip`
          break
        case 'xlsx':
          fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.xlsx`
          break
        case 'csv':
          fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.csv`
          break
        default:
          fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.pdf`
      }
      
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
      
      // Mostrar mensagem especial para ZIP
      if (format === 'zip') {
        alert('📦 Relatório ZIP baixado! Contém o relatório PDF e todos os anexos (boletos e comprovantes).')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function uploadFile(billId, fileType, file) {
    setError('')
    try {
      const formData = new FormData()
      formData.append(fileType, file)
      
      const res = await fetch(`${API_URL}/bills/${billId}/${fileType}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar arquivo')
      
      // Atualizar a lista de contas
      await loadBills()
      return data
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  async function downloadFile(billId, fileType) {
    setError('')
    try {
      const res = await fetch(`${API_URL}/bills/${billId}/${fileType}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Erro ao baixar arquivo')
      
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileType}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleFileUpload(billId, fileType) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt'
    
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      if (file.size > 10 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo 10MB')
        return
      }
      
      try {
        await uploadFile(billId, fileType, file)
        alert(`${fileType === 'boleto' ? 'Boleto' : 'Comprovante'} enviado com sucesso!`)
      } catch (error) {
        console.error('Erro no upload:', error)
      }
    }
    
    input.click()
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo/Brand Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-4 shadow-lg">
              <Banknote className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Financeiro</h1>
            <p className="text-gray-600">Gerencie suas finanças de forma inteligente</p>
          </div>

          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl text-center font-semibold">Bem-vindo de volta</CardTitle>
              <CardDescription className="text-center">
                {authMode === 'login' ? 'Faça login em sua conta' : 'Crie sua conta gratuitamente'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <Tabs value={authMode} onValueChange={setAuthMode} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg">
                  <TabsTrigger 
                    value="login" 
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
                  >
                    Login
                  </TabsTrigger>
                  <TabsTrigger 
                    value="register"
                    className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
                  >
                    Cadastro
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="login" className="space-y-4 mt-6">
                  <Form onSubmit={handleAuth}>
                    <FormField>
                      <FormLabel htmlFor="login-email">Email</FormLabel>
                      <FormControl>
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={authForm.email}
                          onChange={(e)=>setAuthForm(a=>({...a,email:e.target.value}))}
                          required
                          className="h-11"
                        />
                      </FormControl>
                    </FormField>
                    
                    <FormField>
                      <FormLabel htmlFor="login-password">Senha</FormLabel>
                      <FormControl>
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="Digite sua senha"
                          value={authForm.password}
                          onChange={(e)=>setAuthForm(a=>({...a,password:e.target.value}))}
                          required
                          className="h-11"
                        />
                      </FormControl>
                    </FormField>
                    
                    <Button type="submit" className="w-full h-11 mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200">
                      Entrar
                    </Button>
                  </Form>
                </TabsContent>
                
                <TabsContent value="register" className="space-y-4 mt-6">
                  <Form onSubmit={handleAuth}>
                    <FormField>
                      <FormLabel htmlFor="register-name">Nome completo</FormLabel>
                      <FormControl>
                        <Input
                          id="register-name"
                          placeholder="Seu nome completo"
                          value={authForm.name}
                          onChange={(e)=>setAuthForm(a=>({...a,name:e.target.value}))}
                          required
                          className="h-11"
                        />
                      </FormControl>
                    </FormField>
                    
                    <FormField>
                      <FormLabel htmlFor="register-email">Email</FormLabel>
                      <FormControl>
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={authForm.email}
                          onChange={(e)=>setAuthForm(a=>({...a,email:e.target.value}))}
                          required
                          className="h-11"
                        />
                      </FormControl>
                    </FormField>
                    
                    <FormField>
                      <FormLabel htmlFor="register-password">Senha</FormLabel>
                      <FormControl>
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="Mínimo 8 caracteres"
                          value={authForm.password}
                          onChange={(e)=>setAuthForm(a=>({...a,password:e.target.value}))}
                          required
                          className="h-11"
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-gray-500 mt-1">
                        Use pelo menos 8 caracteres com maiúscula, minúscula, número e símbolo
                      </FormMessage>
                    </FormField>
                    
                    <Button type="submit" className="w-full h-11 mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200">
                      Criar conta
                    </Button>
                  </Form>
                </TabsContent>
              </Tabs>
              
              <div className="relative">
                <Separator />
                <div className="absolute inset-0 flex justify-center">
                  <span className="bg-white px-2 text-xs text-gray-500">ou</span>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-xs text-gray-500">
                  {authMode === 'login' ? (
                    <>
                      Não tem uma conta?{' '}
                      <button 
                        type="button"
                        onClick={() => setAuthMode('register')}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Cadastre-se gratuitamente
                      </button>
                    </>
                  ) : (
                    <>
                      Já tem uma conta?{' '}
                      <button 
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Faça login
                      </button>
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-xs text-gray-400">
              Sistema seguro e confiável • Seus dados estão protegidos
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo, {user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={testNotifications} className="relative z-10"><Bell className="h-4 w-4 mr-2"/> Testar Notificações</Button>
          <Button variant="outline" onClick={() => setShowSettings(true)}><Settings className="h-4 w-4 mr-2"/> Configurações</Button>
          <Button onClick={() => setShowFilterModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <FileDown className="h-4 w-4 mr-2"/> Relatórios
          </Button>
          <Button variant="destructive" onClick={handleLogout}><LogOut className="h-4 w-4 mr-2"/> Logout</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-10 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-red-200 bg-gradient-to-br from-red-50 to-orange-50">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Vence Hoje
              </CardTitle>
              <Badge variant="destructive" className="text-xs">{billsDueToday.length}</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-700">R$ {totalDueToday.toFixed(2)}</p>
              <p className="text-xs text-red-600 mt-1">{billsDueToday.length} conta(s)</p>
            </CardContent>
          </Card>
          
          {billsOverdue.length > 0 && (
            <Card className="border-red-400 bg-gradient-to-br from-red-100 to-red-50">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-600" />
                  Vencidas
                </CardTitle>
                <Badge className="text-xs bg-red-700">{billsOverdue.length}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-800">R$ {totalOverdue.toFixed(2)}</p>
                <p className="text-xs text-red-700 mt-1">{billsOverdue.length} conta(s) atrasada(s)</p>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <XCircle className="h-5 w-5 text-warning"/>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ {stats.pending.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pagas</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-success"/>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ {stats.paid.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Download className="h-5 w-5"/>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ {stats.total.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Contas</h2>
          <Button onClick={() => setShowForm(s=>!s)}>Adicionar Nova Conta</Button>
        </div>

        {showForm && (
          <Card id="new-bill-form">
            <CardHeader>
              <CardTitle>Nova Conta</CardTitle>
              <CardDescription>Preencha os dados abaixo</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addNewBill} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))} required />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={form.category} onChange={(e)=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">Selecione uma categoria</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name} style={{ color: cat.color }}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                    <option value="Moradia">🏠 Moradia</option>
                    <option value="Transporte">🚗 Transporte</option>
                    <option value="Alimentação">🍽️ Alimentação</option>
                    <option value="Saúde">🏥 Saúde</option>
                    <option value="Educação">📚 Educação</option>
                    <option value="Outros">📁 Outros</option>
                  </Select>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      console.log('Botão clicado - abrindo modal')
                      openCategoryModal()
                    }}
                    className="w-full"
                  >
                    + Adicionar Nova Categoria
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e)=>setForm(f=>({...f,amount:e.target.value}))} required />
                </div>
                <div className="space-y-2">
                  <Label>Vencimento Único</Label>
                  <Input 
                    type="date" 
                    value={form.due_date} 
                    onChange={(e)=>setForm(f=>({...f,due_date:e.target.value}))} 
                    required={!form.start_date && !form.end_date}
                    disabled={form.start_date || form.end_date}
                  />
                  <p className="text-xs text-gray-500">Ou use datas inicial/final para contas recorrentes</p>
                </div>
                
                <Separator className="sm:col-span-2 lg:col-span-4" />
                
                <div className="sm:col-span-2 lg:col-span-4">
                  <h3 className="font-semibold text-sm mb-2">📅 Contas Recorrentes (Opcional)</h3>
                  <p className="text-xs text-gray-500 mb-3">Crie múltiplas contas com mesmo nome, categoria e valor para um período</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Data Inicial</Label>
                  <Input 
                    type="date" 
                    value={form.start_date} 
                    onChange={(e)=>setForm(f=>({...f,start_date:e.target.value, due_date: ''}))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Final</Label>
                  <Input 
                    type="date" 
                    value={form.end_date} 
                    onChange={(e)=>setForm(f=>({...f,end_date:e.target.value, due_date: ''}))}
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  {form.start_date && form.end_date && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                      <p className="font-semibold text-blue-800">
                        {(() => {
                          const start = new Date(form.start_date)
                          const end = new Date(form.end_date)
                          const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
                          return `✅ ${months} conta(s) serão criadas`
                        })()}
                      </p>
                      <p className="text-blue-600 mt-1">Uma conta para cada mês do período selecionado</p>
                    </div>
                  )}
                </div>
                
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button type="submit">
                    {form.start_date && form.end_date ? 'Criar Contas Recorrentes' : 'Salvar Conta'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Seção de Contas que Vencem Hoje */}
        {billsDueToday.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-700">🔥 Contas que Vencem Hoje</h2>
              <Badge variant="destructive" className="text-sm">
                {billsDueToday.length} conta(s) - R$ {totalDueToday.toFixed(2)}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {billsDueToday.map(b => {
                const categoryColor = getCategoryColor(b.category)
                const bgColor = getCategoryBgColor(b.category)
                const textColor = getCategoryTextColor(b.category)
                
                return (
                  <Card 
                    key={b.id} 
                    className="border-2 border-red-400 shadow-lg bg-gradient-to-br from-red-50 to-orange-50"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base" style={{ color: textColor }}>
                          {b.name}
                        </CardTitle>
                        <Badge 
                          variant="destructive" 
                          className="text-xs"
                          style={{ 
                            backgroundColor: categoryColor,
                            color: textColor,
                            borderColor: categoryColor
                          }}
                        >
                          R$ {Number(b.amount).toFixed(2)}
                        </Badge>
                      </div>
                      <CardDescription style={{ color: textColor }}>
                        {b.category || 'Sem categoria'} • Vence HOJE
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex-col space-y-2">
                      <div className="flex flex-wrap gap-2 w-full">
                        {b.boleto_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'boleto')} className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'boleto')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        )}
                        
                        {b.comprovante_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'comprovante')} className="text-xs">
                            <Receipt className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'comprovante')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => openPixModal(b)} 
                          className={`text-xs ${b.pix_info ? 'bg-green-50 text-green-700 border-green-200' : ''}`}
                        >
                          <Smartphone className="h-3 w-3 mr-1" />
                          {b.pix_info ? 'PIX ✓' : 'PIX'}
                        </Button>
                      </div>
                      
                      <div className="flex gap-2 w-full">
                        <Button size="sm" onClick={()=>markAsPaid(b.id)} className="flex-1 bg-green-600 hover:bg-green-700">
                          Marcar como pago
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>openEditModal(b)} className="flex-1">
                          <Edit3 className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>cloneBill(b)} className="flex-1">
                          <Copy className="w-4 h-4 mr-1" />
                          Clonar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={()=>deleteBill(b.id)}>
                          Excluir
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* Seção de Contas Vencidas */}
        {billsOverdue.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-800">⚠️ Contas Vencidas</h2>
              <Badge className="text-sm bg-red-700">
                {billsOverdue.length} conta(s) - R$ {totalOverdue.toFixed(2)}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {billsOverdue.map(b => {
                const categoryColor = getCategoryColor(b.category)
                const bgColor = getCategoryBgColor(b.category)
                const textColor = getCategoryTextColor(b.category)
                const dueDate = new Date(b.due_date)
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const daysOverdue = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24))
                
                return (
                  <Card 
                    key={b.id} 
                    className="border-2 border-red-600 shadow-lg bg-gradient-to-br from-red-100 to-red-50"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base" style={{ color: textColor }}>
                          {b.name}
                        </CardTitle>
                        <Badge 
                          className="text-xs bg-red-700"
                          style={{ 
                            backgroundColor: categoryColor,
                            color: textColor,
                            borderColor: categoryColor
                          }}
                        >
                          R$ {Number(b.amount).toFixed(2)}
                        </Badge>
                      </div>
                      <CardDescription style={{ color: textColor }}>
                        {b.category || 'Sem categoria'} • Venceu há {daysOverdue} dia(s)
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex-col space-y-2">
                      <div className="flex flex-wrap gap-2 w-full">
                        {b.boleto_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'boleto')} className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'boleto')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        )}
                        
                        {b.comprovante_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'comprovante')} className="text-xs">
                            <Receipt className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'comprovante')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => openPixModal(b)} 
                          className={`text-xs ${b.pix_info ? 'bg-green-50 text-green-700 border-green-200' : ''}`}
                        >
                          <Smartphone className="h-3 w-3 mr-1" />
                          {b.pix_info ? 'PIX ✓' : 'PIX'}
                        </Button>
                      </div>
                      
                      <div className="flex gap-2 w-full">
                        <Button size="sm" onClick={()=>markAsPaid(b.id)} className="flex-1 bg-green-600 hover:bg-green-700">
                          Marcar como pago
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>openEditModal(b)} className="flex-1">
                          <Edit3 className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={()=>cloneBill(b)} className="flex-1">
                          <Copy className="w-4 h-4 mr-1" />
                          Clonar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={()=>deleteBill(b.id)}>
                          Excluir
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">⏰ Pendentes ({filteredPending.length})</h3>
              <div className="flex gap-2">
                <select 
                  value={activeFilters.pending.period}
                  onChange={(e) => setActiveFilters(f => ({ ...f, pending: { ...f.pending, period: e.target.value }}))}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="all">Todos os períodos</option>
                  <option value="current_month">📅 Mês Atual</option>
                  <option value="last_month">📅 Mês Passado</option>
                  <option value="next_month">📅 Próximo Mês</option>
                </select>
                <select 
                  value={activeFilters.pending.category}
                  onChange={(e) => setActiveFilters(f => ({ ...f, pending: { ...f.pending, category: e.target.value }}))}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="todas">Todas categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                  ))}
                  <option value="Moradia">🏠 Moradia</option>
                  <option value="Transporte">🚗 Transporte</option>
                  <option value="Alimentação">🍽️ Alimentação</option>
                  <option value="Saúde">🏥 Saúde</option>
                  <option value="Educação">📚 Educação</option>
                  <option value="Outros">📁 Outros</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {filteredPending.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta pendente</p>}
              {paginatedPending.map(b => {
                const categoryColor = getCategoryColor(b.category)
                const bgColor = getCategoryBgColor(b.category)
                const textColor = getCategoryTextColor(b.category)
                
                return (
                  <Card key={b.id} className="border border-gray-200" style={{ backgroundColor: bgColor }}>
                    <CardHeader className="flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base" style={{ color: textColor }}>{b.name}</CardTitle>
                        <CardDescription style={{ color: textColor }}>{b.category || 'Sem categoria'}</CardDescription>
                      </div>
                      <Badge 
                        variant="warning" 
                        className="border-2"
                        style={{ 
                          backgroundColor: categoryColor,
                          color: textColor,
                          borderColor: categoryColor
                        }}
                      >
                        R$ {Number(b.amount).toFixed(2)}
                      </Badge>
                    </CardHeader>
                  <CardFooter className="flex-col space-y-3">
                    <div className="text-sm text-muted-foreground w-full">Vence em {formatDate(b.due_date)}</div>
                    
                    {/* Anexos */}
                    <div className="flex flex-wrap gap-2 w-full">
                      {/* Boleto */}
                      <div className="flex items-center gap-1">
                        {b.boleto_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'boleto')} className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'boleto')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Boleto
                          </Button>
                        )}
                      </div>
                      
                      {/* Comprovante */}
                      <div className="flex items-center gap-1">
                        {b.comprovante_file ? (
                          <Button size="sm" variant="outline" onClick={() => downloadFile(b.id, 'comprovante')} className="text-xs">
                            <Receipt className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleFileUpload(b.id, 'comprovante')} className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            Comprovante
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => openPixModal(b)} 
                          className={`text-xs ${b.pix_info ? 'bg-green-50 text-green-700 border-green-200' : ''}`}
                        >
                          <Smartphone className="h-3 w-3 mr-1" />
                          {b.pix_info ? 'PIX ✓' : 'PIX'}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex gap-2 w-full">
                      <Button size="sm" onClick={()=>markAsPaid(b.id)} className="flex-1">Marcar como pago</Button>
                      <Button size="sm" variant="outline" onClick={()=>openEditModal(b)} className="flex-1">✏️ Editar</Button>
                      <Button size="sm" variant="outline" onClick={()=>cloneBill(b)} className="flex-1">📋 Clonar</Button>
                      <Button size="sm" variant="destructive" onClick={()=>deleteBill(b.id)}>Excluir</Button>
                    </div>
                  </CardFooter>
                </Card>
                )
              })}
            </div>
            
            {/* Paginação para Pendentes */}
            {totalPagesPending > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setCurrentPagePending(p => Math.max(1, p - 1))}
                  disabled={currentPagePending === 1}
                >
                  ← Anterior
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPagePending} de {totalPagesPending}
                </span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setCurrentPagePending(p => Math.min(totalPagesPending, p + 1))}
                  disabled={currentPagePending === totalPagesPending}
                >
                  Próxima →
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">✅ Pagas ({filteredPaid.length})</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <select 
                  value={activeFilters.paid.period}
                  onChange={(e) => setActiveFilters(f => ({ ...f, paid: { ...f.paid, period: e.target.value }}))}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="all">Todos os períodos</option>
                  <option value="current_month">📅 Mês Atual</option>
                  <option value="last_month">📅 Mês Passado</option>
                  <option value="next_month">📅 Próximo Mês</option>
                </select>
                <select 
                  value={activeFilters.paid.category}
                  onChange={(e) => setActiveFilters(f => ({ ...f, paid: { ...f.paid, category: e.target.value }}))}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="todas">Todas categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                  ))}
                  <option value="Moradia">🏠 Moradia</option>
                  <option value="Transporte">🚗 Transporte</option>
                  <option value="Alimentação">🍽️ Alimentação</option>
                  <option value="Saúde">🏥 Saúde</option>
                  <option value="Educação">📚 Educação</option>
                  <option value="Outros">📁 Outros</option>
                </select>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Total: R$ {filteredPaid.reduce((sum, b) => sum + Number(b.amount), 0).toFixed(2)}
                </Badge>
              </div>
            </div>
            
            {filteredPaid.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conta paga ainda</p>
              </div>
            ) : (
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="p-0">
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed">
                      <thead className="bg-green-100 border-b border-green-200">
                        <tr>
                          <th className="text-left p-1 text-xs font-medium text-green-800 w-[19%]">Conta</th>
                          <th className="text-left p-1 text-xs font-medium text-green-800 w-[18%]">Categoria</th>
                          <th className="text-left p-1 text-xs font-medium text-green-800 w-[12%]">Valor</th>
                          <th className="text-left p-1 text-xs font-medium text-green-800 w-[11%]">Vencimento</th>
                          <th className="text-center p-1 text-xs font-medium text-green-800 w-[14%]">Anexos</th>
                          <th className="text-left p-1 text-xs font-medium text-green-800 w-[26%]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPaid.map((b, index) => {
                          const categoryColor = getCategoryColor(b.category)
                          const bgColor = getCategoryBgColor(b.category)
                          const textColor = getCategoryTextColor(b.category)
                          
                          return (
                            <tr 
                              key={b.id} 
                              className="border-b border-gray-200 hover:opacity-90 transition-opacity"
                              style={{ backgroundColor: bgColor }}
                            >
                              <td className="p-1">
                                <div className="font-medium text-xs truncate" title={b.name} style={{ color: textColor }}>
                                  {b.name}
                                </div>
                              </td>
                              <td className="p-1">
                                <Badge 
                                  variant="outline" 
                                  className="text-xs border truncate max-w-full block"
                                  style={{ 
                                    backgroundColor: categoryColor,
                                    color: textColor,
                                    borderColor: categoryColor,
                                    maxWidth: '100%'
                                  }}
                                >
                                  {b.category || 'Sem categoria'}
                                </Badge>
                              </td>
                              <td className="p-1 font-medium text-xs" style={{ color: textColor }}>
                                R$ {Number(b.amount).toFixed(0)}
                              </td>
                              <td className="p-1 text-xs" style={{ color: textColor }}>
                                {formatDate(b.due_date).replace('/2025', '').replace('/2024', '')}
                              </td>
                              <td className="p-1 text-center">
                                <div className="flex gap-0.5 justify-center">
                                  {b.boleto_file && (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => downloadFile(b.id, 'boleto')} 
                                      className="h-4 px-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    >
                                      <FileText className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {b.comprovante_file && (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => downloadFile(b.id, 'comprovante')} 
                                      className="h-4 px-1 text-xs bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                    >
                                      <Receipt className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {!b.boleto_file && !b.comprovante_file && (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </div>
                              </td>
                            <td className="p-1">
                              <div className="flex gap-0.5">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => openPixModal(b)}
                                  className={`h-4 px-1 text-xs ${b.pix_info ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                                  title="PIX"
                                >
                                  <Smartphone className="w-3 h-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => openEditModal(b)}
                                  className="h-4 px-1 text-xs bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                                  title="Editar"
                                >
                                  ✏️
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={() => deleteBill(b.id)}
                                  className="h-4 px-1 text-xs"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Paginação para Pagas */}
            {totalPagesPaid > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setCurrentPagePaid(p => Math.max(1, p - 1))}
                  disabled={currentPagePaid === 1}
                >
                  ← Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPagesPaid) }, (_, i) => {
                    const pageNum = i + 1
                    return (
                      <Button
                        key={pageNum}
                        size="sm"
                        variant={currentPagePaid === pageNum ? 'default' : 'outline'}
                        onClick={() => setCurrentPagePaid(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                  {totalPagesPaid > 5 && (
                    <>
                      {currentPagePaid > 3 && <span className="text-gray-400">...</span>}
                      {currentPagePaid > 5 && currentPagePaid <= totalPagesPaid && (
                        <Button
                          size="sm"
                          variant="default"
                          className="w-8 h-8 p-0"
                        >
                          {currentPagePaid}
                        </Button>
                      )}
                      {currentPagePaid < totalPagesPaid - 2 && <span className="text-gray-400">...</span>}
                      {totalPagesPaid > 5 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrentPagePaid(totalPagesPaid)}
                          className="w-8 h-8 p-0"
                        >
                          {totalPagesPaid}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setCurrentPagePaid(p => Math.min(totalPagesPaid, p + 1))}
                  disabled={currentPagePaid === totalPagesPaid}
                >
                  Próxima →
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal de Configurações */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Configurações de Notificação</CardTitle>
              <CardDescription>Configure quando e onde receber notificações</CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email de Notificação</Label>
                  <Input 
                    type="email" 
                    value={notificationEmail} 
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder="Digite o email para receber notificações"
                  />
                  <p className="text-sm text-muted-foreground">
                    Deixe em branco para usar o email de login: {user?.email}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Dias Antes do Vencimento</Label>
                  <Select 
                    value={notificationDays} 
                    onChange={(e) => setNotificationDays(Number(e.target.value))}
                  >
                    <option value={1}>1 dia antes</option>
                    <option value={2}>2 dias antes</option>
                    <option value={3}>3 dias antes</option>
                    <option value={5}>5 dias antes</option>
                    <option value={7}>1 semana antes</option>
                    <option value={15}>15 dias antes</option>
                    <option value={30}>1 mês antes</option>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Receberá notificação quando a conta estiver próxima do vencimento
                  </p>
                </div>

                {/* Seção de Categorias */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Categorias Personalizadas</h3>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {categories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <span style={{ color: cat.color }}>{cat.icon}</span>
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openCategoryModal(cat)}
                            className="h-6 w-6 p-0"
                          >
                            ✏️
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteCategory(cat.id)}
                            className="h-6 w-6 p-0 text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => openCategoryModal()}
                    className="w-full"
                  >
                    + Adicionar Nova Categoria
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button onClick={updateNotificationSettings} className="flex-1">
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={() => setShowSettings(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Filtros de Relatórios */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle>Filtros de Relatório</CardTitle>
              <CardDescription>Configure os filtros para gerar relatórios personalizados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={filters.period} onChange={(e) => setFilters(f => ({ ...f, period: e.target.value }))}>
                  <option value="current_month">📅 Mês Atual</option>
                  <option value="last_month">📅 Mês Passado</option>
                  <option value="custom">🗓️ Período Personalizado</option>
                </Select>
              </div>

              {filters.period === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Inicial</Label>
                    <Input 
                      type="date" 
                      value={filters.startDate}
                      onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Final</Label>
                    <Input 
                      type="date" 
                      value={filters.endDate}
                      onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={filters.category} onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}>
                  <option value="todas">Todas as Categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                  ))}
                  <option value="Moradia">🏠 Moradia</option>
                  <option value="Transporte">🚗 Transporte</option>
                  <option value="Alimentação">🍽️ Alimentação</option>
                  <option value="Saúde">🏥 Saúde</option>
                  <option value="Educação">📚 Educação</option>
                  <option value="Outros">📁 Outros</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
                  <option value="todos">Todos os Status</option>
                  <option value="pending">⏰ Pendentes</option>
                  <option value="paid">✅ Pagas</option>
                </Select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-xs text-blue-800">
                  <strong>Filtros Ativos:</strong><br />
                  • Período: {filters.period === 'current_month' ? 'Mês Atual' : filters.period === 'last_month' ? 'Mês Passado' : 'Personalizado'}<br />
                  • Categoria: {filters.category === 'todas' ? 'Todas' : filters.category}<br />
                  • Status: {filters.status === 'todos' ? 'Todos' : filters.status === 'paid' ? 'Pagas' : 'Pendentes'}
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Formato do Relatório</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={() => { downloadReport('pdf'); setShowFilterModal(false) }}
                    variant="outline"
                    className="w-full"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                  <Button 
                    onClick={() => { downloadReport('xlsx'); setShowFilterModal(false) }}
                    variant="outline"
                    className="w-full"
                  >
                    📊 Excel
                  </Button>
                  <Button 
                    onClick={() => { downloadReport('csv'); setShowFilterModal(false) }}
                    variant="outline"
                    className="w-full"
                  >
                    📋 CSV
                  </Button>
                  <Button 
                    onClick={() => { downloadReport('zip'); setShowFilterModal(false) }}
                    variant="outline"
                    className="w-full bg-blue-50 border-blue-300"
                  >
                    📦 ZIP Completo
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilters({
                    category: 'todas',
                    status: 'todos',
                    period: 'current_month',
                    startDate: '',
                    endDate: ''
                  })
                }}
                className="flex-1"
              >
                Limpar Filtros
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowFilterModal(false)}
                className="flex-1"
              >
                Fechar
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Modal do PIX */}
      {showPixModal && pixBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-green-600" />
                Informações do PIX
              </CardTitle>
              <CardDescription>Adicione as informações do PIX para esta conta</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePixInfo} className="space-y-4">
                <div className="space-y-2">
                  <Label>Conta: {pixBill.name}</Label>
                  <p className="text-sm text-gray-600">Valor: R$ {Number(pixBill.amount).toFixed(2)}</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Informações do PIX</Label>
                  <textarea
                    value={pixInfo}
                    onChange={(e) => setPixInfo(e.target.value)}
                    placeholder="Cole aqui a chave PIX, QR Code ou informações de pagamento..."
                    className="w-full p-3 border border-gray-300 rounded-md resize-none"
                    rows={6}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500">
                    {pixInfo.length}/500 caracteres
                  </p>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                  <p className="font-semibold mb-1">💡 Dicas para o PIX:</p>
                  <ul className="space-y-1">
                    <li>• Cole a chave PIX (CPF, email, telefone, etc.)</li>
                    <li>• Cole o código "Copia e Cola" do PIX</li>
                    <li>• Adicione informações adicionais se necessário</li>
                  </ul>
                </div>
                
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">
                    Salvar PIX
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {setShowPixModal(false); setPixBill(null); setPixInfo(''); setError('')}} 
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Edição de Conta */}
      {showEditModal && editingBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Editar Conta</CardTitle>
              <CardDescription>Modifique os detalhes da conta</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={updateBill} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input 
                    value={editingBill.name} 
                    onChange={(e)=>setEditingBill(b=>({...b,name:e.target.value}))} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select 
                    value={editingBill.category} 
                    onChange={(e)=>setEditingBill(b=>({...b,category:e.target.value}))}
                  >
                    <option value="">Selecione...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.icon} {cat.name}</option>
                    ))}
                    <option value="Moradia">🏠 Moradia</option>
                    <option value="Transporte">🚗 Transporte</option>
                    <option value="Alimentação">🍽️ Alimentação</option>
                    <option value="Saúde">🏥 Saúde</option>
                    <option value="Educação">📚 Educação</option>
                    <option value="Outros">📁 Outros</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={editingBill.amount} 
                    onChange={(e)=>setEditingBill(b=>({...b,amount:e.target.value}))} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input 
                    type="date" 
                    value={editingBill.due_date} 
                    onChange={(e)=>setEditingBill(b=>({...b,due_date:e.target.value}))} 
                    required 
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-red-800 text-sm">{error}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Salvar Alterações</Button>
                  <Button type="button" variant="outline" onClick={() => {setShowEditModal(false); setEditingBill(null); setError('')}} className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Categoria */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</CardTitle>
              {error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Nome</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Trabalho, Viagem, Investimento..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category-icon">Ícone</Label>
                <div className="grid grid-cols-6 gap-2">
                  {['📁', '🏠', '🚗', '🍽️', '🏥', '🎮', '📚', '💰', '✈️', '💼', '🎯', '⭐'].map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewCategoryIcon(icon)}
                      className={`p-2 text-xl rounded border ${
                        newCategoryIcon === icon 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category-color">Cor</Label>
                <div className="grid grid-cols-6 gap-2">
                  {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#f43f5e'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCategoryColor(color)}
                      className={`w-8 h-8 rounded border-2 ${
                        newCategoryColor === color 
                          ? 'border-gray-800' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button 
                onClick={editingCategory ? updateCategory : createCategory}
                disabled={!newCategoryName.trim()}
                className="flex-1"
              >
                {editingCategory ? 'Atualizar' : 'Criar'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowCategoryModal(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}


