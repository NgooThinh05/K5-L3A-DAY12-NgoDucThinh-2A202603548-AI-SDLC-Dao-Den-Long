# Đảo Đèn Lồng — Đèn Cạn Dầu (Phase 3 · Contract v1.2)

> **Day 12 · AI SDLC Lab (Phase 3 — TICKET-03)** · Sinh viên: **Ngô Đức Thịnh** (`2A202603548-NgoDucThinh`)
> Video demo: *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba theo kiến trúc **Headless-First** (TypeScript + Three.js + Vite + Node.js), gồm chuỗi **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)** với cơ chế **nhiên liệu đèn, Bóng Mực hút dầu, sức chứa tăng dần, chế độ mù màu** và chế độ headless đạt chuẩn **Test Contract v1.2**.

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy mượt trên macOS, Linux và Windows).

```bash
npm install
npm run build
npm run dev
```

Mở trình duyệt tại địa chỉ hiển thị (mặc định `http://localhost:5173`) để chọn Đêm, Nhân vật, Chủ đề bản đồ & Cài đặt (kể cả chế độ mù màu).

---

## 2. Điều khiển

| Phím / Thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` (hoặc `↑` `↓`) | Di chuyển (`6.0 m/s`; `7.2 m/s` khi có Bùa Gió) |
| Kéo chuột hoặc `←` `→` | Xoay camera quanh nhân vật (`cam_yaw_deg`) |
| `Space` | Nhảy (`7.0 m/s`, chỉ khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14.0 m/s` trong `0.2 s`, hồi chiêu `1.5 s` (giữ độ cao trên không) |
| `E` hoặc `F` | Nạp ánh sáng (thắp mới `10`, thắp lại `5`) hoặc **Châm dầu** (`+10` dầu/đom đóm) |
| `Q` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, bán kính 3D `5.0 m`, hồi chiêu `3.0 s` |
| `Esc` hoặc `P` | **Tạm dừng** (đóng băng hoàn toàn logic, mở menu Cài đặt / Chơi lại / Về Menu) |
| `M` | Bật / tắt âm thanh nhanh |

---

## 3. Luật chơi & Công thức tính điểm (Contract v1.2)

Mọi hằng số cân bằng được đọc trực tiếp từ [`game.contract.json`](game.contract.json):

| Đêm | Đảo | Thời gian | Ngưỡng thắng lúc Bình Minh | Đặc trưng nổi bật |
|---|---|---:|---:|---|
| **Đêm 1** | **Đảo Bến** | `240 s` | `≥ 3/5` đèn sáng | Đảo tròn `40 m`, rơi khỏi đảo (`Y < -10`) mất 1 Ngọn Lửa |
| **Đêm 2** | **Đảo Cau** | `270 s` | `≥ 4/6` đèn sáng | Hai đảo `28 m` + cầu tre + 2 Bục Nhảy + Bùa Gió `C1` + **Gió Lạc** |
| **Đêm 3** | **Đảo Chuông** | `300 s` | `≥ 5/7` đèn sáng | 3 tầng (`Y = 0/3/6`), 2 dốc `30°/150°`, Tháp Chuông, **Gió mạnh** mỗi `30 s`, 2 Bùa Gió |

- **Nhiên liệu đèn:** Khi thắp có `100` dầu, hao `1.0/s`; dưới `30` dầu mất vùng an toàn `6 m`, nhấp nháy `1 Hz` và bị Bóng Mực ở `wander` lao tới hút `5.0/s` (`drain`). Hết dầu (`≤ 0`) đèn tắt (`lantern_out`), thắp lại chỉ tốn `5` đom đóm.
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`), đặt lại về `10` ở đầu mỗi Đêm.
- **Khả năng tiếp cận:** Cài đặt **"Bảng màu dễ phân biệt"** (lưu `localStorage`) đổi viền/mắt Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`; đèn tắt luôn xẹp `20%` kèm vết rách.

### Công thức tính điểm mới (`tuning.score`)

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp mới, thắp lại hoặc châm dầu) | `+5` |
| Thắp đèn lần đầu / Thắp lại đèn từng sáng | `+100` / `+40` |
| Bóng Mực trúng Tỏa Sáng (thường / đang `drain`) | `+5` / `+15` |
| Bình minh (chỉ khi thắng `dawn_survived`) | `+ ∑(50 + floor(fuel))` mỗi đèn đang sáng `+ 50 × flames` |

---

## 4. Chế độ Headless & Kiểm thử (Test Contract v1.2)

```bash
npm run verify
```

Chạy trực tiếp Headless CLI cho Đêm `1`, `2`, hoặc `3`:

```bash
node dist/headless.js --seed 42 --night 3 --ticks 1800 --snapshot-every 60 --out out.jsonl
```

---

## 5. Sáng tạo của tôi

Cô lập 100% trong `src/web/`, không ảnh hưởng đầu ra headless JSONL:
1. **Sảnh Chọn Nhân Vật & Chủ Đề Bản Đồ kèm Xem Trước 3D Trực Tiếp:** 4 nhân vật chi tiết 3D (có khuôn mặt, tóc nhiều lớp, tay cầm lồng đèn đung đưa) và 4 chủ đề bản đồ kèm 4 tạo hình ma khác nhau (*Bóng Mực*, *Ma Trơi Rừng Trúc*, *Oan Hồn Tuyết*, *Quỷ Mặt Nạ Đỏ*).
2. **Âm thanh tổng hợp WebAudio:** Nhạc nền đêm ngũ cung + đầy đủ hiệu ứng âm thanh tổng hợp thời gian thực, không dùng file âm thanh ngoài.
3. **La bàn Ánh sáng + Mũi tên ngoài màn hình + Thanh dầu 3D & Lá bay theo Gió:** Dẫn đường tới đèn tắt hoặc đèn yếu `< 30` dầu, vòng sóng Pulse và hạt sáng.

---

## 6. Tài liệu SDLC & Kiến trúc

- [`game.contract.json`](game.contract.json) — Single Source of Truth (`contract_version: "1.2"`).
- [`docs/ADR-001-lantern-fuel-and-dawn-survival.md`](docs/ADR-001-lantern-fuel-and-dawn-survival.md) — ADR mô tả thay đổi mô hình nhiên liệu & luật thắng Phase 3.
- [`CHANGELOG.md`](CHANGELOG.md) — Danh sách đầy đủ Breaking Changes của Phase 3.
- [`docs/SPEC_PHASE2.md`](docs/SPEC_PHASE2.md) — Đặc tả & Acceptance Criteria các tính năng Phần 3 (Phase 2).
- [`EVIDENCE.md`](EVIDENCE.md) — Bằng chứng thực tế, lý do cập nhật test cũ & nhật ký AI/token.
- [`AGENTS.md`](AGENTS.md) & [`.agents/skills/verify-contract/SKILL.md`](.agents/skills/verify-contract/SKILL.md) — Harness AI.
