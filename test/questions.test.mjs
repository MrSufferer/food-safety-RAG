import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectEvidence } from '../src/evidence.mjs';
import { passages, snapshotDate } from '../src/passages.mjs';
import { answerQuestion, buildBoundaryChecklist, classifyQuestion, validateQuestion } from '../src/questions.mjs';

const householdCafe = {
  businessType: 'cafe',
  legalForm: 'household_business',
  preparation: 'food_and_drink',
  operationMode: 'prepared_at_fixed_shop',
  smallExemptionClaim: 'no',
  location: 'Da Nang',
};

const evidence = selectEvidence(householdCafe, passages);
const issue16Review = JSON.parse(await readFile(new URL('../evaluation/issue-16-scenario-review.json', import.meta.url), 'utf8'));

test('classifies current filing details in Vietnamese with or without diacritics', () => {
  assert.equal(classifyQuestion('Hồ sơ, lệ phí và thời hạn hiện nay là gì?'), 'filing_details');
  assert.equal(classifyQuestion('Ho so, le phi va thoi han hien nay la gi?'), 'filing_details');
  assert.equal(classifyQuestion('Lệ phí bao nhiêu và sau bao nhiêu ngày có kết quả?'), 'filing_details');
});

test('classifies a fire-safety permit question separately from food-safety procedure details', () => {
  assert.equal(classifyQuestion('Quán của tôi có cần giấy phép PCCC không?'), 'fire_safety');
  assert.equal(classifyQuestion('PCCC cần nộp hồ sơ nào?'), 'fire_safety');
});

test('validates optional questions without changing or accepting oversized input', () => {
  assert.equal(validateQuestion(undefined), '');
  assert.equal(validateQuestion('  '), '');
  assert.equal(validateQuestion('Hỏi thủ tục nào?'), 'Hỏi thủ tục nào?');
  assert.throws(() => validateQuestion('x'.repeat(501)), /500 ký tự/);
  assert.throws(() => validateQuestion({ text: 'PCCC' }), /dạng văn bản/);
});

test('answers current filing details as unresolved and asks the commune to confirm each detail', () => {
  const answer = answerQuestion('Hồ sơ, lệ phí và thời hạn giải quyết hiện hành là gì?', evidence, householdCafe);

  assert.equal(answer.kind, 'filing_details');
  assert.equal(answer.status, 'unverified');
  assert.equal(answer.unresolvedDetails.length, 3);
  assert.ok(answer.unresolvedDetails.every((detail) => detail.status === 'chưa xác minh'));
  assert.match(answer.unresolvedDetails[0].confirmationQuestion, /UBND cấp xã/);
  assert.match(answer.unresolvedDetails[1].confirmationQuestion, /lệ phí/i);
  assert.match(answer.unresolvedDetails[2].confirmationQuestion, /thời hạn/i);
  assert.equal(answer.source.id, 'dn-procedure-1-013855-h17');
  assert.equal(answer.source.effectiveDate, null);
  assert.equal(answer.source.reviewDate, snapshotDate);
  assert.match(answer.sourceNote, /ngày hiệu lực: chưa ghi nhận/);
  assert.match(answer.sourceNote, /hoặc gộp với tài liệu mâu thuẫn/);
});

test('surfaces conflicting source assertions without choosing or combining a current fee', () => {
  const fixture = issue16Review.conflictDetectionFixture;
  const procedure = evidence.find((passage) => passage.claimTags?.includes('procedure-code'));
  assert.equal(fixture.modelIdentity, 'local:question-boundary-v1');
  assert.equal(fixture.snapshotDate, snapshotDate);
  assert.ok(fixture.syntheticPassages.every(({ reviewDate }) => reviewDate === fixture.snapshotDate));
  const answer = answerQuestion(
    fixture.input.question,
    [procedure, ...fixture.syntheticPassages],
    fixture.input.facts,
  );

  assert.equal(answer.status, fixture.expectedOutput.status);
  assert.equal(answer.sourceConflicts.length, 1);
  assert.equal(answer.sourceConflicts[0].key, fixture.expectedOutput.sourceConflict.key);
  assert.equal(answer.sourceConflicts[0].status, fixture.expectedOutput.sourceConflict.status);
  assert.equal(answer.sourceConflicts[0].assertions.length, fixture.expectedOutput.sourceConflict.assertionCount);
  assert.match(answer.sourceConflicts[0].summary, /thông tin khác nhau/);
  assert.ok(answer.sourceConflicts[0].assertions.some(({ value }) => value === 'SYNTHETIC FIXTURE VALUE A'));
  assert.ok(answer.sourceConflicts[0].assertions.some(({ value }) => value === 'SYNTHETIC FIXTURE VALUE B'));
  assert.deepEqual(
    Object.fromEntries(answer.unresolvedDetails.map(({ key, status }) => [key, status])),
    fixture.expectedOutput.unresolvedDetailStatuses,
  );
});

test('answers fire-safety questions with the corpus boundary and an official confirmation route', () => {
  const answer = answerQuestion('Quán cà phê của tôi có cần giấy phép phòng cháy chữa cháy không?', evidence);

  assert.equal(answer.kind, 'fire_safety');
  assert.equal(answer.status, 'outside_food_safety_corpus');
  assert.match(answer.summary, /không đủ căn cứ/);
  assert.match(answer.summary, /không kết luận/);
  assert.match(answer.confirmationQuestion, /thủ tục nào áp dụng/);
  assert.match(answer.route.label, /Cổng thông tin thành phố Đà Nẵng/);
  assert.match(answer.route.source.label, /Phòng Cảnh sát PCCC/);
  assert.equal(answer.route.url, 'https://danang.gov.vn/');
  assert.equal(answer.route.source.reviewDate, snapshotDate);
  assert.match(answer.route.source.note, /không xác nhận/);
});

test('keeps supported food-preparation tasks cited beside each claim in boundary answers', () => {
  const checklist = buildBoundaryChecklist(evidence, householdCafe);

  assert.equal(checklist.tasks.length, 3);
  assert.ok(checklist.tasks.every((task) => task.citations.length === 1));
  assert.ok(checklist.tasks.some((task) => task.passageIds.includes('vn-law-55-2010-article-29-separate-utensils')));
  assert.ok(checklist.tasks.every((task) => task.citations[0].url.startsWith('https://')));
  assert.equal(checklist.route.passageIds[0], 'dn-faq-24680-household-certificate-authority');
  assert.equal(checklist.unresolved.length, 3);
  assert.ok(checklist.unresolved.every((claim) => claim.text.includes('chưa xác minh')));
});

test('does not guess the filing office when the registration type is unknown', () => {
  const facts = { ...householdCafe, legalForm: 'unknown' };
  const selected = selectEvidence(facts, passages);
  const answer = answerQuestion('Hồ sơ, lệ phí và thời hạn hiện hành là gì?', selected, facts);
  const checklist = buildBoundaryChecklist(selected, facts);

  assert.ok(answer.unresolvedDetails.every((detail) => !detail.confirmationQuestion.includes('UBND cấp xã')));
  assert.equal(checklist.route, null);
  assert.match(checklist.unresolved[0].text, /loại giấy đăng ký/);
  assert.match(checklist.nextAction.text, /Xác định đúng loại giấy đăng ký/);
  assert.ok(checklist.tasks.length > 0);
});
