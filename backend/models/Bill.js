import mongoose from 'mongoose'

const billSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'ID do usuário é obrigatório']
  },
  name: {
    type: String,
    required: [true, 'Nome da conta é obrigatório'],
    trim: true,
    minlength: [1, 'Nome deve ter pelo menos 1 caractere'],
    maxlength: [120, 'Nome deve ter no máximo 120 caracteres']
  },
  category: {
    type: String,
    trim: true,
    maxlength: [120, 'Categoria deve ter no máximo 120 caracteres'],
    default: null
  },
  amount: {
    type: Number,
    required: [true, 'Valor é obrigatório'],
    min: [0.01, 'Valor deve ser maior que zero']
  },
  due_date: {
    type: Date,
    required: [true, 'Data de vencimento é obrigatória']
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  paid_at: {
    type: Date,
    default: null
  },
  boleto_file: {
    type: String,
    default: null
  },
  boleto_filename: {
    type: String,
    default: null
  },
  comprovante_file: {
    type: String,
    default: null
  },
  comprovante_filename: {
    type: String,
    default: null
  },
  pix_info: {
    type: String,
    default: null,
    trim: true,
    maxlength: [500, 'Informações do PIX devem ter no máximo 500 caracteres']
  }
}, {
  timestamps: true
})

// Índices para performance
billSchema.index({ user_id: 1, due_date: 1 })
billSchema.index({ user_id: 1, status: 1 })

// Middleware para atualizar paid_at quando status muda
billSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'paid' && !this.paid_at) {
      this.paid_at = new Date()
    } else if (this.status === 'pending') {
      this.paid_at = null
    }
  }
  // Se paid_at foi explicitamente definido, não sobrescrever
  next()
})

export default mongoose.model('Bill', billSchema)
