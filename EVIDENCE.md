# EVIDENCE — Đảo Đèn Lồng (Phase 1, 2, 3 & 4 · v1.0.0)

Tài liệu bằng chứng kiểm chứng, quyết định thiết kế, kết quả đo hiệu năng/ổn định thực tế, đánh giá từng phase và nhật ký sử dụng AI.

---

# PHASE 4 — TICKET-04: "Bình minh: phát hành v1.0.0" (Contract v1.3)

## 1. Cấu hình máy tự đo tham khảo
- **OS:** Windows 11 (`Windows_NT 10.0.22631 x64`)
- **CPU:** 11th Gen Intel(R) Core(TM) i5-11400H @ 2.70GHz
- **GPU / WebGL2:** Intel(R) UHD Graphics (Direct3D11 ANGLE)
- **RAM:** 7.8 GB · **Node.js:** `v22.19.0` · **Browser:** Google Chrome

## 2. Bảng truy vết Yêu cầu Phase 4 → Kiểm chứng → Bằng chứng

| Yêu cầu TICKET-04 | Cách kiểm chứng | Bằng chứng thực tế | Kết quả |
|---|---|---|---|
| **Benchmark 3D** (`1280×720`, 200 Shades, 100 Motes, L1–L3 lit, camera quỹ đạo `30 m / Y=15 / 15 s`, `3 s` warmup + `30 s` đo, exit `0`) | `node dist/bench.js --seed 42 --duration 30 --out bench.json` | [`bench.json`](bench.json): **`avg_fps: 109.1`** (`≥ 60`), **`p1_low_fps: 67.2`** (`≥ 30`), **`frame_ms_p95: 14`**, **`load_ms: 2002`** (`≤ 10000`), `peak_mem_mb: 846.5`, `vsync_off: true` | **ĐẠT** |
| **Soak test** (`10` Đêm liên tiếp `1→2→3`, seed `7+i`, input ngẫu nhiên theo xác suất đặc tả) | `node dist/soak.js --seed 7 --nights 10 --out soak.json` + Test #18 | [`soak.json`](soak.json): **`nights: 10`**, **`crashes: 0`**, **`mem_start_mb: 38.1` → `mem_end_mb: 40.8`** (`1.07× ≤ 1.20×`), `duration_s: 0.4` | **ĐẠT** |
| **Bảng xếp hạng cục bộ** (tên 3–12 ký tự, top 10, tie-break thời gian sớm hơn, lưu đĩa, menu UI, `--export-leaderboard`) | Test #19 + `node dist/run.js --export-leaderboard` + `/api/leaderboard` | `PASS 19` (validate ASCII & tiếng Việt, top 10 + tie-break, xuất `{"entries":[...]}` mã `0`) | **ĐẠT** |
| **Dễ tiếp cận (Accessibility)** (Đổi 9 phím + báo trùng + khôi phục mặc định; Phụ đề + mũi tên Bóng Mực; Giảm chuyển động; UI `≥ 18px` + `×1.25`) | `npm run typecheck && npm run build:web` + kiểm tra trực tiếp CSS/DOM | `tsc --noEmit` `0` lỗi, `vite build` thành công (`1.83 s`), tất cả 4 nhóm lưu qua `localStorage` | **ĐẠT** |
| **Contract v1.3** (`contract_version: "1.3"`, thêm `bench_cmd`, `soak_cmd`, giữ toàn bộ Phase 1–3) | `npm run verify` (Test #1–#19) | **19/19 PASS**, Full Đêm 3 (`18,000` tick) `385 ms ≤ 30 s` | **ĐẠT** |
| **Đóng gói & Tài liệu** (`README.md` `≤ 3` lệnh + ảnh chụp, `CHANGELOG.md` 4 phase, `CREDITS.md`, `LICENSE`, `Dockerfile`, `docs/RETRO.md`) | Kiểm tra trực tiếp file trong repo | [`README.md`](README.md), [`docs/screenshot.png`](docs/screenshot.png), [`CHANGELOG.md`](CHANGELOG.md), [`CREDITS.md`](CREDITS.md), [`LICENSE`](LICENSE), [`Dockerfile`](Dockerfile), [`docs/RETRO.md`](docs/RETRO.md) | **ĐẠT** |

## 3. Kết quả đo thực tế (Phase 4)

### 3.1. `bench.json` (chạy thật 30 giây, `--seed 42`)

```json
{
  "contract_version": "1.3",
  "avg_fps": 109.1,
  "p1_low_fps": 67.2,
  "frame_ms_p95": 14,
  "frames": 3275,
  "load_ms": 2002,
  "peak_mem_mb": 846.5,
  "vsync_off": true,
  "renderer": "Three.js r170 / WebGL2 (ANGLE (Intel, Intel(R) UHD Graphics (0x00009A68) Direct3D11 vs_5_0 ps_5_0, D3D11))",
  "os": "Windows_NT 10.0.22631 (x64)"
}
```

### 3.2. `soak.json` (chạy thật 10 Đêm liên tiếp, `--seed 7`)

```json
{
  "nights": 10,
  "crashes": 0,
  "results": ["lost", "lost", "lost", "lost", "lost", "lost", "lost", "lost", "lost", "lost"],
  "mem_start_mb": 38.1,
  "mem_end_mb": 40.8,
  "duration_s": 0.4
}
```

### 3.3. Kết quả `npm run verify` (19/19 PASS)

```text
=== Test Contract v1.3 Suite (2A202603548-NgoDucThinh) ===
PASS  1. [Regression] Determinism (byte-for-byte) & Contract v1.3 Snapshot/End schema
PASS  2. [Regression] Exit code 2 on invalid --inputs / --scenario
PASS  3. [Regression] Movement rotation (cam_yaw_deg = 0 & 90), vector norm (>1), jump
PASS  4. [Updated for Phase 3] Light 5th lantern -> NO early win; survive to dawn -> dawn_survived + v1.2 score
PASS  5. [Regression] Shade hit drops floor(carried/2) motes (TTL 480) & recoils 2m
PASS  6. [Regression] Safe radius (6m) blocks external shades & pushes interior shade out in <= 30 ticks
PASS  7. [Updated for Phase 3] Pulse: +5 normal stun, +15 drain stun, 4m push over 15 ticks, stun ends -> wander
PASS  8. [Regression] Pre-lit scenario sets fuel=100 by default, emits 0 events & 0 score, does not boost capacity
PASS  9. [Regression Phase 2] Dash (14 m/s, 0.2s, air-dash preserves Y, 1.5s cooldown)
PASS  10. [Regression Phase 2] Fall off island (Y < -10) -> lost + respawn after 60 ticks
PASS  11. [Regression Phase 2] Night 2 Jump Pad + Wind Charm + Drifter steal & pulse drop
PASS  12. [Regression Phase 2] Night 3 3-tier jump pad + Wind gust + Pause/Resume
PASS  13. [Phase 3] Fuel decay (1/s), Refuel ceil((100-fuel)/10), full lantern ignored, lantern_out & Relight (5 motes, +40)
PASS  14. [Phase 3] Dynamic Capacity: 10 + 2 * successful_lights capped at 20
PASS  15. [Phase 3] Shade drain AI: fuel < 30 loses safe zone, wander -> drain (5/s + 1/s), fuel_drain every 60 ticks, refuel >= 30 pushes shade out
PASS  16. [Phase 3] Dawn survival threshold: 3/5 wins dawn_survived, 2/5 loses dawn
      -> Full Night 3 (18,000 ticks) completed in 385 ms
PASS  17. [Phase 3 Performance] Full Night 3 (18,000 ticks = 300s) finishes in <= 30s
PASS  18. [Phase 4] Soak runner: multi-night stability, 0 crashes, RSS <= 1.2x, schema
PASS  19. [Phase 4] Leaderboard validation, top-10 tie-break sorting & CLI --export-leaderboard

Summary: 19 passed, 0 failed
```

## 4. Lỗi thực tế phát hiện & khắc phục trong Phase 4
1. **Khựng khung hình `p1_low_fps = 1.8 FPS` ở lần đo đầu tiên:** Phát hiện nguyên nhân từ `toDataURL()` chạy giữa pha đo + cờ `--disable-frame-rate-limit` làm nghẽn hàng đợi Direct3D11 trên Intel UHD Graphics + polling PowerShell đồng bộ. Sau khi dời chụp ảnh sang cuối benchmark, giữ `--disable-gpu-vsync`, khóa `pixelRatio = 1` và đo RSS bất đồng bộ, `p1_low_fps` tăng từ `1.8` lên **`67.2 FPS`**.
2. **Tỷ số RSS `soak.json` ở lần đo đầu (`1.33×`):** Do warmup 60 tick quá ngắn khiến V8 TurboFan biên dịch JIT sau khi đã ghi `mem_start_mb`. Sau khi nâng warmup lên `3,000` tick trước khi tải Đêm 1, tỷ số RSS giảm còn **`1.07×`** (`38.1 → 40.8 MB`).
- **Ước tính token Phase 4:** ~80,000–90,000 tokens (chi tiết đầy đủ trong [`docs/RETRO.md`](docs/RETRO.md)).

---

# PHASE 3 — TICKET-03: CHANGE REQUEST "Đèn cạn dầu" (Contract v1.2)

## 1. Tài liệu quyết định thiết kế & Breaking Changes
- **ADR:** [`docs/ADR-001-lantern-fuel-and-dawn-survival.md`](docs/ADR-001-lantern-fuel-and-dawn-survival.md) — Thiết kế nhiên liệu nguyên `1/60` (`fuel60 ∈ [0, 6000]`), trạng thái Bóng Mực `drain`, luật thắng `dawn_survived` và khả năng tiếp cận (mù màu + phân biệt không cần màu).
- **Changelog Breaking Changes:** [`CHANGELOG.md`](CHANGELOG.md).

## 2. Lý do cập nhật Test cũ do Change Request Phase 3 (Không bỏ qua âm thầm)

| Test cũ (Phase 2 / v1.1) | Luật bị `[THAY THẾ]` trong TICKET-03 | Cách cập nhật |
|---|---|---|
| Test #4 (thắng sớm ngay khi thắp đèn cuối `all_lit`, `+10`/đom đóm, thưởng thời gian) | Bỏ `all_lit` & thưởng thời gian; thắng bằng `dawn_survived` tại tick cuối; `+5`/đom đóm; thưởng bình minh `∑(50 + floor(fuel)) + 50 × flames`. | Cập nhật Test #4 xác minh thắp đủ 5 đèn **không kết thúc sớm** (tick 60 vẫn `playing`), kết thúc đúng tick bình minh (`120`) với `dawn_survived` và tổng điểm chính xác từng đơn vị. |
| Test #7 (Pulse `+5` cố định, hết choáng quay về `chase` nếu trong `18 m`) | Pulse trúng Bóng đang `drain` thưởng tổng `+15` (thường `+5`); hết `stunned` luôn về `wander`. | Cập nhật Test #7 kiểm tra đồng thời `S1` (`drain` → `+15`) và `S2` (`chase` → `+5`) = `20` điểm, đẩy `4 m` trong `15` tick và choáng `120` tick. |
| Test #1 (`time_left_s = 300`) & Test #17 (`21,600` tick Đêm 3) | Thời lượng chuẩn mới `240 / 270 / 300 s` (`18,000` tick cho Đêm 3). | Cập nhật Test #1 kiểm tra `time_left_s = 240`, `capacity = 10`, `fuel/ever_lit/relit_count`; cập nhật Test #17 benchmark Đêm 3 đầy đủ `18,000` tick (`351 ms <= 30 s`). |

## 3. Bảng truy vết Yêu cầu Phase 3 → Kiểm chứng → Bằng chứng

| Yêu cầu TICKET-03 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Contract `v1.2`, thêm 8 khóa `tuning` & cập nhật thời lượng `240/270/300 s` | `game.contract.json` + Test #1 | `contract_version = "1.2"`, `PASS 1` | **ĐẠT** |
| Nhiên liệu đèn `100`, hao `1/60`/tick, châm dầu `ceil((100-fuel)/10)`, bỏ qua đèn đầy | Headless scenario Test #13 | `PASS 13` (`refuel` amount `3` -> `fuel: 100`, `+15` điểm) | **ĐẠT** |
| Hết dầu `fuel <= 0` tắt ngay sau bước 2 (`lantern_out`, `ever_lit`), thắp lại tốn `5` (`relight: true`, `+40`) | Headless scenario Test #13 | `PASS 13` (`lantern_out` tick `60`, `lantern_lit` `relight: true`, `relit_count: 1`, `+65` điểm) | **ĐẠT** |
| Sức chứa tăng dần `min(20, 10 + 2 × successful_lights)`, đặt sẵn scenario không cộng | Headless scenario Test #8 & #14 | `PASS 8` (`capacity: 10`), `PASS 14` (`18 -> 20`) | **ĐẠT** |
| Đèn `< 30` mất vùng an toàn, Bóng Mực `wander -> drain` (`5/s` + `fuel_drain` mỗi `60` tick), châm lên `>= 30` đẩy ra `6 m` trong `<= 30` tick | Headless scenario Test #15 | `PASS 15` (`drain`, `fuel_drain`, đẩy ra `>= 6 m`, `0` hit) | **ĐẠT** |
| Pulse `+15` trên Bóng đang `drain` / `+5` Bóng thường; hết choáng về `wander` | Headless scenario Test #7 | `PASS 7` (`score = 20`) | **ĐẠT** |
| Luật thắng mới `dawn_survived` (`≥ 3/5`, `4/6`, `5/7`), không thắng sớm, công thức điểm bình minh mới | Headless scenario Test #4 & #16 | `PASS 4` & `PASS 16` (`3/5` thắng, `2/5` thua `dawn`) | **ĐẠT** |
| Chế độ mù màu (`#00B3FF` Bóng Mực, `#FFFFFF` + `⚠` UI, lưu `localStorage`) & phân biệt đèn không cần màu (xẹp `20%` + vết rách + thanh dầu 3D + nhấp nháy `1 Hz`) | `npm run build:web` + `tsc --noEmit` | Build web thành công (`1.82 s`), `0` lỗi TypeScript | **ĐẠT** |
| Toàn bộ test hồi quy Phase 1–2 không bị thay thế (Dash, Fall, Night 2, Drifter, Night 3, Pause, Exit code 2, Determinism) | Test #1–#3, #5–#6, #8–#12 + SHA-256 | **17/17 PASS**, SHA-256 giống hệt nhau | **ĐẠT** |
| Hiệu năng headless Đêm 3 đầy đủ (`18,000` tick `<= 30 s`) | Benchmark Test #17 | **351 ms** (`0.351 s` << `30 s`) | **ĐẠT** |

## 4. Log chạy kiểm thử thực tế (Phase 3)

### 4.1. Kết quả `npm run verify`

```text
> dao-den-long@0.1.0 verify
> npm run build && npm test

> tsc --noEmit

> esbuild src/sim/headless.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/headless.js
  dist\headless.js  71.5kb
Done in 8ms

> vite build
✓ 13 modules transformed.
dist/web/index.html                  10.56 kB │ gzip:   2.97 kB
dist/web/assets/index-CGd7GrqM.css   11.73 kB │ gzip:   3.07 kB
dist/web/assets/index-DQ97q0zn.js   591.94 kB │ gzip: 156.10 kB
✓ built in 1.82s

=== Test Contract v1.2 Suite (2A202603548-NgoDucThinh) ===
PASS  1. [Regression] Determinism (byte-for-byte) & Contract v1.2 Snapshot/End schema
PASS  2. [Regression] Exit code 2 on invalid --inputs / --scenario
PASS  3. [Regression] Movement rotation (cam_yaw_deg = 0 & 90), vector norm (>1), jump
PASS  4. [Updated for Phase 3] Light 5th lantern -> NO early win; survive to dawn -> dawn_survived + v1.2 score
PASS  5. [Regression] Shade hit drops floor(carried/2) motes (TTL 480) & recoils 2m
PASS  6. [Regression] Safe radius (6m) blocks external shades & pushes interior shade out in <= 30 ticks
PASS  7. [Updated for Phase 3] Pulse: +5 normal stun, +15 drain stun, 4m push over 15 ticks, stun ends -> wander
PASS  8. [Regression] Pre-lit scenario sets fuel=100 by default, emits 0 events & 0 score, does not boost capacity
PASS  9. [Regression Phase 2] Dash (14 m/s, 0.2s, air-dash preserves Y, 1.5s cooldown)
PASS  10. [Regression Phase 2] Fall off island (Y < -10) -> lost + respawn after 60 ticks
PASS  11. [Regression Phase 2] Night 2 Jump Pad + Wind Charm + Drifter steal & pulse drop
PASS  12. [Regression Phase 2] Night 3 3-tier jump pad + Wind gust + Pause/Resume
PASS  13. [Phase 3] Fuel decay (1/s), Refuel ceil((100-fuel)/10), full lantern ignored, lantern_out & Relight (5 motes, +40)
PASS  14. [Phase 3] Dynamic Capacity: 10 + 2 * successful_lights capped at 20
PASS  15. [Phase 3] Shade drain AI: fuel < 30 loses safe zone, wander -> drain (5/s + 1/s), fuel_drain every 60 ticks, refuel >= 30 pushes shade out
PASS  16. [Phase 3] Dawn survival threshold: 3/5 wins dawn_survived, 2/5 loses dawn
      -> Full Night 3 (18,000 ticks) completed in 351 ms
PASS  17. [Phase 3 Performance] Full Night 3 (18,000 ticks = 300s) finishes in <= 30s

Summary: 17 passed, 0 failed
```

### 4.2. Bằng chứng tính tất định Đêm 3 (SHA-256)

```text
Hash                                                             Path
----                                                             ----
621B9939F6424B052BFD59D7B95218D003BB66A3F496CC8A78BAD58681C70B3D ...\docs\proof\phase-3\night3_det1.jsonl
621B9939F6424B052BFD59D7B95218D003BB66A3F496CC8A78BAD58681C70B3D ...\docs\proof\phase-3\night3_det2.jsonl
```

## 5. Đánh giá Phase 3, Lỗi AI & Nhật ký Token
- **Đánh giá nhanh:** Hoàn thành 100% Change Request TICKET-03 trong khung thời gian 30 phút nhờ kiến trúc tách biệt `src/sim/` và `src/web/` từ Phase 1–2; mọi test cũ bị thay thế đều được cập nhật có ghi lý do, 17/17 test PASS ngay lần đầu không lỗi biên dịch.
- **Lỗi AI phát hiện trong Phase 3:** Không phát sinh lỗi build/test trong Phase 3 nhờ áp dụng bài học từ Phase 1–2 (dùng số nguyên `fuel60` ngay từ đầu và kiểm tra lõi headless PASS trước khi chỉnh `src/web/`).
- **Ước tính token Phase 3:** ~45,000–55,000 tokens (đọc `phase3.md`, cập nhật Contract v1.2 + `engine.ts` + 17 test, cập nhật 3D fuel bar/colorblind/HUD, viết ADR + CHANGELOG + EVIDENCE).

---

# LƯU TRỮ PHASE 2 (Contract v1.1) & PHASE 1 (Contract v1.0)

- **Phase 2 (Contract v1.1):** 16/16 test PASS, Đêm 3 (`21,600` tick) đạt `297 ms`, SHA-256 Đêm 3: `EFCD63864ED35B7F2582E0653EB60D4FD1FCD69923471E12B3E4DB4BC9DB437A` ([`docs/proof/phase-2/night3_det1.jsonl`](docs/proof/phase-2/night3_det1.jsonl)), đặc tả AC tại [`docs/SPEC_PHASE2.md`](docs/SPEC_PHASE2.md). Ước tính token: ~70,000–85,000.
- **Phase 1 (Contract v1.0):** 10/10 test PASS, SHA-256 Đêm 1: `57C69BB1D7EC581C61A1CAC4B48A66F92603C8C8A6C1A1CB6A2B8460EB88A87B` ([`docs/proof/phase-1/determinism_run1.jsonl`](docs/proof/phase-1/determinism_run1.jsonl)). Ước tính token: ~45,000–60,000.
