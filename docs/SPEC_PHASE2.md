# SPEC — Phase 2: "Ba hòn đảo" (TICKET-02 · Contract v1.1)

Tài liệu đặc tả và tiêu chí nghiệm thu (**Acceptance Criteria**) cho từng mục của **Phần 3 — Tính năng mới** cùng chuẩn hóa **Phần 1, 2, 4**.

---

## 1. Gió Lạc (Drifters — Đêm 2 & 3)
- **AC-1.1:** Sinh tối đa `2` con (`D1`, `D2`, …) tại các tick `1200, 2400, …` ở điểm sương ngẫu nhiên (chỉ tương tác từ tick sau); tắt được bằng `random_drifters: false`.
- **AC-1.2:** Trạng thái `idle` (lượn `2.0 m/s`) chuyển sang `chase` (`7.0 m/s`) khi Mây mang `>= 5` đom đóm và khoảng cách XZ `<= 15 m`; mất điều kiện thì quay về `idle`.
- **AC-1.3:** Khi `chase` và chạm Mây (`XZ <= 1.2 m`), cướp `min(3, carried)` đom đóm, phát `drifter_steal`, chuyển sang `flee` (`7.0 m/s` ra xa Mây trong `240` tick rồi biến mất). Mỗi con chỉ cướp tối đa 1 lần; xử lý trước Bóng Mực trong bước 9.
- **AC-1.4:** Trúng Tỏa Sáng (bán kính 3D `<= 5 m`) khi đang `chase` → chuyển `flee` không cướp; trúng khi đang `flee` có mang đồ → thả toàn bộ đom đóm đã cướp thành đom đóm rơi (`kind: "dropped"`, TTL `480` tick), phát `drifter_drop`, rồi biến mất sau `120` tick.
- **AC-1.5:** Không gây mất Ngọn Lửa, không bị chặn bởi `safe_radius`, và không bị chặn bởi `invuln` của Mây.

## 2. Bùa Gió (Wind Charms — Đêm 2 & 3)
- **AC-2.1:** Đặt tại Đêm 2 `C1 (35, 0, 0)`; Đêm 3 `C1 (30, 0, 25)` và `C2 (-30, 0, 25)`. Hiển thị lá bùa đỏ `#C8102E` viền vàng `#F2C14E`.
- **AC-2.2:** Nhặt theo luật đom đóm (`XZ <= 1.0 m`, chênh cao `<= 1.5 m`), phát `charm_picked: { charm_id, charm_ticks: 600 }`.
- **AC-2.3:** Trong `600` tick hiệu lực (nhặt lại làm mới): tốc độ chạy tăng lên `7.2 m/s`, Lướt không còn hồi chiêu (`dash_cd_s = 0`, vẫn cần nhấn lại phím và bỏ qua khi đang trong `12` tick lướt).
- **AC-2.4:** Sau khi nhặt, bùa hồi lại sau đúng `2700` tick (`45 s`).

## 3. Chuỗi 3 Đêm & Sảnh Chọn Chủ Đề
- **AC-3.1:** Luồng đầy đủ: **Menu chính (Sảnh)** → **Giới thiệu Đêm (tên đảo + lời Ông Đăng)** → **Chơi** → **Kết quả Đêm** → **Đêm kế tiếp** (`Đêm 1 → Đêm 2 → Đêm 3`).
- **AC-3.2:** Thắng Đêm 3 hiển thị màn hình **Bình Minh** cùng **tổng điểm** cộng dồn các Đêm đã thắng.
- **AC-3.3:** Thua ở bất kỳ Đêm nào cho phép **Chơi lại Đêm đó** hoặc **Về Menu chính**.
- **AC-3.4 (Sáng tạo cô lập):** Menu chính cho phép chọn 1 trong **4 nhân vật** (*Mây*, *Linh*, *Mộc*, *Sao*) và **4 chủ đề bản đồ / loại ma** (*Cổ Tích Chuẩn · Bóng Mực*, *Rừng Trúc Sương · Ma Trơi*, *Đỉnh Tuyết Băng · Oan Hồn Tuyết*, *Đền Đỏ Chạng Vạng · Quỷ Mặt Nạ Đỏ*) kèm xem trước 3D trực tiếp, không ảnh hưởng `src/sim/` hay đầu ra headless.

