import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationEngine, TICK_RATE } from './engine.ts';
import { createPRNG } from './prng.ts';
import { createDefaultInput, type GameContract, type NightNumber } from './types.ts';

interface SoakArgs {
  seed: number;
  nights: number;
  out: string;
}

function parseIntArg(flag: string, value: string | undefined): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer value for ${flag}: ${value ?? '(missing)'}`);
  }
  return Number.parseInt(value, 10);
}

function parseArgs(argv: string[]): SoakArgs {
  let seed = 7;
  let nights = 10;
  let out = 'soak.json';

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--seed':
        seed = parseIntArg('--seed', argv[++i]);
        break;
      case '--nights':
        nights = parseIntArg('--nights', argv[++i]);
        break;
      case '--out':
        out = argv[++i] ?? '';
        break;
      default:
        throw new Error(`Unknown flag: ${argv[i]}`);
    }
  }
  if (nights <= 0) throw new Error('--nights must be > 0');
  if (!out) throw new Error('--out is required');
  return { seed, nights, out };
}

function loadContract(): GameContract {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../game.contract.json'),
    path.resolve(here, '../../game.contract.json'),
    path.resolve(process.cwd(), 'game.contract.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return JSON.parse(fs.readFileSync(c, 'utf8')) as GameContract;
    }
  }
  throw new Error('Could not locate game.contract.json');
}

function rssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function main(): void {
  let args: SoakArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Soak CLI error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const contract = loadContract();
  const t0 = performance.now();

  // Warm up V8 JIT across all simulation code paths (movement, dash, pulse, wind, drifters, shades)
  // so one-time TurboFan compilation overhead doesn't artificially depress mem_start_mb.
  {
    const warm = new SimulationEngine(contract.tuning, { seed: 9999, night: 3 });
    const warmRng = createPRNG(9999);
    const inp = createDefaultInput();
    for (let k = 0; k < 3000; k++) {
      if (k % 30 === 0) {
        const a = warmRng.range(0, Math.PI * 2);
        inp.move = [Math.cos(a), Math.sin(a)];
      }
      inp.jump = warmRng.next() < 0.05;
      inp.dash = warmRng.next() < 0.03;
      inp.pulse = warmRng.next() < 0.02;
      inp.interact = warmRng.next() < 0.1;
      const r = warm.step(inp);
      if (r.state === 'won' || r.state === 'lost') break;
    }
  }

  let crashes = 0;
  const results: Array<'won' | 'lost'> = [];
  let memStartMb = 0;

  for (let i = 0; i < args.nights; i++) {
    const night = ((i % 3) + 1) as NightNumber;
    const nightSeed = args.seed + i;
    const maxTicks =
      (night === 1
        ? contract.tuning.night1_duration_s
        : night === 2
          ? contract.tuning.night2_duration_s
          : contract.tuning.night3_duration_s) * TICK_RATE;

    try {
      let engine: SimulationEngine | null = new SimulationEngine(contract.tuning, {
        seed: nightSeed,
        night,
      });

      if (i === 0) {
        memStartMb = rssMb();
      }

      const inputRng = createPRNG((nightSeed * 2654435761) >>> 0);
      const input = createDefaultInput();
      let moveAngle = inputRng.range(0, Math.PI * 2);
      input.move = [Math.cos(moveAngle), Math.sin(moveAngle)];

      for (let tick = 0; tick < maxTicks; tick++) {
        if (tick > 0 && tick % 30 === 0) {
          moveAngle = inputRng.range(0, Math.PI * 2);
          input.move = [Math.cos(moveAngle), Math.sin(moveAngle)];
        }
        input.jump = inputRng.next() < 0.05;
        input.dash = inputRng.next() < 0.03;
        input.pulse = inputRng.next() < 0.02;
        input.interact = inputRng.next() < 0.1;

        const res = engine.step(input);
        if (res.state === 'won' || res.state === 'lost') {
          break;
        }
      }

      const finalState = engine.getState();
      results.push(finalState === 'won' ? 'won' : 'lost');
      // Release engine reference for clean reset
      engine = null;
    } catch (err) {
      crashes++;
      results.push('lost');
      process.stderr.write(`Crash on night index ${i}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  const memEndMb = rssMb();
  const durationS = Math.round(((performance.now() - t0) / 1000) * 10) / 10;

  const output = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS,
  };

  const outAbs = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(output, null, 2) + '\n', 'utf8');
}

main();
