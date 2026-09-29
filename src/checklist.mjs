function validClaim(claim, evidence, supportedTags) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const text = typeof claim.text === 'string' ? claim.text.trim() : '';
  const passageIds = Array.isArray(claim.passageIds) ? [...new Set(claim.passageIds)] : [];
  const byId = new Map(evidence.map((passage) => [passage.id, passage]));

  if (!text || text.length > 900 || passageIds.length === 0 || passageIds.length > 4) return null;
  if (passageIds.some((id) => typeof id !== 'string' || !byId.has(id))) return null;
  if (passageIds.some((id) => !byId.get(id).claimTags?.some((tag) => supportedTags.has(tag)))) return null;

  return {
    text,
    passageIds,
    citations: passageIds.map((id) => {
      const passage = byId.get(id);
      return {
        id: passage.id,
        label: `${passage.document} · ${passage.section}`,
        url: passage.documentUrl ?? passage.url,
        sourcePageUrl: passage.url,
        publishedDate: passage.issuedDate,
        effectiveDate: passage.effectiveDate,
        snapshotDate: passage.reviewDate,
      };
    }),
  };
}

export function sanitizeChecklist(input, evidence) {
  const route = validClaim(input?.route, evidence, new Set(['household-business-authority', 'conditional-route']));
  const nextAction = validClaim(input?.nextAction, evidence, new Set([
    'household-business-authority',
    'conditional-route',
    'official-next-step',
    'procedure-code',
    'unverified-administrative-details',
    'certificate-rule',
    'exception-criteria',
    'no-size-only-exemption',
  ]));
  const tasks = (Array.isArray(input?.tasks) ? input.tasks : [])
    .map((claim) => validClaim(claim, evidence, new Set([
      'separate-raw-cooked-utensils',
      'safe-cooking-utensils',
      'clean-dry-serving-utensils',
    ])))
    .filter(Boolean)
    .slice(0, 4);
  const unresolved = (Array.isArray(input?.unresolved) ? input.unresolved : [])
    .map((claim) => validClaim(claim, evidence, new Set([
      'unverified-administrative-details',
      'certificate-rule',
      'exception-criteria',
      'no-size-only-exemption',
      'procedure-code',
    ])))
    .filter(Boolean)
    .slice(0, 5);

  return { route, tasks, unresolved, nextAction };
}

export function assertUsefulChecklist(checklist) {
  if (!checklist.route || checklist.tasks.length < 1 || checklist.unresolved.length < 1 || !checklist.nextAction) {
    throw new Error('Model trả về câu trả lời thiếu lộ trình, việc chuẩn bị, điểm chưa xác minh hoặc bước tiếp theo có căn cứ.');
  }
  return checklist;
}