## 4. Tạm dừng (`Esc` / `P`)
- **AC-4.1:** Nhấn `Esc` hoặc `P` (hoặc nút `⏸` trên HUD) gửi cạnh lên `pause: true` vào `SimulationEngine`, phát event `paused`, chuyển `state: "paused"`.
- **AC-4.2:** Khi đang tạm dừng, `tick` ngoài vẫn tăng nhưng `sim_tick`, `time_left_s`, hồi chiêu, spawn và TTL đứng yên hoàn toàn.
- **AC-4.3:** Màn hình Tạm dừng có đủ 4 lựa chọn: *Tiếp tục*, *Chơi lại Đêm*, *Cài đặt*, *Về menu*. Nhấn *Tiếp tục* / `Esc` / `P` phát `resumed`.

## 5. Cài đặt (Settings)
- **AC-5.1:** Có thanh chỉnh **Âm lượng tổng (`0%–100%`)** và **Độ nhạy chuột (`0.2x–2.5x`)** mở được từ cả Menu chính lẫn Menu Tạm dừng.
- **AC-5.2:** Giá trị cài đặt tự động lưu vào `localStorage` (`ddl_settings_v1`) và khôi phục lại ở các lần mở game sau.

## 6. Âm thanh (Procedural WebAudio)
- **AC-6.1:** Có nhạc nền đêm ngũ cung nhẹ nhàng khi đang chơi và tắt khi về menu.
- **AC-6.2:** Có hiệu ứng âm thanh riêng cho đầy đủ 10 sự kiện: nhặt đom đóm, nạp/thắp đèn, Tỏa Sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, cảnh báo gió & đếm ngược 10 giây cuối.

## 7. HUD đầy đủ
- **AC-7.1:** **Trên trái:** Ngọn Lửa, nhãn Bùa Gió (khi đang kích hoạt), cảnh báo Gió mạnh (Đêm 3) và chỉ số FPS.
- **AC-7.2:** **Trên giữa:** Đồng hồ `mm:ss`, tự đổi màu đỏ `#FF5A5F` và nhấp nháy khi còn `<= 30 s`.
- **AC-7.3:** **Trên phải:** Số đèn `k/n`, điểm số màu vàng `#F2C14E` và nút Tạm dừng.
- **AC-7.4:** **Dưới giữa:** Thanh đom đóm **10 ô** riêng biệt + dòng nhắc `"E — Nạp ánh sáng (x/10)"` khi đứng trong bán kính `2.0 m` của đèn chưa sáng.
- **AC-7.5:** **Dưới phải:** Biểu tượng & thanh hồi chiêu của **Lướt (`Shift`)** và **Tỏa Sáng (`Q`)**.
- **AC-7.6:** **Ngoài màn hình:** Mũi tên vàng xoay ở mép màn hình chỉ tới Đèn Lồng Lớn chưa sáng gần nhất khi đèn nằm ngoài khung nhìn camera.

## 8. Bảng màu chuẩn & Ánh sáng môi trường
- **AC-8.1:** Chủ đề mặc định (**Cổ Tích Chuẩn**) áp dụng chính xác bảng màu chuẩn Phase 2: trời `#0E1430`, sương `#1B2350`, cỏ `#2F5D50`, cát `#C9B48A`, gỗ `#6B4A2F`, biển mây `#12384A`, đèn sáng `#FFB347`/`#FFE9B0`, đèn tắt `#5B5F6E`, đom đóm `#FFF6C2`/`#FFE58A`, Bóng Mực `#120A1A`/`#7A3CFF`/`#3A3450`, Mây `#E8E2D0`/`#C8102E`, viền vàng `#F2C14E`, Gió Lạc `#8FA3B8`, nguy hiểm `#FF5A5F`, chữ `#F5F1E6`.
- **AC-8.2:** Cường độ ánh sáng môi trường cập nhật theo đúng công thức `0.15 + 0.55 × (đèn sáng / tổng đèn)`.
