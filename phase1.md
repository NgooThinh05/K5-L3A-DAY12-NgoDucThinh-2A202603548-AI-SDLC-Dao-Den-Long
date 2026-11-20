# AGENTS.md — Đảo Đèn Lồng (Day 12 · AI SDLC Lab · Phase 1)

File này là **nguồn chân lý duy nhất (Single Source of Truth)** và bộ quy tắc bắt buộc cho AI Agent khi thiết kế, lập trình, kiểm thử và bàn giao game 3D **Đảo Đèn Lồng — Phase 1**.

---

## 1. Nguyên tắc tối thượng (Core Directives)

1. **Đúng yêu cầu > Phức tạp:** Hoàn thiện 100% lõi gameplay và **Test Contract v1.0** trước. Tuyệt đối không thêm tính năng phụ khi chế độ `headless` chưa vượt qua kiểm thử tự động.
2. **Tách biệt Lõi & Hiển thị (Headless-First Architecture):** Toàn bộ logic game (vật lý, di chuyển, va chạm, AI Bóng Mực, điểm số, trạng thái thắng/thua) PHẢI nằm trong một module mô phỏng thuần (Pure Simulation Core), chạy độc lập không cần GPU, không cần cửa sổ, không phụ thuộc DOM/WebGL. Giao diện 3D chỉ là lớp đọc trạng thái (render) và gửi input vào lõi này.
3. **Một nguồn thông số duy nhất:** Mọi hằng số cân bằng game trong code PHẢI đọc trực tiếp từ (hoặc đồng bộ 100% với) `tuning` trong file `game.contract.json`. Khai lệch số sẽ làm trượt bài test tự động.
4. **Không có bằng chứng = Chưa xong:** Không bao giờ tuyên bố hoàn thành nếu chưa tự chạy lệnh kiểm thử thực tế, kiểm tra exit code và xác minh định dạng JSONL đầu ra.
5. **Tiết kiệm Token:** Viết code gọn, rõ ràng, đúng trọng tâm, tránh over-engineering.

---

## 2. Kiến trúc & Công nghệ khuyến nghị

- **Ngôn ngữ / Runtime:** TypeScript + Node.js (chạy mượt trên macOS/Linux, đáp ứng dễ dàng yêu cầu chạy tối đa 3 lệnh trong `README.md`).
- **3D Frontend:** Three.js + Vite (đồ họa low-poly / stylized đơn giản, đẹp, không cần asset nặng).
- **Headless Runner:** Script Node.js/TS chạy trực tiếp Simulation Core ở tần số cố định 60 tick/giây (nhanh nhất có thể, không `setTimeout`/`requestAnimationFrame`).
- **Cấu trúc thư mục gợi ý:**
  ```text
  .
  ├── game.contract.json      # Bắt buộc ở gốc repo
  ├── AGENTS.md               # File hướng dẫn này
  ├── README.md               # Cài đặt (<=3 lệnh), điều khiển, tính điểm, sáng tạo
  ├── EVIDENCE.md             # Bằng chứng chạy test, giả định, nhật ký dùng AI
  ├── src/
  │   ├── sim/                # Pure Simulation Core (deterministic, 0 dependency UI)
  │   │   ├── prng.ts         # Bộ sinh số ngẫu nhiên tất định theo --seed
  │   │   ├── types.ts        # Kiểu dữ liệu state, input, scenario, event
  │   │   ├── engine.ts       # Vòng lặp step(tick, input) cố định 1/60s
  │   │   └── headless.ts     # CLI entrypoint cho headless_cmd
  │   └── web/                # Three.js renderer, camera 3D, HUD, input bàn phím/chuột
  └── tests/                  # Bộ test tự động kiểm tra Test Contract v1.0
  ```

---

## 3. Yêu cầu Gameplay — Phase 1 (Đêm 1: Đảo Bến)

