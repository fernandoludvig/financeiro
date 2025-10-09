import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'ID do usuário é obrigatório']
  },
  bill_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bill',
    default: null
  },
  type: {
    type: String,
    required: [true, 'Tipo da notificação é obrigatório'],
    enum: ['email', 'sms', 'push']
  },
  message: {
    type: String,
    required: [true, 'Mensagem é obrigatória'],
    trim: true,
    maxlength: [500, 'Mensagem deve ter no máximo 500 caracteres']
  },
  sent_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Índices para performance
notificationSchema.index({ user_id: 1, sent_at: -1 })
notificationSchema.index({ bill_id: 1 })

export default mongoose.model('Notification', notificationSchema)
