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
func.getBody = (info,type) => {
  try {
    const m = info.message;
    if (!m) return '';

    const safeJson = (str) => {
      try { return JSON.parse(str); } catch { return null; }
    };

    const mapa = {
      // ── Texto ────────────────────
      conversation:           () => m.conversation || '',
      extendedTextMessage:    () => m.extendedTextMessage?.text || '',
      text:                   () => info.text || '',

      // ── Mídia com legenda ────────
      imageMessage:           () => m.imageMessage?.caption || '',
      videoMessage:           () => m.videoMessage?.caption || '',
      audioMessage:           () => m.audioMessage?.caption || '',
      documentMessage:        () => m.documentMessage?.caption || m.documentMessage?.fileName || '',
      stickerMessage:         () => m.stickerMessage?.caption || '',
      gifPlayback:            () => m.videoMessage?.caption || '',

      // ── Documento com legenda ────
      documentWithCaptionMessage: () =>
        m.documentWithCaptionMessage?.message?.documentMessage?.caption || '',

      // ── Botões ───────────────────
      buttonsMessage: () =>
        m.buttonsMessage?.contentText ||
        m.buttonsMessage?.text ||                    // alguns forks enviam aqui
        m.buttonsMessage?.imageMessage?.caption ||
        m.buttonsMessage?.videoMessage?.caption ||
        m.buttonsMessage?.documentMessage?.caption || '',

      buttonsResponseMessage: () =>
        m.buttonsResponseMessage?.selectedButtonId ||
        m.buttonsResponseMessage?.contextInfo?.quotedMessage?.conversation || '',

      // ── Listas ──────────────────
      listMessage:                () => m.listMessage?.description || m.listMessage?.title || '',
      listResponseMessage:        () => m.listResponseMessage?.singleSelectReply?.selectedRowId || '',

      // ── Templates ───────────────
      templateMessage:            () =>
        m.templateMessage?.hydratedTemplate?.hydratedContentText ||
        m.templateMessage?.hydratedTemplate?.hydratedTitleText || '',
      templateButtonReplyMessage: () => m.templateButtonReplyMessage?.selectedId || '',
      highlyStructuredMessage:    () => m.highlyStructuredMessage?.title || '',

      // ── Interativo ──────────────
      interactiveMessage: () =>
        m.interactiveMessage?.body?.text ||
        m.interactiveMessage?.nativeFlowMessage?.body?.text ||   // novo formato 2025/2026
        m.interactiveMessage?.header?.text ||
        m.interactiveMessage?.header?.imageMessage?.caption || '',

      interactiveResponseMessage: () => {
        const params = safeJson(m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson);
        return params?.id || params?.title || '';
      },

      // ── Enquetes ────────────────
      pollCreationMessage:   () => m.pollCreationMessage?.name || '',
      pollCreationMessageV2: () => m.pollCreationMessageV2?.name || '',
      pollCreationMessageV3: () => m.pollCreationMessageV3?.name || '',
      pollCreationMessageV4: () => m.pollCreationMessageV4?.name || '', // suporte futuro
      pollUpdateMessage:     () => m.pollUpdateMessage?.vote?.selectedOptions?.[0] || '',

      // ── Convite de grupo ────────
      groupInviteMessage: () => m.groupInviteMessage?.caption || m.groupInviteMessage?.groupName || '',

      // ── Mensagens efêmeras / visualização única ────────────────────────────
      viewOnceMessage: () => {
        const msg = m.viewOnceMessage?.message;
        return msg?.imageMessage?.caption || msg?.videoMessage?.caption || '';
      },
      viewOnceMessageV2: () => {
        const msg = m.viewOnceMessageV2?.message;
        return msg?.imageMessage?.caption || msg?.videoMessage?.caption || '';
      },
      viewOnceMessageV2Extension: () => {
        const msg = m.viewOnceMessageV2Extension?.message;
        return msg?.imageMessage?.caption || msg?.videoMessage?.caption || '';
      },
      ephemeralMessage: () => {
        const msg = m.ephemeralMessage?.message;
        return msg?.conversation ||
               msg?.extendedTextMessage?.text ||
               msg?.imageMessage?.caption ||
               msg?.videoMessage?.caption || '';
      },

      // ── Mensagens editadas / protocolo ────────────────────────────────────
      editedMessage: () => {
        const e = m.editedMessage?.message?.protocolMessage?.editedMessage;
        return e?.conversation ||
               e?.extendedTextMessage?.text ||
               e?.imageMessage?.caption ||
               e?.videoMessage?.caption ||
               e?.documentMessage?.caption || '';
      },
      protocolMessage: () => {
        const e = m.protocolMessage?.editedMessage;
        return e?.conversation || e?.extendedTextMessage?.text || '';
      },

      // ── Reações ─────────────────
      reactionMessage: () => m.reactionMessage?.text || '',

      // ── Contatos e localização ──
      contactMessage:       () => m.contactMessage?.displayName || '',
      contactsArrayMessage: () => m.contactsArrayMessage?.contacts?.[0]?.displayName || '',
      locationMessage:      () => m.locationMessage?.name || m.locationMessage?.address || '',
      liveLocationMessage:  () => m.liveLocationMessage?.caption || '',

      // ── Pagamentos ──────────────
      sendPaymentMessage:  () => m.sendPaymentMessage?.noteMessage?.extendedTextMessage?.text || '',
      requestPaymentMessage: () => m.requestPaymentMessage?.noteMessage?.extendedTextMessage?.text || '',

      // ── Canal / Newsletter ──────
      newsletterAdminInviteMessage: () => m.newsletterAdminInviteMessage?.caption || '',

      // ── Outros ──────────────────
      productMessage: () => m.productMessage?.product?.description || m.productMessage?.product?.title || '',
      orderMessage:   () => m.orderMessage?.message || '',
      invoiceMessage: () => m.invoiceMessage?.title || '',
      callLogMessage: () => m.callLogMessage?.callOutcome || '',
      pinInChatMessage: () => {
        const msg = m.pinInChatMessage?.message?.message;
        return msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || '';
      },
      scheduledCallCreationMessage: () => m.scheduledCallCreationMessage?.title || '',
    };

    // Se o tipo foi informado e existe no mapa → retorna direto (mais rápido)
    if (mapa[type]) return mapa[type]();

    // ── Fallback inteligente ─────────────────────────────────────
    // Só executa os extractors que realmente podem ter conteúdo nessa mensagem
    for (const [key, extractor] of Object.entries(mapa)) {
      if (m[key] || (key === 'text' && info.text)) {
        const val = extractor();
        if (val) return val;
      }
    }

    return '';
  } catch {
    return '';
  }
};


/**
 * Retorna o tipo real da mensagem do WhatsApp
 * @param {object} info - Objeto completo da mensagem (geralmente `sock.messages`)
 * @returns {string|null} Tipo principal da mensagem ou null
 */
func.getMessageType = (info) => {
  if (!info?.message) return null;

  // Apenas os wrappers de protocolo interno que NUNCA são o tipo principal
  const ignore = new Set([
    'senderKeyDistributionMessage',
    'messageContextInfo',
    'deviceSentMessage',        // wrapper de mensagens enviadas pelo próprio device
  ]);

  const type = Object.keys(info.message).find(k => !ignore.has(k));

  return type || null;
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