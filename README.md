# 🔍 Pre-Release Code Checker CLI

Công cụ CLI kiểm tra chất lượng mã nguồn & phát hiện các rủi ro runtime trước khi release dự án **C# (.NET)** và **TypeScript**.

## ✨ Tính năng chính

- 🎯 **Chỉ định Project cụ thể hoặc Branch**: Quét bất kỳ project nào ở local thông qua đường dẫn thư mục, hoặc so sánh diff theo Git branch.
- 📍 **Định vị chính xác theo Page / Module**: Tự động nhận diện lỗi nằm ở màn hình/page nào (`Page: /checkout`, `Page: /products/detail`, `API: Order Controller`).
- ⚠️ **Dự đoán rủi ro khi vận hành (Runtime Impact)**: Không chỉ báo lỗi cú pháp mà giải thích rõ rủi ro thực tế khi code chạy trên production (Crash WSOD, Memory leak, ThreadPool Starvation, Deadlock, XSS injection...).
- 📊 **Bảng tổng hợp trực quan (Terminal Table)**: Đổi màu theo mức độ (🔴 Critical, 🟡 Warning, 🔵 Info) và đưa ra quyết định Release (`BLOCKED`, `CAUTION`, `APPROVED`).
- 📄 **Xuất báo cáo HTML / JSON**: Tạo file báo cáo HTML tương tác có bộ lọc tìm kiếm theo Page và Severity để chia sẻ cho team.

---

## 🚀 Hướng dẫn cài đặt & Sử dụng

### 1. Cài đặt toàn cục (Global) hoặc dùng trực tiếp

Tại thư mục `code-checker-2`:
```bash
npm install
npm run build
npm link  # Để có thể gõ lệnh 'code-check' ở bất kỳ thư mục nào trên máy
```

### 2. Các lệnh sử dụng thường dùng

#### 🔹 Quét một Project TypeScript / Next.js / React:
```bash
code-check -p "D:/source/my-frontend-app"
```

#### 🔹 Quét một Project C# / ASP.NET Core:
```bash
code-check -p "D:/source/MyBackend/Services/OrderApi"
```

#### 🔹 Quét và xuất báo cáo HTML để mở trên trình duyệt:
```bash
code-check -p "D:/source/my-project" --html report.html
```

#### 🔹 Chỉ quét các file thay đổi trong một branch cụ thể:
```bash
code-check -p "D:/source/my-project" --branch feature/checkout-v2 --base main
```

#### 🔹 Dùng trong CI/CD hoặc Pre-commit (Chặn release nếu có lỗi Critical):
```bash
code-check -p "D:/source/my-project" --strict
```

---

## ⚙️ Bảng tham số (CLI Options)

| Tham số | Rút gọn | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `--path <path>` | `-p` | `.` | Đường dẫn đến thư mục dự án cần kiểm tra |
| `--branch <branch>` | `-b` | | Chỉ kiểm tra các file bị thay đổi trên branch này |
| `--base <branch>` | | `main` | Branch gốc để so sánh diff (main hoặc master) |
| `--severity <levels>` | `-s` | | Lọc theo mức độ (`critical`, `warning`, `info`) |
| `--html <file>` | | | Đường dẫn xuất file báo cáo HTML |
| `--json <file>` | | | Đường dẫn xuất file kết quả dạng JSON |
| `--strict` | | `false` | Trả về mã lỗi `exit 1` nếu có lỗi Critical |

---

## 🛠️ Các lỗi được phát hiện tự động

### 🔷 TypeScript / Frontend:
- 🔴 Lỗi biên dịch TypeScript (`tsc --noEmit`), bắt các mã lỗi `TS2532`, `TS2531` (Null/Undefined dereference).
- 🔴 Unhandled Promise Rejections (gọi `fetch`/`axios` không bắt lỗi `catch` hay `await`).
- 🔴 Hardcoded URL localhost (`http://localhost:...`) sót trước release.
- 🔴 Lệnh `debugger` sót lại trong mã nguồn.
- 🔴 Lỗ hổng XSS tiềm ẩn với `dangerouslySetInnerHTML`.
- 🟡 Ép kiểu nguy hiểm `as any` bỏ qua type safety.
- 🔵 Log debug sót lại (`console.log`).

### 🔷 C# / Backend:
- 🔴 Cảnh báo Null Reference từ Roslyn compiler (`CS8600`, `CS8602`, `CS8603`).
- 🔴 Fire-and-forget Tasks (`CS4014` - async không await).
- 🔴 Khối Sync-over-Async (`.Result` hoặc `.Wait()`) gây Deadlock & nghẽn ThreadPool.
- 🔴 Empty Catch blocks nuốt lỗi âm thầm.
- 🔴 Hardcoded mật khẩu, Connection String, API Keys trong code.
- 🟡 Câu lệnh `throw ex;` làm mất toàn bộ Call Stack.
- 🟡 Controller Endpoint thiếu `CancellationToken`.
