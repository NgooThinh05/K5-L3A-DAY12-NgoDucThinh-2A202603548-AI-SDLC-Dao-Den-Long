import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import {
  addLeaderboardEntry,
  sortAndTrimLeaderboard,
  type LeaderboardData,
} from './src/sim/leaderboard.ts';

function leaderboardDevPlugin(): Plugin {
  const lbPath = path.resolve(process.cwd(), 'data', 'leaderboard.json');
  const readEntries = () => {
    try {
      if (!fs.existsSync(lbPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(lbPath, 'utf8')) as Partial<LeaderboardData>;
      return Array.isArray(parsed.entries) ? sortAndTrimLeaderboard(parsed.entries) : [];
    } catch {
      return [];
    }
  };
  return {
    name: 'dao-den-long-leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ entries: readEntries() }));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => {
            body += c;
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
              const updated = addLeaderboardEntry(readEntries(), payload);
              fs.mkdirSync(path.dirname(lbPath), { recursive: true });
              fs.writeFileSync(lbPath, JSON.stringify({ entries: updated }, null, 2) + '\n', 'utf8');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ entries: updated }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            }
          });
          return;
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [leaderboardDevPlugin()],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: false,
  },
});