### 3.1. Cốt truyện & Bối cảnh
- Nhân vật chính: **Mây** — người giữ đèn nhỏ tuổi đội **nón lá có treo một chiếc đèn lồng nhỏ**.
- Bản đồ: **Đảo Bến**, một hòn đảo hình tròn giữa biển mây, mặt đất ở độ cao $Y = 0$, có **5 Đèn Lồng Lớn** (`L1` đến `L5`).
- Nhiệm vụ: Chạy quanh đảo thu thập **đom đóm (motes)**, mang về nạp vào 5 Đèn Lồng Lớn để thắp sáng chúng.

### 3.2. Cơ chế cốt lõi bắt buộc
- **Di chuyển & Camera:** Nhân vật đi lại, nhảy, camera 3D góc nhìn thứ 3.
- **Đom đóm (Motes):** Xuất hiện rải rác trên đảo, tự động nhặt khi Mây đi vào trong bán kính `pickup_radius` và số lượng đang mang `< carry_capacity`.
- **Thắp đèn (Lanterns):** Khi đứng trong bán kính `interact_radius` của đèn chưa sáng và bấm `interact` (nếu đang mang đom đóm), nạp đom đóm vào đèn. Khi `deposited >= lantern_cost`, đèn sáng (`lit = true`).
- **Bóng Mực (Shades):** Xuất hiện và đuổi theo Mây với tốc độ `shade_speed`.
  - Chạm Mây (khoảng cách $\le$ `shade_hit_radius`, không trong thời gian bất tử `invuln_s`): Mây mất 1 máu (`flames`), rơi đom đóm theo tỉ lệ `hit_drop_ratio`, kích hoạt bất tử `invuln_s`.
  - **Vùng an toàn:** Bóng Mực sợ đèn đã thắp sáng, không được tiến vào bán kính `safe_radius` quanh bất kỳ đèn nào có `lit === true`.
- **Tỏa sáng (Pulse):** Khi bấm `pulse`, nếu đủ ánh sáng (`carried >= pulse_cost`) và hết hồi chiêu (`pulse_cooldown_s`):
  - Trừ `pulse_cost` đom đóm đang mang.
  - Mọi Bóng Mực trong bán kính `pulse_radius` bị đẩy lùi thêm `pulse_push_m` mét (ra xa Mây) và bị choáng (`state: "stunned"`) trong `pulse_stun_s` giây.
- **Điều kiện Thắng / Thua:**
  - **Thắng (`won`, `reason: "all_lit"`):** Cả 5 Đèn Lồng Lớn đều sáng.
  - **Thua (`lost`, `reason: "no_flames"`):** `flames <= 0`.
  - **Thua (`lost`, `reason: "dawn"`):** Hết thời gian Đêm 1 (`time_left_s <= 0`).
- **Điểm số & UI:** Có hệ thống tính điểm khớp `tuning.score`, có HUD hiển thị (máu/flames, đom đóm đang mang/tối đa, số đèn đã thắp, thời gian còn lại, điểm số, trạng thái hồi chiêu Pulse) và màn hình Thắng/Thua có nút **Chơi lại**.

### 3.3. Cảm giác, Phong cách & Sáng tạo
- **Thẩm mỹ:** Đêm cổ tích ấm áp, không bạo lực/máu me. Ánh sáng vàng cam ấm = an toàn/tốt; tím đen = nguy hiểm. Đảo sáng dần lên (ánh sáng môi trường, sương mù dịu đi) mỗi khi thắp thêm một đèn.
- **Sáng tạo mở rộng (chỉ làm SAU khi xong lõi):** Có thể thêm chi tiết đẹp mắt (hiệu ứng hạt, âm thanh WebAudio nhẹ nhàng, hoa/cỏ phát sáng, đom đóm bay lượn, chỉ dẫn hướng đèn).
  - **QUY TẮC CỨNG:** Mọi yếu tố sáng tạo KHÔNG ĐƯỢC làm thay đổi hành vi, tọa độ, điểm số hay output của chế độ `headless`. Nếu thêm thực thể mới, bắt buộc tắt khi chạy headless. Ghi rõ mục **"Sáng tạo của tôi"** trong `README.md`.

---

## 4. Đặc tả bắt buộc — Test Contract v1.0

Mọi chi tiết dưới đây là **BẮT BUỘC TUYỆT ĐỐI** để vượt qua hệ thống chấm tự động.

