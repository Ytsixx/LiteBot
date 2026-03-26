import fs from 'fs-extra';

global.config = {};

// ─── Package.json ─────────────────────────────────────────────────────────────
const {
  version,
  author,
  repository,
  type,
  description,
  license,
  name
} = await fs.readJson('./package.json');

// ─── Info do Bot ──────────────────────────────────────────────────────────────
config.info = {
  botNome:      'Base LiteBot ' + version,
  botPrefix:    '.',
  botVersao:    version,
  botType:      type,
  botNomePkg:   name        || 'litebot',
  botDesc:      description || 'Bot WhatsApp',
  botLicense:   license     || 'MIT',
  botAutor:     typeof author === 'string' ? author : author?.name || 'Desconhecido',
  botRepo:      typeof repository === 'string' ? repository : repository?.url || null,
};

// ─── Auto-Reload / Watcher ────────────────────────────────────────────────────
config.atualizacao = {
  entryFile:        './index.js',
  watchPaths:       ['./src', './lib', './index.js', './config', './media'],
  watchExtensions:  ['.js', '.mjs', '.cjs', '.json'],
  debounceMs:       5000,
  showChildLogs:    true,
  restartOnCrash:   true,
  maxRestarts:      10,
  restartDelayMs:   3000,
};

// ─── Sessão / Auth ────────────────────────────────────────────────────────────
config.sessao = {
  pastaAuth:     './qrLite',
  multiDevice:   true,
  printQR:       false,
  qrSmall:       true,
  timeoutMs:     60_000,
};

// ─── Limites & Permissões ─────────────────────────────────────────────────────
config.limites = {
  maxAudioMB:       15,
  maxVideoMB:       50,
  maxImageMB:       5,
  maxDocumentoMB:   20,
  cooldownMs:       2000,
};

// ─── Grupos ───────────────────────────────────────────────────────────────────
config.grupo = {
  apenasAdmins:         false,
  antiLink:             false,
  antiLinkAcao:         'avisar',   // 'avisar' | 'remover' | 'silenciar'
  bemVindo:             true,
  mensagemBemVindo:     'Bem-vindo(a) ao grupo, @user! 👋',
  mensagemSaida:        'Até mais, @user! 👋',
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
config.logs = {
  nivel:         'info',    // 'silent' | 'info' | 'debug' | 'warn' | 'error'
  salvarArquivo: false,
  caminhoLog:    './logs/bot.log',
  mostrarMsgs:   true,
};

// ─── APIs Externas ────────────────────────────────────────────────────────────
config.apis = {
  ytDownload: 'https://acodex.fluxdev.site/api/download/ytmp',
  // openai:  process.env.OPENAI_KEY || null,
};
