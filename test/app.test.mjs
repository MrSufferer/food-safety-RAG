import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { passages } from '../src/passages.mjs';
import { renderEvidence, renderEvidenceGaps, renderGenerationNotice, renderProviderFailure } from '../public/evidence-view.js';

const issue16Review = JSON.parse(await readFile(new URL('../evaluation/issue-16-scenario-review.json', import.meta.url), 'utf8'));

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

function testDocument() {
  return { createElement: (tagName) => new TestElement(tagName) };
}

const householdCafe = {
  businessType: 'cafe',
  legalForm: 'household_business',
  preparation: 'food_and_drink',
  operationMode: 'prepared_at_fixed_shop',
  smallExemptionClaim: 'no',
  location: 'Da Nang',
};

function fakeProviderResponse(output, { model = 'test-model' } = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { model, choices: [{ message: { content: JSON.stringify(output) } }] };
    },
  };
}

function fakeGeminiResponse(output, { modelVersion = 'gemini-test' } = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        modelVersion,
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      };
    },
  };
}

function validOutput() {
  return {
    route: {
      text: 'Với giấy đăng ký hộ kinh doanh, hỏi UBND cấp xã nơi quán hoạt động để xác nhận thủ tục áp dụng.',
      passageIds: ['dn-faq-24680-household-certificate-authority'],
    },
    tasks: [{
      text: 'Rà soát cách quán tách riêng dụng cụ và đồ chứa đựng cho thực phẩm sống, chín.',
      passageIds: ['vn-law-55-2010-article-29-separate-utensils'],
    }],
    unresolved: [{
      text: 'Chưa xác minh thành phần hồ sơ, lệ phí và thời hạn hiện hành; danh mục năm 2025 chỉ giúp nhận diện mã thủ tục.',
      passageIds: ['dn-procedure-1-013855-h17'],
    }],
    nextAction: {
      text: 'Liên hệ UBND cấp xã để hỏi thủ tục 1.013855.H17 còn áp dụng không, cơ sở có thuộc diện cấp giấy không, và xin danh sách hồ sơ, lệ phí, thời hạn đang dùng.',
      passageIds: ['dn-faq-24680-household-certificate-authority', 'dn-procedure-1-013855-h17'],
    },
  };
}

test('reports Gemini-only configuration as a ready provider', async () => {
  await withServer({ env: { GEMINI_API_KEY: 'gemini-test-key' } }, async (origin) => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, providerConfigured: true });
  });
});

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('user facts pass through review, evidence selection, model generation, and cited checklist output', async () => {
  let requestBody;
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    requestBody = JSON.parse(options.body);
    return fakeProviderResponse(validOutput());
  };

  await withServer({ env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'test-model' }, fetchImpl }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.facts, householdCafe);
    assert.equal(body.model, 'test-model');
    assert.equal(body.snapshotDate, '2026-09-29');
    assert.equal(body.checklist.tasks.length, 1);
    assert.ok(body.checklist.route.citations[0].url.startsWith('https://'));
    assert.equal(body.checklist.unresolved[0].citations[0].snapshotDate, body.snapshotDate);
    assert.equal(requestBody.model, 'test-model');
    assert.deepEqual(requestBody.messages[1].content && JSON.parse(requestBody.messages[1].content).facts, householdCafe);
    assert.equal(requestBody.response_format.type, 'json_object');
    assert.ok(JSON.parse(requestBody.messages[1].content).passages.length <= 6);
    assert.match(requestBody.messages[0].content, /unresolved về hồ sơ, lệ phí và thời hạn dùng dn-procedure-1-013855-h17/);
  });
});

test('uses Gemini Flash-Lite with structured Vietnamese checklist output when configured', async () => {
  let requestBody;
  await withServer({
    env: { GEMINI_API_KEY: 'gemini-test-key' },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
      assert.equal(options.headers['x-goog-api-key'], 'gemini-test-key');
      requestBody = JSON.parse(options.body);
      return fakeGeminiResponse(validOutput());
    },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.model, 'gemini-test');
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
    assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(Object.hasOwn(requestBody.generationConfig, 'responseFormat'), false);
    assert.match(requestBody.systemInstruction.parts[0].text, /người lần đầu mở quán/i);
    assert.match(requestBody.systemInstruction.parts[0].text, /không viết nhận xét.*nguyên mẫu/i);
    const input = JSON.parse(requestBody.contents[0].parts[0].text);
    assert.deepEqual(input.facts, householdCafe);
    assert.ok(input.passages.length > 0);
  });
});

