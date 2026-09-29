import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEvidence, validateFacts } from '../src/evidence.mjs';
import { sanitizeChecklist } from '../src/checklist.mjs';
import { passages } from '../src/passages.mjs';

const householdCafe = {
  businessType: 'cafe',
  legalForm: 'household_business',
  preparation: 'food_and_drink',
  location: 'Da Nang',
};

test('validates the registered household cafe scenario', () => {
  assert.deepEqual(validateFacts(householdCafe), householdCafe);
});

test('retrieves only the compact passage set relevant to a household cafe', () => {
  const evidence = selectEvidence(householdCafe, passages);
  const ids = evidence.map((passage) => passage.id);

  assert.ok(ids.includes('dn-faq-24680-household-certificate-authority'));
  assert.ok(ids.includes('dn-procedure-1-013855-h17'));
  assert.ok(ids.includes('vn-decree-15-2018-articles-11-12'));
  assert.ok(ids.includes('vn-law-55-2010-article-29-separate-utensils'));
  assert.ok(ids.length <= 6);
  assert.ok(evidence.every((passage) => passage.url.startsWith('https://')));
});

test('validates another registration type but does not treat it as the supported household scenario', async () => {
  const { isSupportedScenario } = await import('../src/evidence.mjs');
  const enterprise = { ...householdCafe, legalForm: 'enterprise' };
  assert.deepEqual(validateFacts(enterprise), enterprise);
  assert.equal(isSupportedScenario(enterprise), false);
});

test('withholds claims that have missing, invalid, or topically unrelated passage references', () => {
  const evidence = selectEvidence(householdCafe, passages);
  const safe = sanitizeChecklist({
    route: {
      text: 'Hộ kinh doanh có thể hỏi UBND cấp xã về thủ tục phù hợp.',
      passageIds: ['dn-faq-24680-household-certificate-authority'],
    },
    tasks: [
      {
        text: 'Tách riêng dụng cụ cho thực phẩm sống và thực phẩm chín.',
        passageIds: ['vn-law-55-2010-article-29-separate-utensils'],
      },
      { text: 'Quán nhỏ được miễn giấy chứng nhận.', passageIds: [] },
      { text: 'Nộp mẫu A trong 5 ngày.', passageIds: ['made-up-id'] },
      { text: 'UBND cấp xã là đầu mối cho hộ kinh doanh.', passageIds: ['dn-faq-24680-household-certificate-authority'] },
    ],
    unresolved: [{
      text: 'Chưa xác minh bộ hồ sơ, lệ phí và thời hạn hiện hành.',
      passageIds: ['dn-procedure-1-013855-h17'],
    }],
    nextAction: {
      text: 'Hỏi UBND cấp xã về thủ tục đang áp dụng trước khi nộp.',
      passageIds: ['dn-procedure-1-013855-h17'],
    },
  }, evidence);

  assert.equal(safe.tasks.length, 1);
  assert.equal(safe.tasks[0].text, 'Tách riêng dụng cụ cho thực phẩm sống và thực phẩm chín.');
  assert.equal(safe.route.passageIds[0], 'dn-faq-24680-household-certificate-authority');
  assert.equal(safe.unresolved.length, 1);
  assert.equal(safe.nextAction.passageIds[0], 'dn-procedure-1-013855-h17');
});

test('citations resolve only against selected, dated official passages', () => {
  const evidence = selectEvidence(householdCafe, passages);
  const safe = sanitizeChecklist({
    route: { text: 'Hướng liên hệ cần xác nhận.', passageIds: ['dn-faq-24680-household-certificate-authority'] },
    tasks: [], unresolved: [], nextAction: null,
  }, evidence);
  const [citation] = safe.route.citations;
  assert.equal(citation.snapshotDate, '2026-09-29');
  assert.ok(citation.url.startsWith('https://'));
  assert.equal(citation.publishedDate, '2026-06-23');
});

test('removes route and next-action claims when citations are invalid', () => {
  const evidence = selectEvidence(householdCafe, passages);
  const safe = sanitizeChecklist({
    route: { text: 'Go to the district office.', passageIds: ['missing'] },
    tasks: [],
    unresolved: [],
    nextAction: { text: 'Submit tomorrow.', passageIds: [] },
  }, evidence);

  assert.equal(safe.route, null);
  assert.equal(safe.nextAction, null);
});
