# EVIDENCE — Đảo Đèn Lồng (Phase 1 & Phase 2)

Tài liệu bằng chứng kiểm chứng, các giả định kỹ thuật, lịch sử cập nhật test khi yêu cầu thay đổi, đánh giá từng phase và nhật ký sử dụng AI.

---

# PHASE 2 — TICKET-02: "Ba hòn đảo" (Contract v1.1)

## 1. Giả định kỹ thuật & Làm rõ (Phase 2)

| Hạng mục | Quyết định / Giả định | Lý do |
|---|---|---|
| Quy ước góc mặt phẳng XZ | `x = r · cos(α)`, `z = r · sin(α)` với `α` đo từ `+X`. | Khớp 100% với Đêm 3 Tầng 1 (`z > 0`), dốc tại `30°` & `150°`, và 8 điểm sinh đom đóm Tầng 1 (`20°..160°`). |
| Điểm xuất phát Đêm 3 | `(0, 0, -10)` hướng `+Z` (trên Tầng 0, ngoài Tầng 2 bán kính `8 m` và Tháp Chuông `2 m`). | Tại `(0, 0, 0)` của Đêm 3 là tâm Tháp Chuông không đi vào được; nếu `--scenario` truyền `player.pos` thì luôn tôn trọng `scenario`. |
| Thời điểm phát sự kiện `night_start` | Phát 1 lần tại `sim_tick = 1` (bước mô phỏng đầu tiên). | Giữ nguyên bất biến Phase 1 (`--ticks 0` dựng scenario phát `0` event) đồng thời đảm bảo mọi lượt chạy thật đều có `night_start: { night }`. |
| Tăng tốc / dừng `<= 0.1 s` | Đáp ứng vận tốc ngay trong 1 tick (`0 s <= 0.1 s`). | Đạt chuẩn `<= 0.1 s` và đảm bảo test hồi quy di chuyển Phase 1 (`6 m/s × 1 s = 6.0 m`) chính xác tuyệt đối. |
| Cô lập sáng tạo (Menu chọn Nhân vật / Chủ đề / Loại ma) | Đặt 100% trong `src/web/themes.ts` & `src/web/renderer.ts`; chủ đề mặc định dùng đúng bảng màu chuẩn Phase 2. | Giữ `src/sim/` thuần tuyệt đối, không ảnh hưởng bất kỳ output JSONL headless nào. |

## 2. Cập nhật Test Phase 1 do Thay đổi Yêu cầu ở Phase 2 (Không tắt âm thầm)

Theo quy định của `AGENTS.md` và `CHECKPOINTS.md`, các test Phase 1 bị ảnh hưởng trực tiếp bởi số liệu chuẩn hóa của **TICKET-02** đã được cập nhật minh bạch:

| Test cũ (Phase 1) | Thay đổi từ TICKET-02 (Phase 2) | Cách cập nhật |
|---|---|---|
| Test #4 (`lantern_cost = 5`, `+10` khi nhặt đom đóm) | Chuẩn hóa `lantern_cost = 10`, cộng `+10` mỗi đom đóm **nạp** (`deposit`). | Cập nhật Test #4 kiểm tra nạp đủ `10` đom đóm và xác minh điểm bằng `0` trước khi nạp, cộng `+100` (`10×10`) khi nạp. |
| Test #5 (`dropped = Math.round(carried * 0.5)`, không có recoil/dropped motes) | Chuẩn hóa `dropped = floor(carried / 2)`, sinh đom đóm rơi (`kind: "dropped"`, TTL `480` tick), Bóng Mực vào trạng thái `recoil` lùi `2 m` trong `60` tick. | Mở rộng Test #5 xác minh `floor(5/2) = 2`, 2 đom đóm `dropped` có `ttl_s = 8`, và Bóng Mực chuyển `recoil`. |
| Test #6 (`safe_radius = 5.0`) | Chuẩn hóa `safe_radius = 6.0` + đẩy Bóng Mực đang ở trong khi đèn mới thắp ra mép trong `<= 30` tick không gây sát thương. | Nâng cấp Test #6 kiểm tra đồng thời bóng ở trong (bị đẩy ra trong `<= 30` tick, `0` hit) và bóng ở ngoài bị chặn ở mép `6.0 m`. |
| Test #7 (`pulse_cost = 2`, đẩy tức thì, `stun = 180` tick, `+25` điểm) | Chuẩn hóa `pulse_cost = 3`, bán kính 3D `5.0 m`, đẩy tổng `4.0 m` trong `15` tick đầu, choáng `120` tick, `+5` điểm. | Cập nhật Test #7 xác minh đủ 4 thông số mới và trạng thái `wander` cho bóng ngoài `12 m`. |

