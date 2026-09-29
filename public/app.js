import { renderEvidence, renderEvidenceGaps, renderProviderFailure } from './evidence-view.js';

const labels = {
  legalForm: {
    household_business: 'Giấy chứng nhận đăng ký hộ kinh doanh',
    enterprise: 'Giấy chứng nhận đăng ký doanh nghiệp',
    cooperative: 'Giấy đăng ký hợp tác xã',
    unknown: 'Chưa rõ loại giấy đăng ký',
  },
  businessType: { cafe: 'Quán cà phê', takeaway: 'Quán takeaway', both: 'Quán cà phê và takeaway' },
  preparation: { food_and_drink: 'Chuẩn bị đồ ăn và thức uống', drinks_only: 'Chỉ pha chế thức uống' },
  operationMode: {
    prepared_at_fixed_shop: 'Tự chuẩn bị đồ ăn, thức uống tại địa điểm quán',
    packaged_only: 'Đồ ăn bán tại quán là thực phẩm bao gói sẵn',
    street_food: 'Bán thức ăn đường phố hoặc di động',
    mixed_or_unknown: 'Hoạt động khác, kết hợp hoặc chưa rõ',
  },
  smallExemptionClaim: {
    yes: 'Nghĩ quán có thể được miễn vì quy mô nhỏ',
    no: 'Chưa cho rằng quán được miễn',
    unsure: 'Chưa biết quán có thuộc ngoại lệ không',
  },
};

const form = document.querySelector('#intake-form');
const panels = [...document.querySelectorAll('[data-step-panel]')];
const indicators = [...document.querySelectorAll('[data-step-indicator]')];
const formMessage = document.querySelector('#form-message');
const reviewFacts = document.querySelector('#review-facts');
const reviewConfirm = document.querySelector('#review-confirm');
const questionInput = document.querySelector('#question');
const submitButton = document.querySelector('#submit-button');
const result = document.querySelector('#result');
const resultContent = document.querySelector('#result-content');
let currentStep = 0;

function value(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
}

function factsFromForm() {
  return {
    legalForm: value('legalForm'),
    businessType: value('businessType'),
    preparation: value('preparation'),
    operationMode: value('operationMode'),
    smallExemptionClaim: value('smallExemptionClaim'),
    location: 'Da Nang',
  };
}

