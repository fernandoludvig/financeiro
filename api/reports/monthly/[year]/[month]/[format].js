import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

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

function generatePDFReportBuffer(bills, year, month) {
  return new Promise((resolve, reject) => {
    try {
      const headerHeight = 120;
      const tableHeaderHeight = 45;
      const rowHeight = 18;
      const footerHeight = 50;
      const totalContentHeight = headerHeight + tableHeaderHeight + (bills.length * rowHeight) + footerHeight;
      
      const doc = new PDFDocument({ 
        margin: 30,
        size: 'A4',
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `Relatório Mensal - ${year}/${month}`,
          Author: 'Sistema Financeiro',
          Subject: 'Relatório de Contas',
          Creator: 'Sistema Financeiro'
        }
      });
      
      const chunks = [];
      
      doc.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      doc.on('end', () => {
        try {
          if (chunks.length === 0) {
            reject(new Error('Nenhum chunk foi coletado do PDF'));
            return;
          }
          
          // Concatenar todos os chunks em um único buffer
          const pdfBuffer = Buffer.concat(chunks);
          
          if (pdfBuffer.length === 0) {
            reject(new Error('PDF gerado está vazio'));
            return;
          }
          
          // Verificar se é um PDF válido
          const header = pdfBuffer.slice(0, 4).toString('ascii');
          if (header !== '%PDF') {
            console.error('❌ Header PDF inválido:', header, 'Primeiros bytes:', pdfBuffer.slice(0, 20).toString('hex'));
            reject(new Error('PDF inválido: cabeçalho incorreto'));
            return;
          }
          
          // Verificar se o PDF tem tamanho mínimo razoável
          if (pdfBuffer.length < 100) {
            reject(new Error(`PDF muito pequeno (${pdfBuffer.length} bytes), provavelmente corrompido`));
            return;
          }
          
          // Criar uma cópia do buffer para garantir que não seja modificado
          const finalBuffer = Buffer.from(pdfBuffer);
          
          console.log(`✅ PDF gerado com sucesso: ${finalBuffer.length} bytes, header: ${header}`);
          resolve(finalBuffer);
        } catch (err) {
          console.error('❌ Erro ao processar PDF:', err);
          reject(new Error(`Erro ao processar PDF: ${err.message}`));
        }
      });
      
      doc.on('error', (err) => {
        reject(new Error(`Erro no PDFKit: ${err.message}`));
      });
    
      doc.fontSize(20)
        .fillColor('#1e40af')
        .text('Relatório Mensal de Contas', { align: 'center' });
      
      doc.moveDown(0.8)
        .fontSize(12)
        .fillColor('#374151')
        .text(`Período: ${String(month).padStart(2, '0')}/${year}`, { align: 'center' });
      
      doc.moveDown(1.2);
      
      const total = bills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
      const paid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount || 0), 0);
      const pending = total - paid;
      doc.fontSize(11)
        .fillColor('#1f2937')
        .text('RESUMO FINANCEIRO', { underline: true });
      
      doc.moveDown(0.6);
      
      const resumoY = doc.y;
      doc.fontSize(10)
        .fillColor('#374151')
        .text(`Total de Contas: R$ ${total.toFixed(2)}`, 30, resumoY)
        .text(`Contas Pagas: R$ ${paid.toFixed(2)}`, 250, resumoY)
        .text(`Contas Pendentes: R$ ${pending.toFixed(2)}`, 470, resumoY);
      
      if (bills.length > 0) {
        doc.moveDown(2)
          .fontSize(13)
          .fillColor('#1f2937')
          .text('DETALHAMENTO DAS CONTAS', { align: 'center', underline: true });
        
        doc.moveDown(0.8);
        
        const tableTop = doc.y;
        const col1 = 30;
        const col2 = 85;
        const col3 = 180;
        const col4 = 250;
        const col5 = 300;
        const col6 = 350;
        const col7 = 390;
        const col8 = 450;
        
        doc.fontSize(9)
          .fillColor('#6b7280')
          .text('Data', col1, tableTop)
          .text('Descrição', col2, tableTop)
          .text('Categoria', col3, tableTop)
          .text('Status', col4, tableTop)
          .text('Valor', col5, tableTop)
          .text('Boleto', col6, tableTop)
          .text('Comprov.', col7, tableTop)
          .text('PIX', col8, tableTop);
        
        doc.moveTo(col1, tableTop + 12)
          .lineTo(col8 + 40, tableTop + 12)
          .stroke('#e5e7eb');
        
        let currentY = tableTop + 20;
        
        // Linhas da tabela
        bills.forEach((bill) => {
          // Verificar se precisa de nova página
          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
          }
          
          const dueDate = new Date(bill.due_date).toLocaleDateString('pt-BR');
          const status = bill.status === 'paid' ? 'Pago' : 'Pendente';
          const statusColor = bill.status === 'paid' ? '#10b981' : '#f59e0b';
          
          doc.fontSize(9)
            .fillColor('#374151')
            .text(dueDate || '', col1, currentY)
            .text((bill.name || '').substring(0, 15) + ((bill.name || '').length > 15 ? '...' : ''), col2, currentY)
            .text(((bill.category || 'Sem cat.')).substring(0, 12) + ((bill.category || 'Sem cat.').length > 12 ? '...' : ''), col3, currentY)
            .fillColor(statusColor)
            .text(status, col4, currentY)
            .fillColor('#374151')
            .text(`R$ ${Number(bill.amount || 0).toFixed(2)}`, col5, currentY);
          
          doc.fillColor(bill.boleto_file ? '#1e40af' : '#ef4444')
            .text(bill.boleto_file ? 'Sim' : 'Não', col6, currentY);
          
          doc.fillColor(bill.comprovante_file ? '#1e40af' : '#ef4444')
            .text(bill.comprovante_file ? 'Sim' : 'Não', col7, currentY);
          
          doc.fillColor(bill.pix_info ? '#10b981' : '#ef4444')
            .text(bill.pix_info ? 'Sim' : 'Não', col8, currentY);
          
          currentY += 18;
        });
      }
      
      doc.moveDown(2);
      const footerY = doc.y;
      doc.fontSize(8)
        .fillColor('#9ca3af')
        .text(`Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`, 30, footerY)
        .text('Sistema Financeiro - Relatórios Automáticos', { align: 'center' }, footerY);
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