## 3. Bảng truy vết Yêu cầu Phase 2 → Kiểm chứng → Bằng chứng

| Hạng mục TICKET-02 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Contract `v1.1` & Số liệu chuẩn Phần 1 | `game.contract.json` + Test #1–#8 | `npm run verify` PASS 16/16 | **ĐẠT** |
| Lướt (`dash`): `14 m/s`, `0.2 s`, hồi `1.5 s`, giữ Y trên không | Headless scenario Test #9 | `PASS 9. [Phase 2] Dash...` | **ĐẠT** |
| Rơi khỏi đảo (`Y < -10`): `-1` lửa, `lost`, chờ `60` tick, hồi sinh + `90` tick bất tử | Headless scenario Test #10 | `PASS 10. [Phase 2] Fall off island...` | **ĐẠT** |
| Đêm 2 — Đảo Cau: 2 đảo `28 m`, cầu tre, 2 Bục Nhảy, `6` đèn | Headless scenario Test #11 | `PASS 11. [Phase 2] Night 2 (Đảo Cau)...` | **ĐẠT** |
| Bùa Gió (`C1`/`C2`): `7.2 m/s`, Lướt không hồi chiêu, hồi `2700` tick | Headless scenario Test #12 | `PASS 12. [Phase 2] Wind Charm...` | **ĐẠT** |
| Gió Lạc (`D1`/`D2`): cướp `<= 3` khi mang `>= 5`, `flee`, Pulse làm rơi đồ | Headless scenario Test #13 | `PASS 13. [Phase 2] Drifter...` | **ĐẠT** |
| Đêm 3 — Đảo Chuông: `7` đèn, 3 tầng, dốc, Bục Nhảy lên tầng 2, Gió mạnh | Headless scenario Test #14 | `PASS 14. [Phase 2] Night 3 (Đảo Chuông)...` | **ĐẠT** |
| Tạm dừng (`pause` / `resumed`) đóng băng `sim_tick` & hồi chiêu | Headless scenario Test #15 | `PASS 15. [Phase 2] Pause & Resume...` | **ĐẠT** |
| Hiệu năng headless 1 Đêm đầy đủ (`21,600` tick `<= 30 s`) | Benchmark Test #16 | **297 ms** (`0.297 s` << `30 s`) | **ĐẠT** |
| Tính tất định byte-for-byte Đêm 3 (`1800` tick) | Chạy 2 lần `--seed 42 --night 3` so SHA-256 | `docs/proof/phase-2/night3_det1.jsonl`, SHA-256: `EFCD63864ED35B7F2582E0653EB60D4FD1FCD69923471E12B3E4DB4BC9DB437A` | **ĐẠT** |
| Chuỗi 3 Đêm, Ông Đăng intro, Cài đặt `localStorage`, HUD 10 ô, Bảng màu chuẩn, Âm thanh, Menu chọn Nhân vật/Chủ đề/Loại ma | `npm run build:web` + `docs/SPEC_PHASE2.md` | Vite production build thành công (`1.45 s`), `tsc --noEmit` 0 lỗi | **ĐẠT** |
| Harness AI & Spec Acceptance Criteria | Cập nhật `AGENTS.md`, `SKILL.md`, `docs/SPEC_PHASE2.md` | Có đủ trong repo & lịch sử git | **ĐẠT** |

