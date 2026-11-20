# CHANGELOG — Đảo Đèn Lồng

## [Phase 3 · Contract v1.2] — 2026-11-20 ("Đèn cạn dầu" — TICKET-03)

### Breaking Changes (Thay đổi phá vỡ tương thích so với Phase 2 / Contract v1.1)
1. **Luật thắng thay thế (`[THAY THẾ]`):**
   - Loại bỏ thắng sớm `all_lit`; thắp đủ đèn không còn kết thúc Đêm.
   - Đổi điều kiện thắng thành **sống sót tới bình minh (`dawn_survived`)** với số đèn đang sáng tại tick cuối `≥ ceil(0.6 × tổng đèn)` (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`).
   - Rút ngắn thời lượng chuẩn 3 Đêm: `300 / 330 / 360 s` → **`240 / 270 / 300 s`**.
2. **Nhiên liệu đèn & Châm dầu (`[THAY THẾ]`):**
   - Đèn sáng không còn sáng vĩnh viễn: bắt đầu với `fuel = 100`, hao `1.0/s` (`1/60` mỗi tick); tắt khi `fuel ≤ 0` (`lantern_out`, `deposited = 0`, `ever_lit = true`).
   - Đèn đã sáng nhưng chưa đầy dầu có thể châm dầu bằng `interact`: `used = min(carried, ceil((100 - fuel) / 10))`, phát event `refuel`. Đèn đầy dầu bị bỏ qua.
   - Đèn đã từng sáng (`ever_lit`) thắp lại chỉ cần **`5`** đom đóm (`lantern_lit.relight = true`, tăng `relit_count`).
3. **Vùng an toàn & Bóng Mực hút dầu (`[THAY THẾ]`):**
   - Đèn có `fuel < 30` mất vùng an toàn `6 m` (đúng `30` vẫn giữ).
   - Bóng Mực ở `wander` chủ động tìm đèn yếu (`fuel < 30`) và chuyển sang trạng thái mới **`drain`** khi ở `≤ 2 m`, hút thêm `5 fuel/s`, phát `fuel_drain` mỗi `60` tick.
   - Bóng Mực hết `stunned` luôn quay về `wander`.
4. **Công thức điểm mới (`[THAY THẾ]`):**
   - Mỗi đom đóm nạp/châm dầu: `+10` → **`+5`**.
   - Thắp lần đầu: `+100`; Thắp lại: **`+40`**.
   - Trúng Tỏa Sáng: `+5` bình thường, **`+15`** nếu ngay trước đó đang `drain`.
   - Bỏ thưởng thời gian (`per_second_left = 0`); thay bằng thưởng bình minh khi thắng: **`+50 + floor(fuel)`** mỗi đèn đang sáng + **`+50`** mỗi Ngọn Lửa còn lại.
5. **Contract v1.2 Schema:**
   - `contract_version`: `"1.1"` → `"1.2"`.
   - Snapshot đèn thêm `fuel`, `ever_lit`, `relit_count`; Snapshot người chơi thêm `capacity`.
   - Event `lantern_lit` thêm `relight`; thêm `refuel`, `lantern_out`, `fuel_drain`; `game_over.reason` thay `all_lit` bằng `dawn_survived`.

### Tính năng mới (Phase 3)
- **Sức chứa tăng dần:** `min(20, 10 + 2 × successful_lights)` mỗi Đêm, hiển thị động trên thanh đom đóm HUD.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Cài đặt lưu `localStorage`, đổi Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`.
- **Phân biệt đèn không cần màu:** Đèn tắt xẹp `20%` kèm vết rách; đèn sáng có thanh dầu 3D nổi và nhấp nháy `1 Hz` khi `fuel < 30`.

---

## [Phase 2 · Contract v1.1] — 2026-11-20 ("Ba hòn đảo" — TICKET-02)
- Chuẩn hóa toàn bộ hằng số điều khiển, vật lý 60Hz, Lướt (`dash`), rơi khỏi đảo (`Y < -10`), đom đóm rơi TTL `480` tick, vùng an toàn `6 m` đẩy bóng trong `<= 30` tick, Pulse 3D + đẩy `4 m` trong `15` tick, 5 trạng thái Bóng Mực.
- Mở rộng thành chuỗi **3 Đêm**: Đảo Bến, Đảo Cau (2 đảo + cầu tre + Bục Nhảy + Bùa Gió + Gió Lạc), Đảo Chuông (3 tầng + 2 dốc + Tháp Chuông + Gió mạnh).
- Thêm Menu chọn Nhân vật / Chủ đề bản đồ / Loại ma, Tạm dừng (`Esc`/`P`), Cài đặt `localStorage`, nhạc nền & âm thanh WebAudio, HUD 10 ô + mũi tên ngoài màn hình, và nhân vật 3D có mặt/tóc/tay cầm lồng đèn.

## [Phase 1 · Contract v1.0] — 2026-11-20 ("Đảo Bến" — PRD-0)
- Xây dựng kiến trúc Headless-First (`src/sim/` thuần + Three.js `src/web/`), PRNG tất định `Mulberry32`, CLI `dist/headless.js` và bộ 10 test tự động Contract v1.0.
