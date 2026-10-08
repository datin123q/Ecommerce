# Báo cáo so sánh hiệu năng API

**Ngày cập nhật:** 01/10/2026  
**Môi trường:** ứng dụng chạy local; nhóm PM2 dùng cluster mode với 6 instances, truy cập qua Nginx tại `http://localhost`.  
**Công cụ:** Autocannon, `-p 1`, các bài mới chạy 15 giây ở 10/40/80 kết nối.  
**Phạm vi:** ba API GET đọc dữ liệu: danh sách sản phẩm, danh mục, chi tiết sản phẩm.

## Tóm tắt ba giai đoạn

| Giai đoạn | Cách chạy | Trạng thái Redis/code |
|---|---|---|
| A. Local | Gọi trực tiếp cổng 3000, không qua Nginx | Trước khi đổi cách trả dữ liệu cache |
| B. PM2 trước thay đổi | Nginx → PM2 cluster, 6 instances | Cách lấy dữ liệu Redis cũ |
| C. PM2 sau thay đổi | Nginx → PM2 cluster, 6 instances | Dùng `getRaw()` và trả JSON string cho danh sách/chi tiết sản phẩm |

Các bảng dưới đây so sánh Req/Sec trung bình và latency trung bình/p99. Với nhóm C, số liệu là các kết quả Autocannon bạn vừa gửi; tất cả đều trả HTTP 200.

## A. Chạy local trực tiếp cổng 3000

| API | Kết nối | Req/Sec TB | Latency TB | p99 | HTTP 200 | Lỗi |
|---|---:|---:|---:|---:|---:|---:|
| Danh sách sản phẩm | 10 | 326,27 | 30,24 ms | 179 ms | 4.894 | 0 |
| Danh sách sản phẩm | 40 | 364,74 | 109,69 ms | 381 ms | 5.471 | 0 |
| Danh sách sản phẩm | 80 | 388,60 | 205,80 ms | 639 ms | 5.829 | 0 |
| Danh mục | 10 | 490,80 | 19,95 ms | 206 ms | 7.362 | 0 |
| Danh mục | 40 | 560,94 | 70,67 ms | 313 ms | 8.414 | 0 |
| Danh mục | 80 | 541,40 | 147,36 ms | 424 ms | 8.121 | 0 |
| Chi tiết sản phẩm | 10 | 546,07 | 17,87 ms | 175 ms | 8.191 | 0 |
| Chi tiết sản phẩm | 40 | 636,27 | 61,95 ms | 318 ms | 9.544 | 0 |
| Chi tiết sản phẩm | 80 | 250,67 | 261,18 ms | 1.410 ms | 3.760 | Khoảng 2.000 lỗi socket |

## B. PM2 cluster 6 instances, trước thay đổi Redis

| API | Kết nối | Req/Sec TB | Latency TB | p99 | HTTP 200 | Lỗi |
|---|---:|---:|---:|---:|---:|---:|
| Danh sách sản phẩm | 10 | 652,94 | 14,82 ms | 48 ms | 9.794 | 0 |
| Danh sách sản phẩm | 40 | 857,27 | 46,10 ms | 104 ms | 12.859 | 0 |
| Danh sách sản phẩm | 80 | 782,94 | 101,50 ms | 214 ms | 11.744 | 0 |
| Danh mục | 10 | 748,80 | 14,35 ms | 36 ms | 11.232 | 0 |
| Danh mục | 40 | 1.026,67 | 38,42 ms | 81 ms | 15.400 | 0 |
| Danh mục | 80 | 951,67 | 83,11 ms | 251 ms | 14.275 | 0 |
| Chi tiết sản phẩm | 10 | 1.265,54 | 11,24 ms | 26 ms | 18.983 | 0 |
| Chi tiết sản phẩm | 40 | 1.641,20 | 23,85 ms | 53 ms | 24.618 | 0 |
| Chi tiết sản phẩm | 80 | 1.782,80 | 44,32 ms | 106 ms | 26.741 | 0 |

