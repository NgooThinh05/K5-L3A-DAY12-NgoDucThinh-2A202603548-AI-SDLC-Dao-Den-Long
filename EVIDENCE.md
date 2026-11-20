# EVIDENCE — Phase 1 (Đêm 1: Đảo Bến)

Tài liệu bằng chứng kiểm chứng, các giả định kỹ thuật, đánh giá phase và nhật ký sử dụng AI cho **Phase 1**.

---

## 1. Giả định kỹ thuật (Assumptions cho các điểm mở)

| Hạng mục | Giả định áp dụng | Lý do & nhất quán |
|---|---|---|
| Hình dạng & kích thước Đảo Bến | Hình tròn tâm `(0, 0, 0)`, bán kính `48.0m`, mặt đất `Y = 0`. `fall_enabled = false`. | Đủ rộng cho 5 đèn ở vòng bán kính `25m` và Bóng Mực xuất hiện ở vành ngoài `30m–42m`. Khi chạy `--scenario`, không chặn biên nhân vật để không cản các bài test di chuyển quãng đường lớn. |
| Vị trí mặc định 5 Đèn Lồng Lớn | Chia đều trên vòng bán kính `25.0m`: `L1 = [0, 0, 25]`, `L2 = [23.776, 0, 7.725]`, `L3 = [14.695, 0, -20.225]`, `L4 = [-14.695, 0, -20.225]`, `L5 = [-23.776, 0, 7.725]`. | `L1` khớp trực tiếp ví dụ trong Test Contract v1.0; phân bố đối xứng giúp trải nghiệm chơi cân bằng. |
| Sinh đom đóm ngẫu nhiên (`random_motes: true`) | Khởi tạo `16` đom đóm ở tick `0` (bán kính `5m–36m`, cách chân đèn `>= 2.2m`), sinh thêm `1` đom đóm mỗi `180` tick (`3s`) nếu số lượng `< 20`. | Luôn đủ đom đóm trên đảo để thắp 5 đèn (`25` đom đóm) + dùng Pulse, tất định 100% theo `Mulberry32(seed)`. |
| Sinh Bóng Mực ngẫu nhiên (`random_shades: true`) | Khởi tạo `2` Bóng Mực ở tick `0` (`S1`, `S2`, bán kính `30m–42m`, không phát event ở tick 0); sinh thêm `1` mỗi `1200` tick (`20s`) tối đa `5` con, cách người chơi `>= 12m` và ngoài `safe_radius + 1m`, phát `shade_spawned`. | Tạo áp lực ngay từ đầu nhưng không gây mất máu tức thì ở vị trí xuất phát `(0, 0, 0)`. |
| Làm tròn đom đóm bị rơi khi dính đòn | `dropped = Math.min(carried, Math.round(carried * hit_drop_ratio))`. Đom đóm rơi tan biến (không spawn lại thành entity mới). | Đối xứng (mang `1` vẫn rơi `1` khi tỉ lệ `0.5`, mang `4` rơi `2`), tránh làm biến động bất ngờ `motes_active` trong kịch bản `random_motes: false`. |
| Điểm thưởng thời gian khi thắng | `Math.floor(time_left_s) * per_second_left + flames * per_flame_left`. | Đảm bảo tổng điểm luôn là số nguyên không âm, tính theo số giây nguyên còn lại. |
| Biên an toàn `safe_radius` sau làm tròn 3 chữ số | Đẩy Bóng Mực đang đuổi ra khoảng cách `safe_radius + 0.002m` (`5.002m`). | Đảm bảo sau khi làm tròn tọa độ 3 chữ số thập phân (`round3`), khoảng cách XZ từ Bóng Mực tới đèn sáng luôn thỏa `>= safe_radius` (`5.0`). |
| Nhảy (`jump`) | Vận tốc đầu `7.5 m/s`, trọng lực `-20.0 m/s²`, chỉ kích hoạt khi đứng trên mặt đất (`y = 0`) theo cạnh lên (rising edge). | Không ảnh hưởng khoảng cách mặt phẳng ngang XZ theo đúng Test Contract. |

---

## 2. Bảng truy vết Yêu cầu → Kiểm chứng → Bằng chứng

