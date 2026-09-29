import { assertUsefulChecklist, sanitizeChecklist } from './checklist.mjs';
import { snapshotDate } from './passages.mjs';

export const boundaryResolverId = 'local:question-boundary-v1';

const pcccRoute = {
  label: 'Cổng thông tin thành phố Đà Nẵng',
  url: 'https://danang.gov.vn/',
  source: {
    label: 'Cổng thông tin xã Thăng Trường · thông tin về Phòng Cảnh sát PCCC và CNCH (PC07)',
    url: 'https://thangtruong.danang.gov.vn/chi-tiet-tin/group/151/nid/417241/thang-truong-to-chuc-huan-luyen-nghiep-vu-pccc-va-cnch-cho-luc-luong-dan-phong-truong-thon',
    issuedDate: '2026-09-22',
    reviewDate: snapshotDate,
    note: 'Nguồn này giúp tìm đúng tên đơn vị để hỏi; không xác nhận yêu cầu, giấy tờ hoặc thủ tục áp dụng cho quán.',
  },
};

const filingDetails = [
  {
    key: 'dossier',
    label: 'Thành phần hồ sơ',
    question: 'Với cơ sở của tôi, thành phần hồ sơ đang áp dụng hôm nay gồm những gì? Xin gửi đường dẫn thủ tục và căn cứ hiện hành.',
  },
  {
    key: 'fee',
    label: 'Lệ phí',
    question: 'Lệ phí hiện hành cho trường hợp của tôi là bao nhiêu? Xin gửi căn cứ và đường dẫn chính thức đang áp dụng.',
  },
  {
    key: 'processing_time',
    label: 'Thời hạn xử lý',
    question: 'Thời hạn xử lý hiện hành là bao lâu, tính từ mốc nào? Xin gửi căn cứ và đường dẫn thủ tục đang áp dụng.',
  },
];

const preparationTasks = [
  {
    tag: 'separate-raw-cooked-utensils',
    text: 'Rà soát việc dùng dụng cụ và đồ chứa riêng cho thực phẩm sống và thực phẩm chín.',
  },
  {
    tag: 'safe-cooking-utensils',
    text: 'Rà soát dụng cụ nấu nướng, chế biến để bảo đảm vệ sinh an toàn.',
  },
  {
    tag: 'clean-dry-serving-utensils',
    text: 'Rà soát dụng cụ ăn uống: vật liệu an toàn, được rửa sạch và giữ khô.',
  },
];

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function validateQuestion(input) {
  if (input == null) return '';
  if (typeof input !== 'string') throw new TypeError('Câu hỏi cần ở dạng văn bản.');
  const question = input.trim();
  if (question.length > 500) throw new TypeError('Câu hỏi không được dài hơn 500 ký tự.');
  return question;
}

export function classifyQuestion(input) {
  const question = normalize(validateQuestion(input));
  if (!question) return null;

  if (['pccc', 'phong chay', 'chua chay', 'cuu nan cuu ho', 'fire safety'].some((term) => question.includes(term))) {
    return 'fire_safety';
  }

  if ([
    'ho so', 'thanh phan', 'le phi', 'phi', 'thoi han', 'han nop', 'thoi gian', 'bao lau',
    'bao nhieu ngay', 'ngay xu ly', 'ngay co ket qua', 'ngay nhan ket qua', 'khi nao co ket qua', 'deadline',
  ]
    .some((term) => question.includes(term))) {
    return 'filing_details';
  }

  return 'unsupported';
}

function sourceCitation(passage) {
  if (!passage) return null;
  return {
    id: passage.id,
    label: `${passage.document} · ${passage.section}`,
    url: passage.documentUrl ?? passage.url,
    issuedDate: passage.issuedDate,
    effectiveDate: passage.effectiveDate,
    reviewDate: passage.reviewDate,
  };
}