test('tries the free Gemini model and then OpenRouter when the preferred Gemini model fails', async () => {
  const requested = [];
  await withServer({
    env: {
      GEMINI_API_KEY: 'gemini-test-key',
      GEMINI_MODEL: 'gemini-paid-test',
      GEMINI_FREE_MODEL: 'gemini-free-test',
      OPENROUTER_API_KEY: 'openrouter-test-key',
      OPENROUTER_MODEL: 'openrouter-test-model',
    },
    fetchImpl: async (url, options) => {
      requested.push(url);
      if (url.includes('/models/gemini-paid-test:')) return { ok: false, status: 429 };
      if (url.includes('/models/gemini-free-test:')) return { ok: false, status: 503 };
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer openrouter-test-key');
      return fakeProviderResponse(validOutput(), { model: 'openrouter-test-model' });
    },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.model, 'openrouter-test-model');
    assert.match(body.generationNotice, /Gemini.*OpenRouter/i);
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
  });
  assert.equal(requested.length, 3);
  assert.match(requested[0], /gemini-paid-test/);
  assert.match(requested[1], /gemini-free-test/);
  assert.equal(requested[2], 'https://openrouter.ai/api/v1/chat/completions');
});

test('drops Gemini prototype meta-commentary while retaining independently supported RAG claims', async () => {
  const output = validOutput();
  output.route.text = 'The checklist was created by this protype. Với giấy đăng ký hộ kinh doanh, UBND cấp xã là nơi hỏi về thủ tục cấp Giấy chứng nhận.';
  output.tasks[0].text = 'This is not suitable for your case. Rà soát cách quán tách riêng dụng cụ và đồ chứa đựng cho thực phẩm sống, chín.';
  await withServer({
    env: { GEMINI_API_KEY: 'gemini-test-key' },
    fetchImpl: async () => fakeGeminiResponse(output),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    const visible = JSON.stringify(body.checklist);

    assert.equal(response.status, 200);
    assert.doesNotMatch(visible, /protype|not suitable for your case/i);
    assert.ok(body.checklist.tasks.length > 0);
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
  });
});

test('unknown registration withholds the office and keeps cited preparation tasks available', async () => {
  let requestFacts;
  const fetchImpl = async (_url, options) => {
    requestFacts = JSON.parse(options.body).messages[1].content;
    return fakeProviderResponse(validOutput());
  };
  const facts = { ...householdCafe, legalForm: 'unknown', smallExemptionClaim: 'yes' };

  await withServer({ env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.checklist.route, null);
    assert.ok(body.checklist.exceptionAssessment);
    assert.ok(body.checklist.tasks.length > 0);
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
    const registrationGuidance = body.checklist.unresolved.find((claim) => /chưa thể nêu cơ quan tiếp nhận/i.test(claim.text));
    assert.ok(registrationGuidance, 'missing registration guidance');
    assert.match(registrationGuidance.text, /Giấy chứng nhận đầu tư/);
    assert.match(registrationGuidance.text, /liên hợp tác xã/);
    assert.ok(registrationGuidance.citations.some((citation) => citation.id === 'dn-faq-24680-household-certificate-authority'));
    assert.ok(body.checklist.nextAction.passageIds.includes('dn-faq-24680-household-certificate-authority'));
    assert.deepEqual(JSON.parse(requestFacts).facts, facts);
    assert.ok(body.evidence.some((passage) => passage.id === 'vn-law-55-2010-article-29-separate-utensils'));
  });
});

test('small takeaway exemption claim is checked against registration and operation facts while food-safety tasks remain', async () => {
  const facts = { ...householdCafe, businessType: 'takeaway', smallExemptionClaim: 'yes' };
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => fakeProviderResponse(validOutput()),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true }),
    });
    const body = await response.json();
    const assessment = body.checklist.exceptionAssessment;

    assert.equal(response.status, 200);
    assert.match(assessment.text, /quy mô.*không/i);
    assert.match(assessment.text, /hộ kinh doanh/);
    assert.match(assessment.text, /chuẩn bị đồ ăn và thức uống/);
    assert.match(assessment.text, /khoản 10 Điều 3/);
    assert.match(assessment.text, /Điều 12/);
    assert.match(assessment.text, /Điều 29 Luật An toàn thực phẩm/);
    assert.match(assessment.text, /xác nhận/);
    assert.ok(assessment.passageIds.includes('vn-decree-15-2018-articles-11-12'));
    assert.ok(body.checklist.tasks.some((task) => task.passageIds.includes('vn-law-55-2010-article-29-separate-utensils')));
    assert.ok(body.checklist.tasks.some((task) => task.text.includes('khoản 2 Điều 12')));
    assert.ok(body.checklist.nextAction.text.includes('UBND cấp xã'));
  });
});

