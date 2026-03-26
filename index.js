import './lib/func.js';
import './config/configuracaos.js';
import * as baileys from '@sixcore/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import chalk from 'chalk';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import fs from 'fs';

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = baileys;

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helper: Newsletter ───────────────────────────────────────────────────────
const newsletter = async (liteBot, id) => {
  return await liteBot.newsletterMetadata('invite', id, 'GUEST');
};

// ─── Helper: Reação ───────────────────────────────────────────────────────────
const react = async (liteBot, key, emoji) => {
  await liteBot.sendMessage(key.remoteJid, {
    react: { text: emoji, key }
  });
};

// ─── Bot ──────────────────────────────────────────────────────────────────────
async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./qrLite');

    const liteBot = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    });

    liteBot.ev.on('creds.update', saveCreds);

    // ─── Conexão ─────────────────────────────────────────────────────────────
    liteBot.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {

      if (qr) {
        console.log(chalk.yellow('📲 Escaneia o QR:'));
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        console.log(chalk.green('✅ Conectado!'));
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null;

        console.log(chalk.red('❌ Desconectado. Código:', code));

        if (code !== DisconnectReason.loggedOut) {
          console.log(chalk.cyan('🔄 Reconectando em 5s...'));
          setTimeout(startBot, 5000);
        }
      }
    });

    // ─── Mensagens ────────────────────────────────────────────────────────────
    liteBot.ev.on('messages.upsert', async ({ messages }) => {
      const info = messages[0];
      if (!info.message || info.key.fromMe) return;

      const from = info.key.remoteJid;

      const isGroup      = from.endsWith('@g.us');
      const isStatus     = from.endsWith('@broadcast');
      const isNewsletter = from.endsWith('@newsletter');
      const isPrivate    = from.endsWith('@s.whatsapp.net');

      const type     = func.getMessageType(info);
      const body     = await func.getBody(info, type);
      const pushname = info.pushName;
      const sender   = isGroup ? info.key.participant : info.key.remoteJid;

      const { remoteJid, id, participant } = info.key;
      const key = { remoteJid, id, participant };

      const isCmd  = body?.startsWith(config.info['botPrefix']) || false;
      const comando = isCmd
        ? body.slice(1).trim().split(/ +/).shift().toLowerCase()
        : null;

      const args   = body.trim().split(' ').slice(1);
      const prompt = args.join(' ');
      const texto  = args.join(' ');
      const text   = args.join(' ');
      const q      = args.join(' ');

      const quoted = info.quoted ? info.quoted : info;
      const mime   = (quoted.msg || quoted).mimetype || '';

      console.log(chalk.gray(`[MSG] type: ${type} | body: ${body} | cmd: ${comando}`));

      // ─── Ignorar status e newsletter ─────────────────────────────────────
      if (isStatus || isNewsletter) return;

      // ─── Comandos ─────────────────────────────────────────────────────────
      switch (comando) {

        // ── Ping ─────────────────────────────────────────────────────────────
        case 'ping':
          await liteBot.sendMessage(from, { text: '🏓 Pong!' });
          break;

        // ── Texto simples ─────────────────────────────────────────────────────
        case 'texto': {
          const mensagem =
            `👋 Olá, ${pushname}!\n` +
            `🤖 Eu sou o ${config.info['botNome']}.\n` +
            `📌 Prefixo: ${config.info['botPrefix']}`;

          await liteBot.sendMessage(from, { text: mensagem });
          break;
        }

        // ── Imagem local ──────────────────────────────────────────────────────
        case 'imagem': {
          await liteBot.sendMessage(from, {
            image: { url: './media/teste.jpeg' },
            caption: `🖼️ Teste de imagem\n\nOlá, ${pushname}!`
          });
          break;
        }

        // ── Documento ─────────────────────────────────────────────────────────
        case 'documento': {
          await liteBot.sendMessage(from, {
            document: { url: './media/teste.xlsx' },
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileName: 'teste.xlsx'
          });
          break;
        }

        // ── Áudio via YouTube ─────────────────────────────────────────────────
        case 'audio': {
          if (!q) return liteBot.sendMessage(from, { text: '❌ Usa: !audio <nome da música>' });

          try {
            await react(liteBot, key, '🎵');
            const api = `https://acodex.fluxdev.site/api/download/ytmp?type=mp3&titulo=${encodeURIComponent(q)}`;
            const { data } = await axios.get(api);
            const audioUrl = data.data.download;

            const audio = await axios.get(audioUrl, { responseType: 'arraybuffer' });

            await liteBot.sendMessage(from, {
              audio: Buffer.from(audio.data),
              mimetype: 'audio/mpeg',
              ptt: true
            });
          } catch (err) {
            console.error('[audio] Erro:', err.message);
            await liteBot.sendMessage(from, { text: '❌ Erro ao buscar áudio.' });
          }
          break;
        }

        // ── Vídeo via YouTube ─────────────────────────────────────────────────
        case 'video': {
          if (!q) return liteBot.sendMessage(from, { text: '❌ Usa: !video <nome do vídeo>' });

          try {
            await react(liteBot, key, '🎬');
            const api = `https://acodex.fluxdev.site/api/download/ytmp?type=mp4&titulo=${encodeURIComponent(q)}`;
            const { data } = await axios.get(api);

            await liteBot.sendMessage(from, {
              video: { url: data.data.download },
              mimetype: 'video/mp4',
              caption: `🎬 ${data.data.title}`
            });
          } catch (err) {
            console.error('[video] Erro:', err.message);
            await liteBot.sendMessage(from, { text: '❌ Erro ao buscar vídeo.' });
          }
          break;
        }

        // ── Sticker a partir de imagem quotada ────────────────────────────────
        case 'sticker':
        case 's': {
          if (!mime.startsWith('image/')) {
            return liteBot.sendMessage(from, { text: '❌ Manda ou responde uma imagem para fazer sticker.' });
          }

          try {
            await react(liteBot, key, '🎨');
            const media = await liteBot.downloadMediaMessage(quoted);

            await liteBot.sendMessage(from, {
              sticker: media
            });
          } catch (err) {
            console.error('[sticker] Erro:', err.message);
            await liteBot.sendMessage(from, { text: '❌ Erro ao criar sticker.' });
          }
          break;
        }

        // ── Mencionar todos (só grupos) ───────────────────────────────────────
        case 'todos':
        case 'all': {
          if (!isGroup) return liteBot.sendMessage(from, { text: '❌ Só funciona em grupos.' });

          try {
            const metadata  = await liteBot.groupMetadata(from);
            const members   = metadata.participants.map(p => p.id);
            const mencoes   = members.map(m => `@${m.split('@')[0]}`).join(' ');

            await liteBot.sendMessage(from, {
              text: `📢 ${mencoes}`,
              mentions: members
            });
          } catch (err) {
            console.error('[todos] Erro:', err.message);
          }
          break;
        }

        // ── Info do grupo ─────────────────────────────────────────────────────
        case 'grupoinfo':
        case 'ginfo': {
          if (!isGroup) return liteBot.sendMessage(from, { text: '❌ Só funciona em grupos.' });

          try {
            const meta = await liteBot.groupMetadata(from);
            const admins = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`).join(', ');

            const info =
              `📋 *Info do Grupo*\n\n` +
              `📛 Nome: ${meta.subject}\n` +
              `👥 Membros: ${meta.participants.length}\n` +
              `👑 Admins: ${admins || 'N/A'}\n` +
              `🗓️ Criado em: ${new Date(meta.creation * 1000).toLocaleDateString('pt-BR')}`;

            await liteBot.sendMessage(from, { text: info });
          } catch (err) {
            console.error('[ginfo] Erro:', err.message);
          }
          break;
        }

        // ── Resposta citada ───────────────────────────────────────────────────
        case 'citar': {
          const msg = texto || '📌 Mensagem citada!';

          await liteBot.sendMessage(from, {
            text: msg,
            quoted: info
          });
          break;
        }

        // ── Perfil do usuário ─────────────────────────────────────────────────
        case 'perfil':
        case 'pp': {
          try {
            const jid  = isGroup ? (info.key.participant) : from;
            const ppUrl = await liteBot.profilePictureUrl(jid, 'image');

            await liteBot.sendMessage(from, {
              image: { url: ppUrl },
              caption: `📸 Foto de perfil de ${pushname}`
            });
          } catch {
            await liteBot.sendMessage(from, { text: '❌ Não foi possível obter a foto de perfil.' });
          }
          break;
        }

        // ── Status do bot ─────────────────────────────────────────────────────
        case 'status':
        case 'botinfo': {
          const uptime  = process.uptime();
          const horas   = Math.floor(uptime / 3600);
          const minutos = Math.floor((uptime % 3600) / 60);
          const segundos = Math.floor(uptime % 60);

          const info =
            `🤖 *${config.info['botNome']}*\n\n` +
            `⏱️ Uptime: ${horas}h ${minutos}m ${segundos}s\n` +
            `📌 Prefixo: ${config.info['botPrefix']}\n` +
            `🟢 Status: Online`;

          await liteBot.sendMessage(from, { text: info });
          break;
        }

        // ── Menu de ajuda ─────────────────────────────────────────────────────
        case 'menu':
        case 'ajuda':
        case 'help': {
          const p = config.info['botPrefix'];
          const menu =
            `🤖 *${config.info['botNome']} — Menu*\n\n` +
            `*━━━ Geral ━━━*\n` +
            `${p}ping — Testa o bot\n` +
            `${p}texto — Mensagem de teste\n` +
            `${p}status — Info do bot\n\n` +
            `*━━━ Média ━━━*\n` +
            `${p}imagem — Envia imagem teste\n` +
            `${p}documento — Envia doc teste\n` +
            `${p}audio <nome> — Baixa áudio do YouTube\n` +
            `${p}video <nome> — Baixa vídeo do YouTube\n` +
            `${p}sticker — Cria sticker (responde imagem)\n\n` +
            `*━━━ Grupo ━━━*\n` +
            `${p}todos — Menciona todos\n` +
            `${p}ginfo — Info do grupo\n\n` +
            `*━━━ Utilitários ━━━*\n` +
            `${p}perfil — Foto de perfil\n` +
            `${p}citar <texto> — Cita a mensagem`;

          await liteBot.sendMessage(from, { text: menu });
          break;
        }

        default:
          break;
      }
    });

  } catch (err) {
    console.error(chalk.red('[ERRO GERAL]'), err.message);
    setTimeout(startBot, 10000);
  }
}

startBot();
