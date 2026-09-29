import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

const householdCafe = {
  businessType: 'cafe',
  legalForm: 'household_business',
  preparation: 'food_and_drink',
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
  });
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
    assert.match(await response.text(), /Hỏi từng bước/);
  });
});
