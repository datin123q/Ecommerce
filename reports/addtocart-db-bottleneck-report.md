# Báo cáo xác định nút thắt PostgreSQL khi tải API addToCart

**Ngày ghi nhận:** 02/10/2026  
**Mục tiêu:** xác định nguồn tải PostgreSQL trong bài kiểm thử API thêm sản phẩm vào giỏ hàng (`addToCart`). Báo cáo này ghi nhận chẩn đoán; chưa thay đổi code hoặc schema.

## Quy trình xác định và kết quả áp dụng cho addToCart

| Bước | Việc đã làm và kết quả | Suy luận từ kết quả / trạng thái |
|---|---|---|
| 1. Chọn API và kịch bản | Tập trung vào API addToCart bằng JMeter, dùng CSV access token; các lượt kiểm tra không trộn login/checkout trong cùng kết quả được phân tích ở đây. | Phạm vi đủ hẹp để điều tra luồng thêm giỏ. Một số lượt dùng cùng variant/cart, nên tải ghi có thể tập trung trên cùng CartItem; không đại diện tuyệt đối cho mọi người dùng thực tế. |
| 2. Đo tải và latency | Các lượt 10/15/20/25 threads đã cho: 10 threads khoảng 146 req/s, p95 99 ms; 15 khoảng 171 req/s, p95 119 ms; median của ba lượt 20 threads khoảng 185 req/s, p95 139 ms; median của ba lượt 25 threads khoảng 191 req/s, p95 170 ms. Lượt khác gửi sau đó có 6.196 mẫu, 217,17 req/s, p95 178 ms, p99 257 ms, lỗi 0%; số threads/thời lượng của lượt 6.196 mẫu không được ghi kèm. | Trong dải 20→25 threads, throughput chỉ tăng nhẹ trong khi latency tăng rõ; đây là dấu hiệu gần điểm bão hòa trong điều kiện thử đó, không phải ngưỡng production tuyệt đối. Lượt 6.196 mẫu không gộp vào chuỗi này vì thiếu cấu hình. |
| 3. Đo tài nguyên cùng lúc | Một bài addToCart 10 threads ghi nhận CPU tổng máy 95–97%, PostgreSQL Docker khoảng 160%, Vmmem 31,9%, Node.js process cao nhất 20,7% (còn các worker Node khác), Java/JMeter 0,6%, VS Code 12,2%. Các snapshot khác được tách ở mục CPU bên dưới vì không ghép chắc chắn với cùng lượt. | Máy test gần bận hết CPU; PostgreSQL dùng CPU đáng kể. Điều này gợi ý DB là thành phần cần điều tra, nhưng CPU tổng hợp chưa chỉ ra chính xác câu SQL nào gây tải. Phần trăm Docker/Task Manager/Vmmem không so trực tiếp được. |
| 4. Xem truy vấn đang chạy/chờ | pg_stat_activity ghi nhận đồng thời nhiều COUNT Notifications active khoảng 0,2–0,4 giây; các dòng COUNT không có wait_event. Upsert CartItems có các lần chờ transactionid khoảng 31 ms, WALSync khoảng 24 ms, WALWrite khoảng 4–9 ms. blocked_by rỗng tại snapshot. | Có tải thực thi COUNT và có chờ trên đường ghi CartItems. Snapshot không bắt được blocker trực tiếp; các wait có thể ngắn và thay đổi theo thời điểm. |
| 5. Kiểm tra execution plan | EXPLAIN ANALYZE của COUNT Notifications dùng Parallel Seq Scan. Với user có thật, các lần riêng lẻ mất khoảng 16–23 ms; trong một plan, ba worker loại tổng cộng khoảng 163 nghìn dòng không khớp. | Truy vấn đếm đang quét bảng thay vì tìm nhanh theo user/read status. Kế hoạch và thời gian xác nhận truy vấn có chi phí đáng kể; phép EXPLAIN đơn lẻ không đại diện chính xác cho latency API khi tải đồng thời. |
| 6. So sánh bộ đếm DB trước/sau | Notifications: seq_scan +5.090; seq_tup_read +969.996.284; n_tup_ins +5.091. CartItems: idx_scan +11.489; n_tup_upd +5.643; seq_scan không tăng. | Gần một lần quét Notifications cho mỗi notification mới; trung bình khoảng 190.569 dòng đọc mỗi lần quét. Đây là bằng chứng mạnh về lượng công việc DB lặp lại trong khoảng đo. CartItems dùng index nhưng vẫn có một số lần chờ ghi/transaction. |
| 7. Đối chiếu bằng chứng | Số notification insert, số lần sequential scan, số dòng đọc, execution plan và snapshot active COUNT cùng chỉ về Notifications. Luồng code xác nhận addToCart phát event; listener đẩy job; worker tạo notification rồi gọi getUnreadCount. | Đã xác định được một nguồn tải PostgreSQL cụ thể do luồng addToCart kích hoạt: COUNT Notifications quét tuần tự lặp lại. Vì công việc này chạy nền, chưa chứng minh nó trực tiếp chiếm bao nhiêu phần latency HTTP. Chờ WAL/transaction của CartItems là dấu hiệu phụ, chưa có bằng chứng nó lớn hơn tải COUNT. |
| 8. Xác nhận và bước tiếp | Hai bộ pg_stat_user_tables trước/sau đã được cung cấp; đã tính delta. Không sửa code/schema và không chạy lại sau khi có đủ hai bộ số. | Mục tiêu tìm nguồn tải đã đạt; không cần lặp lại phép xác nhận. Nếu sau này cần chứng minh ảnh hưởng nhân quả lên latency API, cần một phép đo đối chứng có kiểm soát, ví dụ so cùng kịch bản khi worker notification không xử lý job, rồi bật lại để so sánh. Việc này chưa thực hiện. |