| Yêu cầu Phase 1 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Pure Simulation Core tách biệt 3D, đọc `tuning` từ `game.contract.json` | Build độc lập `dist/headless.js` không bundle Three.js/DOM + `tsc --noEmit` | `npm run build` (`dist/headless.js` = `28.4kb`) | **ĐẠT** |
| Tính tất định byte-for-byte theo `--seed` | Chạy `dist/headless.js` 2 lần cùng `--seed 42 --ticks 600` và so sánh SHA-256 + Test #1 | `docs/proof/phase-1/determinism_run1.jsonl`, SHA-256 giống hệt nhau: `57C69BB1D7EC581C61A1CAC4B48A66F92603C8C8A6C1A1CB6A2B8460EB88A87B` | **ĐẠT** |
| Thoát mã `2` khi `--inputs`/`--scenario` lỗi JSON, sai kiểu hoặc tick không tăng nghiêm ngặt | Test #2 trong `tests/contract.test.ts` (5 case lỗi + 1 case thiếu flag CLI) | Output `PASS 2. Exit code 2...` bên dưới | **ĐẠT** |
| Di chuyển xoay `cam_yaw_deg` (`0°`, `90°`), chuẩn hóa vector `> 1`, nhảy cạnh lên | Test #3 trong `tests/contract.test.ts` | Output `PASS 3. Movement rotation...` bên dưới | **ĐẠT** |
| Nhặt đom đóm, giới hạn `carry_capacity`, nạp đèn, thắp đèn, thắng `all_lit` & điểm thưởng | Test #4 & Test #10 trong `tests/contract.test.ts` | Output `PASS 4` & `PASS 10` bên dưới | **ĐẠT** |
| Bóng Mực đuổi, va chạm (`player_hit`), rơi đom đóm, bất tử `invuln_s`, thua `no_flames` | Test #5 trong `tests/contract.test.ts` + log `determinism_run1.jsonl` (hit ở tick 505 & 595, cách đúng 90 tick = 1.5s) | Output `PASS 5` & `docs/proof/phase-1/determinism_run1.jsonl` | **ĐẠT** |
| Vùng an toàn `safe_radius` của đèn sáng chặn Bóng Mực | Test #6 trong `tests/contract.test.ts` (300 tick, kiểm tra mọi snapshot `d >= 5.0` & 0 hit) | Output `PASS 6` bên dưới | **ĐẠT** |
| Kỹ năng Tỏa sáng (Pulse): trừ ánh sáng, đẩy `pulse_push_m`, choáng `pulse_stun_s`, hồi chiêu `pulse_cooldown_s` | Test #7 trong `tests/contract.test.ts` | Output `PASS 7` bên dưới | **ĐẠT** |
| Hết giờ Đêm 1 thua `dawn` | Test #8 trong `tests/contract.test.ts` (`time_left_s: 2.0` dừng đúng tick `120`) | Output `PASS 8` bên dưới | **ĐẠT** |
| Scenario dựng sẵn `lit: true` không phát event, không cộng điểm | Test #9 trong `tests/contract.test.ts` | Output `PASS 9` bên dưới | **ĐẠT** |
| Giao diện 3D Three.js (Đảo Bến, biển mây, Mây đội nón lá có đèn, 5 đèn sáng dần, HUD, Chơi lại) | Build production Vite (`npm run build:web`) + code review kết nối trực tiếp `SimulationEngine` | `dist/web/index.html` + `dist/web/assets/*` build thành công không lỗi | **ĐẠT** |
| Tự động hóa kiểm chứng (CI) & Harness AI | `.github/workflows/ci.yml`, `AGENTS.md`, `.agents/skills/verify-contract/SKILL.md` | Có trong repo & lịch sử git | **ĐẠT** |

---

## 3. Log chạy kiểm thử thực tế

### 3.1. Kết quả `npm run verify`

```text
> dao-den-long@0.1.0 verify
> npm run build && npm test

> tsc --noEmit

> esbuild src/sim/headless.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/headless.js
  dist\headless.js  28.4kb
Done in 6ms

> vite build
✓ 11 modules transformed.
dist/web/index.html                   4.75 kB │ gzip:   1.51 kB
dist/web/assets/index-D6fVgyyZ.css    4.65 kB │ gzip:   1.57 kB
dist/web/assets/index-BhAplL6l.js   507.17 kB │ gzip: 130.95 kB
✓ built in 1.03s

=== Test Contract v1.0 Suite (2A202603548-NgoDucThinh) ===
PASS  1. Determinism (byte-for-byte identical output) & Snapshot/End schema
PASS  2. Exit code 2 on invalid --inputs / --scenario (bad JSON, non-increasing tick, wrong types)
PASS  3. Movement rotation (cam_yaw_deg = 0 & 90), vector normalization (>1), rising-edge jump
PASS  4. Pickup motes -> deposit -> lantern_lit -> win (all_lit) & exact bonus score
PASS  5. Shade chase -> player_hit (mote drop) -> invuln_s -> loss (no_flames)
PASS  6. Shade cannot enter safe_radius of a lit lantern
PASS  7. Pulse cost, pulse_push_m, stunned for pulse_stun_s, cooldown & empty pulse
PASS  8. Dawn timeout loss (time_left_s <= 0 -> reason: dawn)
PASS  9. Scenario pre-lit lanterns emit 0 events and add 0 score
PASS  10. Carry capacity cap stops automatic mote pickup at carry_capacity

Summary: 10 passed, 0 failed
```

