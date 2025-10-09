import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
} = process.env

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly'
]

const TOKEN_PATH = path.join(process.cwd(), 'backend', 'gmail_token.json')

// Validar se as variáveis de ambiente estão configuradas
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.warn('⚠️  Gmail API não configurada. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no .env')
}

function createOAuth2Client() {
  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  )
  return client
}

export function getAuthUrl() {
  const oAuth2Client = createOAuth2Client()
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })
}

export async function getTokens(code) {
  const oAuth2Client = createOAuth2Client()
  const { tokens } = await oAuth2Client.getToken(code)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  return tokens
}

export function loadTokens() {
  if (fs.existsSync(TOKEN_PATH)) {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf-8')
    const tokens = JSON.parse(raw)
    const oAuth2Client = createOAuth2Client()
    oAuth2Client.setCredentials(tokens)
    return oAuth2Client
  }
  return null
}

function gmailClient() {
  const auth = loadTokens()
  if (!auth) return null
  return google.gmail({ version: 'v1', auth })
}

export async function searchBoletos() {
  const gmail = gmailClient()
  if (!gmail) throw new Error('Gmail OAuth2 não configurado')
  const query = 'has:attachment (boleto OR fatura) newer_than:60d'
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 25
  })
  const messages = res.data.messages || []
  return messages
}

export async function downloadAttachment(messageId, attachmentId, fileName, folderName = 'boletos') {
  const gmail = gmailClient()
  if (!gmail) throw new Error('Gmail OAuth2 não configurado')
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId
  })
  const data = res.data.data
  const buffer = Buffer.from(data, 'base64')
  const destDir = path.join(process.cwd(), 'backend', 'uploads', folderName)
  fs.mkdirSync(destDir, { recursive: true })
  const destPath = path.join(destDir, fileName)
  fs.writeFileSync(destPath, buffer)
  return destPath
}


