# Báo cáo
## Kiến thức
- Đã học kỹ kiến thức về Index, ACID
- Tích hợp thêm Prometheus-Grafana để quan sát tiến trình các luồng, CPU, Ram tiêu tốn.
## Lỗi với database lớn
- Các API đã kiếm tra hoàn tất
- API gửi mail đã sửa được, bằng cách mở pool kết nối, hạ số luồng hoạt động của BullMq xuống, API sẽ không báo lỗi **Too many login attempts** nữa. Tuy nhiên, vì giới hạn của gmail, hiện tại chỉ gửi được 500 mail/ 1 ngày.

## Tối ưu performance
- Login(): Ban đầu khá chậm, kết quả chỉ được 7req/s khi chạy 10 threads và bão hòa ở đây.
    - Biện pháp: Thắt cổ chai khi gọi argon2.hash tận 2 lần để tìm mật khẩu và tạo token. Thay đổi hết cách hash từ argon2 thành bcrypt nhẹ hơn.
    - Kết quả: Thoughput đạt hơn 100 req/s và bão hòa khi chạy 60 threads
- AddtoCart(): kết quả chỉ đạt 120req/s với 80 threads.
    - Biện pháp: Các câu lệnh query quá nhiều dữ liệu không liên quan, sửa lại chỉ lấy dữ liệu cần thiết.
    - Kết quả; Thoughput đạt hơn 200 req/s và bão hòa khi chạy 120 threads