### Phân biệt kết quả và suy luận

- **Đã quan sát trực tiếp:** COUNT Notifications dùng Parallel Seq Scan; bộ đếm bảng tăng mạnh; COUNT và upsert xuất hiện trong pg_stat_activity; có wait WAL/transaction ở một số upsert.
- **Suy luận có bằng chứng:** truy vấn COUNT lặp lại là nguồn tải DB đáng kể trong luồng addToCart.
- **Chưa kết luận:** COUNT là nguyên nhân duy nhất hoặc trực tiếp gây p95/p99 HTTP; chưa tách được phần latency do request ghi giỏ, worker notification, CPU máy test hay các thành phần khác.
## Kết luận

Trong luồng addToCart, truy vấn đếm số notification chưa đọc đang quét tuần tự bảng `Notifications` nhiều lần. Dữ liệu `pg_stat_user_tables` trước/sau lượt đo cho thấy số lần quét tăng **5.090**, gần bằng số notification mới **5.091**; tổng số dòng đọc qua các lần quét tăng khoảng **970 triệu**. `EXPLAIN ANALYZE` xác nhận kế hoạch dùng `Parallel Seq Scan` trên `Notifications`.

Đây là nguồn tải PostgreSQL rõ ràng trong luồng addToCart. Tuy nhiên, do tạo notification và đếm unread chạy qua worker/hàng đợi nền, các phép đo này **không chứng minh truy vấn COUNT trực tiếp chiếm bao nhiêu latency của HTTP request**. Chúng chứng minh worker phát sinh tải DB lớn đồng thời với bài tải addToCart.

## Bằng chứng từ bộ đếm trước và sau

Các số dưới đây được lấy từ `pg_stat_user_tables`, theo thứ tự **trước → sau** lượt đo. Các giá trị là bộ đếm tích lũy; phần chênh lệch mới là hoạt động trong khoảng giữa hai lần chụp.

