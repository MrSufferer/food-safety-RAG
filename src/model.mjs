import { applyOwnerFactGuidance, assertUsefulChecklist, sanitizeChecklist } from './checklist.mjs';
import { snapshotDate } from './passages.mjs';
import { buildBoundaryChecklist } from './questions.mjs';

const RATE_LIMIT_FALLBACK_MODEL = 'local:rate-limit-fallback-v1';
const RATE_LIMIT_FALLBACK_NOTICE = 'Dịch vụ tạo checklist đang giới hạn yêu cầu. Checklist này được tạo tự động từ các đoạn nguồn đã chọn; hãy xem trích dẫn và xác nhận điểm chưa rõ với cơ quan có thẩm quyền.';

const SYSTEM_PROMPT = `Bạn là công cụ chuẩn bị thông tin cho chủ quán cà phê/takeaway mới ở Đà Nẵng. Trả lời hoàn toàn bằng tiếng Việt, ngắn và cụ thể. Chỉ trả một đối tượng JSON có đúng các khóa route, tasks, unresolved, nextAction. Mỗi mục là null hoặc đối tượng có text và passageIds; riêng tasks và unresolved là mảng. Đây không phải tư vấn pháp lý, quyết định đủ điều kiện, hồ sơ nộp, hay xác nhận sẵn sàng hoạt động.

Chỉ dùng các dữ kiện chủ quán cung cấp và các đoạn nguồn trong yêu cầu. Khi loại giấy đăng ký là unknown, đặt route=null; không nêu cơ quan. Trong unresolved, nêu rõ cần kiểm tra tên giấy đăng ký nào và vì sao dữ kiện đó ảnh hưởng đến đầu mối. Vẫn tạo các nhiệm vụ an toàn thực phẩm có căn cứ độc lập với tuyến đăng ký.

Không suy ra miễn giấy từ chữ “nhỏ”. Đối chiếu đúng giấy đăng ký và hoạt động thực tế với định nghĩa tại khoản 10 Điều 3 và các nhóm tại Điều 12 Nghị định 15/2018/NĐ-CP; nếu chưa đủ dữ kiện, nói rõ điều gì còn thiếu và yêu cầu xác nhận chính thức. Ngoại lệ Giấy chứng nhận không xóa các điều kiện an toàn thực phẩm áp dụng cho hoạt động. Không tự thêm thành phần hồ sơ, lệ phí, thời hạn hoặc biểu mẫu hiện hành. Nêu rõ chúng chưa xác minh. Không dùng mã 1.013855.H17 như bằng chứng cho hồ sơ hoặc mức phí hiện hành.

Mọi câu nói về thẩm quyền, điều kiện, hoặc việc chuẩn bị dựa trên nguồn đều phải kèm passageIds chính xác từ các đoạn nguồn gửi vào. Chọn đoạn có thẻ nội dung đúng với từng loại nhận định; không dùng đoạn về dụng cụ để dẫn cho thẩm quyền. Nếu nguồn không hỗ trợ, bỏ câu đó. Tạo 1–4 việc rà soát/chuẩn bị hữu ích, không tuyên bố chủ quán đã tuân thủ. Route chỉ được nêu có điều kiện khi giấy đăng ký hộ kinh doanh được người dùng xác nhận. Trong unresolved, ghi rõ thành phần hồ sơ, lệ phí và thời hạn hiện hành là “chưa xác minh”. Bước tiếp theo phải là việc hỏi/xác nhận chính thức, không khẳng định được nộp hồ sơ. Nhắc rõ các dấu tick chỉ ghi nhận đã đọc hoặc đã chuẩn bị, không xác nhận tuân thủ hay sẵn sàng nộp.`;

const CITATION_GUIDANCE = `Ánh xạ nguồn: route dùng dn-faq-24680-household-certificate-authority và chỉ khi đã xác nhận giấy đăng ký hộ kinh doanh; tasks dùng các passage về dụng cụ trong Luật 55 phù hợp với hoạt động; unresolved về hồ sơ, lệ phí và thời hạn dùng dn-procedure-1-013855-h17, không kèm FAQ vì FAQ chỉ nói về thẩm quyền. Để đánh giá ngoại lệ, dùng vn-decree-15-2018-articles-11-12; nêu đúng dữ kiện đăng ký và hoạt động do chủ quán cung cấp. Với legalForm=unknown, route phải null, unresolved phải xác định giấy đăng ký còn thiếu, còn tasks vẫn phải có căn cứ. Không tự ghép nguồn không hỗ trợ vào cùng một claim.`;

export class ProviderError extends Error {
  constructor(message, evidence, evidenceGaps = []) {
    super(message);
    this.name = 'ProviderError';
    this.evidence = evidence;
    this.evidenceGaps = evidenceGaps;
  }
}

export async function generateChecklist({ facts, evidence, env = process.env, fetchImpl = fetch }) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const model = env.OPENROUTER_MODEL?.trim() || 'nvidia/nemotron-3-super-120b-a12b:free';
  if (!apiKey) throw new ProviderError('Thiếu OPENROUTER_API_KEY. Hãy cấu hình khóa trong môi trường chạy để tạo checklist.', evidence);

  let response;
  try {
    response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4173',
        'X-Title': 'Da Nang Cafe Food Safety Checklist',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n${CITATION_GUIDANCE}` },
          { role: 'user', content: JSON.stringify({ facts, passages: evidence }) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch {
    throw new ProviderError('Không kết nối được với dịch vụ tạo câu trả lời. Các đoạn nguồn đã chọn được giữ bên dưới để bạn tự mở.', evidence);
  }

  if (!response.ok) {
    if (response.status === 429) {
      const { checklist: boundaryChecklist, evidenceGaps } = buildBoundaryChecklist(evidence, facts);
      const checklist = assertUsefulChecklist(applyOwnerFactGuidance(boundaryChecklist, facts, evidence));
      return {
        checklist,
        evidenceGaps,
        model: RATE_LIMIT_FALLBACK_MODEL,
        generationNotice: RATE_LIMIT_FALLBACK_NOTICE,
        snapshotDate,
      };
    }
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

  const sanitized = sanitizeChecklist(parsed, evidence, { expectRoute: facts.legalForm !== 'unknown' });
  const { evidenceGaps: initialEvidenceGaps, ...safeChecklist } = sanitized;
  const checklist = applyOwnerFactGuidance(safeChecklist, facts, evidence);
  const evidenceGaps = initialEvidenceGaps.filter((gap) => {
    if (gap.section === 'route' && checklist.route) return false;
    if (gap.section === 'tasks' && gap.issue === 'missing' && checklist.tasks.length > 0) return false;
    if (gap.section === 'nextAction' && checklist.nextAction) return false;
    return true;
  });
  try {
    assertUsefulChecklist(checklist);
  } catch {
    throw new ProviderError('Câu trả lời không có mục nào đủ căn cứ để hiển thị. Hãy kiểm tra các đoạn nguồn và xác nhận trực tiếp với cơ quan có thẩm quyền.', evidence, evidenceGaps);
  }

  return { checklist, evidenceGaps, model: payload.model || model, snapshotDate };
}
