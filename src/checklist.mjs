function validClaim(claim, evidence, supportedTags) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const text = typeof claim.text === 'string' ? claim.text.trim() : '';
  const passageIds = Array.isArray(claim.passageIds) ? [...new Set(claim.passageIds)] : [];
  const byId = new Map(evidence.map((passage) => [passage.id, passage]));

  if (!text || text.length > 900 || passageIds.length === 0 || passageIds.length > 4) return null;
  if (passageIds.some((id) => typeof id !== 'string' || !byId.has(id))) return null;
  if (passageIds.some((id) => !byId.get(id).claimTags?.some((tag) => supportedTags.has(tag)))) return null;

  return {
    text,
    passageIds,
    citations: passageIds.map((id) => {
      const passage = byId.get(id);
      return {
        id: passage.id,
        label: `${passage.document} · ${passage.section}`,
        url: passage.documentUrl ?? passage.url,
        sourcePageUrl: passage.url,
        publishedDate: passage.issuedDate,
        effectiveDate: passage.effectiveDate,
        snapshotDate: passage.reviewDate,
      };
    }),
  };
}

export function sanitizeChecklist(input, evidence) {
  const route = validClaim(input?.route, evidence, new Set(['household-business-authority', 'conditional-route']));
  const nextAction = validClaim(input?.nextAction, evidence, new Set([
    'household-business-authority',
    'conditional-route',
    'official-next-step',
    'procedure-code',
    'unverified-administrative-details',
    'certificate-rule',
    'exception-criteria',
    'no-size-only-exemption',
  ]));
  const tasks = (Array.isArray(input?.tasks) ? input.tasks : [])
    .map((claim) => validClaim(claim, evidence, new Set([
      'separate-raw-cooked-utensils',
      'safe-cooking-utensils',
      'clean-dry-serving-utensils',
      'conditions-for-exception',
    ])))
    .filter(Boolean)
    .slice(0, 4);
  const unresolved = (Array.isArray(input?.unresolved) ? input.unresolved : [])
    .map((claim) => validClaim(claim, evidence, new Set([
      'unverified-administrative-details',
      'certificate-rule',
      'exception-criteria',
      'no-size-only-exemption',
      'procedure-code',
    ])))
    .filter(Boolean)
    .slice(0, 5);

  return { route, tasks, unresolved, nextAction };
}

function fixedClaim(text, passageIds, evidence, tags) {
  return validClaim({ text, passageIds }, evidence, new Set(tags));
}

const faqId = 'dn-faq-24680-household-certificate-authority';
const decreeId = 'vn-decree-15-2018-articles-11-12';

function operationDescription(facts) {
  if (facts.operationMode === 'prepared_at_fixed_shop') return 'quán tự chuẩn bị đồ ăn và thức uống tại địa điểm cố định';
  if (facts.operationMode === 'packaged_only') return 'đồ ăn quán bán là thực phẩm bao gói sẵn, dù quán có thể vẫn pha chế đồ uống';
  if (facts.operationMode === 'street_food') return 'quán bán thức ăn đường phố hoặc hoạt động di động';
  return 'cách quán chuẩn bị và bán thực phẩm chưa được xác định rõ';
}

function exceptionCategoryCheck(facts) {
  if (facts.legalForm === 'unknown') {
    return 'Do chưa rõ giấy đăng ký, chưa thể đối chiếu điều kiện về loại hình chủ thể trong định nghĩa “kinh doanh thực phẩm nhỏ lẻ”.';
  }
  if (facts.operationMode === 'packaged_only') {
    return 'Phần đồ ăn đã khai có thể khớp nhóm kinh doanh thực phẩm bao gói sẵn tại điểm đ khoản 1 Điều 12; nếu quán còn pha chế, chế biến hoặc có hoạt động khác, cần đánh giá riêng phần đó.';
  }
  if (facts.operationMode === 'street_food') {
    return 'Hoạt động đã khai có thể khớp nhóm kinh doanh thức ăn đường phố tại điểm i khoản 1 Điều 12; cần cơ quan có thẩm quyền xác nhận loại hình thực tế.';
  }
  if (facts.legalForm === 'household_business' && facts.operationMode === 'prepared_at_fixed_shop') {
    return 'Giấy đăng ký hộ kinh doanh bạn nêu phù hợp với tiêu chí đăng ký trong định nghĩa tại khoản 10 Điều 3; hoạt động quán tự chuẩn bị đồ ăn, thức uống là dữ kiện cần đối chiếu với nhóm “kinh doanh thực phẩm nhỏ lẻ” tại điểm d khoản 1 Điều 12.';
  }
  return 'Các dữ kiện hiện có chưa đủ để xếp hoạt động vào một nhóm ngoại lệ cụ thể tại khoản 1 Điều 12.';
}