| Bảng | Bộ đếm | Trước | Sau | Tăng |
|---|---:|---:|---:|---:|
| `Notifications` | `seq_scan` | 145.819 | 150.909 | **5.090** |
| `Notifications` | `seq_tup_read` | 16.786.138.831 | 17.756.135.115 | **969.996.284** |
| `Notifications` | `n_tup_ins` | 145.800 | 150.891 | **5.091** |
| `Notifications` | `idx_scan` | 0 | 0 | 0 |
| `CartItems` | `idx_scan` | 295.509 | 306.998 | **11.489** |
| `CartItems` | `n_tup_upd` | 145.799 | 151.442 | **5.643** |
| `CartItems` | `seq_scan` | 1 | 1 | 0 |

`seq_tup_read` tăng khoảng 970 triệu dòng qua 5.090 lần quét, tương đương trung bình khoảng **190.569 dòng được đọc mỗi lần quét**. Số lần quét Notifications tăng gần một-một với số notification được thêm trong cùng khoảng đo.

Ở `CartItems`, `idx_scan` tăng 11.489 và `n_tup_upd` tăng 5.643; không có thêm sequential scan. Điều này phù hợp với thao tác upsert sử dụng unique index trên `(cartId, variantId)`, dù snapshot hoạt động vẫn ghi nhận một số lần chờ WAL/transaction.

## Kế hoạch truy vấn COUNT

Truy vấn được đo tương đương với điều kiện:

```sql
SELECT COUNT(*)
FROM public."Notifications"
WHERE "userId" = <user_id>
  AND "isRead" = false;
```

Các lần `EXPLAIN ANALYZE` đều hiển thị `Parallel Seq Scan on "Notifications"`. Với user tồn tại, có lần chạy mất khoảng **16,9 ms**; một lần khác khoảng **16,0 ms**. Tại thời điểm tải cao, `pg_stat_activity` ghi nhận nhiều truy vấn COUNT cùng hoạt động, có thời lượng quan sát được khoảng **0,2–0,4 giây**.

Danh sách index được kiểm tra có primary key trên `Notifications.id`, nhưng không có index thể hiện trong kết quả trên các cột lọc `userId` và `isRead`. Điều này giải thích vì sao PostgreSQL chọn quét bảng; báo cáo chỉ ghi nhận hiện trạng, chưa đề xuất hoặc tạo index.

## Kết quả JMeter addToCart được cung cấp