## 4. Log chạy kiểm thử thực tế (Phase 2)

### 4.1. Kết quả `npm run verify`

```text
> dao-den-long@0.1.0 verify
> npm run build && npm test

> tsc --noEmit

> esbuild src/sim/headless.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/headless.js
  dist\headless.js  62.1kb
Done in 8ms

> vite build
✓ 13 modules transformed.
dist/web/index.html                   9.92 kB │ gzip:   2.78 kB
dist/web/assets/index-DjpbaNSj.css   10.93 kB │ gzip:   2.91 kB
dist/web/assets/index-CO37xcHW.js   579.74 kB │ gzip: 152.46 kB
✓ built in 1.45s

=== Test Contract v1.1 Suite (2A202603548-NgoDucThinh) ===
PASS  1. [Regression] Determinism (byte-for-byte) & Contract v1.1 Snapshot/End schema
PASS  2. [Regression] Exit code 2 on invalid --inputs / --scenario
PASS  3. [Regression] Movement rotation (cam_yaw_deg = 0 & 90), vector norm (>1), jump
PASS  4. [Regression + v1.1 Score] Pickup 10 motes -> deposit (+10/mote deposited) -> win (all_lit)
PASS  5. [Regression + v1.1 Recoil & Dropped Motes] Shade hit drops floor(carried/2) motes (TTL 480) & recoils 2m
PASS  6. [Regression + v1.1 Safe Push] Safe radius (6m) blocks external shades & pushes interior shade out in <= 30 ticks
PASS  7. [Regression + v1.1 Pulse 3D & 15-tick push] Pulse costs 3, pushes 4m over 15 ticks, stuns 120 ticks, +5 score
PASS  8. [Regression] Dawn timeout loss & Pre-lit scenario emits 0 events / 0 score at tick 0
PASS  9. [Phase 2] Dash (14 m/s for 0.2s, air-dash preserves Y, 1.5s cooldown from start)
PASS  10. [Phase 2] Fall off island (Y < -10) -> -1 flame, lose all carried (lost), 60-tick wait, respawn + 90-tick invuln
PASS  11. [Phase 2] Night 2 (Đảo Cau): 6 lanterns, Jump Pad launches Island A -> Island B, Wind Charm C1
PASS  12. [Phase 2] Wind Charm: +7.2 m/s speed, 0-cooldown dash, respawns after 2700 ticks
PASS  13. [Phase 2] Drifter (Gió Lạc): steals <= 3 motes when carried >= 5, flees, Pulse drops stolen motes
PASS  14. [Phase 2] Night 3 (Đảo Chuông): 7 lanterns, 3 tiers + ramp + jump pad to Tier 2 + wind gust
PASS  15. [Phase 2] Pause & Resume freeze sim_tick, time_left_s, cooldowns while outer tick advances
      -> Full Night 3 (21,600 ticks) completed in 297 ms
PASS  16. [Phase 2 Performance] Full Night 3 (21,600 ticks) finishes in <= 30s

Summary: 16 passed, 0 failed
```

### 4.2. Bằng chứng tính tất định Đêm 3 (SHA-256)

```text
Hash                                                             Path
----                                                             ----
EFCD63864ED35B7F2582E0653EB60D4FD1FCD69923471E12B3E4DB4BC9DB437A ...\docs\proof\phase-2\night3_det1.jsonl
EFCD63864ED35B7F2582E0653EB60D4FD1FCD69923471E12B3E4DB4BC9DB437A ...\docs\proof\phase-2\night3_det2.jsonl
```

## 5. Đánh giá Phase 2, Lỗi AI phát hiện & Nhật ký Token

