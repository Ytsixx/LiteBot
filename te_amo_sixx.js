import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import chalk from 'chalk';

// ─── Configuração ─────────────────────────────────────────────────────────────
const CONFIG = {
  entryFile: './index.js',
  watchPaths: ['./src', './lib', './index.js', './config', 'media'],
  watchExtensions: ['.js', '.mjs', '.json', '.cjs'],
  debounceMs: 5000,
  showChildLogs: true,
};

// ─── Estado ───────────────────────────────────────────────────────────────────
let botProcess = null;
let restartTimer = null;
let isRestarting = false;
let startTime = Date.now();

// ─── Utilitários ──────────────────────────────────────────────────────────────
const log = {
  info:    (msg) => console.log(chalk.cyan(`[WATCHER] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[WATCHER] ${msg}`)),
  warn:    (msg) => console.log(chalk.yellow(`[WATCHER]  ${msg}`)),
  error:   (msg) => console.log(chalk.red(`[WATCHER] ${msg}`)),
  change:  (msg) => console.log(chalk.magenta(`[WATCHER] ${msg}`)),
  git:     (msg) => console.log(chalk.blue(`[GIT]     ${msg}`)),
};

function formatUptime() {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ─── Git auto-commit (VERSÃO CORRIGIDA E MELHORADA) ──────────────────────────
function gitCommitAndPush() {
  try {
    // 1. Adiciona TODAS as alterações (novos ficheiros, modificados e deletados)
    log.git('A fazer git add -A...');
    execSync('git add -A', { stdio: 'ignore' });

    // 2. Verifica se realmente há algo para commitar
    try {
      execSync('git diff --cached --quiet', { stdio: 'ignore' });
      log.git('Sem alterações para commitar.');
      return;
    } catch {
      // Se chegou aqui → existem alterações staged → vamos commitar
    }

    const now = new Date();
    const timestamp = now.toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const comentarios = [
      `🔧 atualização automática – ${timestamp}`,
      `🚀 deploy automático – ${timestamp}`,
      `⚡ mudanças salvas – ${timestamp}`,
      `🛠️ ajustes no bot – ${timestamp}`,
      `📦 novo update – ${timestamp}`,
    ];
    const mensagem = comentarios[Math.floor(Math.random() * comentarios.length)];

    log.git(`A commitar: "${mensagem}"`);
    execSync(`git commit -m "${mensagem}"`, { stdio: 'ignore' });

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
  isRestarting = true;
  startTime = Date.now();

  log.info(`A iniciar o bot → ${CONFIG.entryFile}`);

  botProcess = spawn('node', ['--experimental-vm-modules', CONFIG.entryFile], {
    stdio: CONFIG.showChildLogs ? ['inherit', 'inherit', 'inherit'] : 'ignore',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  botProcess.on('spawn', () => {
    isRestarting = false;
    log.success(`Bot iniciado! PID: ${botProcess.pid}`);
  });

  botProcess.on('error', (err) => {
    isRestarting = false;
    log.error(`Erro ao iniciar o bot: ${err.message}`);
  });

  botProcess.on('exit', (code, signal) => {
    isRestarting = false;
    if (signal === 'SIGTERM') return;
    if (code !== 0 && code !== null) {
      log.warn(`Bot encerrou com código ${code}. A reiniciar em 3s...`);
      setTimeout(startBot, 3000);
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
      log.error('Forçando encerramento (SIGKILL)...');
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

  stopBot(() => {
    // 1. Commita e faz push (agora funciona sempre que houver mudanças)
    gitCommitAndPush();

    // 2. Só depois reinicia o bot
    log.info('Reiniciando bot...\n');
    console.log(chalk.gray('─'.repeat(50)));
    startBot();
  });
}

// ─── Debounce ─────────────────────────────────────────────────────────────────
function scheduleRestart(filePath) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartBot(filePath);
  }, CONFIG.debounceMs);
}

// ─── Monitorizar ficheiros ────────────────────────────────────────────────────
function watchPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    log.warn(`Caminho não encontrado (será ignorado): ${targetPath}`);
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
    log.info(`A monitorizar pasta: ${chalk.cyan(targetPath)}`);
  } else {
    fs.watch(targetPath, (event) => {
      if (event === 'change') scheduleRestart(targetPath);
    });
    log.info(`A monitorizar ficheiro: ${chalk.cyan(targetPath)}`);
  }
}

// ─── Encerramento gracioso ────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log('');
  log.warn(`Sinal ${signal} recebido. A encerrar...`);
  stopBot(() => {
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
log.info('Modo: Auto-restart + Git auto-commit ativado');
log.info(`Extensões vigiadas: ${CONFIG.watchExtensions.join(', ')}`);
log.info(`Debounce: ${CONFIG.debounceMs}ms`);
console.log('');

CONFIG.watchPaths.forEach(watchPath);
console.log('');

startBot();