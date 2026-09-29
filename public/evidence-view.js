const claimTagLabels = {
  'household-business-authority': 'thẩm quyền hộ kinh doanh',
  'conditional-route': 'hướng liên hệ có điều kiện',
  'official-next-step': 'bước xác nhận chính thức',
  'procedure-code': 'mã thủ tục',
  'unverified-administrative-details': 'chi tiết hành chính chưa xác minh',
  'certificate-rule': 'quy tắc cấp giấy',
  'exception-criteria': 'tiêu chí ngoại lệ',
  'no-size-only-exemption': 'không suy miễn từ quy mô',
  'conditions-for-exception': 'điều kiện vẫn áp dụng khi thuộc ngoại lệ',
  'separate-raw-cooked-utensils': 'tách dụng cụ sống và chín',
  'safe-cooking-utensils': 'dụng cụ nấu nướng an toàn',
  'clean-dry-serving-utensils': 'dụng cụ ăn uống sạch, khô',
};

function node(document, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function externalLink(document, label, url) {
  const link = node(document, 'a', '', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderPassage(document, passage, expanded) {
  const entry = node(document, 'details', 'source-entry');
  entry.open = expanded;
  entry.append(node(document, 'summary', '', `${passage.document} · ${passage.section}`));
  const body = node(document, 'div', 'source-body');
  body.append(node(document, 'blockquote', '', passage.excerpt));
  const meta = node(document, 'div', 'source-meta');
  meta.append(node(document, 'p', '', `Mã đoạn: ${passage.id}`));
  const tags = (passage.claimTags || []).map((tag) => claimTagLabels[tag] || tag);
  if (tags.length) meta.append(node(document, 'p', '', `Thẻ nội dung: ${tags.join(' · ')}`));
  meta.append(node(document, 'p', '', `Phiên bản: ${passage.version}`));
  meta.append(node(document, 'p', '', `Ban hành: ${passage.issuedDate || 'chưa rõ'} · Hiệu lực: ${passage.effectiveDate || 'chưa ghi nhận'} · Rà soát: ${passage.reviewDate || 'chưa rõ'}`));
  if (passage.useLimits) meta.append(node(document, 'p', '', `Giới hạn sử dụng: ${passage.useLimits}`));
  meta.append(externalLink(document, 'Mở trang nguồn ↗', passage.url));
  if (passage.documentUrl && passage.documentUrl !== passage.url) {
    meta.append(externalLink(document, 'Mở văn bản đính kèm ↗', passage.documentUrl));
  }
  body.append(meta);
  entry.append(body);
  return entry;
}

export function renderEvidence(evidence = [], { document, parent, expanded = false }) {
  if (!Array.isArray(evidence) || evidence.length === 0) return;
  const details = node(document, 'details', 'source-box');
  details.open = expanded;
  details.append(node(document, 'summary', '', `Mở các đoạn nguồn đã chọn (${evidence.length})`));
  for (const passage of evidence) details.append(renderPassage(document, passage, expanded));
  parent.append(details);
}

export function renderProviderFailure(data, { document, parent }) {
  const error = node(document, 'div', 'error-box');
  error.setAttribute('role', 'alert');
  error.append(node(document, 'strong', '', 'Chưa tạo checklist'));
  error.append(node(document, 'p', '', data.error));
  parent.append(error);
  renderEvidence(data.evidence, { document, parent, expanded: true });
}
