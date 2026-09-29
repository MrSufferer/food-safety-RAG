function normalizeClaimText(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi');
}

function claimMatchesTag(text, tag) {
  const has = (pattern) => pattern.test(text);
  const hasTool = has(/dung cu|do chua|vat lieu/);
  const action = has(/ra soat|kiem tra|ghi lai|hoi|lien he|xac nhan|doi chieu|mo cau tra loi|gui cau hoi|xin/);
  const sizeAndExemption = has(/quy mo|quan nho|co so nho/) && has(/mien|ngoai le/);
  const rejectsSizeOnlyExemption = has(/khong du|khong the ket luan|khong phai can cu|khong du can cu|chua the ket luan/);

  if (sizeAndExemption && !rejectsSizeOnlyExemption && tag !== 'no-size-only-exemption') return false;

  switch (tag) {
    case 'separate-raw-cooked-utensils':
      return hasTool && ((has(/song/) && has(/chin/)) || (has(/rieng|tach/) && has(/thuc pham/))
        || (has(/dieu 29/) && has(/dieu kien/)));
    case 'safe-cooking-utensils':
      return hasTool && has(/nau|che bien|pha che/) && has(/an toan|ve sinh/);
    case 'clean-dry-serving-utensils':
      return has(/dung cu|vat lieu/) && has(/an uong|phuc vu|chen|dia|ly|coc/) && has(/an toan|rua|sach|kho/);
    case 'conditions-for-exception':
      return has(/dieu kien|yeu cau/) && has(/an toan thuc pham/);
    case 'household-business-authority':
    case 'conditional-route':
      return has(/ho kinh doanh|giay dang ky|giay chung nhan dau tu|lien hop tac xa|hop tac xa/)
        && has(/ubnd cap xa|so y te|co quan tiep nhan|phan nhom co quan|cau tra loi 24680/)
        && has(/giay chung nhan|tham quyen|thu tuc|co quan/);
    case 'official-next-step':
      return action;
    case 'procedure-code':
      return (has(/1\.013855\.h17|ma thu tuc|danh muc thu tuc/) && (action || has(/chua xac minh|hien hanh|con ap dung/)));
    case 'unverified-administrative-details':
      return has(/chua xac minh/) && has(/ho so|le phi|thoi han|ma thu tuc/);
    case 'certificate-rule':
      return has(/giay chung nhan/) && has(/cap|ngoai le|mien|phai|thuoc dien/);
    case 'exception-criteria':
      return has(/dieu 3|dieu 12|nhom ngoai le|kinh doanh thuc pham nho le|thuc pham bao goi san|thuc an duong pho/);
    case 'no-size-only-exemption':
      return has(/quy mo|quan nho|nho/) && has(/khong du|khong the ket luan|khong phai can cu|khong du can cu/);
    default:
      return false;
  }
}

function validClaim(claim, evidence, supportedTags) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const text = typeof claim.text === 'string' ? claim.text.trim() : '';
  const passageIds = Array.isArray(claim.passageIds) ? [...new Set(claim.passageIds)] : [];
  const byId = new Map(evidence.map((passage) => [passage.id, passage]));

  if (!text || text.length > 900 || passageIds.length === 0 || passageIds.length > 4) return null;
  if (passageIds.some((id) => typeof id !== 'string' || !byId.has(id))) return null;
  const normalizedText = normalizeClaimText(text);
  if (passageIds.some((id) => !byId.get(id).claimTags?.some((tag) => (
    supportedTags.has(tag) && claimMatchesTag(normalizedText, tag)
  )))) return null;

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
      'household-business-authority',
      'conditional-route',
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

const evidenceGapDetails = {
  route: {
    label: 'Hướng tiếp nhận',
    neededEvidence: 'Đoạn nguồn chính thức hiện hành của Đà Nẵng cần nêu cơ quan tiếp nhận tương ứng với loại giấy đăng ký hộ kinh doanh.',
  },
  tasks: {
    label: 'Việc chuẩn bị',
    neededEvidence: 'Đoạn nguồn chính thức cần hỗ trợ đúng điều kiện hoặc thao tác chuẩn bị được nêu cho hoạt động quán đã khai.',
  },
  unresolved: {
    label: 'Điểm chưa xác minh',
    neededEvidence: 'Nguồn thủ tục chính thức hiện hành cần xác nhận hồ sơ, lệ phí và thời hạn; nguồn chỉ nhận diện mã thủ tục chưa đủ cho các chi tiết này.',
  },
  nextAction: {
    label: 'Bước chính thức tiếp theo',
    neededEvidence: 'Nguồn chính thức cần xác định đầu mối có thể trả lời câu hỏi cụ thể hoặc cung cấp đường dẫn thủ tục hiện hành.',
  },
};

