import './config/configuracaos.js';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import chalk from 'chalk';

// ─── Configuração ─────────────────────────────────────────────────────────────
const CONFIG = config.atualizacao;

// ─── Estado ───────────────────────────────────────────────────────────────────
let botProcess    = null;
let restartTimer  = null;
let isRestarting  = false;
let startTime     = Date.now();
let totalRestarts = 0;
let crashCount    = 0;

// ─── Utilitários ──────────────────────────────────────────────────────────────
const log = {
  info:    (msg) => console.log(chalk.cyan(`[WATCHER] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[WATCHER] ${msg}`)),
  warn:    (msg) => console.log(chalk.yellow(`[WATCHER] ⚠ ${msg}`)),
  error:   (msg) => console.log(chalk.red(`[WATCHER] ✖ ${msg}`)),
  change:  (msg) => console.log(chalk.magenta(`[WATCHER] ${msg}`)),
  git:     (msg) => console.log(chalk.blue(`[GIT]     ${msg}`)),
};

function formatUptime() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function timestamp() {
  return new Date().toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── Git auto-commit & push ───────────────────────────────────────────────────
function gitCommitAndPush() {
  if (!CONFIG.gitAutoCommit) return;

  try {
    log.git('A verificar alterações...');
    execSync('git add -A', { stdio: 'ignore' });

    try {
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
      log.git('Sem alterações para commitar.');
      return;
    } catch {
      // há alterações staged → prosseguir
    }

    const mensagens = [
      `🔧 atualização automática – ${timestamp()}`,
      `🚀 deploy automático – ${timestamp()}`,
      `⚡ mudanças salvas – ${timestamp()}`,
      `🛠️ ajustes no bot – ${timestamp()}`,
      `📦 novo update – ${timestamp()}`,
    ];
    const msg = mensagens[Math.floor(Math.random() * mensagens.length)];

    log.git(`A commitar: "${msg}"`);
    execSync(`git commit -m "${msg}"`, { stdio: 'ignore' });

    log.git('A fazer git push...');
    execSync('git push', { stdio: 'ignore' });

    log.git(chalk.green('✅ Push concluído com sucesso!'));
  } catch (err) {
    log.git(chalk.red(`❌ Erro no git: ${err.message}`));
  }
}

// ─── Iniciar processo do bot ──────────────────────────────────────────────────
function startBot() {
  if (isRestarting) return;

  // Limite de restarts por crash
  if (CONFIG.restartOnCrash && crashCount >= CONFIG.maxRestarts) {
    log.error(`Limite de ${CONFIG.maxRestarts} restarts por crash atingido. Encerrando watcher.`);
    process.exit(1);
  }

  isRestarting = true;
  startTime    = Date.now();

  log.info(`A iniciar o bot → ${chalk.yellow(CONFIG.entryFile)}`);

  botProcess = spawn('node', ['--experimental-vm-modules', CONFIG.entryFile], {
    stdio: CONFIG.showChildLogs ? ['inherit', 'inherit', 'inherit'] : 'ignore',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  botProcess.on('spawn', () => {
    isRestarting = false;
    crashCount   = 0; // reset ao iniciar com sucesso
    log.success(`Bot iniciado! PID: ${chalk.yellow(botProcess.pid)} | Restarts: ${totalRestarts}`);
  });

  botProcess.on('error', (err) => {
    isRestarting = false;
    log.error(`Erro ao iniciar o bot: ${err.message}`);
  });

  botProcess.on('exit', (code, signal) => {
    isRestarting = false;
    if (signal === 'SIGTERM') return;

    if (code !== 0 && code !== null) {
      crashCount++;
      totalRestarts++;
      log.warn(`Bot encerrou com código ${code}. (crash ${crashCount}/${CONFIG.maxRestarts}) Reiniciando em ${CONFIG.restartDelayMs / 1000}s...`);
      if (CONFIG.restartOnCrash) {
        setTimeout(startBot, CONFIG.restartDelayMs);
      }
    }
  });
}

// ─── Parar processo do bot ────────────────────────────────────────────────────
function stopBot(callback) {
  if (!botProcess) {
    callback?.();
    return;
  }

  log.warn('A parar o bot...');
  botProcess.removeAllListeners('exit');
  botProcess.kill('SIGTERM');

  const forceKill = setTimeout(() => {
    if (botProcess) {
      log.error('Timeout — forçando encerramento (SIGKILL)...');
      botProcess.kill('SIGKILL');
    }
  }, 5000);

  botProcess.on('exit', () => {
    clearTimeout(forceKill);
    botProcess = null;
    callback?.();
  });
}

// ─── Restart com git ──────────────────────────────────────────────────────────
function restartBot(changedFile) {
  log.change(`Alteração detetada: ${chalk.yellow(changedFile)}`);
  log.info(`Uptime anterior: ${formatUptime()}`);
  totalRestarts++;

  stopBot(() => {
    gitCommitAndPush();
    log.info('Reiniciando bot...\n');
    console.log(chalk.gray('─'.repeat(50)));
    startBot();
  });
}

// ─── Debounce ─────────────────────────────────────────────────────────────────
function scheduleRestart(filePath) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => restartBot(filePath), CONFIG.debounceMs);
}

// ─── Monitorizar ficheiros ────────────────────────────────────────────────────
function watchPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    log.warn(`Caminho não encontrado (ignorado): ${chalk.yellow(targetPath)}`);
    return;
  }

  const stat = fs.statSync(targetPath);

  if (stat.isDirectory()) {
    fs.watch(targetPath, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename);
      if (!CONFIG.watchExtensions.includes(ext)) return;
      scheduleRestart(path.join(targetPath, filename));
    });
    log.info(`📁 Pasta:    ${chalk.cyan(targetPath)}`);
  } else {
    fs.watch(targetPath, (event) => {
      if (event === 'change') scheduleRestart(targetPath);
    });
    log.info(`📄 Ficheiro: ${chalk.cyan(targetPath)}`);
  }
}

// ─── Encerramento gracioso ────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log('');
  log.warn(`Sinal ${signal} recebido. A encerrar...`);
  stopBot(() => {
    log.info(`Total de restarts nesta sessão: ${totalRestarts}`);
    log.info('Watcher encerrado. Adeus! 👋');
    process.exit(0);
  });
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  log.error(`Erro não tratado no watcher: ${err.message}`);
});

// ─── Inicialização ────────────────────────────────────────────────────────────
console.log(chalk.bold.cyan('\n╔══════════════════════════════╗'));
console.log(chalk.bold.cyan(`║  ${config.info.botNome.padEnd(28)}║`));
console.log(chalk.bold.cyan('╚══════════════════════════════╝\n'));

log.info(`Modo:       Auto-restart + Git ${CONFIG.gitAutoCommit ? chalk.green('ON') : chalk.red('OFF')}`);
log.info(`Entry:      ${CONFIG.entryFile}`);
log.info(`Extensões:  ${CONFIG.watchExtensions.join(', ')}`);
log.info(`Debounce:   ${CONFIG.debounceMs}ms`);
log.info(`Max crashes: ${CONFIG.maxRestarts}`);
console.log('');

log.info('A monitorizar:');
CONFIG.watchPaths.forEach(watchPath);
console.log('');

startBot();