### 5.1. Đánh giá nhanh Phase 2
- **Đạt:** Toàn bộ số liệu chuẩn Phần 1, 3 bản đồ chuẩn Phần 2, toàn bộ tính năng Phần 3 (kèm sáng tạo sảnh chọn nhân vật/chủ đề/loại ma) và Contract v1.1 đều chạy đúng, 16/16 test PASS, hiệu năng headless vượt trội (`297 ms` cho `21,600` tick).
- **Chưa làm / Hạn chế hiện tại:** Chưa quay video demo `.mp4` và chưa chạy đo FPS tự động trên trình duyệt headless (đã gắn bộ đếm FPS trực tiếp trên HUD; đo đạc hiệu năng chính thức sẽ thực hiện ở Phase 4).

### 5.2. Lỗi AI đã phát hiện & cách khắc phục (Phase 2)
1. **Test #16 kết thúc sớm ở tick `17,926`:** Kịch bản benchmark đặt `flames: 99`, không đủ cho người chơi đứng yên sống sót đủ `21,600` tick trước `10` Bóng Mực (tối đa `240` đòn).
   - *Phát hiện:* Ngay lần chạy `npm test` đầu tiên (`17926 !== 21600`).
   - *Khắc phục:* Tăng `flames: 500` trong kịch bản benchmark để đảm bảo chạy đủ trọn `21,600` tick (`297 ms`).
2. **Biến thừa `currentNight` trong `src/web/renderer.ts`:** Bị TypeScript `noUnusedLocals` (`TS6133`) bắt ngay khi chạy `npm run typecheck`.
   - *Khắc phục:* Gỡ bỏ trường thừa, giữ code gọn sạch.
3. **Phòng ngừa sai quy ước góc XZ & điểm rơi Đêm 3:** Đối chiếu chéo công thức góc với Đêm 3 Tầng 1 (`z > 0`, dốc `30°/150°`) để xác nhận `x = r cos α, z = r sin α` trước khi code `src/sim/maps.ts`.

### 5.3. Nhật ký dùng AI & Quản lý Token (Phase 2)
- **Công cụ:** Antigravity (Google DeepMind).
- **Ước tính token Phase 2:** ~70,000–85,000 tokens (phân tích TICKET-02, tách `src/sim/maps.ts`, viết lại `engine.ts` theo đúng 12 bước + bộ đếm tick nguyên, 16 test tự động, nâng cấp 3D Renderer cho cả 3 đảo + menu chọn nhân vật/chủ đề/loại ma + âm thanh & tài liệu).
- **Cách tiết kiệm token:**
  - Dùng bộ đếm số nguyên (integer ticks) trong `engine.ts` giúp tránh lỗi sai số dấu phẩy động và giảm số vòng debug.
  - Chạy `npm test` xác nhận toàn bộ lõi mô phỏng v1.1 PASS trước khi nâng cấp `src/web/`.
  - Gộp ghi nhiều file độc lập song song theo từng lớp kiến trúc.

---

# PHASE 1 — Lưu trữ tóm tắt (Tag `phase-1` · Contract v1.0)

- **Kết quả Phase 1:** `npm run verify` PASS `10/10` Test Contract v1.0 (`dist/headless.js` = `28.4kb`).
- **Determinism Phase 1 (`--seed 42 --night 1 --ticks 600`):** SHA-256 giống hệt nhau `57C69BB1D7EC581C61A1CAC4B48A66F92603C8C8A6C1A1CB6A2B8460EB88A87B` (lưu tại [`docs/proof/phase-1/determinism_run1.jsonl`](docs/proof/phase-1/determinism_run1.jsonl)).
- **Lỗi AI đã khắc phục ở Phase 1:** Bật `allowImportingTsExtensions` cho `TS5097`; đối chiếu quy tắc bàn tay phải cho trục camera Three.js; bổ sung lề `0.002 m` cho `safe_radius` chống sai số làm tròn 3 chữ số thập phân.
- **Ước tính token Phase 1:** ~45,000–60,000 tokens.