## C. PM2 cluster 6 instances, sau thay đổi Redis

| API | Kết nối | Req/Sec TB | Latency TB | p99 | HTTP 200 | Lỗi |
|---|---:|---:|---:|---:|---:|---:|
| Danh sách sản phẩm | 10 | 1.224,34 | 11,49 ms | 37 ms | 18.365 | 0 |
| Danh sách sản phẩm | 40 | 1.478,54 | 26,56 ms | 84 ms | 22.178 | 0 |
| Danh sách sản phẩm | 80 | 1.466,74 | 54,17 ms | 215 ms | 22.001 | 0 |
| Danh mục | 10 | 1.286,27 | 11,13 ms | 31 ms | 19.294 | 0 |
| Danh mục | 40 | 1.821,67 | 21,45 ms | 54 ms | 27.325 | 0 |
| Danh mục | 80 | 1.942,20 | 40,78 ms | 112 ms | 29.130 | 0 |
| Chi tiết sản phẩm | 10 | 1.998,07 | 9,67 ms | 29 ms | 29.967 | 0 |
| Chi tiết sản phẩm | 40 | 2.659,67 | 14,73 ms | 56 ms | 39.888 | 0 |
| Chi tiết sản phẩm | 80 | 3.107,80 | 25,29 ms | 81 ms | 46.611 | 0 |

> Nhóm C không có phép đo riêng cho API danh sách ở 20 kết nối trong phần so sánh chính; lượt 20 kết nối đã gửi đạt 1.225,94 Req/Sec, latency trung bình 15,81 ms và p99 43 ms.

## So sánh và nhận xét

### Local trực tiếp so với PM2 cluster trước thay đổi Redis

Ở cả ba API, cụm PM2 qua Nginx có thông lượng cao hơn kết quả local trực tiếp. Chênh lệch thấy rõ nhất ở chi tiết sản phẩm tại 80 kết nối: local chỉ đạt khoảng 251 Req/Sec và có khoảng 2.000 lỗi socket; PM2 đạt khoảng 1.783 Req/Sec, không ghi nhận lỗi. Đây là so sánh giữa cấu hình chạy đơn cổng local và cấu hình 6 workers qua Nginx, nên mức tăng phản ánh cả thay đổi kiến trúc chạy, không chỉ riêng Nginx.

### PM2 trước và sau thay đổi Redis

| API | Kết nối | Req/Sec trước → sau | Thay đổi | p99 trước → sau |
|---|---:|---:|---:|---:|
| Danh sách sản phẩm | 10 | 653 → 1.224 | +87% | 48 → 37 ms |
| Danh sách sản phẩm | 40 | 857 → 1.479 | +73% | 104 → 84 ms |
| Danh sách sản phẩm | 80 | 783 → 1.467 | +87% | 214 → 215 ms |
| Danh mục | 10 | 749 → 1.286 | +72% | 36 → 31 ms |
| Danh mục | 40 | 1.027 → 1.822 | +77% | 81 → 54 ms |
| Danh mục | 80 | 952 → 1.942 | +104% | 251 → 112 ms |
| Chi tiết sản phẩm | 10 | 1.266 → 1.998 | +58% | 26 → 29 ms |
| Chi tiết sản phẩm | 40 | 1.641 → 2.660 | +62% | 53 → 56 ms |
| Chi tiết sản phẩm | 80 | 1.783 → 3.108 | +74% | 106 → 81 ms |

Kết quả sau thay đổi có thông lượng cao hơn ở cả ba API. Với danh sách và chi tiết sản phẩm, mức tăng phù hợp với thay đổi trong `ProductsService`: trả nội dung cache đã serialize trực tiếp, giảm bước parse rồi serialize lại trên cache hit. p99 giảm ở phần lớn mức tải; ngoại lệ là chi tiết sản phẩm tại 10/40 kết nối (tăng 3 ms) và danh sách ở 80 kết nối gần như giữ nguyên.

