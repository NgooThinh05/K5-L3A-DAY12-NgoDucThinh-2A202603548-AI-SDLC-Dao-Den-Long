# Đảo Đèn Lồng — Đêm 1: Đảo Bến

> **Day 12 · AI SDLC Lab (Phase 1)** · Sinh viên: **Ngô Đức Thịnh** (`2A202603548-NgoDucThinh`)
> Video demo: *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba xây dựng theo kiến trúc **Headless-First** (TypeScript + Three.js + Vite + Node.js). Mây — người giữ đèn nhỏ tuổi đội nón lá treo đèn lồng — thu thập đom đóm quanh Đảo Bến để thắp sáng 5 Đèn Lồng Lớn trước khi bình minh tới, đồng thời né tránh hoặc đẩy lùi Bóng Mực trong sương đêm.

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy tốt trên macOS, Linux và Windows).

```bash
npm install
npm run build
npm run dev
```

Sau khi chạy `npm run dev`, mở trình duyệt tại địa chỉ hiển thị (mặc định `http://localhost:5173`) và bấm **Bắt đầu Đêm 1**.

---

## 2. Điều khiển

| Phím / Thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` (hoặc `↑` `↓`) | Di chuyển theo hướng camera |
| Kéo chuột trái/phải hoặc `←` `→` | Xoay camera quanh Mây (`cam_yaw_deg`) |
| `Space` | Nhảy |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn ở gần (`interact`) |
| `Q` hoặc `Shift` | **Tỏa sáng (Pulse)** — tiêu thụ ánh sáng để đẩy lùi & làm choáng Bóng Mực |
| `M` | Bật / tắt âm thanh tổng hợp WebAudio |

---

## 3. Luật chơi & Công thức tính điểm

Mọi thông số cân bằng được đọc trực tiếp từ nguồn duy nhất [`game.contract.json`](game.contract.json) (`tuning`):

- **Đom đóm (Motes):** Tự động nhặt trong bán kính `1.5m` (tối đa mang `10`).
- **Đèn Lồng Lớn (`L1`–`L5`):** Đứng trong bán kính `2.5m` và bấm `E` để nạp; đủ `5` đom đóm đèn sẽ sáng và tạo **vùng an toàn** bán kính `5.0m` chặn Bóng Mực.
- **Tỏa sáng (Pulse):** Tiêu tốn `2` đom đóm, hồi chiêu `4.0s`, đẩy lùi mọi Bóng Mực trong bán kính `6.0m` thêm `4.0m` và làm choáng `3.0s`.
- **Bóng Mực (Shades):** Đuổi theo Mây (`3.5 m/s`); chạm trong `1.2m` làm mất `1` ngọn lửa (máu, ban đầu `3`), rơi `50%` đom đóm đang mang (`Math.round(carried * 0.5)`) và kích hoạt bất tử `1.5s`.
- **Thắng / Thua:** Thắp sáng cả 5 đèn → **Thắng (`all_lit`)**; hết ngọn lửa → **Thua (`no_flames`)**; hết `300s` → **Thua (`dawn`)**.

### Công thức tính điểm (`tuning.score`)

| Nguồn điểm | Điểm |
|---|---|
| Nhặt 1 đom đóm (`per_mote`) | `+10` |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`) | `+100` |
| Làm choáng 1 Bóng Mực bằng Pulse (`per_stun`) | `+25` |
| Thưởng thời gian còn lại khi thắng (`per_second_left`) | `+2 × floor(time_left_s)` |
| Thưởng ngọn lửa còn lại khi thắng (`per_flame_left`) | `+50 × flames` |

---

## 4. Chế độ Headless & Kiểm thử (Test Contract v1.0)

Chạy toàn bộ bộ test tự động xác minh Test Contract v1.0:

```bash
npm test
```

Hoặc kiểm tra toàn diện (typecheck + build headless + build web + test):

```bash
npm run verify
```

Chạy trực tiếp chế độ Headless CLI (60 tick/s, tất định byte-for-byte theo `--seed`):

```bash
node dist/headless.js --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out out.jsonl
```

Hỗ trợ đầy đủ `--scenario <file.json>` và `--inputs <file.json>`. Thoát mã `0` khi thành công, mã `2` khi file `--inputs`/`--scenario` sai JSON, sai kiểu hoặc `tick` không tăng nghiêm ngặt.

---

## 5. Sáng tạo của tôi

Mọi yếu tố sáng tạo nằm hoàn toàn ở lớp hiển thị & âm thanh (`src/web/`), **không làm thay đổi** bất kỳ tọa độ, trạng thái, điểm số hay output JSONL nào của chế độ `headless`:

1. **La bàn Ánh sáng (Diegetic Lantern Compass):** Mũi tên ánh vàng nhỏ xoay nhẹ quanh chân Mây luôn hướng về Đèn Lồng Lớn chưa sáng gần nhất, giúp người chơi định hướng tự nhiên trong màn sương mà không cần minimap rối mắt.
2. **Âm thanh tổng hợp WebAudio (`src/web/audio.ts`):** Không dùng file âm thanh ngoài; tổng hợp trực tiếp thang âm ngũ cung (pentatonic chime tăng cao độ theo số đom đóm đang mang), tiếng chuông ấm khi thắp đèn, sóng âm khi Tỏa sáng và giai điệu thắng/thua (bật/tắt bằng phím `M`).
3. **Đảo sáng dần & Hiệu ứng hạt (`src/web/renderer.ts`):** Bầu trời, sương mù, ánh sáng môi trường chuyển dần từ xanh tím sâu sang ánh vàng cổ tích ấm áp mỗi khi thắp thêm đèn, kèm quỹ đạo đom đóm bay quanh Mây, vòng sóng xung kích Pulse và hiệu ứng hạt khi nhặt/nạp ánh sáng.

---

## 6. Cấu trúc dự án & Tài liệu

```text
.
├── game.contract.json                  # Nguồn chân lý duy nhất cho tuning & lệnh chạy
├── AGENTS.md                           # Harness AI: lệnh, bất biến kỹ thuật, quy trình
├── .agents/skills/verify-contract/     # Skill kiểm chứng tự động Test Contract
├── .github/workflows/ci.yml            # CI tự động chạy npm run verify khi push/tag
├── EVIDENCE.md                         # Giả định, bảng truy vết bằng chứng, log AI & token
├── CREDITS.md / LICENSE                # Bản quyền & nguồn tài nguyên (100% procedural)
├── src/
│   ├── sim/                            # Pure Simulation Core (0 dependency DOM/WebGL)
│   │   ├── prng.ts                     # Mulberry32 PRNG tất định
│   │   ├── types.ts                    # Schema state, input, scenario, JSONL
│   │   ├── validators.ts               # Kiểm tra --inputs/--scenario (exit code 2)
│   │   ├── engine.ts                   # SimulationEngine cố định 60Hz
│   │   └── headless.ts                 # CLI entrypoint build ra dist/headless.js
│   └── web/                            # Giao diện 3D Three.js, âm thanh WebAudio, HUD
├── tests/contract.test.ts              # 10 bài test tự động Test Contract v1.0
└── docs/proof/phase-1/                 # File bằng chứng JSONL mẫu
```