async function generateExcelReportBuffer(bills, year, month) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Relatório Mensal');
  
  worksheet.properties.defaultRowHeight = 20;
  
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = 'Relatório Mensal de Contas';
  worksheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1e40af' } };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };
  
  worksheet.mergeCells('A2:F2');
  worksheet.getCell('A2').value = `Período: ${String(month).padStart(2, '0')}/${year}`;
  worksheet.getCell('A2').font = { size: 12, color: { argb: 'FF374151' } };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };
  
  const total = bills.reduce((acc, b) => acc + Number(b.amount), 0);
  const paid = bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + Number(b.amount), 0);
  const pending = total - paid;
  
  worksheet.getCell('A4').value = 'RESUMO FINANCEIRO';
  worksheet.getCell('A4').font = { size: 14, bold: true, color: { argb: 'FF1f2937' } };
  
  worksheet.getCell('A5').value = `Total de Contas: R$ ${total.toFixed(2)}`;
  worksheet.getCell('A6').value = `Contas Pagas: R$ ${paid.toFixed(2)}`;
  worksheet.getCell('A7').value = `Contas Pendentes: R$ ${pending.toFixed(2)}`;
  
  const headerRow = 9;
  worksheet.getCell(`A${headerRow}`).value = 'Data';
  worksheet.getCell(`B${headerRow}`).value = 'Descrição';
  worksheet.getCell(`C${headerRow}`).value = 'Categoria';
  worksheet.getCell(`D${headerRow}`).value = 'Status';
  worksheet.getCell(`E${headerRow}`).value = 'Valor';
  worksheet.getCell(`F${headerRow}`).value = 'Boleto';
  worksheet.getCell(`G${headerRow}`).value = 'Comprovante';
  worksheet.getCell(`H${headerRow}`).value = 'PIX';
  
  for (let col = 1; col <= 8; col++) {
    const cell = worksheet.getCell(headerRow, col);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e40af' } };
    cell.alignment = { horizontal: 'center' };
  }
  
  bills.forEach((bill, index) => {
    const row = headerRow + 1 + index;
    const dueDate = new Date(bill.due_date).toLocaleDateString('pt-BR');
    const status = bill.status === 'paid' ? 'Pago' : 'Pendente';
    
    worksheet.getCell(`A${row}`).value = dueDate;
    worksheet.getCell(`B${row}`).value = bill.name;
    worksheet.getCell(`C${row}`).value = bill.category || 'Sem categoria';
    worksheet.getCell(`D${row}`).value = status;
    worksheet.getCell(`E${row}`).value = Number(bill.amount);
    worksheet.getCell(`F${row}`).value = bill.boleto_file ? 'Sim' : 'Não';
    worksheet.getCell(`G${row}`).value = bill.comprovante_file ? 'Sim' : 'Não';
    worksheet.getCell(`H${row}`).value = bill.pix_info ? 'Sim' : 'Não';
    
    if (index % 2 === 0) {
      for (let col = 1; col <= 8; col++) {
        worksheet.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    }
    
    const statusCell = worksheet.getCell(`D${row}`);
    statusCell.font = { color: { argb: bill.status === 'paid' ? 'FF10b981' : 'FFf59e0b' } };
    
    worksheet.getCell(`E${row}`).numFmt = 'R$ #,##0.00';
  });
  
  worksheet.columns = [
    { width: 12 },  // A - Data
    { width: 25 },  // B - Descrição
    { width: 15 },  // C - Categoria
    { width: 12 },  // D - Status
    { width: 12 },  // E - Valor
    { width: 10 },  // F - Boleto
    { width: 12 },  // G - Comprovante
    { width: 10 }   // H - PIX
  ];
  
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

async function generateCSVReportBuffer(bills, year, month) {
  const headers = [
    { id: 'data', title: 'Data de Vencimento' },
    { id: 'descricao', title: 'Descrição' },
    { id: 'categoria', title: 'Categoria' },
    { id: 'status', title: 'Status' },
    { id: 'valor', title: 'Valor (R$)' },
    { id: 'boleto', title: 'Boleto' },
    { id: 'comprovante', title: 'Comprovante' },
    { id: 'pix', title: 'PIX' }
  ];
  
  const csvData = bills.map(bill => ({
    data: new Date(bill.due_date).toLocaleDateString('pt-BR'),
    descricao: bill.name,
    categoria: bill.category || 'Sem categoria',
    status: bill.status === 'paid' ? 'Pago' : 'Pendente',
    valor: Number(bill.amount).toFixed(2),
    boleto: bill.boleto_file ? 'Sim' : 'Não',
    comprovante: bill.comprovante_file ? 'Sim' : 'Não',
    pix: bill.pix_info ? 'Sim' : 'Não'
  }));
  
  const headerLine = headers.map(h => h.title).join(',') + '\n';
  const dataLines = csvData.map(row => 
    Object.values(row).map(val => `"${val}"`).join(',')
  ).join('\n');
  
  const csvContent = headerLine + dataLines;
  return Buffer.from(csvContent, 'utf8');
}

async function generateZipReportBuffer(bills, year, month) {
  return new Promise(async (resolve, reject) => {
    try {
      const pdfBuffer = await generatePDFReportBuffer(bills, year, month);
      
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];
      
      archive.on('data', chunk => {
        chunks.push(chunk);
      });
      
      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          reject(new Error('ZIP gerado está vazio'));
        } else {
          resolve(buffer);
        }
      });
      
      archive.on('error', reject);
      
      archive.append(pdfBuffer, { name: `relatorio-${year}-${String(month).padStart(2, '0')}.pdf` });
      
      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const user = authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }

    let year = req.query.year;
    let month = req.query.month;
    let formatType = req.query.format || 'pdf';
    
    if (!year || !month) {
      const url = req.url || '';
      const urlParts = url.split('/').filter(Boolean);
      const reportsIndex = urlParts.indexOf('reports');
      
      if (reportsIndex !== -1) {
        if (urlParts.length > reportsIndex + 1 && urlParts[reportsIndex + 1] === 'monthly') {
          if (urlParts.length > reportsIndex + 2) year = urlParts[reportsIndex + 2];
          if (urlParts.length > reportsIndex + 3) month = urlParts[reportsIndex + 3];
          if (urlParts.length > reportsIndex + 4) formatType = urlParts[reportsIndex + 4];
        }
      }
    }
    
    const { category, status, startDate, endDate } = req.query;
    
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    
    if (!y || !m || isNaN(y) || isNaN(m)) {
      return res.status(400).json({ error: 'Ano e mês são obrigatórios e devem ser números válidos' });
    }

    const { client, db } = await connectToDatabase();
    
    const query = {
      user_id: new ObjectId(user.id)
    };
    
    if (startDate && endDate) {
      query.due_date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      query.due_date = {
        $gte: start,
        $lte: end
      };
    }
    
    if (category && category !== 'todas') {
      query.category = category;
    }
    
    if (status && status !== 'todos') {
      query.status = status;
    }
    
    const bills = await db.collection('bills').find(query).sort({ due_date: 1 }).toArray();
    
    console.log(`📊 Gerando relatório: ${bills.length} contas encontradas`);
    
    let buffer;
    let fileName;
    let contentType;
    
    switch (formatType.toLowerCase()) {
      case 'zip':
        buffer = await generateZipReportBuffer(bills, y, m);
        fileName = `relatorio-completo-${y}-${String(m).padStart(2, '0')}.zip`;
        contentType = 'application/zip';
        break;
      case 'excel':
      case 'xlsx':
        buffer = await generateExcelReportBuffer(bills, y, m);
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'csv':
        buffer = await generateCSVReportBuffer(bills, y, m);
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.csv`;
        contentType = 'text/csv';
        break;
      case 'pdf':
      default:
        buffer = await generatePDFReportBuffer(bills, y, m);
        fileName = `relatorio-${y}-${String(m).padStart(2, '0')}.pdf`;
        contentType = 'application/pdf';
        break;
    }
    
    if (!buffer || buffer.length === 0) {
      console.error('❌ Buffer vazio após geração');
      return res.status(500).json({ error: 'Erro ao gerar relatório: buffer vazio' });
    }
    
    console.log(`✅ Relatório gerado: ${fileName} (${buffer.length} bytes)`);
    
    // Garantir que seja um Buffer válido
    const finalBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    
    // Verificar o header do PDF antes de enviar
    if (contentType === 'application/pdf') {
      const header = finalBuffer.slice(0, 4).toString('ascii');
      if (header !== '%PDF') {
        console.error('❌ PDF inválido antes de enviar:', header, 'Primeiros bytes:', finalBuffer.slice(0, 20).toString('hex'));
        return res.status(500).json({ error: 'PDF gerado está corrompido' });
      }
      console.log(`✅ PDF válido confirmado antes de enviar: ${header}, ${finalBuffer.length} bytes`);
    }
    
    // ÚLTIMA TENTATIVA: Salvar temporariamente em /tmp e enviar como arquivo
    // Isso replica exatamente o comportamento do backend local que funciona
    const tmpDir = '/tmp';
    const tmpFilePath = path.join(tmpDir, fileName);
    
    // Garantir que o diretório /tmp existe
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    // Salvar o buffer em arquivo temporário
    fs.writeFileSync(tmpFilePath, finalBuffer);
    
    // Configurar headers exatamente como no backend local
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Enviar o arquivo usando fs.readFileSync (como no backend local)
    const fileBuffer = fs.readFileSync(tmpFilePath);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Enviar o arquivo
    res.status(200).end(fileBuffer);
    
    // Limpar arquivo temporário após envio (opcional, mas recomendado)
    setTimeout(() => {
      try {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
      } catch (err) {
        console.error('Erro ao limpar arquivo temporário:', err);
      }
    }, 1000);
    
  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error);
    return res.status(500).json({ 
      error: 'Erro ao gerar relatório', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
