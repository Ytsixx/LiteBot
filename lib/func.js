import {createRequire} from "module";
import * as mod from "module"
const require = createRequire(
  import.meta.url
  ); import fs from 'fs';
import axios from 'axios';
import path from 'path';
import bia from'@sixcore/baileys';
import {spawn} from 'child_process';
const { proto, downloadContentFromMessage, getContentType, generateWAMessage, areJidsSameUser } = bia;


global.func = {}


/**
 * Extrai o texto/caption/conteúdo principal de qualquer tipo de mensagem do WhatsApp
 * @param {object} info - Objeto completo da mensagem (geralmente `sock.messages` ou similar)
 * @param {string} type - Tipo da mensagem (conversation, imageMessage, buttonsMessage, etc)
 * @returns {string} Texto principal da mensagem ou string vazia
 */
func.getBody = async (info, type) => {
  try {
    const m = info.message;
    if (!m) return '';

    const mapa = {
      conversation:               () => m.conversation || '',
      imageMessage:               () => m.imageMessage?.caption || '',
      videoMessage:               () => m.videoMessage?.caption || '',
      extendedTextMessage:        () => m.extendedTextMessage?.text || '',
      buttonsResponseMessage:     () => m.buttonsResponseMessage?.selectedButtonId || '',
      listResponseMessage:        () => m.listResponseMessage?.singleSelectReply?.selectedRowId || '',
      templateButtonReplyMessage: () => m.templateButtonReplyMessage?.selectedId || '',
      groupInviteMessage:         () => m.groupInviteMessage?.caption || '',
      pollCreationMessageV3:      () => m.pollCreationMessageV3 || '',
      text:                       () => info.text || '',
      editedMessage: () => {
        const e = m.editedMessage?.message?.protocolMessage?.editedMessage;
        return e?.conversation || e?.imageMessage?.caption || e?.videoMessage?.caption || e?.documentMessage?.caption || '';
      },
      viewOnceMessageV2: () => {
        const msg = m.viewOnceMessageV2?.message;
        return msg?.imageMessage?.caption || msg?.videoMessage?.caption || '';
      },
      viewOnceMessage: () => {
        const msg = m.viewOnceMessage?.message;
        return msg?.videoMessage?.caption || msg?.imageMessage?.caption || '';
      },
      documentWithCaptionMessage: () =>
        m.documentWithCaptionMessage?.message?.documentMessage?.caption || '',
      buttonsMessage: () => m.buttonsMessage?.imageMessage?.caption || '',
      interactiveResponseMessage: () => {
        const params = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        return params ? JSON.parse(params)?.id || '' : '';
      },
    };

    if (mapa[type]) return mapa[type]();

    // Fallback geral
    return (
      m.conversation ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.extendedTextMessage?.text ||
      m.viewOnceMessageV2?.message?.imageMessage?.caption ||
      m.viewOnceMessageV2?.message?.videoMessage?.caption ||
      m.viewOnceMessage?.message?.videoMessage?.caption ||
      m.viewOnceMessage?.message?.imageMessage?.caption ||
      m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      m.buttonsMessage?.imageMessage?.caption ||
      m.buttonsResponseMessage?.selectedButtonId ||
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.templateButtonReplyMessage?.selectedId ||
      info.text || ''
    );
  } catch {
    return '';
  }
};


/**
 * Retorna o tipo real da mensagem do WhatsApp
 * @param {object} info - Objeto completo da mensagem (geralmente `sock.messages`)
 * @returns {string|null} Tipo principal da mensagem ou null
 */