API danh mục không nằm trong thay đổi `ProductsService` được mô tả ở đây, nhưng kết quả của nó cũng tăng mạnh. Vì vậy, không thể quy mức tăng của danh mục cho thay đổi Redis này; số đo đó có thể phản ánh khác biệt trạng thái cache, tải nền hoặc biến động giữa các lượt chạy. Kể cả khi cấu hình test giống nhau, riêng biến số code thay đổi không bao gồm API danh mục.

### Hành vi khi tăng kết nối sau thay đổi

- **Danh sách sản phẩm:** throughput gần như chững từ 40 lên 80 (1.479 xuống 1.467 Req/Sec), trong khi p99 tăng từ 84 lên 215 ms. Đây là dấu hiệu rõ nhất cho thấy hàng đợi/độ trễ đuôi tăng khi tải vượt mức xử lý hiệu quả của lượt test.
- **Danh mục:** throughput vẫn tăng từ 40 lên 80 (1.822 lên 1.942 Req/Sec), nhưng p99 tăng từ 54 lên 112 ms.
- **Chi tiết sản phẩm:** throughput tiếp tục tăng đến 80 (2.660 lên 3.108 Req/Sec), p99 tăng từ 56 lên 81 ms. Trong phạm vi tải đã thử, chưa thấy throughput giảm hay lỗi.

Không nên gọi các mức này là năng lực production tuyệt đối: test ngắn 15 giây, chạy trên môi trường local và các lần lặp có thể chịu tác động của cache nóng, CPU/RAM, PostgreSQL/Redis và tải nền. Theo điều kiện test bạn xác nhận là đồng nhất, lượt sau có kết quả tốt hơn rõ rệt về mặt số liệu. Phần cải thiện của hai API sản phẩm phù hợp với thay đổi code; kết quả danh mục cần được xem là biến động quan sát được, không phải bằng chứng hiệu quả của thay đổi Redis.

## Nhận xét code hiện tại

### Thay đổi đang có

`ProductsService.findAll()` và `findOne()` hiện gọi `RedisCacheService.getRaw()`. Khi cache hit, service trả JSON string lấy trực tiếp từ Redis; cache miss thì truy vấn Prisma, ghi object vào cache và trả `JSON.stringify(...)`. Controller gửi chuỗi đó với `Content-Type: application/json`. Cách này tránh parse JSON thành object rồi để Nest serialize lại trên đường cache hit, nên hợp lý với mục tiêu giảm overhead và phù hợp với kết quả benchmark.

### Việc cần sửa/kiểm tra tiếp

1. **`updateProduct()` nhận sai kiểu oldValue:** hàm này gọi `findOne(id)`, nhưng `findOne()` giờ trả `Promise<string>`. Do đó `product.update` event nhận `oldValue` là chuỗi JSON thay vì object sản phẩm như trước. Phần ghi audit/log hoặc consumer của event có thể nhận sai schema. Tách hàm truy vấn object nội bộ (hoặc parse ở chỗ gọi) để API vẫn trả raw JSON còn logic nghiệp vụ tiếp tục dùng object.
2. **Kiểu trả về không thể hiện hợp đồng rõ:** `findAll()` hiện không khai báo kiểu trả về, còn `findOne()` khai báo string. Nên đặt kiểu/đặt tên rõ để phân biệt dữ liệu domain với JSON đã serialize, tránh tái sử dụng raw JSON ở nghiệp vụ.
3. **Bảo đảm cache chứa JSON hợp lệ:** `getRaw()` không parse/validate. Nếu Redis có giá trị hỏng hoặc key cũ khác schema, controller vẫn gửi raw body; client sẽ gặp lỗi parse JSON. Cần cân nhắc kiểm tra/khôi phục cache khi JSON invalid và có quy trình version hóa/invalidate key khi response schema đổi.
4. **Thử nghiệm regression:** ngoài benchmark GET, xác nhận `GET /products/:id` và danh sách giữ đúng response contract; chạy update sản phẩm và kiểm tra event `oldValue` là object; kiểm tra cache miss, cache hit, cache invalid và invalidation sau create/update/delete.

