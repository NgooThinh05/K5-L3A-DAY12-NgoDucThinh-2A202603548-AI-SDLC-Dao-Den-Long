# ADR-001: Chuyển mô hình Đèn Lồng sang Nhiên liệu nguyên `1/60` & Luật Thắng "Sống sót tới Bình Minh"

- **Trạng thái:** Accepted (Phase 3 — TICKET-03 · Contract v1.2)
- **Ngày:** 2026-11-20
- **Bối cảnh:** Ở Phase 1–2, đèn sáng vĩnh viễn và trận đấu kết thúc ngay khi thắp đủ đèn (`all_lit`). Playtest cho thấy người chơi giỏi hoàn tất quá sớm (~2 phút), thiếu cao trào giữ đảo ở cuối Đêm. TICKET-03 đưa ra Change Request thay đổi hai nền tảng cốt lõi: **trạng thái đèn có nhiên liệu cạn dần/bị hút** và **luật thắng chuyển sang giữ đủ ngưỡng đèn sáng tại thời điểm bình minh (`dawn_survived`)**.

---

## 1. Quyết định thiết kế

### A. Mô hình trạng thái Đèn Lồng (`InternalLantern`) & Số học nguyên `1/60`
Thay vì lưu `fuel` dạng số thực float (dễ tích lũy sai số `1/60 = 0.016666...` sau 18,000 tick làm lệch ngưỡng `30.0` hoặc tắt đèn sai 1 tick), chúng tôi lưu trữ nội bộ bằng số nguyên **`fuel60 ∈ [0, 6000]`**:
- `100.0` dầu = `6000`; ngưỡng mất vùng an toàn `30.0` = `1800`.
- Hao tự nhiên: `-1` mỗi tick (`1/60` dầu/tick = `1.0/s`).
- Bóng Mực hút (`drain`): `-5` mỗi tick mỗi con (`5/60` dầu/tick = `5.0/s`), cộng dồn nhiều con, phát `fuel_drain` mỗi `60` tick.
- Châm dầu: `motesNeeded = Math.ceil((6000 - fuel60) / 600)` — tương đương chính xác tuyệt đối `ceil((100 - fuel) / 10)` không sai số làm tròn.
- Tắt đèn ngay sau bước 2 khi `fuel60 <= 0`: `lit = false`, `deposited = 0`, `everLit = true`, phát `lantern_out`. Lần thắp lại chỉ cần `5` đom đóm (`relight: true`, `relit_count++`, `+40` điểm).
- Vùng an toàn `6 m` chỉ kích hoạt khi `lit === true && fuel60 >= 1800` (`fuel >= 30`). Khi châm dầu từ `< 30` lên `>= 30`, kích hoạt cơ chế đẩy Bóng Mực ra mép `6 m` trong tối đa `30` tick giống hệt lúc mới thắp.

### B. Luật Thắng/Thua mới & Thứ tự xử lý trong Tick
- Bỏ điều kiện thắng sớm `all_lit`. Thắp đủ đèn không kết thúc Đêm mà mở rộng sức chứa người chơi (`min(20, 10 + 2 × successful_lights)`).
- Thời lượng chuẩn mới: `240 s` / `270 s` / `300 s`.
- Tại bước 11 cuối mỗi tick (kể cả tick bình minh):
  1. `flames <= 0` → luôn thua `no_flames` trước.
  2. `time_left_s <= 0`: nếu `litCount >= ceil(0.6 × total)` (`3/5`, `4/6`, `5/7`) → thắng `dawn_survived`, cộng điểm bình minh `∑(50 + floor(fuel)) + 50 × flames` (bỏ thưởng thời gian); ngược lại → thua `dawn`.

### C. Bóng Mực `drain` & Hồi phục sau choáng
- Bổ sung trạng thái thứ 6 (`drain`) cho Bóng Mực. Chỉ Bóng ở `wander` mới đi tìm đèn yếu (`lit && fuel < 30`) gần nhất; vào `≤ 2 m` thì đứng yên hút dầu.
- Bóng `drain` trúng Pulse bị choáng `120` tick và thưởng `+15` điểm thay vì `+5`. Mọi Bóng hết choáng đều về `wander`.

### D. Khả năng tiếp cận (Chế độ mù màu)
- Cài đặt **"Bảng màu dễ phân biệt"** lưu trong `localStorage`: đổi viền & mắt Bóng Mực sang `#00B3FF`, đổi màu cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`.
- Đèn tắt luôn xẹp `20%` và có vết rách tối trên thân giấy; đèn sáng có thanh dầu 3D nổi và nhấp nháy chậm `1 Hz` khi `fuel < 30`, giúp phân biệt hoàn toàn không cần màu sắc.

---

## 2. Hệ quả & Đánh đổi
- **Ưu điểm:** Loại bỏ 100% sai số số thực khi tính dầu qua hàng chục nghìn tick, giữ nguyên tính tất định byte-for-byte và tốc độ headless (`~0.3 s` cho Đêm 3 đầy đủ).
- **Ảnh hưởng tới test cũ (Breaking Changes):** Các test Phase 1–2 cũ kiểm tra thắng sớm `all_lit`, công thức điểm cũ (`+10`/đom đóm, thưởng thời gian), thời lượng `300/330/360 s` và Bóng hết choáng quay thẳng sang `chase` bị thay thế và đã được cập nhật minh bạch trong `tests/contract.test.ts` + ghi lý do trong `EVIDENCE.md` và `CHANGELOG.md`.