### A. File `game.contract.json` (tại thư mục gốc)
Phải có đúng cấu trúc sau (điền giá trị thực tế mà game sử dụng, không để 0 vô lý trừ khi cơ chế đó thật sự bằng 0; nếu không có khái niệm nào thì điền `null` hoặc `false` và giải thích trong `README.md`):

```json
{
  "contract_version": "1.0",
  "team": "mssv-ho-ten",
  "build_cmd": "npm install && npm run build",
  "run_cmd": "npm run dev",
  "headless_cmd": "node dist/headless.js",
  "tuning": {
    "player_speed": 6.0,
    "carry_capacity": 10,
    "lantern_cost": 5,
    "lantern_count_night1": 5,
    "pickup_radius": 1.5,
    "interact_radius": 2.5,
    "pulse_cost": 2,
    "pulse_radius": 6.0,
    "night1_duration_s": 300,
    "flames": 3,
    "invuln_s": 1.5,
    "hit_drop_ratio": 0.5,
    "pulse_stun_s": 3.0,
    "pulse_push_m": 4.0,
    "pulse_cooldown_s": 4.0,
    "safe_radius": 5.0,
    "shade_speed": 3.5,
    "shade_hit_radius": 1.2,
    "fall_enabled": false,
    "score": {
      "per_mote": 10,
      "per_lantern": 100,
      "per_stun": 25,
      "per_second_left": 2,
      "per_flame_left": 50
    }
  }
}
```
*(Các con số trên là gợi ý hợp lý; Agent có thể tinh chỉnh để game cân bằng, miễn là code game dùng CHÍNH XÁC các số này).*

### B. Tham số CLI & Quy ước mô phỏng Headless
Cú pháp lệnh:
```bash
<headless_cmd> --seed <int> --night 1 [--scenario <file.json>] [--inputs <file.json>] --ticks <int> --out <file.jsonl> [--snapshot-every <int, default 10>]
```

- **Tần số cố định:** 60 tick/giây ($\Delta t = 1/60$ giây). Chạy nhanh nhất có thể, không chờ thời gian thực.
- **Điều kiện dừng:** Khi chạy đủ `--ticks` bước HOẶC ngay khi game kết thúc (`won`/`lost`). Thoát với exit code `0`.
- **Xử lý lỗi:**
  - File `--inputs` hoặc `--scenario` sai định dạng JSON, sai kiểu dữ liệu, hoặc `tick` trong `frames` không tăng nghiêm ngặt $\rightarrow$ in thông báo lỗi ra `stderr` và thoát với **exit code `2`**.
  - Các lỗi khác (thiếu tham số bắt buộc, lỗi I/O...) $\rightarrow$ in ra `stderr` và thoát với **exit code khác `0`** (ví dụ `1`).
- **Hệ tọa độ & Khoảng cách:**
  - Đơn vị: mét. Trục $Y$ hướng lên. Mặt đất tại $Y = 0$.
  - Người chơi xuất phát tại `(0, 0, 0)`.
  - Điểm tham chiếu: `player.pos` = chân nhân vật; `shade.pos` = tâm Bóng Mực; `lantern.pos` = chân cột đèn; `mote.pos` = hình chiếu trên mặt đất ($Y = 0$, độ cao lơ lửng chỉ là hiển thị).
  - Mọi khoảng cách trong `tuning` đo trên **mặt phẳng ngang XZ**:
    $$d = \sqrt{(x_1 - x_2)^2 + (z_1 - z_2)^2}$$
  - Không cộng thêm bán kính thân nhân vật. "Trong bán kính $r$" nghĩa là $d \le r$.
- **Mô hình Tick:**
  - **Snapshot tick 0:** Ghi trạng thái ngay sau khi khởi tạo màn chơi + áp dụng `scenario`, TRƯỚC khi xử lý bất kỳ input nào.
  - **Bước thứ $k$ ($k = 0 \dots N-1$):** Đọc input của tick $k$, mô phỏng 1 bước $\Delta t = 1/60\text{s}$ để ra trạng thái ở tick $k+1$. Mọi `event` phát sinh trong bước này mang `"tick": k + 1`.
  - `--ticks N` chạy tối đa đúng $N$ bước (từ tick $0$ đến tick $N$).
  - Thời gian còn lại:
    $$\text{time\_left\_s} = \text{initial\_time\_left\_s} - \frac{\text{steps\_run}}{60}$$

