import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  type LeaderboardData,
  type LeaderboardEntry,
} from './leaderboard.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getProjectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..'),
    path.resolve(here, '../..'),
    process.cwd(),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'game.contract.json'))) return c;
  }
  return process.cwd();
}

function getLeaderboardPath(root: string): string {
  return path.join(root, 'data', 'leaderboard.json');
}

function readLeaderboard(filePath: string): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LeaderboardData>;
    if (Array.isArray(parsed.entries)) {
      return sortAndTrimLeaderboard(parsed.entries);
    }
  } catch {
    // fallback empty
  }
  return [];
}

function writeLeaderboard(filePath: string, entries: LeaderboardEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const data: LeaderboardData = { entries: sortAndTrimLeaderboard(entries) };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main(): void {
  const argv = process.argv.slice(2);
  const root = getProjectRoot();
  const lbPath = getLeaderboardPath(root);

  // Check --export-leaderboard <out.json>
  const exportIdx = argv.indexOf('--export-leaderboard');
  if (exportIdx !== -1) {
    const outPath = argv[exportIdx + 1];
    if (!outPath) {
      process.stderr.write('Missing output path for --export-leaderboard\n');
      process.exit(1);
    }
    const entries = readLeaderboard(lbPath);
    const outAbs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, JSON.stringify({ entries }, null, 2) + '\n', 'utf8');
    process.exit(0);
  }

  // Otherwise serve production static bundle (dist/web) + /api/leaderboard
  const webRoot = path.join(root, 'dist', 'web');
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    process.stderr.write('dist/web/index.html not found. Please run "npm run build" first.\n');
    process.exit(1);
  }

  const portArgIdx = argv.indexOf('--port');
  const port = portArgIdx !== -1 ? Number(argv[portArgIdx + 1]) || 4173 : Number(process.env.PORT) || 4173;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/api/leaderboard') {
      if (req.method === 'GET') {
        const entries = readLeaderboard(lbPath);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ entries }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as {
              name: string;
              score: number;
              nights_won: number;
              seed: number;
              achieved_at?: string;
            };
            const updated = addLeaderboardEntry(readLeaderboard(lbPath), payload);
            writeLeaderboard(lbPath, updated);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ entries: updated }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }
    }

    const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(webRoot, safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`Đảo Đèn Lồng v1.0.0 đang chạy tại: http://${displayHost}:${port}`);
    console.log('Nhấn Ctrl+C để dừng server.');
  });
}

main();