test('sends an ASCII provider title header accepted by Fetch', async () => {
  let title;
  const fetchImpl = async (_url, options) => {
    title = new Headers(options.headers).get('x-title');
    return fakeProviderResponse(validOutput());
  };

  await withServer({ env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(title, 'Da Nang Cafe Food Safety Checklist');
});

test('uses the documented free model when no model is configured', async () => {
  let requestedModel;
  const fetchImpl = async (_url, options) => {
    requestedModel = JSON.parse(options.body).model;
    return fakeProviderResponse(validOutput());
  };

  await withServer({ env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(requestedModel, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('configures a free OpenRouter model as fallback and identifies it when used', async () => {
  let requestBody;
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'primary-model' },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return fakeProviderResponse(validOutput(), { model: 'google/gemma-4-31b-it:free' });
    },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(requestBody.model, 'primary-model');
    assert.deepEqual(requestBody.models, ['google/gemma-4-31b-it:free']);
    assert.equal(body.model, 'google/gemma-4-31b-it:free');
    assert.match(body.generationNotice, /mô hình dự phòng miễn phí/i);
  });
});

test('does not configure or announce a fallback when the free model is primary', async () => {
  let requestBody;
  const freeModel = 'google/gemma-4-31b-it:free';
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: freeModel },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return fakeProviderResponse(validOutput(), { model: freeModel });
    },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(requestBody.model, freeModel);
    assert.equal(requestBody.models, undefined);
    assert.equal(body.model, freeModel);
    assert.equal(body.generationNotice, undefined);
  });
});

test('returns a cited local checklist when the primary and free fallback are rate-limited', async () => {
  let requestBody;
  let providerRequests = 0;
  const facts = { ...householdCafe, smallExemptionClaim: 'yes' };
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async (_url, options) => {
      providerRequests += 1;
      requestBody = JSON.parse(options.body);
      return { ok: false, status: 429 };
    },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.facts, facts);
    assert.equal(body.model, 'local:rate-limit-fallback-v1');
    assert.match(body.generationNotice, /giới hạn|quá tải/i);
    assert.equal(body.checklist.tasks.length, 4);
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
    assert.ok(body.checklist.route.citations.some((citation) => citation.id === 'dn-faq-24680-household-certificate-authority'));
    assert.ok(body.checklist.unresolved.some((claim) => /chưa xác minh/i.test(claim.text)));
    assert.ok(body.checklist.exceptionAssessment.citations.some((citation) => citation.id === 'vn-decree-15-2018-articles-11-12'));
    assert.equal(body.error, undefined);
  });
  assert.deepEqual(requestBody.models, ['google/gemma-4-31b-it:free']);
  assert.equal(providerRequests, 1);
});

test('does not call the provider before facts have been reviewed', async () => {
  let providerCalled = false;
  await withServer({ env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl: async () => { providerCalled = true; } }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: false }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /rà soát/);
  });
  assert.equal(providerCalled, false);
});

test('provider failure displays selected source passages and no generated checklist', async () => {
  await withServer({ env: {}, fetchImpl: async () => { throw new Error('must not call'); } }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error, /OPENROUTER_API_KEY/);
    assert.equal(body.checklist, undefined);
    assert.ok(body.evidence.some((passage) => passage.id === 'vn-law-55-2010-article-29-separate-utensils'));
  });
});

test('provider failure expands selected evidence while ordinary evidence stays collapsed', () => {
  const parent = new TestElement('main');
  const evidence = [{
    document: 'Luật An toàn thực phẩm',
    section: 'Điều 29',
    excerpt: 'Dụng cụ riêng cho thực phẩm sống và chín.',
    id: 'vn-law-55-2010-article-29-separate-utensils',
    claimTags: ['separate-raw-cooked-utensils'],
    version: '55/2010/QH12',
    issuedDate: '2010-06-17',
    effectiveDate: '2011-07-01',
    reviewDate: '2026-09-29',
    useLimits: 'Không xác nhận hồ sơ hiện hành.',
    url: 'https://example.gov.vn/law',
  }];

  renderProviderFailure({ error: 'Dịch vụ tạo câu trả lời đang lỗi.', evidence }, {
    document: testDocument(),
    parent,
  });

  const [error, evidenceDisclosure] = parent.children;
  assert.equal(error.className, 'error-box');
  assert.equal(error.attributes.role, 'alert');
  assert.equal(error.children[1].textContent, 'Dịch vụ tạo câu trả lời đang lỗi.');
  assert.equal(evidenceDisclosure.open, true);
  const [passage] = evidenceDisclosure.children.slice(1);
  assert.equal(passage.open, true);
  assert.equal(passage.children[1].children[0].textContent, evidence[0].excerpt);

  const ordinaryParent = new TestElement('main');
  renderEvidence(evidence, { document: testDocument(), parent: ordinaryParent });
  assert.equal(ordinaryParent.children[0].open, false);
  assert.equal(ordinaryParent.children[0].children[1].open, false);
});