### C. Định dạng file `--inputs`
```json
{
  "frames": [
    { "tick": 0,   "move": [0, 1], "cam_yaw_deg": 0 },
    { "tick": 120, "move": [0, 0], "interact": true },
    { "tick": 121, "interact": false }
  ]
}
```
- **Trạng thái mặc định ban đầu:** `move: [0, 0]`, `cam_yaw_deg: 0`, mọi nút (`jump`, `interact`, `pulse`, `dash`) đều `false`.
- **Tính duy trì (Sticky):** Mỗi frame chỉ ghi đè các trường xuất hiện trong frame đó; trường không xuất hiện giữ nguyên giá trị cũ.
- **Kiểm tra hợp lệ:** Giá trị `tick` giữa các frame phải **tăng nghiêm ngặt** ($t_i < t_{i+1}$). Nếu trùng hoặc giảm $\rightarrow$ thoát mã `2`.
- **Công thức di chuyển:** Cho `move` = $[x, z]$ với $x, z \in [-1, 1]$ và $\theta = \text{cam\_yaw\_deg} \times \frac{\pi}{180}$:
  - Chuẩn hóa vector nếu $\sqrt{x^2 + z^2} > 1$: chia cả $x, z$ cho $\sqrt{x^2 + z^2}$.
  - Hướng di chuyển trong thế giới:
    $$x' = x \cos\theta + z \sin\theta$$
    $$z' = -x \sin\theta + z \cos\theta$$
    *(Kiểm chứng: khi $\theta = 0$, $x' = x$ hướng $+X$, $z' = z$ hướng $+Z$).*
- **Cạnh lên (Rising Edge):** Các nút hành động (`jump`, `interact`, `pulse`) chỉ kích hoạt tại tick mà giá trị chuyển từ `false` sang `true`.
- Không truyền `--inputs` $\rightarrow$ người chơi đứng yên với trạng thái mặc định.

### D. Định dạng file `--scenario`
```json
{
  "player": { "pos": [0, 0, 0], "carried": 0, "flames": 3 },
  "random_motes": false,
  "random_shades": false,
  "motes": [[0, 0, 5]],
  "shades": [{ "pos": [10, 0, 0] }],
  "lanterns": [{ "id": "L1", "pos": [0, 0, 25], "deposited": 0 }],
  "time_left_s": 300
}
```
- `random_motes: false`: Không tự sinh đom đóm ngẫu nhiên, chỉ dùng danh sách trong `motes`.
- `random_shades: false`: Không tự sinh Bóng Mực ngẫu nhiên, chỉ dùng danh sách trong `shades` (các Bóng Mực này hoạt động ngay lập tức).
- `lanterns`: Cập nhật theo `id` (`L1`…`L5`). Đèn không được liệt kê giữ nguyên mặc định. Hỗ trợ ghi đè `pos`, `deposited`, `lit`.
- `motes`, `shades`: Thay thế hoàn toàn danh sách ban đầu (mảng rỗng `[]` nghĩa là không có thực thể nào). `shades[]` có thể có trường `id` sẵn để test tham chiếu; nếu không có thì tự gán ID tất định (`S1`, `S2`…).
- Trường nào vắng mặt thì giữ giá trị mặc định của game.
- **QUAN TRỌNG:** Quá trình dựng `scenario` **KHÔNG** phát ra bất kỳ `event` nào và **KHÔNG** cộng điểm (kể cả khi `lanterns` đặt sẵn `lit: true`).

### E. Định dạng đầu ra JSONL (`--out`)
Mỗi dòng là một JSON hợp lệ gồm 3 loại `snapshot`, `event`, `end`:

