import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationEngine } from './engine.ts';
import {
  createDefaultInput,
  type GameContract,
  type InputsFile,
  type ScenarioFile,
} from './types.ts';
import {
  ValidationError,
  validateInputsFile,
  validateScenarioFile,
} from './validators.ts';

interface CliArgs {
  seed: number;
  night: number;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenarioPath?: string;
  inputsPath?: string;
}

function parseIntArg(flag: string, value: string | undefined): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer value for ${flag}: ${value ?? '(missing)'}`);
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Out-of-range integer for ${flag}: ${value}`);
  }
  return n;
}

function parseCliArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let night: number | undefined;
  let ticks: number | undefined;
  let out: string | undefined;
  let snapshotEvery = 10;
  let scenarioPath: string | undefined;
  let inputsPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntArg('--seed', argv[++i]);
        break;
      case '--night':
        night = parseIntArg('--night', argv[++i]);
        break;
      case '--ticks':
        ticks = parseIntArg('--ticks', argv[++i]);
        break;
      case '--out':
        out = argv[++i];
        if (!out) throw new Error('Missing value for --out');
        break;
      case '--snapshot-every':
        snapshotEvery = parseIntArg('--snapshot-every', argv[++i]);
        break;
      case '--scenario':
        scenarioPath = argv[++i];
        if (!scenarioPath) throw new Error('Missing value for --scenario');
        break;
      case '--inputs':
        inputsPath = argv[++i];
        if (!inputsPath) throw new Error('Missing value for --inputs');
        break;
      default:
        throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  if (seed === undefined) throw new Error('Missing required flag: --seed');
  if (night === undefined) throw new Error('Missing required flag: --night');
  if (night !== 1) throw new Error(`Unsupported --night value: ${night} (Phase 1 supports night 1)`);
  if (ticks === undefined || ticks < 0) throw new Error('Missing or invalid required flag: --ticks (>= 0)');
  if (!out) throw new Error('Missing required flag: --out');
  if (snapshotEvery <= 0) throw new Error('--snapshot-every must be a positive integer');

  return { seed, night, ticks, out, snapshotEvery, scenarioPath, inputsPath };
}

function loadContract(): GameContract {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../game.contract.json'),
    path.resolve(here, '../../game.contract.json'),
    path.resolve(process.cwd(), 'game.contract.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as GameContract;
    }
  }
  throw new Error('Could not locate game.contract.json');
}

function readJsonOrExit2(filePath: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`I/O error reading ${label} file "${filePath}": ${msg}\n`);
    process.exit(1);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Invalid JSON in ${label} file "${filePath}": ${msg}\n`);
    process.exit(2);
  }
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`CLI argument error: ${msg}\n`);
    process.exit(1);
  }

  let contract: GameContract;
  try {
    contract = loadContract();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Contract load error: ${msg}\n`);
    process.exit(1);
  }

  let scenario: ScenarioFile | undefined;
  if (args.scenarioPath !== undefined) {
    const raw = readJsonOrExit2(args.scenarioPath, '--scenario');
    try {
      scenario = validateScenarioFile(raw);
    } catch (err) {
      if (err instanceof ValidationError) {
        process.stderr.write(`Invalid --scenario: ${err.message}\n`);
        process.exit(2);
      }
      throw err;
    }
  }

  let inputs: InputsFile | undefined;
  if (args.inputsPath !== undefined) {
    const raw = readJsonOrExit2(args.inputsPath, '--inputs');
    try {
      inputs = validateInputsFile(raw);
    } catch (err) {
      if (err instanceof ValidationError) {
        process.stderr.write(`Invalid --inputs: ${err.message}\n`);
        process.exit(2);
      }
      throw err;
    }
  }

  const engine = new SimulationEngine(contract.tuning, {
    seed: args.seed,
    night: args.night,
    scenario,
  });

  const lines: string[] = [];
  // Snapshot tick 0: after init + scenario setup, BEFORE any input
  lines.push(JSON.stringify(engine.getSnapshot()));

  const stickyInput = createDefaultInput();
  const frames = inputs?.frames ?? [];
  let frameIdx = 0;

  for (let k = 0; k < args.ticks; k++) {
    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx++];
      if (f.move !== undefined) stickyInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) stickyInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) stickyInput.jump = f.jump;
      if (f.interact !== undefined) stickyInput.interact = f.interact;
      if (f.pulse !== undefined) stickyInput.pulse = f.pulse;
      if (f.dash !== undefined) stickyInput.dash = f.dash;
    }

    const res = engine.step(stickyInput);
    for (const ev of res.events) {
      lines.push(JSON.stringify(ev));
    }
    if (res.tick % args.snapshotEvery === 0) {
      lines.push(JSON.stringify(engine.getSnapshot()));
    }
    if (res.state !== 'playing') {
      break;
    }
  }

  lines.push(JSON.stringify(engine.getEndRecord()));

  try {
    const outDir = path.dirname(path.resolve(args.out));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(args.out, lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`I/O error writing --out "${args.out}": ${msg}\n`);
    process.exit(1);
  }
}

main();