test('keeps supported checklist items and explains sections omitted for weak evidence', async () => {
  const partialOutput = validOutput();
  partialOutput.route.passageIds = ['vn-law-55-2010-article-29-safe-utensils'];
  partialOutput.tasks.push({
    text: 'Nộp ngay mẫu đơn hiện hành.',
    passageIds: ['missing-or-unrelated-source'],
  });
  partialOutput.unresolved = [];
  partialOutput.nextAction = null;
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => fakeProviderResponse(partialOutput),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checklist.route, null);
    assert.equal(body.checklist.tasks.length, 1);
    assert.equal(body.checklist.tasks[0].text, validOutput().tasks[0].text);
    assert.ok(body.checklist.tasks[0].citations.length > 0);
    assert.deepEqual(body.evidenceGaps.map(({ section }) => section), ['route', 'tasks', 'unresolved', 'nextAction']);
    assert.match(body.evidenceGaps.find(({ section }) => section === 'unresolved').message, /hồ sơ, lệ phí hoặc thời hạn/);
  });
});

test('uses cited preparation tasks when every model task is unsupported', async () => {
  const output = validOutput();
  output.tasks = [{
    text: 'Quán nhỏ chắc chắn được miễn giấy chứng nhận.',
    passageIds: ['vn-law-55-2010-article-29-safe-utensils'],
  }];
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => fakeProviderResponse(output),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.evidenceGaps.some((gap) => gap.section === 'tasks'));
    assert.ok(body.checklist.tasks.length > 0);
    assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
    assert.ok(body.checklist.tasks.every((task) => !/miễn giấy chứng nhận/.test(task.text)));
  });
});

test('shows sources instead of a checklist when no preparation passage supports a task', async () => {
  const preparationTags = new Set([
    'separate-raw-cooked-utensils', 'safe-cooking-utensils', 'clean-dry-serving-utensils',
  ]);
  const corpus = passages.filter((passage) => !passage.claimTags?.some((tag) => preparationTags.has(tag)));
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    corpus,
    fetchImpl: async () => fakeProviderResponse(validOutput()),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.checklist, undefined);
    assert.ok(body.evidence.length > 0);
    assert.match(body.error, /không có việc chuẩn bị nào được hỗ trợ/);
  });
});

test('renders evidence gaps with section labels and plain-language explanations', () => {
  const parent = new TestElement('main');
  renderEvidenceGaps([{
    section: 'route',
    label: 'Hướng cơ quan',
    issue: 'unsupported',
    message: 'Đoạn nguồn được chọn không xác nhận cơ quan nêu trong nhận định.',
  }], { document: testDocument(), parent });

  const [section] = parent.children;
  assert.equal(section.className, 'result-section evidence-gaps');
  assert.equal(section.attributes.role, 'status');
  assert.equal(section.children[0].textContent, 'Một số phần chưa đủ căn cứ');
  const [item] = section.children[1].children;
  assert.equal(item.children[0].textContent, 'Hướng cơ quan: ');
  assert.match(item.children[1].textContent, /không xác nhận cơ quan/);
});

test('renders a status notice when the local checklist handles a provider rate limit', () => {
  const parent = new TestElement('main');
  renderGenerationNotice('Checklist được tạo từ các nguồn đã chọn.', { document: testDocument(), parent });

  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].className, 'help-text generation-notice');
  assert.equal(parent.children[0].attributes.role, 'status');
  assert.equal(parent.children[0].textContent, 'Checklist được tạo từ các nguồn đã chọn.');
});

test('keeps unsupported registration routes out of the model request', async () => {
  let providerCalled = false;
  await withServer({ env: { OPENROUTER_API_KEY: 'test-key' }, fetchImpl: async () => { providerCalled = true; } }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: { ...householdCafe, legalForm: 'enterprise' }, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 422);
    assert.equal(body.code, 'scenario_out_of_scope');
    assert.match(body.error, /hộ kinh doanh/);
  });
  assert.equal(providerCalled, false);
});