**Kết luận code:** hướng trả raw cached JSON có kết quả tải tốt và là tối ưu hợp lý cho các API đọc này. Trước khi coi thay đổi hoàn tất, cần xử lý việc `updateProduct()` dùng `findOne()` như một hàm lấy object và kiểm tra các trường hợp cache invalid cùng response contract. Báo cáo này không thay đổi source code.

## Dữ liệu nền từ bài đo CPU/PostgreSQL trước đó

Bài test danh sách sản phẩm qua Nginx, 80 kết nối, 30 giây ghi nhận 1.071,84 Req/Sec, latency trung bình 74,09 ms, p99 272 ms. CPU toàn máy trung bình 74,6%, có mẫu 100%; RAM khả dụng thấp nhất 18 MB. PostgreSQL `commerce_core_db` có tối đa 78 kết nối, tối đa 1 truy vấn active tại thời điểm lấy mẫu, không thấy lock wait. Đây là số đo từ lần test khác, dùng để tham khảo tài nguyên; không gộp vào bảng so sánh ba giai đoạn ở trên.




## D. Bài test API ghi

Các bài dưới đây chạy qua Nginx/PM2 với Autocannon trong 15 giây. Mỗi lượt dùng cùng một tài khoản test; ở `POST /carts/add`, cùng một biến thể/giỏ hàng; ở `PATCH /users/me`, cùng một người dùng. Không ghi nhận lỗi HTTP trong các lượt được báo cáo.

### `POST /api/v1/carts/add`

| Kết nối | Req/Sec TB | Latency TB | p99 | Max | HTTP 201 |
|---:|---:|---:|---:|---:|---:|
| 1 | 65,14 | 14,91 ms | 32 ms | 66 ms | 977 |
| 5 | 147,40 | 33,49 ms | 71 ms | 391 ms | 2.211 |
| 10 | 164,14 | 60,58 ms | 147 ms | 295 ms | 2.462 |
| 20 | 162,14 | 122,71 ms | 491 ms | 1.093 ms | 2.432 |

**Nhận xét:** từ 10 lên 20 kết nối, throughput giảm nhẹ (164 xuống 162 Req/Sec), trong khi latency trung bình tăng gấp đôi và p99 tăng từ 147 lên 491 ms. Đây là dấu hiệu API thêm giỏ bão hòa trong khoảng 10–20 kết nối ở kịch bản cùng nhiều request cập nhật một cart item. Kết quả không đại diện cho tải phân tán trên nhiều giỏ hàng khác nhau.

### `PATCH /api/v1/users/me`

| Kết nối | Req/Sec TB | Latency TB | p99 | Max | HTTP 200 |
|---:|---:|---:|---:|---:|---:|
| 1 | 115,47 | 11,75 ms | 29 ms | 41 ms | 1.732 |
| 5 | 188,54 | 26,03 ms | 69 ms | 140 ms | 2.828 |
| 10 | 191,14 | 51,81 ms | 159 ms | 2.263 ms | 2.867 |
| 20 | 203,20 | 97,67 ms | 390 ms | 764 ms | 3.048 |

**Nhận xét:** từ 5 lên 10 kết nối, throughput gần như không tăng (189 lên 191 Req/Sec), trong khi latency trung bình và p99 tăng. Ở 20 kết nối, throughput chỉ tăng thêm khoảng 6% so với 10 (191 lên 203 Req/Sec), nhưng latency trung bình tăng khoảng 88% (51,81 lên 97,67 ms) và p99 tăng từ 159 lên 390 ms. Đây là dấu hiệu bão hòa rõ hơn trong kịch bản nhiều request cùng cập nhật một tài khoản. Max của lượt 10 là 2.263 ms; ở lượt 20 là 764 ms. Endpoint này phát sinh một sự kiện thông báo cho mỗi lần cập nhật.

### Kết luận cho các API ghi