### 3.2. Bằng chứng tính tất định (SHA-256)

Lệnh chạy:
```powershell
node dist/headless.js --seed 42 --night 1 --ticks 600 --snapshot-every 60 --out docs/proof/phase-1/determinism_run1.jsonl
node dist/headless.js --seed 42 --night 1 --ticks 600 --snapshot-every 60 --out docs/proof/phase-1/determinism_run2.jsonl
Get-FileHash docs/proof/phase-1/determinism_run1.jsonl, docs/proof/phase-1/determinism_run2.jsonl -Algorithm SHA256
```

Kết quả thực tế:
```text
Hash                                                             Path
----                                                             ----
57C69BB1D7EC581C61A1CAC4B48A66F92603C8C8A6C1A1CB6A2B8460EB88A87B ...\determinism_run1.jsonl
57C69BB1D7EC581C61A1CAC4B48A66F92603C8C8A6C1A1CB6A2B8460EB88A87B ...\determinism_run2.jsonl
```

File mẫu được giữ lại tại [`docs/proof/phase-1/determinism_run1.jsonl`](docs/proof/phase-1/determinism_run1.jsonl).

---

## 4. Đánh giá Phase 1, Lỗi AI & Nhật ký Token

### 4.1. Đánh giá nhanh Phase 1
- **Đạt:** 100% yêu cầu lõi Phase 1 và Test Contract v1.0 đều có test tự động và bằng chứng thực tế. Lõi mô phỏng chạy độc lập hoàn toàn (`28.4kb`), build web 3D Three.js nhanh (`~1s`), không phụ thuộc asset ngoài.
- **Chưa làm / Hạn chế hiện tại:** Chưa quay video demo (dự kiến thực hiện ở Phase 4) và chưa chạy test hiệu năng FPS chuyên sâu (chưa thuộc yêu cầu Phase 1).

### 4.2. Các lỗi kỹ thuật / lỗi AI đã phát hiện & cách xử lý
1. **Lỗi cấu hình TypeScript `TS5097`:** Khi dùng đuôi `.ts` trong import ESM (`src/sim/engine.ts`), `tsc --noEmit` báo lỗi do thiếu `"allowImportingTsExtensions": true` trong `tsconfig.json`.
   - *Phát hiện:* Ngay khi chạy `npm run typecheck`.
   - *Khắc phục:* Bật `"allowImportingTsExtensions": true` trong `tsconfig.json` và chạy lại `typecheck` + `test` xác nhận xanh.
2. **Phòng ngừa lỗi trục camera phải/trái trong Three.js:** Kiểm tra trước quy tắc bàn tay phải (`Forward +Z × Up +Y = Right -X`) nên ánh xạ `A -> mx=+1`, `D -> mx=-1` khớp chính xác công thức xoay `cam_yaw_deg` của Test Contract ở mọi góc xoay.
3. **Phòng ngừa sai số làm tròn `safe_radius`:** Bổ sung lề `SAFE_RADIUS_MARGIN = 0.002m` để đảm bảo tọa độ sau khi làm tròn 3 chữ số thập phân không bao giờ nhỏ hơn `5.0m` theo đường chéo.
4. **Cải tiến Harness:** Đưa lệnh `npm run verify` làm cổng bắt buộc trong `AGENTS.md`, tách quy trình kiểm chứng thành skill `.agents/skills/verify-contract/SKILL.md` và thêm GitHub Actions CI `.github/workflows/ci.yml`.

### 4.3. Nhật ký dùng AI & Quản lý Token (Phase 1)
- **Công cụ:** Antigravity (Google DeepMind).
- **Ước tính token Phase 1:** ~45,000–60,000 tokens (đọc 7 tài liệu spec, thiết kế & tạo toàn bộ lõi sim, 10 test contract, giao diện 3D Three.js + WebAudio, tài liệu & kiểm chứng).
- **Cách tiết kiệm token đã áp dụng:**
  - Đọc song song toàn bộ tài liệu trong 1 lượt và lập kế hoạch kiến trúc đầy đủ trước khi viết code.
  - Gộp ghi nhiều file độc lập song song theo từng bước (Config/Harness → Sim Core → Test Suite → 3D Frontend → Docs) thay vì chỉnh sửa lắt nhắt.
  - Giữ `AGENTS.md` ngắn gọn (~35 dòng) và tách thủ tục kiểm chứng chi tiết sang skill `.agents/skills/verify-contract/SKILL.md` để chỉ nạp khi cần.
  - Chạy `npm test` kiểm chứng lõi trước khi viết 3D, tránh phải sửa đi sửa lại ở nhiều tầng.
