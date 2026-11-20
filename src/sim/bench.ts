import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface BenchArgs {
  seed: number;
  duration: number;
  out: string;
}

interface BrowserBenchPayload {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
  renderer: string;
  screenshot_data_url?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function parseArgs(argv: string[]): BenchArgs {
  let seed = 42;
  let duration = 30;
  let out = 'bench.json';
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--seed':
        seed = Number.parseInt(argv[++i] ?? '', 10);
        break;
      case '--duration':
        duration = Number.parseFloat(argv[++i] ?? '');
        break;
      case '--out':
        out = argv[++i] ?? '';
        break;
      default:
        throw new Error(`Unknown flag: ${argv[i]}`);
    }
  }
  if (!Number.isSafeInteger(seed)) throw new Error('Invalid --seed');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid --duration');
  if (!out) throw new Error('Missing --out');
  return { seed, duration, out };
}

function getProjectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const c of [path.resolve(here, '..'), path.resolve(here, '../..'), process.cwd()]) {
    if (fs.existsSync(path.join(c, 'game.contract.json'))) return c;
  }
  return process.cwd();
}

function findBrowserExecutable(): string {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const platform = process.platform;
  const candidates: string[] = [];

  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const which = spawnSync('which', [bin], { encoding: 'utf8' });
      if (which.status === 0 && which.stdout.trim()) {
        return which.stdout.trim().split('\n')[0];
      }
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'No Chromium-based browser (Chrome/Chromium/Edge) found. Set CHROME_PATH environment variable.',
  );
}

function sampleProcessTreeRssMbAsync(
  pid: number | undefined,
  cb: (mb: number | null) => void,
): void {
  if (!pid) {
    cb(null);
    return;
  }
  if (process.platform === 'win32') {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or $_.ParentProcessId -eq ${pid} } | Measure-Object WorkingSetSize -Sum).Sum`,
      ],
      { timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout) {
          cb(null);
          return;
        }
        const bytes = Number.parseFloat(stdout.trim());
        cb(Number.isFinite(bytes) && bytes > 0 ? Math.round((bytes / (1024 * 1024)) * 10) / 10 : null);
      },
    );
  } else {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) {
        cb(null);
        return;
      }
      const kb = Number.parseFloat(stdout.trim());
      cb(Number.isFinite(kb) && kb > 0 ? Math.round((kb / 1024) * 10) / 10 : null);
    });
  }
}

function killBrowser(proc: ChildProcess): void {
  try {
    if (process.platform === 'win32' && proc.pid) {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  const processStartMs = performance.now();
  let args: BenchArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Bench CLI error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const root = getProjectRoot();
  const webRoot = path.join(root, 'dist', 'web');
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    process.stderr.write('dist/web/index.html not found. Run "npm run build" first.\n');
    process.exit(1);
  }

  const browserExe = findBrowserExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-profile-'));

  let loadMs: number | null = null;
  let peakMemMb: number | null = null;
  let finished = false;
  let browserProc: ChildProcess | null = null;
  let memInterval: ReturnType<typeof setInterval> | null = null;

  const cleanup = (): void => {
    if (memInterval) clearInterval(memInterval);
    if (browserProc) killBrowser(browserProc);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore on Windows locked profile files
    }
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/bench-first-frame' && req.method === 'POST') {
      if (loadMs === null) {
        loadMs = Math.round(performance.now() - processStartMs);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    if (url.pathname === '/api/bench-result' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        if (finished) return;
        finished = true;

        try {
          const payload = JSON.parse(body) as BrowserBenchPayload;
          const result = {
            contract_version: '1.3',
            avg_fps: payload.avg_fps,
            p1_low_fps: payload.p1_low_fps,
            frame_ms_p95: payload.frame_ms_p95,
            frames: payload.frames,
            load_ms: loadMs ?? Math.round(performance.now() - processStartMs),
            peak_mem_mb: peakMemMb,
            vsync_off: true,
            renderer: payload.renderer,
            os: `${os.type()} ${os.release()} (${os.arch()})`,
          };

          const outAbs = path.resolve(args.out);
          fs.mkdirSync(path.dirname(outAbs), { recursive: true });
          fs.writeFileSync(outAbs, JSON.stringify(result, null, 2) + '\n', 'utf8');

          // Save optional screenshot if requested via SAVE_BENCH_SCREENSHOT env var
          if (payload.screenshot_data_url && process.env.SAVE_BENCH_SCREENSHOT) {
            const b64 = payload.screenshot_data_url.replace(/^data:image\/png;base64,/, '');
            const shotPath = path.resolve(process.env.SAVE_BENCH_SCREENSHOT);
            fs.mkdirSync(path.dirname(shotPath), { recursive: true });
            fs.writeFileSync(shotPath, Buffer.from(b64, 'base64'));
          }

          cleanup();
          server.close(() => process.exit(0));
        } catch (err) {
          process.stderr.write(`Bench result error: ${err instanceof Error ? err.message : String(err)}\n`);
          cleanup();
          server.close(() => process.exit(1));
        }
      });
      return;
    }

    const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(webRoot, safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind local benchmark HTTP server');
  }

  const captureFlag = process.env.SAVE_BENCH_SCREENSHOT ? '&capture=1' : '';
  const benchUrl = `http://127.0.0.1:${addr.port}/?bench=1&seed=${args.seed}&duration=${args.duration}${captureFlag}`;
  const chromeFlags = [
    `--app=${benchUrl}`,
    '--window-size=1280,720',
    '--window-position=80,60',
    '--disable-gpu-vsync',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${userDataDir}`,
  ];

  browserProc = spawn(browserExe, chromeFlags, { stdio: 'ignore' });

  // Sample benchmark browser process tree RSS asynchronously every 8s (minimal overhead)
  const sampleMem = (): void => {
    sampleProcessTreeRssMbAsync(browserProc?.pid, (sample) => {
      if (sample !== null) {
        peakMemMb = peakMemMb === null ? sample : Math.max(peakMemMb, sample);
      }
    });
  };
  memInterval = setInterval(sampleMem, 8000);
  setTimeout(sampleMem, 6000).unref();

  // Safety timeout (warmup + duration + 30s margin)
  const timeoutMs = (args.duration + 35) * 1000;
  setTimeout(() => {
    if (!finished) {
      finished = true;
      process.stderr.write(`Benchmark timed out after ${timeoutMs}ms\n`);
      cleanup();
      server.close(() => process.exit(1));
    }
  }, timeoutMs).unref();
}

void main();