function findFilingSourceConflicts(evidence) {
  // Compare only explicit, source-attributed claims; do not infer procedural values from prose.
  const claimsByKey = new Map();

  for (const passage of evidence) {
    for (const [key, value] of Object.entries(passage.administrativeClaims ?? {})) {
      if (!filingDetails.some((detail) => detail.key === key) || typeof value !== 'string' || !value.trim()) continue;
      if (!claimsByKey.has(key)) claimsByKey.set(key, new Map());
      const valueKey = normalize(value);
      if (!claimsByKey.get(key).has(valueKey)) claimsByKey.get(key).set(valueKey, []);
      claimsByKey.get(key).get(valueKey).push({ value: value.trim(), source: sourceCitation(passage) });
    }
  }

  return filingDetails.flatMap(({ key, label }) => {
    const values = claimsByKey.get(key);
    if (!values || values.size < 2) return [];
    const assertions = [...values.values()].flat();

    return [{
      key,
      label,
      status: 'source_conflict',
      summary: `Các nguồn được chọn nêu thông tin khác nhau về ${label.toLocaleLowerCase('vi')}; chưa xác định nội dung nào đang có hiệu lực. Không gộp các thông tin này thành yêu cầu hiện hành.`,
      assertions,
    }];
  });
}

function answerFilingDetails(evidence, facts) {
  const source = evidence.find((passage) => passage.claimTags?.includes('procedure-code'));
  const sourceConflicts = findFilingSourceConflicts(evidence);
  const conflictsByKey = new Map(sourceConflicts.map((conflict) => [conflict.key, conflict]));
  const householdAuthority = facts?.legalForm === 'household_business'
    && evidence.some((passage) => passage.claimTags?.includes('household-business-authority'));
  const confirmationOffice = householdAuthority
    ? 'UBND cấp xã'
    : 'cơ quan tiếp nhận có thẩm quyền sau khi xác định đúng loại giấy đăng ký';
  const sourceDate = source?.issuedDate ?? 'chưa ghi nhận';
  const effectiveDate = source?.effectiveDate ?? null;
  const effectiveDateLabel = effectiveDate ?? 'chưa ghi nhận';

  return {
    kind: 'filing_details',
    status: 'unverified',
    title: 'Hồ sơ, lệ phí và thời hạn: chưa xác minh',
    summary: 'Bộ nguồn hiện có không xác nhận các chi tiết đang áp dụng. Danh mục thủ tục được chọn chỉ nêu tên và mã thủ tục; không nêu đủ hồ sơ, lệ phí hoặc thời hạn hiện hành.',
    unresolvedDetails: filingDetails.map(({ key, label, question }) => {
      const sourceConflict = conflictsByKey.get(key);
      return {
        key,
        label,
        status: sourceConflict ? 'mâu thuẫn nguồn · chưa xác minh' : 'chưa xác minh',
        confirmationQuestion: `Hỏi ${confirmationOffice}: “${question}”`,
        ...(sourceConflict ? { sourceConflict } : {}),
      };
    }),
    ...(sourceConflicts.length ? { sourceConflicts } : {}),
    sourceNote: source
      ? `Nguồn được chọn ban hành ngày ${sourceDate}, ngày hiệu lực: ${effectiveDateLabel}. Nguồn này được rà soát ngày ${source.reviewDate}; ngày rà soát không thay thế ngày hiệu lực. Vì thiếu xác nhận hiện hành, không dùng riêng nguồn này hoặc gộp với tài liệu mâu thuẫn/chưa rõ hiệu lực để kết luận yêu cầu hiện tại.`
      : 'Không có nguồn thủ tục phù hợp trong các đoạn đã chọn. Vì vậy thành phần hồ sơ, lệ phí và thời hạn hiện hành đều chưa xác minh; không suy đoán hoặc ghép nguồn chưa rõ hiệu lực thành yêu cầu.',
    source: source ? {
      ...sourceCitation(source),
      effectiveDate: source.effectiveDate,
      status: source.effectiveDate ? 'date_recorded' : 'effective_date_unrecorded',
    } : null,
  };
}

function answerFireSafety() {
  return {
    kind: 'fire_safety',
    status: 'outside_food_safety_corpus',
    title: 'Chưa thể xác định yêu cầu PCCC từ bộ nguồn này',
    summary: 'Các đoạn đã chọn chỉ nói về an toàn thực phẩm, không đủ căn cứ để xác định quán của bạn có cần thủ tục hoặc giấy tờ phòng cháy, chữa cháy nào hay không. Công cụ không kết luận rằng quán cần “giấy phép PCCC”, và không nêu mẫu đơn, hồ sơ, lệ phí hay nghĩa vụ PCCC.',
    confirmationQuestion: 'Mở Cổng thông tin thành phố Đà Nẵng để tìm kênh liên hệ chính thức của Công an thành phố; hỏi Phòng Cảnh sát PCCC và CNCH (PC07) hoặc đề nghị chuyển câu hỏi đến đúng đầu mối. Nêu địa chỉ và mô tả mặt bằng, rồi hỏi: “Với cơ sở tại địa chỉ này, hiện có yêu cầu PCCC hoặc thủ tục nào áp dụng không? Xin cho biết căn cứ pháp lý và đường dẫn chính thức; nếu cơ quan khác phụ trách, xin hướng dẫn đầu mối.”',
    route: pcccRoute,
  };
}

