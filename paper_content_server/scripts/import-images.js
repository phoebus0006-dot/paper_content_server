#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const APP_CONFIG = loadJson(path.join(ROOT_DIR, 'config.json'), {});
const IMAGES_DIR = path.isAbsolute(APP_CONFIG.imageRoot || 'images')
  ? APP_CONFIG.imageRoot
  : path.join(ROOT_DIR, APP_CONFIG.imageRoot || 'images');

const THEMES = ['双人对话', '人物出场', '大远景', '夜景', '逆光', '群像', '悬疑', '运动镜头', '色彩搭配'];
const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;

function parseArgs(argv) {
  const args = { from: null, kind: 'shot', theme: null, dryRun: false, help: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if ((arg === '--from' || arg === '-f') && next) {
      args.from = next;
      i++;
    } else if (arg.startsWith('--from=')) {
      args.from = arg.slice(7);
    } else if ((arg === '--kind' || arg === '-k') && next) {
      args.kind = next.toLowerCase();
      i++;
    } else if (arg.startsWith('--kind=')) {
      args.kind = arg.slice(7).toLowerCase();
    } else if ((arg === '--theme' || arg === '-t') && next) {
      args.theme = next;
      i++;
    } else if (arg.startsWith('--theme=')) {
      args.theme = arg.slice(8);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
import-images.js — 本地素材库导入工具

将图片从本地目录复制到 images/shots/<theme>/ 或 images/storyboard/<theme>/。

用法:
  node scripts/import-images.js --from "D:\\素材\\电影截图" --kind shot --theme 夜景
  node scripts/import-images.js --from "D:\\素材\\分镜" --kind storyboard --theme 双人对话
  node scripts/import-images.js --from "D:\\素材" --dry-run

选项:
  --from, -f <path>     源目录路径（必填）
  --kind, -k <type>     图片类型: shot（电影镜头）| storyboard（分镜稿），默认 shot
  --theme, -t <name>    主题名称，默认自动检测目录名，不匹配则提示
  --dry-run             只预览不复制
  --help, -h            显示帮助

支持格式: jpg, jpeg, png, webp
已存在的文件（同名同大小）跳过，不会覆盖。

主题列表:
  ${THEMES.join('、')}
`);
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.from) {
    console.error('错误: --from 是必填参数');
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(args.from)) {
    console.error(`错误: 源目录不存在: ${args.from}`);
    process.exit(1);
  }

  let kind = args.kind;
  if (kind !== 'shot' && kind !== 'storyboard') {
    console.error(`错误: --kind 必须是 shot 或 storyboard，收到: ${kind}`);
    process.exit(1);
  }

  let theme = args.theme;
  if (theme && !THEMES.includes(theme)) {
    console.error(`错误: 未知主题 "${theme}"。可用主题: ${THEMES.join(', ')}`);
    process.exit(1);
  }

  const kindDir = kind === 'storyboard' ? 'storyboard' : 'shots';

  // Scan source directory
  const files = [];
  async function scanDir(dirPath) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await scanDir(absolute);
      } else if (ALLOWED_EXT.test(entry.name)) {
        const stat = await fsp.stat(absolute);
        files.push({ path: absolute, name: entry.name, size: stat.size });
      }
    }
  }

  await scanDir(args.from);

  if (!files.length) {
    console.log('未找到图片文件 (jpg/png/webp)');
    return;
  }

  // Auto-detect theme from directory name if not specified
  if (!theme) {
    const dirName = path.basename(path.resolve(args.from));
    const matched = THEMES.find((t) => dirName.includes(t));
    if (matched) {
      theme = matched;
      console.log(`自动检测主题: "${theme}" (基于目录名 "${dirName}")`);
    } else {
      console.error(`错误: 无法从目录名 "${dirName}" 推断主题，请用 --theme 指定。`);
      console.error(`可用主题: ${THEMES.join(', ')}`);
      process.exit(1);
    }
  }

  const targetDir = path.join(IMAGES_DIR, kindDir, theme);
  await ensureDir(targetDir);

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const targetPath = path.join(targetDir, file.name);

    // Skip if exact same file exists (same name + same size)
    if (fs.existsSync(targetPath)) {
      const targetStat = await fsp.stat(targetPath);
      if (targetStat.size === file.size) {
        skipped++;
        continue;
      }
      // Size differs: add a suffix to avoid overwrite
      const ext = path.extname(file.name);
      const base = path.basename(file.name, ext);
      const dedupPath = path.join(targetDir, `${base}_${Date.now()}${ext}`);
      if (args.dryRun) {
        console.log(`[DRY-RUN] 复制 (重命名): ${file.path} → ${dedupPath}`);
      } else {
        await fsp.copyFile(file.path, dedupPath);
        copied++;
      }
      continue;
    }

    if (args.dryRun) {
      console.log(`[DRY-RUN] 复制: ${file.path} → ${targetPath}`);
    } else {
      try {
        await fsp.copyFile(file.path, targetPath);
        copied++;
      } catch (error) {
        console.error(`失败: ${file.path} → ${error.message}`);
        failed++;
      }
    }
  }

  if (args.dryRun) {
    console.log(`\nDRY-RUN 完成: 发现 ${files.length} 个文件，将复制到 ${targetDir}`);
  } else {
    console.log(`导入完成: ${copied} 已复制, ${skipped} 已跳过, ${failed} 失败 → ${targetDir}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
