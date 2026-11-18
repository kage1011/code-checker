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

#### 🔹 Chỉ định 1 Project cụ thể trong Solution (.sln):
```bash
# Cách 1: Dùng cờ -P / --project kèm tên project
code-check -p "D:/source/MyBackendSolution" -P OrderApi

# Cách 2: Trỏ thẳng vào file .csproj của project đó
code-check -p "D:/source/MyBackendSolution/src/OrderApi/OrderApi.csproj"
```

#### 🔹 Quét và xuất báo cáo HTML để mở trên trình duyệt:
```bash
code-check -p "D:/source/my-project" --html report.html
```

#### 🔹 Chỉ quét các file thay đổi trong một branch cụ thể:
```bash
code-check -p "D:/source/my-project" --branch feature/checkout-v2 --base main
```

#### 🔹 Phân tích sâu Logic nghiệp vụ bằng DeepSeek (Offline, 0đ chi phí qua Ollama):
```bash
# Bật cờ --ai để phân tích các lỗi logic nghiệp vụ, thiếu case, sai mapping như ảnh review
code-check -p "D:/source/MySolution" -P OrderApi --ai
```

#### 🔹 Tập trung vào controller và lần theo code liên quan:
```bash
code-check -p "D:/source/MySolution" --focus "Controllers/QAController.cs" --ai
# Tăng context nếu file focus và các file liên quan vẫn vượt giới hạn
code-check -p "D:/source/MySolution" --focus "Controllers/QAController.cs" --ai-num-ctx 65536
```

`--focus` nhận đường dẫn tương đối trong project hoặc đường dẫn tuyệt đối của file `.cs`, `.cshtml`, `.ts`, `.tsx`; nó ưu tiên file được chỉ định, sau đó lần theo type được tham chiếu và nơi tham chiếu ngược đến type đó (ví dụ interface/service/data access/model), view MVC tương ứng và tài nguyên văn bản được source tham chiếu. Chế độ này không gửi Git diff hoặc ưu tiên file thay đổi. Context mặc định là 100000 tokens khi dùng `--focus` (quét thường là 16384); có thể tăng bằng `--ai-num-ctx`, tùy khả năng RAM/VRAM của Ollama. Độ sâu tối đa là 4 và tối đa 40 file liên quan. Với `.xlsx/.xlsm/.xls`, công cụ chỉ đưa đường dẫn tài nguyên vào ngữ cảnh, không đọc nội dung workbook.

#### 🔹 Ghi nhận lỗi đã xác minh để AI tham khảo ở lần quét sau:
```bash
# Xuất report JSON từ lần quét
code-check -p "D:/source/MySolution" --json report.json

# Issue được đánh số theo thứ tự trong report, bắt đầu từ 1
code-check learn --from report.json --issue 2 --root-cause "Nhánh CompanyCode ghi số cột khác với template đang chọn" --fix "Tính border range từ vùng dữ liệu thực tế của template" --tags "excel,template,mapping"
```

Case được lưu tại `.code-checker/learning-cases.json` trong project của report. Chỉ ghi nhận khi đã xác minh nguyên nhân và cách sửa; source code không được lưu vào kho case. Khi chạy AI review, tối đa 2 case có từ khóa liên quan được đưa vào làm tài liệu tham khảo. AI vẫn phải kiểm chứng từng case với source hiện tại và không được tự suy ra tên template hay số cột. Kho case là JSON cục bộ; có thể quản lý/chia sẻ cùng project hoặc giữ riêng tùy chính sách của team.

---

## 🤖 Hướng dẫn tích hợp DeepSeek Local (Miễn phí 100%)

Để phân tích các lỗi **Logic Bug, Incomplete Mapping, Duplicate Constant & Typo** giống như Senior Dev / AI Reviewer:
1. Tải và cài đặt **Ollama** từ: https://ollama.com (chỉ 1 click trên Windows).
2. Tải model DeepSeek (chỉ cần chạy 1 lần):
   ```bash
   ollama run deepseek-r1:8b
   # hoặc bản nhẹ hơn chuyên cho code:
   ollama run deepseek-coder:6.7b
   ```
3. Chạy `code-check` với cờ `--ai`:
   ```bash
   code-check -p "D:/source/my-project" --ai
   ```

---

## ⚙️ Bảng tham số (CLI Options)

| Tham số | Rút gọn | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `--path <path>` | `-p` | `.` | Đường dẫn đến thư mục dự án hoặc solution |
| `--project <name>` | `-P` | | Chỉ định tên project cụ thể trong solution (VD: `OrderApi`) |
| `--branch <branch>` | `-b` | | Chỉ kiểm tra các file bị thay đổi trên branch này |
| `--base <branch>` | | `main` | Branch gốc để so sánh diff (main hoặc master) |
| `--focus <file>` | | | Tập trung AI review file này và lần theo code liên quan |
| `--severity <levels>` | `-s` | | Lọc theo mức độ (`critical`, `warning`, `info`) |
| `--html <file>` | | | Đường dẫn xuất file báo cáo HTML |
| `--json <file>` | | | Đường dẫn xuất file kết quả dạng JSON |
| `--strict` | | `false` | Trả về mã lỗi `exit 1` nếu có lỗi Critical |
| `--ai` | | `false` | Bật tính năng AI DeepSeek review logic nghiệp vụ |
| `--ai-model <model>` | | `deepseek-r1:8b` | Model Ollama sử dụng (`deepseek-r1:8b`, `deepseek-coder:6.7b`...) |
| `--ai-endpoint <url>` | | `http://localhost:11434` | URL máy chủ Ollama |
| `--ai-num-ctx <size>` | | `16384` (focus: `100000`) | Context window size (tokens) cho Ollama; giá trị lớn hơn cần thêm RAM/VRAM |
| `learn --from <file> --issue <number>` | | | Lưu lỗi đã xác minh từ báo cáo JSON; yêu cầu `--root-cause` và `--fix`, hỗ trợ `--tags` |

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

### 🔷 Excel Template Export:
- 🟡 Dùng range cố định (VD: `A6:CV`) để set style/border nhưng mỗi đối tác có số cột khác nhau → dư viền/nền ở cột trống.
- 🟡 Ghi dữ liệu ra Excel (SetCellValue, LoadFromCollection) nhưng không set border cho vùng dữ liệu → file xuất thiếu đường viền.
- 🟡 Dùng LoadFromCollection/LoadFromDataTable mà không apply style sau đó.

### 🔷 AI Logic Review (DeepSeek):
- 🔴🟡 Phát hiện thiếu case/enum/prefix trong hàm điều kiện khi thêm  đối tác mới.
- 🔴🟡 Mapping cột không đầy đủ khi bổ sung template Excel cho đối tác mới.
- 🔴🟡 Phát hiện range style Excel hardcode không khớp số cột thực tế.
- 🟡 Hằng số trùng, sai chính tả xuyên suốt nhiều file.
