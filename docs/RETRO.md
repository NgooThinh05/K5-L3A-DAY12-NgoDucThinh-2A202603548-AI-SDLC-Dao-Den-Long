# Retrospective — Đảo Đèn Lồng (4 Phases · v1.0.0)

**Dự án:** Đảo Đèn Lồng (`2A202603548-NgoDucThinh`) · **Mô hình:** AI SDLC · **Phiên bản phát hành:** `v1.0.0` (Contract `v1.3`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Mục tiêu chính | Contract | Kiểm chứng tự động | Chỉ số nổi bật | Đánh giá |
|---|---|---|---|---|---|
| **Phase 1** (`PRD-0`) | Kiến trúc Headless-First, Đảo Bến 3D, PRNG tất định `Mulberry32`, CLI headless | `v1.0` | **10/10 PASS** | SHA-256 trùng khớp 100% byte-for-byte | Đạt trọn vẹn, đặt nền móng tách biệt `src/sim/` khỏi `src/web/`. |
| **Phase 2** (`TICKET-02`) | Chuỗi 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Dash, Rơi khỏi đảo, Bục nhảy, Bùa Gió, Gió Lạc, Gió mạnh, Pause, Menu sáng tạo | `v1.1` | **16/16 PASS** | Full Đêm 3 (`21,600` tick): **297 ms** (`<< 30 s`) | Mở rộng độ phức tạp gấp 3 lần nhưng giữ nguyên tính tất định và sạch mã nguồn. |
| **Phase 3** (`TICKET-03`) | Change Request "Đèn cạn dầu": nhiên liệu đèn, Bóng Mực `drain`, sức chứa tăng dần, luật thắng `dawn_survived`, chế độ mù màu | `v1.2` | **17/17 PASS** | Full Đêm 3 (`18,000` tick): **351 ms**; cập nhật 3 test cũ có lý do rõ ràng | Xử lý Change Request phá vỡ tương thích nhanh gọn (~30 phút), ADR & Changelog rõ ràng. |
| **Phase 4** (`TICKET-04`) | Benchmark 3D (`200` Bóng Mực + `100` Đom Đóm), Soak 10 Đêm, Bảng xếp hạng đĩa cục bộ, 4 nhóm Accessibility, đóng gói `v1.0.0` | `v1.3` | **19/19 PASS** | Bench: **`109.1 FPS`**, `1% low` **`67.2 FPS`**, `load` **`2.0 s`**; Soak: `0` crash, RSS `1.07×` | Đạt vượt mức mọi ngưỡng phi chức năng trên iGPU Intel UHD, sẵn sàng phát hành. |

---

## 2. Điều gì hiệu quả và chưa hiệu quả khi làm việc với AI

### Hiệu quả cao
- **Headless-First + Test Contract làm "mỏ neo sự thật":** Khi toàn bộ luật chơi và số liệu cân bằng nằm trong `game.contract.json` và được kiểm tra bằng CLI headless, AI triển khai tính năng rất nhanh và gần như không drift logic giữa các phase.
- **Lập trình đồ họa thủ tục (Procedural 3D & WebAudio):** AI tạo tốt hình khối Three.js (từ Áo Dài, Hanbok, đồ Tinh Linh, Công Chúa Băng Giá dùng spline/LatheGeometry tới `InstancedMesh` cho 200 Bóng Mực) và âm thanh ngũ cung WebAudio mà không phụ thuộc asset ngoài.
- **Chạy kiểm thử & đo thực tế ngay sau mỗi lần sửa:** Nhờ yêu cầu "chạy thật, đọc log thật", các vấn đề hiệu năng thật trên phần cứng được phát hiện và xử lý triệt để thay vì chỉ phỏng đoán.

### Chưa hiệu quả / Cần kiểm soát chặt
- **Dễ mắc bẫy tối ưu/cấu hình đặc thù hệ điều hành:** Các cờ trình duyệt (`--disable-frame-rate-limit`), lệnh shell Windows PowerShell 5.1 (không hỗ trợ `&&`), hay định dạng số `tasklist` theo locale tiếng Việt (`.` thay vì `,`) dễ gây lỗi nếu AI không trực tiếp chạy thử trên máy đích.
- **Tạo hình 3D thủ công cần lặp lại theo phản hồi thị giác:** Ở lần đầu tạo trang phục nhân vật, hình khối còn hơi cứng dạng trụ; cần yêu cầu cụ thể hơn về đường cong `LatheGeometry`/`ExtrudeGeometry` và kiểm tra trực tiếp trên trình duyệt.

---

## 3. Những lần AI sai và cách phát hiện

| # | Lỗi phát sinh | Cách phát hiện | Cách khắc phục |
|---|---|---|---|
| 1 | **Phase 1 — `TS5097` khi dùng đuôi `.ts` trong import:** `tsc --noEmit` báo lỗi do `tsconfig.json` thiếu `allowImportingTsExtensions`. | Chạy `npm run typecheck` ngay sau bước khởi tạo. | Bật `"allowImportingTsExtensions": true` với `"noEmit": true`. |
| 2 | **Phase 2 — Test #16 (Full Night 3) dừng sớm ở tick `17,926/21,600`:** Người chơi đứng yên bị Bóng Mực chạm hết 3 Ngọn Lửa trước khi hết đêm. | `npm test` báo `17926 !== 21600`. | Thiết lập `flames: 500` trong scenario hiệu năng để đo trọn vẹn toàn bộ đêm. |
| 3 | **Phase 4 — `bench.json` đạt `avg_fps: 72–97` nhưng `p1_low_fps` tụt còn `1.8–3.7 FPS`:** Do hai nguyên nhân cộng hưởng: (a) gọi `canvas.toDataURL()` ngay giữa vòng đo benchmark, (b) cờ `--disable-frame-rate-limit` làm tràn hàng đợi lệnh GPU Direct3D11 trên Intel UHD Graphics gây khựng `~500 ms` mỗi `1.3 s`, cộng thêm polling PowerShell WMI mỗi `2 s`. | Đọc trực tiếp `bench.json` và đối chiếu nghịch lý `frame_ms_p95 = 7.6 ms` nhưng `p1_low_fps = 1.8`. | Dời chụp ảnh sau khi đo xong; bỏ `--disable-frame-rate-limit` (giữ `--disable-gpu-vsync`); khóa `pixelRatio = 1` trong bench; chuyển đo RSS sang async 8s. Kết quả: `p1_low_fps` tăng vọt từ **`1.8` → `67.2 FPS`**, `avg_fps` đạt **`109.1 FPS`**. |
| 4 | **Phase 4 — `soak.json` có `mem_end_mb / mem_start_mb = 46.7 / 35.1 = 1.33×` (> `1.2×`):** Warmup 60 tick chưa đủ kích hoạt V8 TurboFan trước khi đo `mem_start_mb`. | Đọc `soak.json` thực tế và kiểm tra tỷ số RSS. | Warmup `3,000` tick phủ đủ mọi nhánh mô phỏng trước khi tải Đêm 1; tỷ số RSS ổn định còn **`40.8 / 38.1 = 1.07×`** (`0` rò rỉ bộ nhớ). |
| 5 | **Phase 4 — `peak_mem_mb: null` khi dùng `tasklist`:** Windows tiếng Việt xuất `"75.412 K"` (dấu chấm ngăn nghìn) khiến regex `[\d,]+` không khớp. | Kiểm tra `bench.json` và chạy thử `tasklist` trực tiếp. | Dùng truy vấn async `Get-CimInstance` lọc chính xác cây tiến trình của trình duyệt benchmark (`peak_mem_mb: 846.5 MB`). |

---

## 4. Harness nào giúp ích nhiều nhất?

1. **`AGENTS.md` (Hiệu quả nhất):** Đóng vai trò "hiến pháp" ngăn AI phá vỡ ranh giới `src/sim/` ↔ `src/web/`, cấm `Math.random()`/`Date.now()` trong lõi mô phỏng, giữ `game.contract.json` là Single Source of Truth, và buộc phải có bằng chứng `npm run verify` trước khi kết luận.
2. **Skill `.agents/skills/verify-contract/SKILL.md` + `npm run verify`:** Biến quy trình kiểm chứng 19 test hợp đồng + typecheck + build + kiểm tra tính tất định thành một cổng duy nhất chạy trong `< 5 s`, giúp phát hiện ngay hồi quy sau mọi chỉnh sửa.
3. **`game.contract.json`:** Giúp cả bộ test, headless CLI, soak, benchmark và giao diện 3D đọc cùng một cấu hình, triệt tiêu lỗi lệch hằng số khi đổi luật ở Phase 3.

---

## 5. Tổng ước tính Token / Chi phí AI & Cách tiết kiệm Token

| Giai đoạn | Ước tính Token (Input + Output) | Ước tính chi phí quy đổi* | Công việc chính |
|---|---:|---:|---|
| **Phase 1** (`PRD-0`) | ~55,000 tokens | ~\$0.25 | Kiến trúc Headless-First, Đảo Bến 3D, PRNG, 10 test |
| **Phase 2** (`TICKET-02` + sáng tạo) | ~120,000 tokens | ~\$0.55 | 3 Đêm, vật lý/AI mở rộng, menu chọn nhân vật/map/ma, tạo hình 3D |
| **Phase 3** (`TICKET-03` + trang phục/zoom) | ~90,000 tokens | ~\$0.40 | Change Request nhiên liệu + `drain` + `dawn_survived`, trang phục mềm mại, zoom |
| **Phase 4** (`TICKET-04` + tối ưu bench/soak) | ~85,000 tokens | ~\$0.38 | Benchmark 3D, Soak 10 đêm, Leaderboard, 4 nhóm Accessibility, đóng gói & tài liệu |
| **Tổng cộng 4 Phase** | **~350,000 tokens** | **~\$1.58** | Toàn bộ sản phẩm `v1.0.0` |

*\*Quy đổi tham khảo theo đơn giá API trung bình ~\$1.25 / 1M input & ~\$5–10 / 1M output token.*

**Cách đã áp dụng để tiết kiệm token:**
- Gộp các thao tác đọc/sửa/ghi file độc lập song song trong một lượt thay vì gọi rời rạc từng tool.
- Nhờ tách `src/sim/` gọn nhẹ (~70 KB sau bundle), khi đổi luật ở Phase 3 và viết soak/bench ở Phase 4 không cần đọc lại toàn bộ `renderer.ts` (~2,300 dòng).
- Chạy `npm run verify` để nhận báo lỗi chính xác thay vì đọc lại cả codebase để dò bằng mắt.

---

## 6. Nếu làm lại từ đầu thì sẽ đổi gì?

1. **Tách `src/web/renderer.ts` sớm thành nhiều module nhỏ** (`character_builder.ts`, `map_builder.ts`, `ghost_builder.ts`, `bench_renderer.ts`) ngay từ Phase 2 thay vì dồn >2,300 dòng vào một file — giúp bảo trì và tiết kiệm ngữ cảnh AI hơn nhiều.
2. **Thiết lập `bench_cmd` và `soak_cmd` sớm ở dạng khung từ Phase 2** để phát hiện nút thắt GPU/GC sớm thay vì đợi tới Phase 4.
3. **Tạo sẵn thư mục dữ liệu & script đóng gói Release/Docker ngay từ Phase 1** và gắn tag git (`phase-1`, `phase-2`, `phase-3`, `phase-4`) ngay sau mỗi mốc nghiệm thu.