1. **Snapshot** (ghi ở tick `0` và mỗi khi `tick % snapshot_every === 0`):
```json
{"type":"snapshot","tick":120,"sim_tick":120,"state":"playing","time_left_s":298.0,"score":20,"player":{"pos":[0.0,0.0,12.0],"flames":3,"carried":2},"lanterns":[{"id":"L1","pos":[0.0,0.0,25.0],"lit":false,"deposited":0}],"shades":[{"id":"S1","pos":[30.1,1.0,2.0],"state":"chase"}],"motes":[{"id":"M1","pos":[2.0,0.0,5.0]}],"motes_active":1}
```
*(Khuyến nghị luôn bao gồm mảng `motes` với `id`, `pos` bên cạnh `motes_active`).*

2. **Event** (ghi ngay tại tick sự kiện xảy ra):

| `name` | `data` (chính xác từng key) | Khi nào phát |
| :--- | :--- | :--- |
| `mote_picked` | `{"carried": n}` | Nhặt 1 đom đóm |
| `deposit` | `{"lantern_id": "L1", "amount": n, "deposited": n}` | Nạp `amount` đom đóm vào đèn |
| `lantern_lit` | `{"lantern_id": "L1"}` | Đèn chuyển từ chưa sáng sang sáng |
| `pulse` | `{"stunned_ids": ["S1"]}` | Khi kích hoạt Pulse thành công (kể cả mảng rỗng `[]`) |
| `player_hit` | `{"by": "shade" \| "fall", "flames": n, "dropped": n}` | Người chơi mất máu |
| `shade_spawned` | `{"id": "S3"}` | Khi Bóng Mực mới được sinh ra trong lúc chơi |
| `game_over` | `{"result": "won" \| "lost", "reason": "all_lit" \| "dawn" \| "no_flames"}` | Ngay khi trận đấu kết thúc |

3. **End** (dòng cuối cùng, BẮT BUỘC):
```json
{"type":"end","ticks":4800,"state":"won","score":1730}
```

**Yêu cầu bổ sung cho Output:**
- `state` thuộc `{"playing", "won", "lost"}`.
- Trạng thái Bóng Mực tối thiểu phải có `"stunned"`; trạng thái đuổi có thể đặt là `"chase"`.
- **Làm tròn số:** Toàn bộ tọa độ `[x, y, z]` làm tròn tối đa **3 chữ số thập phân** (ví dụ `Math.round(v * 1000) / 1000`, tránh `-0`).
- **Tính tất định (Determinism):** Cùng `--seed`, cùng `--scenario`, cùng `--inputs` $\rightarrow$ output JSONL phải **giống hệt nhau từng byte** giữa các lần chạy (dùng PRNG có seed như Mulberry32, không dùng `Math.random()`).
- `sim_tick`: Bằng `tick` trong Phase 1.

---

## 5. Quy trình thực hiện cho AI Agent (Execution Plan)

Hãy thực hiện tuần tự theo 5 bước sau, không nhảy cóc:

1. **Bước 1 — Khởi tạo & Contract:**
   - Tạo `package.json`, `tsconfig.json`, `game.contract.json`.
   - Thiết lập module đọc `tuning` trực tiếp từ `game.contract.json`.
2. **Bước 2 — Xây dựng Simulation Core & Headless CLI:**
   - Cài đặt PRNG tất định (`mulberry32`), parser CLI, validator cho `--scenario` và `--inputs` (trả về mã lỗi `2` khi sai).
   - Cài đặt đầy đủ cơ chế: di chuyển (xoay theo `cam_yaw_deg`, chuẩn hóa vector), nhảy, nhặt đom đóm, nạp đèn, thắp đèn, Bóng Mực đuổi + né `safe_radius` + gây sát thương + `invuln_s`, kỹ năng Pulse (đẩy lùi + choáng + hồi chiêu), tính điểm, điều kiện thắng/thua.
   - Đảm bảo thứ tự cập nhật trong mỗi tick nhất quán và ghi JSONL đúng schema.
