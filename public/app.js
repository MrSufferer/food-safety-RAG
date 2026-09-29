const labels = {
  legalForm: {
    household_business: 'Giấy chứng nhận đăng ký hộ kinh doanh',
    enterprise: 'Giấy chứng nhận đăng ký doanh nghiệp',
    cooperative: 'Giấy đăng ký hợp tác xã',
    unknown: 'Chưa rõ loại giấy đăng ký',
  },
  businessType: { cafe: 'Quán cà phê', takeaway: 'Quán takeaway', both: 'Quán cà phê và takeaway' },
  preparation: { food_and_drink: 'Chuẩn bị đồ ăn và thức uống', drinks_only: 'Chỉ pha chế thức uống' },
};

const claimTagLabels = {
  'household-business-authority': 'thẩm quyền hộ kinh doanh',
  'conditional-route': 'hướng liên hệ có điều kiện',
  'official-next-step': 'bước xác nhận chính thức',
  'procedure-code': 'mã thủ tục',
  'unverified-administrative-details': 'chi tiết hành chính chưa xác minh',
  'certificate-rule': 'quy tắc cấp giấy',
  'exception-criteria': 'tiêu chí ngoại lệ',
  'no-size-only-exemption': 'không suy miễn từ quy mô',
  'separate-raw-cooked-utensils': 'tách dụng cụ sống và chín',
  'safe-cooking-utensils': 'dụng cụ nấu nướng an toàn',
  'clean-dry-serving-utensils': 'dụng cụ ăn uống sạch, khô',
};

const form = document.querySelector('#intake-form');
const panels = [...document.querySelectorAll('[data-step-panel]')];
const indicators = [...document.querySelectorAll('[data-step-indicator]')];
const formMessage = document.querySelector('#form-message');
const reviewFacts = document.querySelector('#review-facts');
const reviewConfirm = document.querySelector('#review-confirm');
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
  const requiredNames = step === 0 ? ['legalForm'] : ['businessType', 'preparation'];
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

function addClaim(parent, claim, className = '') {
  if (!claim) return;
  const article = node('article', `claim ${className}`.trim());
  article.append(node('p', '', claim.text));
  appendCitations(article, claim.citations);
  parent.append(article);
}

function renderEvidence(evidence = [], parent = resultContent) {
  if (!Array.isArray(evidence) || evidence.length === 0) return;
  const details = node('details', 'source-box');
  details.append(node('summary', '', `Mở các đoạn nguồn đã chọn (${evidence.length})`));
  for (const passage of evidence) {
    const entry = node('details', 'source-entry');
    entry.append(node('summary', '', `${passage.document} · ${passage.section}`));
    const body = node('div', 'source-body');
    body.append(node('blockquote', '', passage.excerpt));
    const meta = node('div', 'source-meta');
    meta.append(node('p', '', `Mã đoạn: ${passage.id}`));
    const tags = (passage.claimTags || []).map((tag) => claimTagLabels[tag] || tag);
    if (tags.length) meta.append(node('p', '', `Thẻ nội dung: ${tags.join(' · ')}`));
    meta.append(node('p', '', `Phiên bản: ${passage.version}`));
    meta.append(node('p', '', `Ban hành: ${passage.issuedDate || 'chưa rõ'} · Hiệu lực: ${passage.effectiveDate || 'chưa ghi nhận'} · Rà soát: ${passage.reviewDate || 'chưa rõ'}`));
    if (passage.useLimits) meta.append(node('p', '', `Giới hạn sử dụng: ${passage.useLimits}`));
    const source = node('a', '', 'Mở trang nguồn ↗');
    source.href = passage.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    meta.append(source);
    if (passage.documentUrl && passage.documentUrl !== passage.url) {
      const document = node('a', '', 'Mở văn bản đính kèm ↗');
      document.href = passage.documentUrl;
      document.target = '_blank';
      document.rel = 'noopener noreferrer';
      meta.append(document);
    }
    body.append(meta);
    entry.append(body);
    details.append(entry);
  }
  parent.append(details);
}

function renderFacts(facts) {
  const box = node('section', 'result-facts');
  box.append(node('h3', '', 'Thông tin bạn đã cung cấp'));
  box.append(node('p', '', `${labels.legalForm[facts.legalForm]} · ${labels.businessType[facts.businessType]} · ${labels.preparation[facts.preparation]} · Đà Nẵng`));
  return box;
}

function showResponse(data, factsFromRequest) {
  result.hidden = false;
  result.classList.remove('is-ready');
  resultContent.replaceChildren();
  const facts = data.facts || factsFromRequest;
  if (facts) resultContent.append(renderFacts(facts));
  const reviewedOn = data.snapshotDate || '2026-09-29';
  document.querySelector('#snapshot-badge').textContent = `Nguồn rà soát ${reviewedOn}${data.model ? ` · ${data.model}` : ''}`;

  if (data.error) {
    const error = node('div', 'error-box');
    error.setAttribute('role', 'alert');
    error.append(node('strong', '', 'Chưa tạo checklist'));
    error.append(node('p', '', data.error));
    resultContent.append(error);
    if (data.code === 'scenario_out_of_scope') {
      resultContent.append(node('p', 'help-text', 'Bạn có thể quay lại để xác nhận loại giấy. Bản thử không chọn đầu mối hoặc đoán ngoại lệ cho tình huống này.'));
    }
    renderEvidence(data.evidence);
    result.classList.add('is-ready');
    result.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    return;
  }

  const checklist = data.checklist;
  if (!checklist) {
    resultContent.append(node('div', 'error-box', 'Không có checklist để hiển thị.'));
    renderEvidence(data.evidence);
    result.classList.add('is-ready');
    return;
  }

  const routeHeading = node('section', 'result-section');
  routeHeading.append(node('h3', '', 'Hướng cần xác nhận'));
  addClaim(routeHeading, checklist.route, 'route');
  resultContent.append(routeHeading);

  const tasksSection = node('section', 'result-section');
  tasksSection.append(node('h3', '', 'Việc bạn có thể rà soát'));
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
  tasksSection.append(node('p', 'check-note', 'Dấu tick chỉ ghi nhận việc bạn đã đọc hoặc tự chuẩn bị. Dấu tick không xác nhận tuân thủ, đủ điều kiện hay sẵn sàng nộp hồ sơ.'));
  resultContent.append(tasksSection);

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
  renderEvidence(data.evidence);
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
  submitButton.disabled = true;
  submitButton.textContent = 'Đang chọn nguồn và tạo câu trả lời…';
  formMessage.textContent = 'Đang xử lý. Chỉ các nguồn liên quan đến tình huống này được gửi để tạo câu trả lời.';
  try {
    const response = await fetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts, reviewed: true }),
    });
    const data = await response.json();
    showResponse(data, facts);
  } catch (error) {
    console.error('Checklist request failed', error);
    showResponse({ error: 'Không kết nối được với máy chủ bản thử. Hãy kiểm tra máy chủ đang chạy rồi thử lại.', facts, snapshotDate: '2026-09-29' }, facts);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Tạo checklist có nguồn <span aria-hidden="true">→</span>';
    formMessage.textContent = '';
  }
});

for (const input of form.querySelectorAll('input[type="radio"]')) {
  input.addEventListener('change', () => { formMessage.textContent = ''; });
}
