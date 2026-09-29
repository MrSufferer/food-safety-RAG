import { assertUsefulChecklist, sanitizeChecklist } from './checklist.mjs';
import { snapshotDate } from './passages.mjs';

const SYSTEM_PROMPT = `Bạn là công cụ chuẩn bị thông tin cho chủ quán cà phê/takeaway mới ở Đà Nẵng. Trả lời hoàn toàn bằng tiếng Việt, ngắn và cụ thể. Chỉ trả một đối tượng JSON có đúng các khóa route, tasks, unresolved, nextAction. Mỗi mục là null hoặc đối tượng có text và passageIds; riêng tasks và unresolved là mảng. Đây không phải tư vấn pháp lý, quyết định đủ điều kiện, hồ sơ nộp, hay xác nhận sẵn sàng hoạt động.

Chỉ dùng các dữ kiện chủ quán cung cấp và các đoạn nguồn trong yêu cầu. Không suy ra miễn giấy từ chữ “nhỏ”; nêu Điều 11–12 Nghị định 15/2018 nếu cần nhưng không kết luận ngoại lệ nếu đoạn nguồn không đủ phân loại. Không tự thêm thành phần hồ sơ, lệ phí, thời hạn hoặc biểu mẫu hiện hành. Nêu rõ chúng chưa xác minh và đặt câu hỏi cần hỏi UBND cấp xã. Không dùng mã 1.013855.H17 như bằng chứng cho hồ sơ hoặc mức phí hiện hành.

Mọi câu nói về thẩm quyền, điều kiện, hoặc việc chuẩn bị dựa trên nguồn đều phải kèm passageIds chính xác từ các đoạn nguồn gửi vào. Chọn đoạn có thẻ nội dung đúng với từng loại nhận định; không dùng đoạn về dụng cụ để dẫn cho thẩm quyền. Nếu nguồn không hỗ trợ, bỏ câu đó. Tạo 1–4 việc rà soát/chuẩn bị hữu ích, không tuyên bố chủ quán đã tuân thủ. Tạo route có điều kiện dựa trên giấy đăng ký hộ kinh doanh được người dùng xác nhận. Trong unresolved, ghi rõ thành phần hồ sơ, lệ phí và thời hạn hiện hành là “chưa xác minh”. Bước tiếp theo phải là việc hỏi/xác nhận chính thức, không khẳng định được nộp hồ sơ. Nhắc rõ các dấu tick chỉ ghi nhận đã đọc hoặc đã chuẩn bị, không xác nhận tuân thủ hay sẵn sàng nộp.`;

export class ProviderError extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = 'ProviderError';
    this.evidence = evidence;
  }
}

export async function generateChecklist({ facts, evidence, env = process.env, fetchImpl = fetch }) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const model = env.OPENROUTER_MODEL?.trim() || 'google/gemma-4-31b-it:free';
  if (!apiKey) throw new ProviderError('Thiếu OPENROUTER_API_KEY. Hãy cấu hình khóa trong môi trường chạy để tạo checklist.', evidence);

  let response;
  try {
    response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4173',
        'X-Title': 'Checklist chuẩn bị quán Đà Nẵng',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ facts, passages: evidence }) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    throw new ProviderError('Không kết nối được với dịch vụ tạo câu trả lời. Các đoạn nguồn đã chọn được giữ bên dưới để bạn tự mở.', evidence);
  }

  if (!response.ok) {
    throw new ProviderError(`Dịch vụ tạo câu trả lời trả về lỗi (${response.status}). Các đoạn nguồn đã chọn được giữ bên dưới.`, evidence);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError('Dịch vụ trả về dữ liệu không đọc được. Không tạo checklist chưa kiểm chứng.', evidence);
  }

  const content = payload?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    throw new ProviderError('Dịch vụ trả về nội dung không theo cấu trúc yêu cầu. Không tạo checklist chưa kiểm chứng.', evidence);
  }

  const checklist = sanitizeChecklist(parsed, evidence);
  try {
    assertUsefulChecklist(checklist);
  } catch {
    throw new ProviderError('Câu trả lời thiếu căn cứ hoặc thiếu bước hành động. Không hiển thị các nhận định đó.', evidence);
  }

  return { checklist, model: payload.model || model, snapshotDate };
}
