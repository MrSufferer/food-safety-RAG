import { snapshotDate } from './passages.mjs';

const businessTypes = new Set(['cafe', 'takeaway', 'both']);
const legalForms = new Set(['household_business', 'enterprise', 'cooperative', 'unknown']);
const preparations = new Set(['food_and_drink', 'drinks_only']);
const operationModes = new Set(['prepared_at_fixed_shop', 'packaged_only', 'street_food', 'mixed_or_unknown']);
const exemptionClaims = new Set(['yes', 'no', 'unsure']);

export function validateFacts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Nhập thông tin quán theo các bước trước khi tiếp tục.');
  }

  const facts = {
    businessType: String(input.businessType ?? ''),
    legalForm: String(input.legalForm ?? ''),
    preparation: String(input.preparation ?? ''),
    operationMode: String(input.operationMode ?? ''),
    smallExemptionClaim: String(input.smallExemptionClaim ?? ''),
    location: String(input.location ?? ''),
  };

  if (!businessTypes.has(facts.businessType)) {
    throw new TypeError('Chọn quán cà phê, quán takeaway hoặc cả hai.');
  }
  if (!legalForms.has(facts.legalForm)) {
    throw new TypeError('Chọn đúng loại giấy đăng ký hoặc chọn chưa rõ.');
  }
  if (!preparations.has(facts.preparation)) {
    throw new TypeError('Chọn cách quán chuẩn bị đồ ăn, thức uống.');
  }
  if (!operationModes.has(facts.operationMode)) {
    throw new TypeError('Mô tả cách quán bán hoặc chuẩn bị thực phẩm.');
  }
  if (!exemptionClaims.has(facts.smallExemptionClaim)) {
    throw new TypeError('Cho biết bạn có nghĩ quán được miễn giấy chứng nhận hay chưa.');
  }
  if (facts.location !== 'Da Nang') {
    throw new TypeError('Bản thử này chỉ dùng cho quán ở Đà Nẵng.');
  }

  return Object.freeze(facts);
}

export function selectEvidence(facts, corpus) {
  const validFacts = validateFacts(facts);
  const operation = validFacts.preparation;
  const selected = corpus.filter((passage) => {
    const matchesBusiness = passage.operationTags.includes(validFacts.businessType)
      || (validFacts.businessType === 'both' && (passage.operationTags.includes('cafe') || passage.operationTags.includes('takeaway')));
    if (!matchesBusiness) return false;
    if (!passage.operationTags.includes(operation) && !passage.operationTags.includes('food-and-drink')) return false;
    if (passage.id === 'dn-faq-24680-household-certificate-authority' && !['household_business', 'unknown'].includes(validFacts.legalForm)) return false;
    if (passage.id === 'vn-law-55-2010-article-29-separate-utensils' && operation !== 'food_and_drink') return false;
    return true;
  });

  return selected.slice(0, 6).map((passage) => ({ ...passage, snapshotDate }));
}

export function isSupportedScenario(facts) {
  return ['household_business', 'unknown'].includes(validateFacts(facts).legalForm);
}