test('saves and returns reviewed filing and PCCC boundary scenarios without calling the provider', async () => {
  let providerCalled = false;
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => { providerCalled = true; throw new Error('boundary questions must not call the provider'); },
  }, async (origin) => {
    for (const scenario of issue16Review.scenarios) {
      const response = await fetch(`${origin}/api/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario.input),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body.facts, scenario.input.facts);
      assert.equal(body.question, scenario.input.question);
      assert.equal(body.model, scenario.modelIdentity);
      assert.equal(body.modelIdentity, scenario.modelIdentity);
      assert.equal(body.snapshotDate, scenario.snapshotDate);
      assert.deepEqual(body.questionAnswer, scenario.output.questionAnswer);
      assert.deepEqual(body.checklist, scenario.output.checklist);
      assert.deepEqual(body.evidenceGaps, []);
      assert.deepEqual(body.evidence.map(({ id, issuedDate, effectiveDate, reviewDate }) => ({ id, issuedDate, effectiveDate, reviewDate })), scenario.selectedPassages);
      assert.ok(body.checklist.tasks.length > 0);
      assert.ok(body.checklist.tasks.every((task) => task.citations.length > 0));
    }
  });
  assert.equal(providerCalled, false);
});

test('surfaces conflicting claims carried through selected evidence to the question API', async () => {
  const fixture = issue16Review.conflictDetectionFixture;
  const procedureIndex = passages.findIndex((passage) => passage.id === 'dn-procedure-1-013855-h17');
  const syntheticPassages = fixture.syntheticPassages.map((passage) => ({
    ...passage,
    claimTags: [],
    operationTags: ['cafe', 'food_and_drink'],
  }));
  const corpus = [
    ...passages.slice(0, procedureIndex + 1),
    ...syntheticPassages,
    ...passages.slice(procedureIndex + 1),
  ];

  await withServer({
    env: {},
    corpus,
    fetchImpl: async () => { throw new Error('filing questions must not call the provider'); },
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fixture.input, reviewed: true }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.modelIdentity, fixture.modelIdentity);
    assert.equal(body.snapshotDate, fixture.snapshotDate);
    assert.deepEqual(
      body.evidence.filter(({ id }) => id.startsWith('fixture-fee-source-')).map(({ id }) => id),
      fixture.syntheticPassages.map(({ id }) => id),
    );
    assert.deepEqual(body.questionAnswer.sourceConflicts.map(({ key, status, assertions }) => ({
      key,
      status,
      assertionCount: assertions.length,
    })), [fixture.expectedOutput.sourceConflict]);
    assert.ok(body.questionAnswer.sourceConflicts[0].assertions.every(({ source }) => source.reviewDate === fixture.snapshotDate));
    assert.equal(body.questionAnswer.unresolvedDetails.find(({ key }) => key === 'fee').status, 'mâu thuẫn nguồn · chưa xác minh');
    assert.ok(body.checklist.tasks.length > 0);
  });
});

test('keeps filing answers for an unknown registration type from guessing the receiving office', async () => {
  const facts = { ...householdCafe, legalForm: 'unknown' };
  await withServer({ env: {}, fetchImpl: async () => { throw new Error('must not call'); } }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true, question: 'Hồ sơ, lệ phí và thời hạn hiện hành là gì?' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.questionAnswer.kind, 'filing_details');
    assert.ok(body.questionAnswer.unresolvedDetails.every((detail) => detail.status === 'chưa xác minh'));
    assert.ok(body.questionAnswer.unresolvedDetails.every((detail) => !detail.confirmationQuestion.includes('UBND cấp xã')));
    assert.equal(body.checklist.route, null);
    assert.ok(body.checklist.tasks.length > 0);
    assert.equal(body.checklist.tasks[0].citations[0].snapshotDate, body.snapshotDate);
  });
});

test('rejects a question longer than the supported input limit', async () => {
  await withServer({ env: {}, fetchImpl: async () => { throw new Error('must not call'); } }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true, question: 'x'.repeat(501) }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /500 ký tự/);
  });
});

test('serves the one-command demo page', async () => {
  await withServer({ env: {} }, async (origin) => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /Hỏi từng bước/);
    assert.match(html, /Bạn nghĩ quán có thể được miễn/);
    assert.match(html, /id="question"/);
  });
});
