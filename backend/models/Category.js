import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Nome da categoria é obrigatório'],
    trim: true,
    minlength: [2, 'Nome deve ter pelo menos 2 caracteres'],
    maxlength: [50, 'Nome deve ter no máximo 50 caracteres']
  },
  color: {
    type: String,
    default: '#3b82f6',
    match: [/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser um código hexadecimal válido']
  },
  icon: {
    type: String,
    default: '📁'
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
})

// Índice único para nome + user_id (cada usuário pode ter categorias com nomes únicos)
categorySchema.index({ name: 1, user_id: 1 }, { unique: true })

// Método para retornar dados públicos
categorySchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    name: this.name,
    color: this.color,
    icon: this.icon,
    createdAt: this.createdAt
  }
}

export default mongoose.model('Category', categorySchema)
