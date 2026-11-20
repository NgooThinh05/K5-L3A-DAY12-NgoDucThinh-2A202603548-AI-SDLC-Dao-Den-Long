# EVIDENCE — Đảo Đèn Lồng (Phase 1, Phase 2 & Phase 3)

Tài liệu bằng chứng kiểm chứng, quyết định thiết kế, lý do cập nhật test khi yêu cầu thay đổi, đánh giá từng phase và nhật ký sử dụng AI.

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