Trong những lượt đo đã chạy, `POST /carts/add` có dấu hiệu bão hòa ở 10–20 kết nối; `PATCH /users/me` có dấu hiệu bão hòa từ khoảng 5 kết nối trở lên: throughput gần như đi ngang từ 5 đến 20, trong khi latency và p99 tiếp tục tăng. Cả hai vẫn trả thành công (201/200), nên dấu hiệu hiện tại là throughput chững lại và latency/p99 tăng, chưa phải lỗi HTTP.

Các bài test dùng một user và một cart item, nên cùng dồn ghi lên một tài khoản/bản ghi. Đây là giới hạn của kịch bản; kết quả chưa thể xem như năng lực tổng quát khi nhiều người dùng độc lập. Mỗi lượt PATCH hồ sơ cũng phát sinh notification, còn mỗi lượt thêm giỏ làm tăng quantity. Cần kiểm tra/reset dữ liệu test giữa các lượt.

Trong source hiện tại, `updateProfile()` đã giới hạn trường trả về bằng Prisma `select`. Hãy xác nhận worker PM2 đang chạy bản build/restart mới và response thực tế không chứa `password`, `refreshToken` hoặc token xác minh trước khi tiếp tục benchmark endpoint này.


## E. JMeter: `addToCarts` với CSV token

Bài test chạy riêng sampler thêm giỏ hàng, dùng access token đọc từ CSV, **10 threads trong 30 giây**. Không chạy login hoặc checkout trong luồng tải này.

| API | Threads | Samples | Average | Min | Max | Std. Dev. | Error % | Throughput | Received KB/sec | Sent KB/sec | Avg. Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `addToCarts` | 10 | 4.110 | 71 ms | 16 ms | 419 ms | 24,06 ms | 0,00% | 136,88 req/s | 166,27 | 69,17 | 1.243,86 |

### Tài nguyên ghi nhận trong lúc test

- CPU tổng máy: khoảng **95–97%**.
- PostgreSQL trong `docker stats`: khoảng **160%**. Docker có thể hiển thị trên 100% khi container dùng nhiều hơn một lõi; giá trị này không cùng thang đo với CPU trong Task Manager.
- `Vmmem`: khoảng **31,9%** trong Task Manager; đây là mức của máy ảo WSL/Docker, không riêng PostgreSQL.
- Node.js: tiến trình cao nhất khoảng **20,7%**, ngoài ra Task Manager hiển thị nhiều tiến trình Node.js khác. Không thể xem riêng tiến trình cao nhất là tổng CPU của các worker PM2.
- Java/JMeter: khoảng **0,6%**; VS Code khoảng **12,2%**.

### Nhận xét

Tất cả **4.110 request đều thành công**. Ở mức 10 threads, API đạt khoảng **136,88 request/giây**, latency trung bình **71 ms**, tối đa **419 ms**. Bảng Summary Report không có p95/p99 nên không thể suy ra các percentile này từ số liệu hiện có.

CPU tổng máy gần đầy và PostgreSQL container dùng CPU đáng kể; Java/JMeter gần như không dùng CPU. Điều này cho thấy máy chạy test đang chịu tải cao và database/container là một thành phần đáng kiểm tra. Tuy nhiên, đây chưa đủ bằng chứng để khẳng định PostgreSQL là nút nghẽn duy nhất: `Vmmem` gộp tài nguyên Docker/WSL, Task Manager có nhiều tiến trình Node, và VS Code cũng dùng CPU. Phần trăm Docker và Task Manager không thể so trực tiếp.

Đây là một mức tải duy nhất, vì vậy kết quả **chưa tự xác định điểm bão hòa hay thành phần giới hạn thông lượng**. Muốn kết luận bottleneck cần so các mức tải cùng cấu hình và đối chiếu CPU tổng các worker Node, CPU container PostgreSQL cùng thời gian chờ/hoạt động của database. Số liệu này không nên so trực tiếp với các bài Autocannon trước vì công cụ, thời lượng và kịch bản khác nhau.
