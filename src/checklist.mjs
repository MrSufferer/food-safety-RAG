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

  if (sizeAndExemption && !rejectsSizeOnlyExemption) return false;

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

function evidenceGap(section, issue) {
  const copy = {
    route: {
      label: 'Hướng cơ quan',
      missing: 'Chưa có đoạn nguồn được chọn xác nhận cơ quan hoặc thủ tục áp dụng, nên chưa nêu lộ trình.',
      unsupported: 'Đoạn nguồn được chọn không xác nhận cơ quan hoặc thủ tục nêu trong nhận định, nên lộ trình đã được lược bỏ.',
    },
    tasks: {
      label: 'Việc chuẩn bị',
      missing: 'Chưa có đoạn nguồn phù hợp để nêu việc chuẩn bị có căn cứ.',
      unsupported: 'Đoạn nguồn được chọn không xác nhận một số việc chuẩn bị, nên các việc đó đã được lược bỏ.',
    },
    unresolved: {
      label: 'Điểm chưa xác minh',
      missing: 'Nguồn hiện có chưa xác nhận thành phần hồ sơ, lệ phí hoặc thời hạn hiện hành. Hãy coi các chi tiết này là “chưa xác minh”.',
      unsupported: 'Đoạn nguồn được chọn không đủ căn cứ cho một số điểm chưa xác minh; thành phần hồ sơ, lệ phí và thời hạn hiện hành vẫn “chưa xác minh”.',
    },
    nextAction: {
      label: 'Bước tiếp theo',
      missing: 'Chưa có đoạn nguồn phù hợp để đưa ra bước tiếp theo; hãy hỏi cơ quan có thẩm quyền để xác nhận.',
      unsupported: 'Đoạn nguồn được chọn không hỗ trợ bước tiếp theo đã nêu, nên bước đó đã được lược bỏ. Hãy hỏi cơ quan có thẩm quyền để xác nhận.',
    },
  }[section];
  return { section, label: copy.label, issue, message: copy[issue] };
}

export function sanitizeChecklist(input, evidence, { expectRoute = true } = {}) {
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
  const taskCandidates = Array.isArray(input?.tasks) ? input.tasks : [];
  const validTasks = taskCandidates
    .map((claim) => validClaim(claim, evidence, new Set([
      'separate-raw-cooked-utensils',
      'safe-cooking-utensils',
      'clean-dry-serving-utensils',
      'conditions-for-exception',
    ])))
    .filter(Boolean);
  const tasks = validTasks.slice(0, 4);
  const unresolvedCandidates = Array.isArray(input?.unresolved) ? input.unresolved : [];
  const validUnresolved = unresolvedCandidates
    .map((claim) => validClaim(claim, evidence, new Set([
      'household-business-authority',
      'conditional-route',
      'unverified-administrative-details',
      'certificate-rule',
      'exception-criteria',
      'no-size-only-exemption',
      'procedure-code',
    ])))
    .filter(Boolean);
  const unresolved = validUnresolved.slice(0, 5);

  const gaps = [];
  if (expectRoute && !route) gaps.push(evidenceGap('route', input?.route ? 'unsupported' : 'missing'));
  if (taskCandidates.length === 0 || validTasks.length < taskCandidates.length) {
    gaps.push(evidenceGap('tasks', taskCandidates.length ? 'unsupported' : 'missing'));
  }
  if (unresolvedCandidates.length === 0 || validUnresolved.length < unresolvedCandidates.length) {
    gaps.push(evidenceGap('unresolved', unresolvedCandidates.length ? 'unsupported' : 'missing'));
  }
  if (!nextAction) gaps.push(evidenceGap('nextAction', input?.nextAction ? 'unsupported' : 'missing'));

  return { route, tasks, unresolved, nextAction, evidenceGaps: gaps };
}

function fixedClaim(text, passageIds, evidence, tags) {
  return validClaim({ text, passageIds }, evidence, new Set(tags));
}

export function addSupportedPreparationTasks(checklist, facts, evidence) {
  if (checklist.tasks.length > 0) return checklist;
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
  const tasks = taskOptions.flatMap(([tag, text]) => {
    const passage = evidence.find((item) => item.claimTags?.includes(tag));
    const claim = passage && fixedClaim(text, [passage.id], evidence, [tag]);
    return claim ? [claim] : [];
  });
  return { ...checklist, tasks };
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

export function assertUsefulChecklist(checklist) {
  if (checklist.tasks.length === 0) {
    throw new Error('Không có việc chuẩn bị nào được hỗ trợ bởi nguồn đã chọn.');
  }
  return checklist;
}
