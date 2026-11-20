# Đảo Đèn Lồng — Ba Hòn Đảo (Phase 2 · Contract v1.1)

> **Day 12 · AI SDLC Lab (Phase 2 — TICKET-02)** · Sinh viên: **Ngô Đức Thịnh** (`2A202603548-NgoDucThinh`)
> Video demo: *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba xây dựng theo kiến trúc **Headless-First** (TypeScript + Three.js + Vite + Node.js), gồm chuỗi **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)** cùng chế độ mô phỏng không giao diện đạt chuẩn **Test Contract v1.1**.

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy tốt trên macOS, Linux và Windows).

```bash
npm install
npm run build
npm run dev
```

Mở trình duyệt tại địa chỉ hiển thị (mặc định `http://localhost:5173`) để chọn Đêm, Nhân vật, Chủ đề bản đồ và bắt đầu hành trình.

---

## 2. Điều khiển

| Phím / Thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` (hoặc `↑` `↓`) | Di chuyển (`6.0 m/s`; `7.2 m/s` khi có Bùa Gió) |
| Kéo chuột hoặc `←` `→` | Xoay camera quanh nhân vật (`cam_yaw_deg`) |
| `Space` | Nhảy (`7.0 m/s`, chỉ khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14.0 m/s` trong `0.2 s`, hồi chiêu `1.5 s` (giữ độ cao trên không) |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất trong `2.0 m` (`interact`) |
| `Q` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, bán kính 3D `5.0 m`, hồi chiêu `3.0 s` |
| `Esc` hoặc `P` | **Tạm dừng** (dừng hoàn toàn logic, mở menu Cài đặt / Chơi lại / Về Menu) |
| `M` | Bật / tắt âm thanh nhanh |

---

## 3. Nội dung 3 Đêm & Công thức tính điểm (Contract v1.1)

Mọi hằng số cân bằng được đọc trực tiếp từ nguồn duy nhất [`game.contract.json`](game.contract.json):

| Đêm | Đảo | Thời gian | Đèn Lồng Lớn | Đặc trưng nổi bật |
|---|---|---:|---:|---|
| **Đêm 1** | **Đảo Bến** | `300 s` | `5` (`L1–L5`) | Đảo tròn `40 m`, rơi khỏi đảo (`Y < -10`) mất 1 Ngọn Lửa & hồi sinh sau `1 s` |
| **Đêm 2** | **Đảo Cau** | `330 s` | `6` (`L1–L6`) | Hai đảo `28 m` nối bằng cầu tre không lan can, 2 Bục Nhảy, Bùa Gió `C1`, **Gió Lạc** |
| **Đêm 3** | **Đảo Chuông** | `360 s` | `7` (`L1–L7`) | Đảo `45 m` 3 tầng (`Y = 0/3/6`), 2 dốc `30°/150°`, Bục Nhảy lên Tháp Chuông, **Gió mạnh** mỗi `30 s`, 2 Bùa Gió, Bóng Mực `4.5 m/s` |

### Công thức tính điểm chuẩn hóa (`tuning.score`)

| Nguồn điểm | Điểm |
|---|---|
| Mỗi đom đóm **nạp** vào đèn (`per_mote`) | `+10` |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`, đủ `10` đom đóm) | `+100` |
| Mỗi Bóng Mực trúng Tỏa Sáng (`per_stun`, kể cả đang choáng) | `+5` |
| Thưởng khi thắng Đêm | `+ floor(time_left_s) × 2 + 50 × flames` |

Tổng điểm chiến dịch là tổng điểm của các Đêm đã thắng.

---

## 4. Chế độ Headless & Kiểm thử (Test Contract v1.1)

```bash
npm run verify
```

Hoặc chạy trực tiếp chế độ Headless CLI cho Đêm `1`, `2`, hoặc `3`:

```bash
node dist/headless.js --seed 42 --night 3 --ticks 1800 --snapshot-every 60 --out out.jsonl
```

Hỗ trợ đầy đủ `--scenario <file.json>` và `--inputs <file.json>` theo chuẩn **Contract v1.1** (thoát `0` khi thành công, `2` khi lỗi định dạng/schema/tick không tăng nghiêm ngặt). Chạy trọn Đêm 3 (`21,600` tick) chỉ mất **~0.3 giây** (ngưỡng yêu cầu `<= 30 s`).

---

## 5. Sáng tạo của tôi

Mọi phần sáng tạo được cô lập 100% trong lớp hiển thị & âm thanh (`src/web/`), **không làm thay đổi** tọa độ, vật lý, điểm số hay đầu ra headless JSONL:

1. **Sảnh Chọn Nhân Vật & Chủ Đề Bản Đồ kèm Xem Trước 3D Trực Tiếp (`src/web/themes.ts`):**
   - **4 Nhân vật có thể chọn:** *Mây* (mặc định đúng bảng màu chuẩn `#E8E2D0` / `#C8102E`), *Linh* (Học sĩ đèn trời), *Mộc* (Kiểm lâm rừng đêm), *Sao* (Thủy thủ biển mây).
   - **4 Chủ đề bản đồ & Loại ma đặc trưng:** *Cổ Tích Chuẩn · Bóng Mực* (mặc định đúng bảng màu chuẩn Phase 2), *Rừng Trúc Sương · Ma Trơi Rừng Trúc*, *Đỉnh Tuyết Băng · Oan Hồn Tuyết*, và *Đền Đỏ Chạng Vạng · Quỷ Mặt Nạ Đỏ*.
2. **Âm thanh tổng hợp WebAudio (`src/web/audio.ts`):** Nhạc nền đêm ngũ cung nhẹ nhàng cùng đủ hiệu ứng âm thanh tổng hợp trực tiếp (không cần file âm thanh ngoài), có lưu cấu hình âm lượng & độ nhạy chuột qua `localStorage`.
3. **La bàn Ánh sáng + Mũi tên ngoài màn hình + Hiệu ứng Hạt & Lá bay theo Gió:** Kết hợp vòng la bàn dưới chân Mây, mũi tên mép màn hình chỉ đèn chưa sáng gần nhất, vòng sóng Pulse, quỹ đạo đom đóm bay quanh Mây và lá bay báo gió trên Đảo Chuông.

---

## 6. Cấu trúc dự án & Tài liệu

- [`game.contract.json`](game.contract.json) — Nguồn chân lý duy nhất (`contract_version: "1.1"`).
- [`AGENTS.md`](AGENTS.md) & [`.agents/skills/verify-contract/SKILL.md`](.agents/skills/verify-contract/SKILL.md) — Harness AI đã cập nhật cho Phase 2.
- [`docs/SPEC_PHASE2.md`](docs/SPEC_PHASE2.md) — Đặc tả & Acceptance Criteria cho toàn bộ Phần 3.
- [`EVIDENCE.md`](EVIDENCE.md) — Bằng chứng thực tế, lý do cập nhật test Phase 1, kết quả benchmark & nhật ký AI/token.
- [`src/sim/`](src/sim/) — Pure Simulation Core (`maps.ts`, `engine.ts`, `validators.ts`, `prng.ts`, `headless.ts`).
- [`src/web/`](src/web/) — 3D Three.js Renderer, Themes/Menu, WebAudio, HUD & Campaign Controller.
- [`tests/contract.test.ts`](tests/contract.test.ts) — 16 bài test tự động (Phase 1 regression + toàn bộ tính năng Phase 2 + benchmark 21,600 tick).