function showStep(step) {
  currentStep = step;
  panels.forEach((panel, index) => { panel.hidden = index !== step; });
  indicators.forEach((indicator, index) => {
    indicator.classList.toggle('is-current', index === step);
    indicator.classList.toggle('is-complete', index < step);
    if (index === step) indicator.setAttribute('aria-current', 'step');
    else indicator.removeAttribute('aria-current');
  });
  formMessage.textContent = '';
  const heading = panels[step].querySelector('h3');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  panels[step].scrollIntoView({
    block: 'nearest',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

function validateStep(step) {
  const requiredNames = step === 0
    ? ['legalForm']
    : ['businessType', 'preparation', 'operationMode', 'smallExemptionClaim'];
  const missing = requiredNames.find((name) => !value(name));
  if (missing) {
    formMessage.textContent = 'Chọn một phương án để tiếp tục.';
    form.querySelector(`input[name="${missing}"]`)?.focus();
    return false;
  }
  return true;
}

function review() {
  const facts = factsFromForm();
  const rows = [
    ['Giấy đăng ký', labels.legalForm[facts.legalForm]],
    ['Hình thức quán', labels.businessType[facts.businessType]],
    ['Cách chuẩn bị', labels.preparation[facts.preparation]],
    ['Hoạt động bán thực phẩm', labels.operationMode[facts.operationMode]],
    ['Nhận định về ngoại lệ', labels.smallExemptionClaim[facts.smallExemptionClaim]],
    ['Địa điểm', 'Đà Nẵng'],
  ];
  reviewFacts.replaceChildren(...rows.flatMap(([term, description]) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = description;
    return [dt, dd];
  }));
  reviewConfirm.checked = false;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendCitations(parent, citations = []) {
  if (citations.length === 0) return;
  const group = node('div', 'claim-citations');
  for (const citation of citations) {
    const link = node('a', '', `${citation.label} ↗`);
    link.href = citation.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    group.append(link);
  }
  parent.append(group);
}

function appendSourceLink(parent, source, label) {
  if (!source?.url) return;
  const link = node('a', '', label || source.label || 'Mở nguồn chính thức ↗');
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  parent.append(link);
}

function sourceDateText(source) {
  return [
    source.issuedDate ? `Ban hành: ${source.issuedDate}` : '',
    source.effectiveDate ? `Hiệu lực: ${source.effectiveDate}` : 'Hiệu lực: chưa ghi nhận',
    source.reviewDate ? `Rà soát: ${source.reviewDate}` : '',
  ].filter(Boolean).join(' · ');
}

function renderQuestionAnswer(answer, question) {
  const section = node('section', `question-answer question-answer-${answer.kind || 'unknown'}`);
  section.setAttribute('aria-labelledby', 'question-answer-title');
  section.append(node('p', 'eyebrow', 'Câu trả lời có giới hạn nguồn'));
  const heading = node('h3', '', answer.title || 'Câu hỏi của bạn');
  heading.id = 'question-answer-title';
  section.append(heading);
  if (question) section.append(node('p', 'question-echo', `Bạn hỏi: ${question}`));
  if (answer.summary) section.append(node('p', 'question-summary', answer.summary));

  if (answer.unresolvedDetails?.length) {
    const list = node('ul', 'question-details');
    for (const detail of answer.unresolvedDetails) {
      const item = node('li', 'question-detail');
      const heading = node('div', 'question-detail-heading');
      heading.append(node('strong', '', detail.label));
      heading.append(node('span', 'status-pill', detail.status));
      item.append(heading, node('p', '', detail.confirmationQuestion));
      if (detail.sourceConflict) {
        item.append(node('p', 'question-conflict-note', detail.sourceConflict.summary));
        const sources = node('ul', 'question-conflict-sources');
        for (const assertion of detail.sourceConflict.assertions) {
          const sourceItem = node('li', 'question-conflict-source');
          sourceItem.append(node('p', '', `Nguồn ghi: ${assertion.value}`));
          appendSourceLink(sourceItem, assertion.source, assertion.source.label || 'Mở nguồn');
          const dates = sourceDateText(assertion.source);
          if (dates) sourceItem.append(node('p', 'source-dates', dates));
          sources.append(sourceItem);
        }
        item.append(sources);
      }
      list.append(item);
    }
    section.append(list);
  }

  if (answer.sourceNote) section.append(node('p', 'question-source-note', answer.sourceNote));
  if (answer.source) {
    const source = node('div', 'question-source');
    appendSourceLink(source, answer.source);
    const dates = sourceDateText(answer.source);
    if (dates) source.append(node('p', 'source-dates', dates));
    section.append(source);
  }

  if (answer.confirmationQuestion) {
    section.append(node('h4', '', 'Cách hỏi cơ quan chính thức'));
    section.append(node('p', 'question-next-step', answer.confirmationQuestion));
  }
  if (answer.route) {
    const route = node('div', 'question-route');
    appendSourceLink(route, answer.route, answer.route.label);
    if (answer.route.source?.note) route.append(node('p', 'source-dates', answer.route.source.note));
    if (answer.route.source) appendSourceLink(route, answer.route.source, `${answer.route.source.label} ↗`);
    section.append(route);
  }
  return section;
}

function addClaim(parent, claim, className = '') {
  if (!claim) return;
  const article = node('article', `claim ${className}`.trim());
  article.append(node('p', '', claim.text));
  appendCitations(article, claim.citations);
  parent.append(article);
}

function renderFacts(facts) {
  const box = node('section', 'result-facts');
  box.append(node('h3', '', 'Thông tin bạn đã cung cấp'));
  const summary = [
    labels.legalForm[facts.legalForm],
    labels.businessType[facts.businessType],
    labels.preparation[facts.preparation],
    labels.operationMode[facts.operationMode],
    labels.smallExemptionClaim[facts.smallExemptionClaim],
    'Đà Nẵng',
  ].join(' · ');
  box.append(node('p', '', summary));
  return box;
}

function showResponse(data, factsFromRequest) {
  result.hidden = false;
  result.classList.remove('is-ready');
  resultContent.replaceChildren();
  const facts = data.facts || factsFromRequest;
  if (facts) resultContent.append(renderFacts(facts));
  const reviewedOn = data.snapshotDate || '2026-09-29';
  const modelLabel = data.model && data.model !== 'local:question-boundary-v1' ? ` · ${data.model}` : '';
  document.querySelector('#snapshot-badge').textContent = `Nguồn rà soát ${reviewedOn}${modelLabel}`;

  if (data.questionAnswer) resultContent.append(renderQuestionAnswer(data.questionAnswer, data.question));

  if (data.error) {
    renderProviderFailure(data, { document, parent: resultContent });
    if (data.code === 'scenario_out_of_scope') {
      resultContent.append(node('p', 'help-text', 'Bạn có thể quay lại để xác nhận loại giấy. Bản thử không chọn đầu mối hoặc đoán ngoại lệ cho tình huống này.'));
    }
    result.classList.add('is-ready');
    result.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    return;
  }

  const checklist = data.checklist;
  if (!checklist) {
    if (!data.questionAnswer) resultContent.append(node('div', 'error-box', 'Không có checklist để hiển thị.'));
    renderEvidenceGaps(data.evidenceGaps, { document, parent: resultContent });
    renderEvidence(data.evidence, { document, parent: resultContent });
    result.classList.add('is-ready');
    return;
  }

  renderEvidenceGaps(data.evidenceGaps, { document, parent: resultContent });

  if (checklist.route) {
    const routeHeading = node('section', 'result-section');
    routeHeading.append(node('h3', '', 'Hướng cần xác nhận'));
    addClaim(routeHeading, checklist.route, 'route');
    resultContent.append(routeHeading);
  }

  const tasksSection = node('section', 'result-section');
  tasksSection.append(node('h3', '', 'Việc bạn có thể rà soát'));
  if (checklist.tasks.length === 0) {
    tasksSection.append(node('p', 'help-text', 'Chưa có việc chuẩn bị nào đủ căn cứ để hiển thị.'));
  } else {
    const taskList = node('ul', 'prep-list');
    checklist.tasks.forEach((task, index) => {
      const item = node('li', 'prep-item');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.id = `prep-${index}`;
      check.setAttribute('aria-label', `Đánh dấu đã đọc hoặc chuẩn bị: ${task.text}`);
      const copy = document.createElement('div');
      copy.append(node('p', '', task.text));
      appendCitations(copy, task.citations);
      item.append(check, copy);
      taskList.append(item);
    });
    tasksSection.append(taskList);
  }
  tasksSection.append(node('p', 'check-note', 'Dấu tick chỉ ghi nhận việc bạn đã đọc hoặc tự chuẩn bị. Dấu tick không xác nhận tuân thủ, đủ điều kiện hay sẵn sàng nộp hồ sơ.'));
  resultContent.append(tasksSection);

  if (checklist.exceptionAssessment) {
    const exceptionSection = node('section', 'result-section');
    exceptionSection.append(node('h3', '', 'Rà soát ngoại lệ Giấy chứng nhận'));
    addClaim(exceptionSection, checklist.exceptionAssessment);
    resultContent.append(exceptionSection);
  }

  if (checklist.unresolved?.length) {
    const section = node('section', 'result-section unresolved');
    section.append(node('h3', '', 'Chưa xác minh'));
    checklist.unresolved.forEach((claim) => addClaim(section, claim));
    resultContent.append(section);
  }

  if (checklist.nextAction) {
    const next = node('section', 'next-action');
    next.append(node('p', 'eyebrow', 'Việc tiếp theo'));
    addClaim(next, checklist.nextAction);
    resultContent.append(next);
  }
  renderEvidence(data.evidence, { document, parent: resultContent });
  result.classList.add('is-ready');
  result.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

document.querySelectorAll('[data-next]').forEach((button) => button.addEventListener('click', () => {
  if (!validateStep(currentStep)) return;
  const nextStep = currentStep + 1;
  if (nextStep === 2) review();
  showStep(nextStep);
}));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => showStep(currentStep - 1)));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!reviewConfirm.checked) {
    formMessage.textContent = 'Xác nhận rằng bạn đã rà soát thông tin trước khi tiếp tục.';
    reviewConfirm.focus();
    return;
  }
  const facts = factsFromForm();
  const question = questionInput.value.trim();
  submitButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  submitButton.textContent = 'Đang chọn nguồn và tạo câu trả lời…';
  formMessage.textContent = 'Đang chọn nguồn liên quan đến tình huống và tạo phản hồi có trích dẫn.';
  try {
    const response = await fetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true, question }),
    });
    const data = await response.json();
    showResponse(data, facts);
  } catch (error) {
    console.error('Checklist request failed', error);
    showResponse({ error: 'Không kết nối được với máy chủ bản thử. Hãy kiểm tra máy chủ đang chạy rồi thử lại.', facts, snapshotDate: '2026-09-29' }, facts);
  } finally {
    submitButton.disabled = false;
    form.removeAttribute('aria-busy');
    submitButton.innerHTML = 'Tạo checklist có nguồn <span aria-hidden="true">→</span>';
    formMessage.textContent = '';
  }
});

for (const input of form.querySelectorAll('input[type="radio"]')) {
  input.addEventListener('change', () => { formMessage.textContent = ''; });
}
