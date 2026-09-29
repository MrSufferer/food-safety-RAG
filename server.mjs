import { createServer as createHttpServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectEvidence, validateFacts, isSupportedScenario } from './src/evidence.mjs';
import { passages, snapshotDate } from './src/passages.mjs';
import { generateChecklist, ProviderError } from './src/model.mjs';
import { answerQuestion, boundaryResolverId, buildBoundaryChecklist, validateQuestion } from './src/questions.mjs';

const publicDirectory = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request, limit = 16 * 1024) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new RangeError('Yêu cầu dài hơn giới hạn cho phép.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new SyntaxError('Dữ liệu gửi lên không phải JSON hợp lệ.');
  }
}

async function serveStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const safePath = pathname === '/' ? '/index.html' : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(safePath);
  } catch {
    sendJson(response, 400, { error: 'Đường dẫn không hợp lệ.' });
    return true;
  }

  const filePath = resolve(publicDirectory, `.${decoded}`);
  if (!filePath.startsWith(`${publicDirectory}${sep}`)) {
    sendJson(response, 404, { error: 'Không tìm thấy trang.' });
    return true;
  }
  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch {
    sendJson(response, 404, { error: 'Không tìm thấy trang.' });
    return true;
  }
  if (!fileInfo.isFile()) {
    sendJson(response, 404, { error: 'Không tìm thấy trang.' });
    return true;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Content-Length': fileInfo.size,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
  return true;
}

export function createServer({ env = process.env, fetchImpl = fetch, corpus = passages } = {}) {
  return createHttpServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
      return sendJson(response, 200, { ok: true, providerConfigured: Boolean(env.OPENROUTER_API_KEY?.trim()) });
    }

    if (requestUrl.pathname === '/api/checklist' && request.method === 'POST') {
      try {
        const body = await readJson(request);
        if (body?.reviewed !== true) {
          return sendJson(response, 400, { error: 'Hãy rà soát thông tin quán trước khi tạo checklist.' });
        }
        const facts = validateFacts(body.facts);
        const question = validateQuestion(body.question);
        const evidence = selectEvidence(facts, corpus);
        if (question) {
          const supported = isSupportedScenario(facts);
          const boundary = supported
            ? buildBoundaryChecklist(evidence, facts)
            : { checklist: null, evidenceGaps: [] };
          return sendJson(response, 200, {
            question,
            questionAnswer: answerQuestion(question, evidence, facts),
            ...boundary,
            model: boundaryResolverId,
            modelIdentity: boundaryResolverId,
            facts,
            evidence,
            snapshotDate,
          });
        }
        if (!isSupportedScenario(facts)) {
          return sendJson(response, 422, {
            code: 'scenario_out_of_scope',
            error: 'Bản thử này chỉ hướng dẫn tình huống có giấy đăng ký hộ kinh doanh. Chưa thể chọn đầu mối cho loại đăng ký bạn đã chọn.',
            facts,
            evidence,
            snapshotDate,
          });
        }
        const generated = await generateChecklist({ facts, evidence, env, fetchImpl });
        return sendJson(response, 200, { ...generated, facts, evidence });
      } catch (error) {
        if (error instanceof ProviderError) {
          return sendJson(response, 502, {
            error: error.message,
            evidence: error.evidence,
            evidenceGaps: error.evidenceGaps,
            snapshotDate,
          });
        }
        if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) {
          return sendJson(response, error instanceof RangeError ? 413 : 400, { error: error.message });
        }
        return sendJson(response, 500, { error: 'Không thể xử lý yêu cầu này.' });
      }
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      return sendJson(response, 404, { error: 'Không tìm thấy API.' });
    }
    if (await serveStatic(request, response, requestUrl.pathname)) return;
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`API server đang lắng nghe cổng ${port}\n`);
  });
}