func.getMessageType = async (info) => {
  if (!info?.message) return null;
  return Object.keys(info.message)
    .filter(k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo')[0] || null;
};

/**
 * ─────────────────────────────────────────────────────────────
 * HELPERS DE MENSAGENS – WhatsApp (Baileys)
 * Retorna conteúdo principal, quoted messages e tipos específicos
 * ─────────────────────────────────────────────────────────────
 */

/** Helper interno: pega o quotedMessage de qualquer tipo de mensagem */
const _q = (info) => {
  if (!info?.message) return null;
  const m = info.message;

  return (
    m.extendedTextMessage?.contextInfo?.quotedMessage ||
    m.imageMessage?.contextInfo?.quotedMessage ||
    m.videoMessage?.contextInfo?.quotedMessage ||
    m.audioMessage?.contextInfo?.quotedMessage ||
    m.documentMessage?.contextInfo?.quotedMessage ||
    m.stickerMessage?.contextInfo?.quotedMessage ||
    m.buttonsResponseMessage?.contextInfo?.quotedMessage ||
    m.listResponseMessage?.contextInfo?.quotedMessage ||
    m.templateButtonReplyMessage?.contextInfo?.quotedMessage ||
    m.interactiveResponseMessage?.contextInfo?.quotedMessage ||
    m.interactiveMessage?.contextInfo?.quotedMessage ||     // novo formato
    m.pollUpdateMessage?.contextInfo?.quotedMessage ||      // enquetes respondidas
    null
  );
};

/** Helper interno: desempacota viewOnce (suporta V1, V2 e V2Extension) */
const _viewOnce = (src, key) =>
  src?.viewOnceMessage?.message?.[key] ||
  src?.viewOnceMessageV2?.message?.[key] ||
  src?.viewOnceMessageV2Extension?.message?.[key] ||
  null;

/**
 * Retorna o conteúdo principal da mensagem (quoted tem prioridade)
 * - Se for texto → retorna string
 * - Se for resposta de botão/lista → retorna o ID selecionado
 * - Se for mídia → retorna o objeto completo da mídia
 */
func.getMsg = (info) => {
  if (!info?.message) return null;

  const q = _q(info);
  const m = info.message;

  // ── Texto (quoted > direto) ─────────────────────
  const text =
    q?.conversation ||
    q?.extendedTextMessage?.text ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    null;
  if (text) return text;

  // ── Respostas de botão / lista / template ──────
  const reply =
    q?.buttonsResponseMessage?.selectedButtonId ||
    q?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    q?.templateButtonReplyMessage?.selectedId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    null;
  if (reply) return reply;

  // ── Mídia (quoted > direto > viewOnce) ─────────
  return (
    q?.imageMessage    || _viewOnce(q, 'imageMessage')    ||
    m.imageMessage     || _viewOnce(m, 'imageMessage')    ||

    q?.videoMessage    || _viewOnce(q, 'videoMessage')    ||
    m.videoMessage     || _viewOnce(m, 'videoMessage')    ||

    q?.audioMessage    || _viewOnce(q, 'audioMessage')    ||
    m.audioMessage     || _viewOnce(m, 'audioMessage')    ||

    q?.documentMessage || m.documentMessage               ||
    q?.stickerMessage  || m.stickerMessage                ||
    q?.locationMessage || m.locationMessage               ||
    q?.liveLocationMessage || m.liveLocationMessage       ||
    q?.contactMessage  || m.contactMessage                ||
    q?.contactsArrayMessage || m.contactsArrayMessage     ||
    null
  );
};

// ── Helpers específicos (mantidos e otimizados) ─────────────────────────────

/** Retorna apenas texto puro (quoted ou direto) */
func.getTextMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return (
    q?.conversation ||
    q?.extendedTextMessage?.text ||
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    null
  );
};

/** Retorna objeto de imagem (quoted > direto > viewOnce) */
func.getImageMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return (
    q?.imageMessage || _viewOnce(q, 'imageMessage') ||
    m?.imageMessage || _viewOnce(m, 'imageMessage') || null
  );
};

/** Retorna objeto de vídeo */
func.getVideoMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return (
    q?.videoMessage || _viewOnce(q, 'videoMessage') ||
    m?.videoMessage || _viewOnce(m, 'videoMessage') || null
  );
};

/** Retorna objeto de áudio */
func.getAudioMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return (
    q?.audioMessage || _viewOnce(q, 'audioMessage') ||
    m?.audioMessage || _viewOnce(m, 'audioMessage') || null
  );
};

/** Retorna objeto de documento */
func.getDocumentMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return q?.documentMessage || m?.documentMessage || null;
};

/** Retorna objeto de sticker */
func.getStickerMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return q?.stickerMessage || m?.stickerMessage || null;
};

/** Retorna objeto de contato */
func.getContactMessage = (info) => {
  const q = _q(info);
  const m = info.message;
  return q?.contactMessage || m?.contactMessage || null;
};
func.getBaixarMsg = async (message) => {
  if (!message?.mimetype) {
    throw new Error(`getBaixarMsg: mimetype undefined — objeto recebido: ${JSON.stringify(message)}`)
  }

  const type   = message.mimetype.split('/')[0] || ''
  const stream = await downloadContentFromMessage(message, type)
  let buffer   = Buffer.from([])
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
  return buffer
}