import './lib/func.js';
import './config/configuracaos.js';
import * as baileys from '@sixcore/baileys';
import { createRequire }      from 'module'
const require    = createRequire(import.meta.url)
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

// ─── Cooldown ─────────────────────────────────────────────────────────────────
const cooldowns = new Map();
function checkCooldown(sender) {
  const agora = Date.now();
  const ultimo = cooldowns.get(sender) || 0;
  if (agora - ultimo < config.limites.cooldownMs) return true;
  cooldowns.set(sender, agora);
  return false;
}

// ─── Helper: Reação ───────────────────────────────────────────────────────────
const react = async (liteBot, key, emoji) => {
  await liteBot.sendMessage(key.remoteJid, {
    react: { text: emoji, key }
  });
};

// ─── Helper: Newsletter ───────────────────────────────────────────────────────
const newsletter = async (liteBot, id) => {
  return await liteBot.newsletterMetadata('invite', id, 'GUEST');
};

// ─── Helper: Reply ────────────────────────────────────────────────────────────
const reply = async (liteBot, from, text, info) => {
  return liteBot.sendMessage(from, { text }, { quoted: info });
};

// ─── Bot ──────────────────────────────────────────────────────────────────────
async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessao.pastaAuth);

    const liteBot = makeWASocket({
      auth:              state,
      logger:            pino({ level: config.logs.nivel === 'info' ? 'silent' : config.logs.nivel }),
      printQRInTerminal: config.sessao.printQR,
    });

    liteBot.ev.on('creds.update', saveCreds);

    // ─── Conexão ──────────────────────────────────────────────────────────────
    liteBot.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {

      if (qr) {
        console.log(chalk.yellow('📲 Escaneia o QR:'));
        qrcode.generate(qr, { small: config.sessao.qrSmall });
      }

      if (connection === 'open') {
        console.log(chalk.green(`✅ Conectado! Bot: ${config.info.botNome} v${config.info.botVersao}`));
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null;

        console.log(chalk.red(`❌ Desconectado. Código: ${code}`));

        if (code !== DisconnectReason.loggedOut) {
          console.log(chalk.cyan(`🔄 Reconectando em ${config.sessao.timeoutMs / 1000}s...`));
          setTimeout(startBot, config.sessao.timeoutMs);
        } else {
          console.log(chalk.red('🚫 Sessão encerrada. Apaga a pasta de auth e reinicia.'));
        }
      }
    });

    // ─── Eventos de grupo ─────────────────────────────────────────────────────
    liteBot.ev.on('group-participants.update', async ({ id, participants, action }) => {
      if (!config.grupo.bemVindo) return;

      for (const jid of participants) {
        const numero = jid.split('@')[0];
        const mencao = `@${numero}`;

        if (action === 'add') {
          const msg = config.grupo.mensagemBemVindo.replace('@user', mencao);
          await liteBot.sendMessage(id, { text: msg, mentions: [jid] });
        }

        if (action === 'remove') {
          const msg = config.grupo.mensagemSaida.replace('@user', mencao);
          await liteBot.sendMessage(id, { text: msg, mentions: [jid] });
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

      // ─── Ignorar status e newsletter ──────────────────────────────────────
      if (isStatus || isNewsletter) return;

      const type     = func.getMessageType(info);
      const body     = await func.getBody(info, type);
      const pushname = info.pushName;
      const sender   = isGroup ? info.key.participant : info.key.remoteJid;

      const { remoteJid, id, participant } = info.key;
      const key = { remoteJid, id, participant };

      const isCmd  = body?.startsWith(config.info.botPrefix) || false;
      const comando = isCmd
        ? body.slice(1).trim().split(/ +/).shift().toLowerCase()
        : null;

      const args   = body.trim().split(' ').slice(1);
      const q      = args.join(' ');
      const texto  = q;
      const text   = q;
      const prompt = q;

      const quoted = info.quoted ? info.quoted : info;
      const mime   = (quoted.msg || quoted).mimetype || '';

      if (config.logs.mostrarMsgs) {
        console.log(chalk.gray(`[MSG] ${sender} | type: ${type} | cmd: ${comando || body?.slice(0, 30)}`));
      }

      // ─── Anti-link ────────────────────────────────────────────────────────
      if (isGroup && config.grupo.antiLink) {
        const linkRegex = /(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i;
        if (linkRegex.test(body)) {
          if (config.grupo.antiLinkAcao === 'remover') {
            await liteBot.groupParticipantsUpdate(from, [sender], 'remove');
          }
          await liteBot.sendMessage(from, {
            text: `⚠️ @${sender.split('@')[0]} links não são permitidos!`,
            mentions: [sender]
          });
          return;
        }
      }

      // ─── Cooldown ─────────────────────────────────────────────────────────
      if (isCmd && checkCooldown(sender)) {
        await react(liteBot, key, '⏳');
        return;
      }

      // ─── Comandos ─────────────────────────────────────────────────────────
      switch (comando) {

        // ── Ping ───────────────────────────────────────────────────────────────
        case 'ping': {
          const start = Date.now();
          const m = await liteBot.sendMessage(from, { text: '🏓 Calculando...' });
          const ms = Date.now() - start;
          await liteBot.sendMessage(from, {
            text: `🏓 Pong! *${ms}ms*`,
            edit: m.key
          });
          break;
        }

        // ── Texto simples ──────────────────────────────────────────────────────
        case 'texto': {
          await reply(liteBot, from,
            `👋 Olá, ${pushname}!\n` +
            `🤖 Eu sou o *${config.info.botNome}*\n` +
            `📌 Prefixo: ${config.info.botPrefix}\n` +
            `🔖 Versão: ${config.info.botVersao}`,
            info
          );
          break;
        }

        // ── Imagem local ───────────────────────────────────────────────────────
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

        // ── Áudio via YouTube ──────────────────────────────────────────────────
        case 'audio': {
          if (!q) return reply(liteBot, from, `❌ Usa: ${config.info.botPrefix}audio <nome da música>`, info);

          try {
            await react(liteBot, key, '🎵');
            const api = `${config.apis.ytDownload}?type=mp3&titulo=${encodeURIComponent(q)}`;
            const { data } = await axios.get(api, { timeout: 15000 });
            const audioUrl = data.data.download;

            const audio = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });

            await liteBot.sendMessage(from, {
              audio: Buffer.from(audio.data),
              mimetype: 'audio/mpeg',
              ptt: true
            });
            await react(liteBot, key, '✅');
          } catch (err) {
            console.error('[audio] Erro:', err.message);
            await reply(liteBot, from, '❌ Erro ao buscar áudio. Tenta novamente.', info);
          }
          break;
        }

        // ── Vídeo via YouTube ──────────────────────────────────────────────────
        case 'video': {
          if (!q) return reply(liteBot, from, `❌ Usa: ${config.info.botPrefix}video <nome do vídeo>`, info);

          try {
            await react(liteBot, key, '🎬');
            const api = `${config.apis.ytDownload}?type=mp4&titulo=${encodeURIComponent(q)}`;
            const { data } = await axios.get(api, { timeout: 15000 });

            await liteBot.sendMessage(from, {
              video: { url: data.data.download },
              mimetype: 'video/mp4',
              caption: `🎬 ${data.data.title}`
            });
            await react(liteBot, key, '✅');
          } catch (err) {
            console.error('[video] Erro:', err.message);
            await reply(liteBot, from, '❌ Erro ao buscar vídeo. Tenta novamente.', info);
          }
          break;
        }

        // ── Sticker ────────────────────────────────────────────────────────────
        case 'sticker':
case 's': {


  try {
  const alvo = info.quoted
          ? info.quoted.message?.stickerMessage
          : info.message?.stickerMessage
    // Baixa a mídia da mensagem
    const media = await func.getBaixarMsg(alvo);

    // Converte para sticker usando ffsixx
    const ffsixx = require('ffsixx');
    const stickerBuffer = await ffsixx.sticker(media, {
      pack: 'LenaBot',        // Nome do pack do sticker
      author: 'SixxHxRx.js',  // Autor
      resize: true,            // Redimensiona automaticamente
      crop: true               // Corta se necessário
    });

    // Envia o sticker
    await liteBot.sendMessage(from, { sticker: stickerBuffer });

  } catch (err) {
    console.error('[sticker] Erro:', err.message);
    await reply(liteBot, from, '❌ Erro ao criar sticker.', info);
  }

  break;
}

        // ── Mencionar todos ────────────────────────────────────────────────────
        case 'todos':
        case 'all': {
          if (!isGroup) return reply(liteBot, from, '❌ Só funciona em grupos.', info);

          try {
            const metadata = await liteBot.groupMetadata(from);
            const members  = metadata.participants.map(p => p.id);
            const mencoes  = members.map(m => `@${m.split('@')[0]}`).join(' ');

            await liteBot.sendMessage(from, { text: `📢 ${mencoes}`, mentions: members });
          } catch (err) {
            console.error('[todos] Erro:', err.message);
          }
          break;
        }

        // ── Info do grupo ──────────────────────────────────────────────────────
        case 'grupoinfo':
        case 'ginfo': {
          if (!isGroup) return reply(liteBot, from, '❌ Só funciona em grupos.', info);

          try {
            const meta   = await liteBot.groupMetadata(from);
            const admins = meta.participants
              .filter(p => p.admin)
              .map(p => `@${p.id.split('@')[0]}`)
              .join(', ');

            await reply(liteBot, from,
              `📋 *Info do Grupo*\n\n` +
              `📛 Nome: ${meta.subject}\n` +
              `👥 Membros: ${meta.participants.length}\n` +
              `👑 Admins: ${admins || 'N/A'}\n` +
              `🗓️ Criado em: ${new Date(meta.creation * 1000).toLocaleDateString('pt-BR')}\n` +
              `🔒 Restrição: ${meta.restrict ? 'Sim' : 'Não'}`,
              info
            );
          } catch (err) {
            console.error('[ginfo] Erro:', err.message);
          }
          break;
        }

        // ── Citar ──────────────────────────────────────────────────────────────
        case 'citar': {
          await liteBot.sendMessage(from, {
            text: texto || '📌 Mensagem citada!',
            quoted: info
          });
          break;
        }

        // ── Perfil ─────────────────────────────────────────────────────────────
        case 'perfil':
        case 'pp': {
          try {
            const jid   = isGroup ? sender : from;
            const ppUrl = await liteBot.profilePictureUrl(jid, 'image');

            await liteBot.sendMessage(from, {
              image: { url: ppUrl },
              caption: `📸 Foto de perfil de ${pushname}`
            });
          } catch {
            await reply(liteBot, from, '❌ Perfil privado ou não foi possível obter a foto.', info);
          }
          break;
        }

        // ── Status / Info do bot ───────────────────────────────────────────────
        case 'status':
        case 'botinfo': {
          const uptime   = process.uptime();
          const horas    = Math.floor(uptime / 3600);
          const minutos  = Math.floor((uptime % 3600) / 60);
          const segundos = Math.floor(uptime % 60);
          const mem      = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

          await reply(liteBot, from,
            `🤖 *${config.info.botNome}*\n\n` +
            `📌 Prefixo: ${config.info.botPrefix}\n` +
            `🔖 Versão: ${config.info.botVersao}\n` +
            `👤 Autor: ${config.info.botAutor}\n` +
            `⏱️ Uptime: ${horas}h ${minutos}m ${segundos}s\n` +
            `🧠 RAM: ${mem} MB\n` +
            `🟢 Status: Online`,
            info
          );
          break;
        }

        // ── Menu ───────────────────────────────────────────────────────────────
        case 'menu':
        case 'ajuda':
        case 'help': {
          const p = config.info.botPrefix;

          await liteBot.sendMessage(from, {
            text:
              `🤖 *${config.info.botNome}*\n` +
              `🔖 v${config.info.botVersao} | Prefixo: *${p}*\n\n` +

              `*━━━ Geral ━━━*\n` +
              `${p}ping — Latência do bot\n` +
              `${p}texto — Mensagem de teste\n` +
              `${p}status — Info e uptime do bot\n\n` +

              `*━━━ Média ━━━*\n` +
              `${p}imagem — Envia imagem de teste\n` +
              `${p}documento — Envia documento de teste\n` +
              `${p}audio <nome> — Baixa áudio do YouTube\n` +
              `${p}video <nome> — Baixa vídeo do YouTube\n` +
              `${p}sticker — Cria sticker (responde imagem)\n\n` +

              `*━━━ Grupo ━━━*\n` +
              `${p}todos — Menciona todos os membros\n` +
              `${p}ginfo — Info e stats do grupo\n\n` +

              `*━━━ Utilitários ━━━*\n` +
              `${p}perfil — Foto de perfil\n` +
              `${p}citar <texto> — Cita a mensagem\n` +
              `${p}menu — Este menu`
          });
          break;
        }

        default:
          break;
      }
    });

  } catch (err) {
    console.error(chalk.red('[ERRO GERAL]'), err.message);
    setTimeout(startBot, config.sessao.timeoutMs);
  }
}

startBot();