export function buildEvidenceGaps(input, sanitized, facts) {
  const gaps = [];
  const add = (section, missing, omittedCount = 0) => {
    const detail = evidenceGapDetails[section];
    gaps.push({
      section,
      label: detail.label,
      reason: missing
        ? 'Chưa đủ căn cứ để hiển thị mục này. Nội dung thiếu trích dẫn hợp lệ từ nguồn phù hợp hoặc đoạn được dẫn không hỗ trợ cách diễn đạt.'
        : `${omittedCount} mục do mô hình đề xuất đã được lược bỏ vì thiếu trích dẫn hợp lệ hoặc nguồn không hỗ trợ cách diễn đạt.`,
      neededEvidence: detail.neededEvidence,
    });
  };

  if (facts.legalForm !== 'unknown' && !sanitized.route) add('route', true);

  const proposedTasks = Array.isArray(input?.tasks) ? input.tasks.length : 0;
  const omittedTasks = Math.max(0, proposedTasks - sanitized.tasks.length);
  if (omittedTasks > 0 || sanitized.tasks.length === 0) add('tasks', sanitized.tasks.length === 0, omittedTasks);

  const proposedUnresolved = Array.isArray(input?.unresolved) ? input.unresolved.length : 0;
  const omittedUnresolved = Math.max(0, proposedUnresolved - sanitized.unresolved.length);
  if (omittedUnresolved > 0 || sanitized.unresolved.length === 0) {
    add('unresolved', sanitized.unresolved.length === 0, omittedUnresolved);
  }

  if (!sanitized.nextAction) add('nextAction', true);
  return gaps;
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
      'Chưa thể nêu cơ quan tiếp nhận vì chưa rõ tên loại giấy đăng ký. Hãy kiểm tra quán đang hoạt động theo Giấy chứng nhận đăng ký hộ kinh doanh, Giấy chứng nhận đăng ký doanh nghiệp, Giấy chứng nhận đầu tư, Giấy chứng nhận đăng ký hợp tác xã hay Giấy chứng nhận đăng ký liên hợp tác xã; hướng dẫn của Đà Nẵng phân nhóm cơ quan theo thông tin này.',
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

export function addSupportedFallbacks(checklist, facts, evidence) {
  const completed = { ...checklist };
  const findByTag = (tag) => evidence.find((passage) => passage.claimTags?.includes(tag));

  if (completed.tasks.length === 0) {
    const taskOptions = facts.preparation === 'food_and_drink'
      ? [
        ['separate-raw-cooked-utensils', 'Rà soát việc dùng dụng cụ và đồ chứa riêng cho thực phẩm sống và thực phẩm chín.'],
        ['safe-cooking-utensils', 'Rà soát dụng cụ nấu nướng, chế biến để bảo đảm vệ sinh an toàn.'],
        ['clean-dry-serving-utensils', 'Rà soát dụng cụ ăn uống: vật liệu an toàn, được rửa sạch và giữ khô.'],
      ]
      : [
        ['safe-cooking-utensils', 'Rà soát dụng cụ pha chế để bảo đảm vệ sinh an toàn.'],
        ['clean-dry-serving-utensils', 'Rà soát dụng cụ phục vụ: vật liệu an toàn, được rửa sạch và giữ khô.'],
      ];
    completed.tasks = taskOptions.flatMap(([tag, text]) => {
      const passage = findByTag(tag);
      return passage
        ? [fixedClaim(text, [passage.id], evidence, [tag])]
        : [];
    }).filter(Boolean).slice(0, 4);
  }

  const procedure = findByTag('unverified-administrative-details');
  if (procedure && !completed.unresolved.some((claim) => claim.passageIds.includes(procedure.id))) {
    const unresolved = fixedClaim(
      'Thành phần hồ sơ, lệ phí và thời hạn hiện hành: chưa xác minh. Danh mục năm 2025 chỉ giúp nhận diện mã thủ tục, không xác nhận các chi tiết này đang áp dụng.',
      [procedure.id], evidence, ['unverified-administrative-details'],
    );
    if (unresolved) completed.unresolved = [...completed.unresolved, unresolved].slice(0, 5);
  }

  if (!completed.nextAction) {
    const authority = findByTag('household-business-authority');
    const procedure = findByTag('procedure-code');
    let text;
    let passageIds = [];

    if (facts.legalForm === 'unknown' && authority) {
      text = 'Đối chiếu đúng tên giấy đăng ký theo Câu trả lời 24680 trên Cổng Thông tin điện tử Đà Nẵng; sau đó hỏi cơ quan tương ứng để xác nhận thủ tục đang áp dụng.';
      passageIds = [authority.id];
    } else if (facts.legalForm === 'household_business' && authority && procedure) {
      text = 'Hỏi UBND cấp xã nơi quán hoạt động xem mã thủ tục 1.013855.H17 còn áp dụng không; xin đường dẫn hiện hành xác nhận riêng hồ sơ, lệ phí và thời hạn.';
      passageIds = [authority.id, procedure.id];
    } else if (facts.legalForm === 'household_business' && authority) {
      text = 'Hỏi UBND cấp xã nơi quán hoạt động về thủ tục đang áp dụng và đề nghị cung cấp đường dẫn chính thức.';
      passageIds = [authority.id];
    } else if (procedure) {
      text = 'Hỏi đầu mối an toàn thực phẩm chính thức của Đà Nẵng xem mã 1.013855.H17 còn áp dụng không và xin đường dẫn thủ tục hiện hành.';
      passageIds = [procedure.id];
    }

    if (text) {
      completed.nextAction = fixedClaim(
        text,
        passageIds,
        evidence,
        ['household-business-authority', 'official-next-step', 'procedure-code', 'unverified-administrative-details'],
      );
    }
  }

  return completed;
}

export function assertUsefulChecklist(checklist, {
  requireRoute = true,
  requireUnresolved = true,
  requireNextAction = true,
} = {}) {
  if ((requireRoute && !checklist.route)
    || checklist.tasks.length < 1
    || (requireUnresolved && checklist.unresolved.length < 1)
    || (requireNextAction && !checklist.nextAction)) {
    throw new Error('Model trả về câu trả lời thiếu lộ trình, việc chuẩn bị, điểm chưa xác minh hoặc bước tiếp theo có căn cứ.');
  }
  return checklist;
}
