import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

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
    assert.match(body.checklist.unresolved.map((claim) => claim.text).join(' '), /giấy đăng ký/);
    assert.ok(body.checklist.unresolved.some((claim) => claim.passageIds.includes('dn-faq-24680-household-certificate-authority')));
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

test('withholds a claim if its generated citation is topically unrelated to the claim', async () => {
  const invalidOutput = validOutput();
  invalidOutput.route.passageIds = ['vn-law-55-2010-article-29-safe-utensils'];
  await withServer({
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => fakeProviderResponse(invalidOutput),
  }, async (origin) => {
    const response = await fetch(`${origin}/api/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: householdCafe, reviewed: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error, /thiếu căn cứ/);
    assert.equal(body.checklist, undefined);
    assert.ok(body.evidence.length > 0);
  });
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

test('serves the one-command demo page', async () => {
  await withServer({ env: {} }, async (origin) => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /Hỏi từng bước/);
    assert.match(html, /Bạn nghĩ quán có thể được miễn/);
  });
});