function answerUnsupported() {
  return {
    kind: 'unsupported',
    status: 'outside_selected_corpus',
    title: 'Câu hỏi ngoài phạm vi nguồn đã chọn',
    summary: 'Bộ nguồn đã chọn không đủ căn cứ để trả lời câu hỏi này. Công cụ không suy đoán yêu cầu, giấy tờ, lệ phí hoặc thời hạn.',
    confirmationQuestion: 'Hãy hỏi cơ quan chính thức phụ trách lĩnh vực của câu hỏi và đề nghị họ gửi căn cứ cùng đường dẫn thủ tục đang áp dụng.',
  };
}

export function answerQuestion(input, evidence, facts) {
  const question = validateQuestion(input);
  switch (classifyQuestion(question)) {
    case 'filing_details': return answerFilingDetails(evidence, facts);
    case 'fire_safety': return answerFireSafety();
    default: return answerUnsupported();
  }
}

export function buildBoundaryChecklist(evidence, facts) {
  const byTag = new Map();
  for (const passage of evidence) {
    for (const tag of passage.claimTags ?? []) {
      if (!byTag.has(tag)) byTag.set(tag, passage);
    }
  }

  const authority = evidence.find((passage) => passage.claimTags?.includes('household-business-authority'));
  const procedure = evidence.find((passage) => passage.claimTags?.includes('procedure-code'));
  const knownHouseholdBusiness = facts?.legalForm === 'household_business';
  const unknownRegistration = facts?.legalForm === 'unknown';
  const tasks = preparationTasks.flatMap(({ tag, text }) => {
    const passage = byTag.get(tag);
    return passage ? [{ text, passageIds: [passage.id] }] : [];
  });

  const input = {
    route: authority && knownHouseholdBusiness ? {
      text: 'Nguồn địa phương nêu UBND cấp xã có thẩm quyền cấp Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm cho cơ sở có đăng ký hộ kinh doanh. Hỏi cơ quan này để xác nhận thủ tục áp dụng cho quán của bạn; nguồn không xác nhận riêng quán có phải xin giấy hay không.',
      passageIds: [authority.id],
    } : null,
    tasks,
    unresolved: [
      ...(unknownRegistration && authority ? [{
        text: 'Chưa rõ loại giấy đăng ký của quán; cần xác định giấy trước khi chọn đúng cơ quan tiếp nhận.',
        passageIds: [authority.id],
      }] : []),
      ...(procedure ? filingDetails.map(({ label }) => ({
        text: `${label} hiện hành: chưa xác minh.`,
        passageIds: [procedure.id],
      })) : []),
    ],
    nextAction: authority && procedure && knownHouseholdBusiness ? {
      text: 'Hỏi UBND cấp xã để xác nhận riêng thành phần hồ sơ, lệ phí và thời hạn đang áp dụng; đề nghị cung cấp căn cứ và đường dẫn thủ tục hiện hành.',
      passageIds: [authority.id, procedure.id],
    } : authority && procedure && unknownRegistration ? {
      text: 'Xác định đúng loại giấy đăng ký trước; sau đó hỏi cơ quan tiếp nhận tương ứng theo hướng dẫn của Đà Nẵng để xác nhận hồ sơ, lệ phí và thời hạn đang áp dụng.',
      passageIds: [authority.id, procedure.id],
    } : procedure ? {
      text: 'Hỏi cơ quan tiếp nhận có thẩm quyền cho loại giấy đăng ký của quán để xác nhận riêng thành phần hồ sơ, lệ phí và thời hạn đang áp dụng; đề nghị cung cấp căn cứ và đường dẫn thủ tục hiện hành.',
      passageIds: [procedure.id],
    } : null,
  };

  const checklist = sanitizeChecklist(input, evidence);
  return assertUsefulChecklist(checklist, { requireRoute: knownHouseholdBusiness });
}
