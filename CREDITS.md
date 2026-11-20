# Credits & Attributions

## Original Concept & World
- **Đảo Đèn Lồng** (Mây, Đảo Bến, Đảo Cau, Đảo Chuông, Đèn Lồng Lớn, Đom Đóm, Bóng Mực, Gió Lạc, Bùa Gió): Original game specification for Day 12 — AI SDLC Lab.

## 3D Models, Outfits, Shaders & Visuals
- All 3D geometry — including all 4 playable characters (Mây in Vietnamese White Áo Dài, Linh in Hanbok, Mộc in Forest Elf tunic, Sao in Ice Princess gown built procedurally with `LatheGeometry` and smooth curves), 4 themed islands, 4 ghost variants, Great Lantern shrines with 3D fuel gauges, GPU-instanced benchmark entities (`THREE.InstancedMesh`), wind leaves, and particle VFX — is **100% procedurally generated in TypeScript** using [Three.js](https://threejs.org/) (MIT License).
- No external copyrighted 3D models, textures, fonts, or image assets are used.

## Audio
- All background pentatonic night ambiance and sound effects (pickup chimes, lantern gong, refuel chime, pulse shimmer, dash whoosh, hit thud, win/loss cues) are **100% procedurally synthesized** at runtime via the browser **Web Audio API**. No external audio files are used.

## Open-Source Libraries & Tooling
- **Three.js** (`^0.170.0`) — MIT License
- **Vite** (`^6.1.0`) — MIT License
- **TypeScript** (`^5.7.3`) — Apache-2.0 License
- **esbuild** (`^0.25.0`) — MIT License
- **tsx** (`^4.19.2`) — MIT License
- **Node.js** (`>= 20`) — MIT License

## AI Tools Used
- **Antigravity (Google DeepMind)** — Assisted with architecture design, deterministic simulation core (`src/sim/`), Three.js 3D rendering (`src/web/`), benchmark/soak automation, accessibility UI, automated Test Contract verification, and SDLC documentation under developer direction, testing, and review.