| Samples | Avg (ms) | Median (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Min (ms) | Max (ms) | Error | Throughput (req/s) | Received (KB/s) | Sent (KB/s) | Avg bytes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6.196 | 114 | 109 | 159 | 178 | 257 | 28 | 2.019 | 0% | 217,17 | 264,26 | 109,90 | — |

Max 2.019 ms là ngoại lệ đuôi dài; p95 178 ms và p99 257 ms mô tả độ trễ ở phần lớn request tốt hơn. Số threads và thời lượng của chính lượt JMeter này không có trong số liệu được gửi nên không được suy đoán trong báo cáo.

## CPU và tài nguyên quan sát được

Các số dưới đây đến từ ảnh/chỉ số tài nguyên đã gửi trong quá trình đo. Chỉ snapshot đầu được ghi rõ là cùng bài JMeter addToCart 10 threads; các ảnh còn lại không có đủ thông tin để ghép chính xác với lượt JMeter 6.196 mẫu, vì vậy được tách riêng và không dùng để suy ra nhân quả.

### Snapshot cùng bài JMeter addToCart 10 threads

| Chỉ số | Giá trị quan sát |
|---|---:|
| CPU tổng máy Windows | khoảng **95–97%** |
| PostgreSQL container (docker stats) | khoảng **160% CPU** |
| Vmmem trong Task Manager | khoảng **31,9%** |
| Node.js process cao nhất hiển thị | khoảng **20,7%**; còn nhiều tiến trình Node.js khác |
| Java/JMeter | khoảng **0,6%** |
| VS Code | khoảng **12,2%** |

### Các snapshot tài nguyên khác đã gửi

| Nguồn | Giá trị quan sát | Ghi chú |
|---|---|---|
| Task Manager | CPU tổng khoảng **73%**, Vmmem **35,2%**, Node.js process cao nhất **17,8%** | Ảnh chụp riêng; không gắn chắc chắn với lượt JMeter 6.196 mẫu |
| Docker stats | PostgreSQL **257,1% CPU**, Redis **15,59%**, Nginx **4,86%** | Docker có thể báo CPU trên 100% khi container dùng nhiều lõi; không so trực tiếp với % trong Task Manager |
| Task Manager | Vmmem **42,5%**, Node.js process cao nhất **22,5%** | Ảnh chụp riêng; các Node.js worker khác cũng đang chạy |

### Cách diễn giải

CPU tổng máy gần 100% ở snapshot cùng bài test cho thấy máy chạy benchmark đang gần bận hết tài nguyên. PostgreSQL ở mức 160% Docker CPU cho thấy container dùng hơn một lõi CPU theo cách Docker biểu diễn. Vmmem là tiến trình máy ảo WSL/Docker, không phải CPU riêng của PostgreSQL; phần trăm của Docker, Vmmem và Task Manager có phạm vi đo khác nhau nên không cộng hoặc so trực tiếp.

Các quan sát này phù hợp với bằng chứng truy vấn COUNT quét bảng lặp lại và nhiều truy vấn COUNT hoạt động đồng thời. Tuy vậy, số đo CPU tổng hợp không tự chứng minh truy vấn COUNT là nguyên nhân duy nhất; báo cáo dựa kết luận vào cả bộ đếm bảng, execution plan và snapshot truy vấn.
## Snapshot `pg_stat_activity`

Trong lúc tải, snapshot ghi nhận đồng thời:

- Nhiều truy vấn COUNT `Notifications` đang `active`, một số khoảng 0,2–0,4 giây; không có `wait_event` ở các dòng này, nghĩa là snapshot không ghi nhận chúng đang chờ lock/I/O tại thời điểm chụp.
- Upsert `CartItems` chờ `transactionid` khoảng 31 ms, `WALSync` khoảng 24 ms và `WALWrite` khoảng 4–9 ms ở các dòng được gửi.
- `blocked_by` rỗng trong snapshot; không bắt được PID chặn trực tiếp tại thời điểm chụp.

Các thời lượng và wait event là ảnh chụp tức thời, không phải tổng thời gian tích lũy. Không cộng chúng để suy ra latency toàn request.

## Đường xử lý trong code

1. `CartsService.addToCart` upsert `CartItems` rồi phát event `cartItem.created`.
2. `NotificationsListener` nhận event và đưa job vào `notification-queue`.
3. `NotificationProcessor` gọi `NotificationsService.createNotification`.
4. Sau khi insert notification, `createNotification` gọi `getUnreadCount`.
5. `getUnreadCount` thực hiện Prisma `notification.count({ where: { userId, isRead: false } })`.

Do đó, truy vấn COUNT là công việc DB phát sinh từ hoạt động addToCart, nhưng được xử lý nền. Nó có thể cạnh tranh CPU/DB I/O/WAL với request addToCart mà không nhất thiết nằm trực tiếp trong thời gian phản hồi HTTP.

## Giới hạn và phạm vi kết luận

- Bằng chứng đủ để xác định một nguồn tải DB lặp lại, tốn nhiều lượt đọc: COUNT Notifications quét tuần tự bảng.
- Kết quả chưa định lượng tỷ lệ latency HTTP addToCart do COUNT gây ra, vì notification được xử lý nền và chưa có phép đo đối chứng khi worker không chạy.
- Chờ WAL/transaction trên CartItems đã xuất hiện nhưng số liệu hiện tại chưa chứng minh đây là nguồn tải lớn hơn COUNT Notifications.
- CPU/RAM ở Windows, Docker và PM2 dùng các phạm vi đo khác nhau; báo cáo không quy đổi hoặc so sánh chéo các phần trăm đó.
- Không thực hiện thay đổi code, cấu hình, database hoặc index trong quá trình lập báo cáo.

## Tệp code đối chiếu

- `src/modules/carts/carts.service.ts`
- `src/modules/notifications/notifications.listener.ts`
- `src/processor/notifications.processor.ts`
- `src/modules/notifications/notifications.service.ts`


