import './lib/func.js';
import './config/configuracaos.js';
import * as baileys from '@sixcore/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import chalk from 'chalk'
import qrcode from 'qrcode-terminal'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = baileys

const __dirname = dirname(fileURLToPath(import.meta.url))

const newsletter = async (liteBot, id) => {
  return await liteBot.newsletterMetadata('invite', id, 'GUEST')
}

// ─── Bot ──────────────────────────────────────────
async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./qrLite')

    const liteBot = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    })

    liteBot.ev.on('creds.update', saveCreds)

    liteBot.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {

      if (qr) {
        console.log('📲 Escaneia o QR:')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        console.log(chalk.green('✅ Conectado!'))
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null

        console.log(chalk.red('❌ Desconectado:', code))

        if (code !== DisconnectReason.loggedOut) {
          console.log('🔄 Reconectando...')
          setTimeout(startBot, 5000)
        }
      }
    })

    // ─── Mensagens ────────────────────────────────
    liteBot.ev.on('messages.upsert', async ({ messages }) => {
      const info = messages[0]
      if (!info.message || info.key.fromMe) return

      const from = info.key.remoteJid

      const isGroup      = from.endsWith('@g.us')
      const isStatus     = from.endsWith('@broadcast')
      const isNewsletter = from.endsWith('@newsletter')
      const isPrivate    = from.endsWith('@s.whatsapp.net')

      const type = func.getMessageType(info)
      const body = await func.getBody(info, type)

      const { remoteJid, id, participant } = info.key
      const key = { remoteJid, id, participant }

      const sender = isGroup ? info.key.participant : info.key.remoteJid
      
      const pushname = info.pushName

      const isCmd  = body?.startsWith(config.info["botPrefix"]) || false
      const comando = isCmd
        ? body.slice(1).trim().split(/ +/).shift().toLowerCase()
        : null
        
        //const pc   = `${prefix}${command}`
    const args = body.trim().split(' ').slice(1)

    // aliases de args
    const prompt = args.join(' ')
    const texto  = args.join(' ')
    const text   = args.join(' ')
    const q      = args.join(' ')

    const quoted = info.quoted ? info.quoted : info
    const mime   = (quoted.msg || quoted).mimetype || ''

      console.log('type:', type, '| body:', body, '| cmd:', comando)

      // ─── Comandos ──────────────────────────────
      switch (comando) {
        
          case 'texto': {
            const mensagem = `👋 Olá, ${pushname}! Este é um teste de envio de mensagens.\n🤖 Eu chamo-me ${config.info["botNome"]}.`;
            
  await liteBot.sendMessage(from, {
    text: mensagem
  });
  break;
            
          };
          
          case 'imagem': {
  const caminhoImagem = './media/teste.jpeg'; // caminho da tua imagem

  await liteBot.sendMessage(from, {
    image: { url: caminhoImagem },
    caption: `🖼️ Teste de imagem\n\nOlá, ${pushname}!`
  });

  break;
}
        
        
        
        
        
        
        
        
        
        
        
        
        case 'ping':
          await liteBot.sendMessage(from, { text: 'Pong! 🏓' })
          break

        case 'value1':
          
          await liteBot.sendMessage(from, { text: 'Tudo ok!' })
          break

        default:
          break
      }
    })

  } catch (err) {
    console.error('Erro geral:', err.message)
  }
}

startBot()