export function applyOwnerFactGuidance(checklist, facts, evidence) {
  const guided = { ...checklist, exceptionAssessment: null };
  const lawId = facts.preparation === 'food_and_drink'
    ? 'vn-law-55-2010-article-29-separate-utensils'
    : 'vn-law-55-2010-article-29-safe-utensils';
  const hasLawPassage = evidence.some((passage) => passage.id === lawId);

  if (facts.legalForm === 'unknown') {
    guided.route = null;
    const missingRegistration = fixedClaim(
      'Chưa rõ tên trên giấy đăng ký của quán. Cần biết quán đang giữ Giấy chứng nhận đăng ký hộ kinh doanh, Giấy chứng nhận đăng ký doanh nghiệp, hay giấy đăng ký hợp tác xã để xác định đúng nhóm cơ quan theo hướng dẫn của Đà Nẵng.',
      [faqId], evidence, ['household-business-authority', 'conditional-route'],
    );
    guided.unresolved = [missingRegistration, ...guided.unresolved].filter(Boolean).slice(0, 5);
    guided.nextAction = fixedClaim(
      'Mở Câu trả lời 24680 trên Cổng Thông tin điện tử Đà Nẵng và đối chiếu đúng tên giấy đăng ký. Nếu chưa xác định được giấy hoặc nhóm cơ quan, gửi câu hỏi qua cổng này kèm thông tin quán tự chuẩn bị/bán thực phẩm như thế nào để xác nhận nơi tiếp nhận và thủ tục áp dụng.',
      [faqId], evidence, ['household-business-authority', 'official-next-step'],
    );
  }

  if (facts.smallExemptionClaim !== 'no') {
    const operation = operationDescription(facts);
    const citesLaw = facts.operationMode === 'prepared_at_fixed_shop' && hasLawPassage;
    const conditionNote = citesLaw
      ? ' Với hoạt động chuẩn bị đồ ăn, các điều kiện về dụng cụ tại Điều 29 Luật An toàn thực phẩm vẫn cần được rà soát; việc ngoại lệ giấy chứng nhận (nếu được xác nhận) không xác nhận đã đáp ứng các điều kiện đó.'
      : ' Ngoại lệ được liệt kê chỉ nói về Giấy chứng nhận; hãy hỏi cơ quan xác nhận những điều kiện an toàn thực phẩm còn áp dụng cho đúng hoạt động này.';
    guided.exceptionAssessment = fixedClaim(
      `Bạn cho biết ${facts.smallExemptionClaim === 'yes' ? 'nghĩ quán có thể được miễn vì quy mô nhỏ' : 'muốn kiểm tra quán có thể được miễn giấy chứng nhận hay không'}. Chỉ dựa vào quy mô nhỏ không đủ để kết luận được miễn. Nghị định 15/2018/NĐ-CP định nghĩa “kinh doanh thực phẩm nhỏ lẻ” theo loại chủ thể/giấy đăng ký tại khoản 10 Điều 3 và liệt kê các nhóm ngoại lệ tại Điều 12; ${operation}. ${exceptionCategoryCheck(facts)}${conditionNote}`,
      citesLaw ? [decreeId, lawId] : [decreeId],
      evidence,
      ['certificate-rule', 'exception-criteria', 'no-size-only-exemption', 'separate-raw-cooked-utensils', 'safe-cooking-utensils', 'clean-dry-serving-utensils'],
    );
    const nextActionText = facts.legalForm === 'unknown'
      ? `Sau khi tìm được đúng tên giấy đăng ký, gửi câu hỏi qua Cổng Thông tin điện tử Đà Nẵng: ${operation} có thuộc nhóm ngoại lệ tại Điều 12 Nghị định 15/2018/NĐ-CP không, và cơ quan nào xác nhận điều kiện an toàn thực phẩm tương ứng?`
      : `Hỏi UBND cấp xã nơi quán hoạt động xem ${operation} có thuộc nhóm ngoại lệ nào tại Điều 12 Nghị định 15/2018/NĐ-CP không; nêu rõ loại giấy đăng ký và hỏi những điều kiện an toàn thực phẩm nào vẫn áp dụng.`;
    guided.nextAction = fixedClaim(
      nextActionText, [faqId, decreeId], evidence,
      ['household-business-authority', 'conditional-route', 'official-next-step', 'certificate-rule', 'exception-criteria'],
    );

    const activityTask = fixedClaim(
      `Ghi lại các bước quán thực tế chuẩn bị và bán thực phẩm (${operation}) để cơ quan có thẩm quyền xác nhận các điều kiện an toàn thực phẩm tương ứng; khoản 2 Điều 12 Nghị định 15/2018/NĐ-CP vẫn yêu cầu tuân thủ các điều kiện đó với cơ sở thuộc nhóm ngoại lệ.`,
      [decreeId], evidence, ['conditions-for-exception'],
    );
    guided.tasks = [...guided.tasks.slice(0, 3), activityTask].filter(Boolean);
  }

  return guided;
}

export function assertUsefulChecklist(checklist, { requireRoute = true } = {}) {
  if ((requireRoute && !checklist.route) || checklist.tasks.length < 1 || checklist.unresolved.length < 1 || !checklist.nextAction) {
    throw new Error('Model trả về câu trả lời thiếu lộ trình, việc chuẩn bị, điểm chưa xác minh hoặc bước tiếp theo có căn cứ.');
  }
  return checklist;
}