3. **Bước 3 — Kiểm thử tự động Test Contract v1.0 (BẮT BUỘC PASS 100%):**
   - Viết bộ script test tự động trong `tests/` kiểm tra:
     1. Tính tất định (chạy 2 lần cùng seed $\rightarrow$ `diff` giống hệt nhau).
     2. Mã thoát `2` khi `inputs` có tick giảm/trùng hoặc JSON lỗi.
     3. Di chuyển với `cam_yaw_deg = 0` và `cam_yaw_deg = 90`, vector dài $> 1$.
     4. Kịch bản nhặt đom đóm $\rightarrow$ nạp đèn $\rightarrow$ thắp đèn $\rightarrow$ thắng (`all_lit`) và cộng điểm bonus.
     5. Kịch bản Bóng Mực đuổi $\rightarrow$ chạm mất máu (`player_hit`) $\rightarrow$ bất tử $\rightarrow$ thua (`no_flames`).
     6. Kịch bản Bóng Mực bị chặn bởi `safe_radius` của đèn đã sáng.
     7. Kịch bản Pulse tiêu thụ ánh sáng, đẩy lùi `pulse_push_m` và chuyển Bóng Mực sang `"stunned"` trong `pulse_stun_s`.
     8. Kịch bản hết giờ thua (`dawn`).
     9. Xác minh scenario dựng sẵn `lit: true` không phát event và không cộng điểm.
   - Chạy toàn bộ test và lưu lại kết quả thực tế.
4. **Bước 4 — Giao diện 3D & Trải nghiệm chơi (Three.js):**
   - Dựng Đảo Bến hình tròn, biển mây bao quanh, 5 Đèn Lồng Lớn, đom đóm phát sáng vàng cam, Bóng Mực màu tím đen.
   - Tạo model Mây đội nón lá có đèn lồng nhỏ treo ở vành nón.
   - Gắn camera 3D, điều khiển phím/chuột nối trực tiếp vào Simulation Core.
   - Làm ánh sáng đảo sáng ấm dần lên khi số đèn sáng tăng.
   - Xây dựng HUD gọn gàng + màn hình Thắng/Thua có nút Chơi lại.
   - (Tùy chọn) Thêm 1–2 điểm sáng tạo tinh gọn về hình ảnh/âm thanh (không ảnh hưởng Simulation Core).
5. **Bước 5 — Tài liệu, Bằng chứng & Kiểm tra bàn giao:**
   - Viết `README.md`: hướng dẫn cài đặt và chạy (**tối đa 3 lệnh**), bảng điều khiển, công thức tính điểm, mục **"Sáng tạo của tôi"**.
   - Viết `EVIDENCE.md`: ghi lại các giả định hợp lý (ví dụ bán kính đảo, quy tắc sinh đom đóm/Bóng Mực ngẫu nhiên, cách làm tròn khi rơi đom đóm), log kết quả chạy test thực tế, và nhật ký sử dụng AI.
   - Kiểm tra sạch sẽ repo, đảm bảo chạy `build_cmd`, `run_cmd`, `headless_cmd` trong `game.contract.json` hoạt động trơn tru.

---

## 6. Danh sách kiểm tra bàn giao (Definition of Done)

Trước khi gắn tag git `phase-1`, AI Agent phải xác nhận tất cả các mục sau đều **PASS**:
- [ ] Chơi được trọn vẹn Đêm 1 trên giao diện 3D từ lúc bắt đầu đến Thắng/Thua và Chơi lại được.
- [ ] `game.contract.json` nằm ở thư mục gốc, điền đúng `team`, lệnh chạy, và `tuning` khớp 100% với code.
- [ ] `headless_cmd` chạy độc lập, đạt 60 tick/s logic, thoát mã `0` khi thành công, mã `2` khi file `inputs`/`scenario` sai định dạng.
- [ ] Toàn bộ test tự động kiểm tra Test Contract v1.0 đều PASS và có log bằng chứng lưu trong `EVIDENCE.md`.
- [ ] `README.md` rõ ràng, cài đặt & chạy trong tối đa 3 lệnh, có phần điều khiển, cách tính điểm và "Sáng tạo của tôi".
- [ ] Có file Harness AI (`AGENTS.md`) trong repo.