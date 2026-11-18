import type { ClarifiedFieldItem, Enterprise, ServicePlan } from '@/types/enterprise';
import type { RuleSetEvaluation, RuleTemplate } from '@/types/fraudguard';
import type {
  ActivateEnterpriseInput,
  ActivateEnterpriseResult,
  ApplyEnterpriseActivationCommandResult,
  ApproveEnterpriseConfigInput,
  ConfigureSubscriptionDurationInput,
  EnterpriseActivationRecord,
  EnterpriseConfigSnapshot,
  EnterpriseConfigTestEvidence,
  EnterpriseLifecycle,
  EnterpriseLifecycleCommand,
  EnterpriseLifecycleError,
  EnterpriseLifecycleErrorCode,
  EnterpriseLifecycleEvent,
  EnterpriseLifecycleResult,
  EnterpriseOperationalEligibility,
  EnterpriseRuleSetActivationCommand,
  EnterpriseSubscriptionRecord,
  InitializeEnterpriseLifecycleInput,
  LifecycleActorInput,
  LifecycleActorRef,
  PlatformApprovalRecord,
  RequestEnterpriseRevisionInput,
  ResolvedEnterpriseLifecycle,
  SMERevisionRequestRecord,
  SubmitEnterpriseConfigInput,
  SubscriptionDuration,
} from '@/types/enterprise-lifecycle';
import type { ManagedRuleSet, SetTest, SetVersion } from './rule-set-lifecycle';
import { enterprisePlan } from './enterprise';
import { normalizeFields, validateDataSchema } from './ingestion-validation';
import { evaluateRuleSet } from './rule-set';
import { setSignature } from './rule-set-lifecycle';

const MS_PER_DAY = 86_400_000;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const hash = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return Array.from(hash, word => word.toString(16).padStart(8, '0')).join('');
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => (item === undefined ? 'null' : canonicalStringify(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter(k => record[k] !== undefined)
    .sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`).join(',')}}`;
}

function fail(code: EnterpriseLifecycleErrorCode, error: string): EnterpriseLifecycleError {
  return { ok: false, code, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function daysInUtcMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export function parseStrictIsoTimestamp(
  value: string,
): { ok: true; iso: string; ms: number } | { ok: false } {
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      trimmed,
    );
  if (!match) return { ok: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInUtcMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return { ok: false };
  }
  if (match[9] && (Number(match[10]) > 23 || Number(match[11]) > 59)) {
    return { ok: false };
  }

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return { ok: false };
  return { ok: true, iso: new Date(ms).toISOString(), ms };
}

export function addSubscriptionDurationUtc(
  startedAtIso: string,
  duration: SubscriptionDuration,
): string {
  const parsed = parseStrictIsoTimestamp(startedAtIso);
  if (!parsed.ok) {
    throw new Error('Timestamp bắt đầu Subscription phải ở định dạng ISO-8601 có múi giờ.');
  }
  if (duration.unit === 'days') {
    return new Date(parsed.ms + duration.value * MS_PER_DAY).toISOString();
  }

  const d = new Date(parsed.ms);
  const totalMonths = d.getUTCFullYear() * 12 + d.getUTCMonth() + duration.value;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthZeroBased = totalMonths % 12;
  const maxDay = daysInUtcMonth(targetYear, targetMonthZeroBased + 1);
  const targetDay = Math.min(d.getUTCDate(), maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonthZeroBased,
      targetDay,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  ).toISOString();
}

function validateActor(
  actor: LifecycleActorInput | undefined,
): { ok: true; ref: LifecycleActorRef } | EnterpriseLifecycleError {
  if (!isPlainObject(actor) || typeof actor.id !== 'string' || !actor.id.trim()) {
    return fail('INVALID_ACTOR', 'Thiếu định danh người thực hiện (actor.id) hợp lệ.');
  }
  const cleanName = typeof actor.name === 'string' && actor.name.trim() ? actor.name.trim() : undefined;
  return {
    ok: true,
    ref: cleanName ? { id: actor.id.trim(), name: cleanName } : { id: actor.id.trim() },
  };
}

function resolveEventTimestamp(
  at: string | undefined,
): { ok: true; iso: string; ms: number } | EnterpriseLifecycleError {
  const candidate = at === undefined ? new Date().toISOString() : at;
  const parsed = parseStrictIsoTimestamp(candidate);
  if (!parsed.ok) {
    return fail(
      'INVALID_TIMESTAMP',
      'Thời điểm thao tác phải là chuỗi ISO-8601 hợp lệ và có thông tin múi giờ (ví dụ Z hoặc +07:00).',
    );
  }
  return parsed;
}

function nextId(provided: string | undefined, prefix: string): string {
  if (typeof provided === 'string' && provided.trim()) return provided.trim();
  return `${prefix}-${crypto.randomUUID()}`;
}

function validateSubscriptionDuration(
  duration: SubscriptionDuration | undefined,
): { ok: true; value: SubscriptionDuration } | EnterpriseLifecycleError {
  if (!isPlainObject(duration)) {
    return fail(
      'MISSING_SUBSCRIPTION_DURATION',
      'Gói Subscription chưa có cấu hình thời lượng hiệu lực.',
    );
  }
  if (duration.unit !== 'days' && duration.unit !== 'months') {
    return fail(
      'INVALID_SUBSCRIPTION_DURATION',
      'Đơn vị thời lượng Subscription không hợp lệ (chỉ hỗ trợ days hoặc months).',
    );
  }
  if (
    typeof duration.value !== 'number' ||
    !Number.isInteger(duration.value) ||
    duration.value <= 0
  ) {
    return fail(
      'INVALID_SUBSCRIPTION_DURATION',
      'Thời lượng Subscription phải là số nguyên dương lớn hơn 0.',
    );
  }
  return { ok: true, value: { value: duration.value, unit: duration.unit } };
}

function durationsEqual(a: SubscriptionDuration, b: SubscriptionDuration): boolean {
  return a.value === b.value && a.unit === b.unit;
}

function sanitizeRule(rule: RuleTemplate): RuleTemplate {
  const cloned = structuredClone(rule);
  delete cloned.draft;
  delete cloned.history;
  return cloned;
}

function sanitizeSchema(schema: ClarifiedFieldItem[]): ClarifiedFieldItem[] {
  return schema.map(field => {
    const clean: ClarifiedFieldItem = {
      name: field.name,
      type: field.type,
      required: field.required,
    };
    if (typeof field.description === 'string' && field.description.trim()) {
      clean.description = field.description;
    }
    return clean;
  });
}

function computeConfigContentHash(parts: {
  enterpriseId: string;
  configVersion: string;
  ruleSetId: string;
  ruleSetName: string;
  ruleSetVersion: number;
  projectIds: string[];
  rules: RuleTemplate[];
  schema: ClarifiedFieldItem[];
}): string {
  return sha256Hex(
    canonicalStringify({
      enterpriseId: parts.enterpriseId,
      configVersion: parts.configVersion,
      ruleSetId: parts.ruleSetId,
      ruleSetName: parts.ruleSetName,
      ruleSetVersion: parts.ruleSetVersion,
      projectIds: [...parts.projectIds],
      rules: parts.rules.map(sanitizeRule),
      schema: sanitizeSchema(parts.schema),
    }),
  );
}

function normalizeEvalForDigest(evaluation: RuleSetEvaluation) {
  return {
    applicable: evaluation.applicable,
    evaluated: evaluation.evaluated,
    matched: evaluation.matched,
    failed: evaluation.failed,
    status: evaluation.status,
    result: evaluation.result,
    rules: evaluation.rules.map(rule => ({
      id: rule.id,
      version: rule.version,
      outcome: rule.outcome,
    })),
  };
}

function computeTestDigest(test: SetTest): string {
  return sha256Hex(
    canonicalStringify({
      signature: test.signature,
      testedAt: test.testedAt,
      labeled: test.labeled,
      mismatched: test.mismatched,
      complete: test.complete,
      samples: test.samples,
      results: test.results.map(normalizeEvalForDigest),
    }),
  );
}

function isValidEnterpriseInput(enterprise: Enterprise | undefined): enterprise is Enterprise {
  return isPlainObject(enterprise) && typeof enterprise.id === 'string' && Boolean(enterprise.id.trim());
}
function resolveEffectivePlan(enterprise: Enterprise): ServicePlan | undefined {
  return enterprise.plan ?? enterprisePlan(enterprise);
}

function verifySnapshotIntegrity(
  snapshot: EnterpriseConfigSnapshot | undefined,
  enterpriseId: string,
): EnterpriseLifecycleError | null {
  if (!isPlainObject(snapshot)) {
    return fail('SNAPSHOT_TAMPERED', 'Thiếu snapshot cấu hình hoặc dữ liệu snapshot không hợp lệ.');
  }
  if (snapshot.enterpriseId !== enterpriseId) {
    return fail('SNAPSHOT_TAMPERED', 'Snapshot cấu hình không thuộc doanh nghiệp hiện tại.');
  }
  if (
    typeof snapshot.submissionId !== 'string' ||
    !snapshot.submissionId.trim() ||
    typeof snapshot.configVersion !== 'string' ||
    !snapshot.configVersion.trim() ||
    typeof snapshot.ruleSetId !== 'string' ||
    !snapshot.ruleSetId.trim() ||
    typeof snapshot.ruleSetName !== 'string' ||
    !snapshot.ruleSetName.trim() ||
    typeof snapshot.ruleSetVersion !== 'number' ||
    !Number.isInteger(snapshot.ruleSetVersion) ||
    snapshot.ruleSetVersion <= 0 ||
    !Array.isArray(snapshot.projectIds) ||
    snapshot.projectIds.length === 0 ||
    !Array.isArray(snapshot.rules) ||
    snapshot.rules.length === 0 ||
    !Array.isArray(snapshot.schema) ||
    snapshot.schema.length === 0 ||
    !isPlainObject(snapshot.testEvidence) ||
    !isPlainObject(snapshot.testEvidence.test)
  ) {
    return fail('SNAPSHOT_TAMPERED', 'Cấu trúc dữ liệu bên trong snapshot không hợp lệ.');
  }
  try {
    validateDataSchema(snapshot.schema);
  } catch (err) {
    return fail('SNAPSHOT_TAMPERED', `Schema trong snapshot không hợp lệ: ${(err as Error).message}`);
  }
  const evTime = parseStrictIsoTimestamp(snapshot.testEvidence.testedAt);
  const rawTestTime = parseStrictIsoTimestamp(snapshot.testEvidence.test.testedAt);
  if (
    !evTime.ok ||
    !rawTestTime.ok ||
    evTime.iso !== rawTestTime.iso ||
    computeTestDigest(snapshot.testEvidence.test) !== snapshot.testEvidence.testDigest
  ) {
    return fail(
      'SNAPSHOT_TAMPERED',
      'Bằng chứng kiểm thử trong snapshot đã bị thay đổi so với mã kiểm tra toàn vẹn.',
    );
  }
  const recomputed = computeConfigContentHash({
    enterpriseId: snapshot.enterpriseId,
    configVersion: snapshot.configVersion,
    ruleSetId: snapshot.ruleSetId,
    ruleSetName: snapshot.ruleSetName,
    ruleSetVersion: snapshot.ruleSetVersion,
    projectIds: snapshot.projectIds,
    rules: snapshot.rules,
    schema: snapshot.schema,
  });
  if (recomputed !== snapshot.contentHash) {
    return fail(
      'SNAPSHOT_TAMPERED',
      'Nội dung cấu hình trong snapshot đã bị thay đổi so với mã kiểm tra toàn vẹn.',
    );
  }
  return null;
}

function verifySingleRuleSetAgainstSnapshot(
  enterpriseId: string,
  snapshot: EnterpriseConfigSnapshot,
  targetRuleSet: ManagedRuleSet | undefined,
): { ok: true; targetRuleSet: ManagedRuleSet; release: SetVersion } | EnterpriseLifecycleError {
  if (!isPlainObject(targetRuleSet)) {
    return fail('RULESET_NOT_FOUND', 'Không tìm thấy bộ quy tắc hợp lệ để đối chiếu.');
  }
  if (targetRuleSet.id !== snapshot.ruleSetId) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Mã bộ quy tắc được truyền vào không khớp với bộ quy tắc đã gửi duyệt.',
    );
  }
  if (targetRuleSet.enterpriseId !== enterpriseId) {
    return fail(
      'FORBIDDEN_TENANT',
      'Bộ quy tắc mục tiêu không thuộc doanh nghiệp đang xử lý.',
    );
  }
  if (
    !Array.isArray(targetRuleSet.projectIds) ||
    canonicalStringify(targetRuleSet.projectIds) !== canonicalStringify(snapshot.projectIds)
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Phạm vi dự án của bộ quy tắc đã thay đổi so với bản gửi duyệt.',
    );
  }
  if (!Array.isArray(targetRuleSet.versions)) {
    return fail(
      'RELEASE_NOT_FOUND',
      'Không tìm thấy danh sách phiên bản phát hành trong bộ quy tắc.',
    );
  }
  const matchingReleases = targetRuleSet.versions.filter(
    v => isPlainObject(v) && v.version === snapshot.ruleSetVersion,
  );
  if (matchingReleases.length === 0) {
    return fail(
      'RELEASE_NOT_FOUND',
      'Không tìm thấy phiên bản tập quy tắc tương ứng với bản gửi duyệt.',
    );
  }
  if (matchingReleases.length > 1) {
    return fail(
      'INVALID_RULESET_SCOPE',
      'Bộ quy tắc chứa nhiều phiên bản phát hành trùng số version.',
    );
  }

  const release = matchingReleases[0];
  if (!Array.isArray(release.schema) || release.schema.length === 0) {
    return fail(
      'MISSING_SCHEMA',
      'Phiên bản tập quy tắc không có danh mục trường dữ liệu để đối chiếu toàn vẹn.',
    );
  }
  try {
    validateDataSchema(release.schema);
  } catch (err) {
    return fail('INVALID_SCHEMA', `Schema trong phiên bản phát hành không hợp lệ: ${(err as Error).message}`);
  }
  if (
    canonicalStringify(sanitizeSchema(release.schema)) !==
    canonicalStringify(sanitizeSchema(snapshot.schema))
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Schema lưu trong phiên bản phát hành không khớp với schema của bản cấu hình đã duyệt.',
    );
  }
  if (!Array.isArray(release.rules) || release.rules.length === 0) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Phiên bản phát hành không có danh sách quy tắc hợp lệ.',
    );
  }

  const liveHash = computeConfigContentHash({
    enterpriseId,
    configVersion: snapshot.configVersion,
    ruleSetId: targetRuleSet.id,
    ruleSetName: targetRuleSet.name,
    ruleSetVersion: release.version,
    projectIds: targetRuleSet.projectIds,
    rules: release.rules,
    schema: release.schema,
  });
  if (liveHash !== snapshot.contentHash) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Nội dung quy tắc, phạm vi dự án hoặc schema đã thay đổi so với phiên bản được duyệt/gửi.',
    );
  }

  if (!isPlainObject(release.test)) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Phiên bản phát hành thiếu bằng chứng kiểm thử hợp lệ.',
    );
  }
  const relTestTime = parseStrictIsoTimestamp(release.test.testedAt);
  if (
    !relTestTime.ok ||
    relTestTime.iso !== snapshot.testEvidence.testedAt ||
    computeTestDigest(release.test) !== snapshot.testEvidence.testDigest
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Bằng chứng kiểm thử trong phiên bản phát hành không khớp với snapshot đã duyệt.',
    );
  }

  return { ok: true, targetRuleSet, release };
}

function resolveTargetFromRuleSets(
  enterpriseId: string,
  snapshot: EnterpriseConfigSnapshot,
  ruleSets: ManagedRuleSet[],
): { ok: true; targetRuleSet: ManagedRuleSet; release: SetVersion } | EnterpriseLifecycleError {
  if (!Array.isArray(ruleSets)) {
    return fail('INVALID_RULESET_SCOPE', 'Danh sách bộ quy tắc truyền vào không hợp lệ.');
  }
  for (const item of ruleSets) {
    if (
      !isPlainObject(item) ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.enterpriseId !== 'string' ||
      !item.enterpriseId.trim()
    ) {
      return fail(
        'INVALID_RULESET_SCOPE',
        'Danh sách bộ quy tắc chứa phần tử thiếu định danh hoặc mã doanh nghiệp.',
      );
    }
  }

  const matchingById = ruleSets.filter(s => s.id === snapshot.ruleSetId);
  const ownedSets = ruleSets.filter(s => s.enterpriseId === enterpriseId);
  const ownedIds = ownedSets.map(s => s.id);
  if (matchingById.length > 1 || new Set(ownedIds).size !== ownedIds.length) {
    return fail(
      'INVALID_RULESET_SCOPE',
      'Danh sách bộ quy tắc chứa phần tử trùng mã định danh mục tiêu.',
    );
  }
  if (matchingById.length === 0) {
    return fail(
      'RULESET_NOT_FOUND',
      'Không tìm thấy đúng bộ quy tắc gắn với cấu hình đã gửi duyệt.',
    );
  }
  const candidateTarget = matchingById[0];
  if (candidateTarget.enterpriseId !== enterpriseId) {
    return fail(
      'FORBIDDEN_TENANT',
      'Bộ quy tắc mục tiêu trong danh sách thuộc doanh nghiệp khác.',
    );
  }

  return verifySingleRuleSetAgainstSnapshot(enterpriseId, snapshot, candidateTarget);
}

function verifyLiveCandidateAgainstSnapshot(
  enterprise: Enterprise,
  snapshot: EnterpriseConfigSnapshot,
  candidate: {
    ruleSet?: ManagedRuleSet;
    ruleSets?: ManagedRuleSet[];
    schema?: ClarifiedFieldItem[];
  },
): EnterpriseLifecycleError | null {
  if (candidate.schema !== undefined) {
    if (!Array.isArray(candidate.schema) || candidate.schema.length === 0) {
      return fail(
        'MISSING_SCHEMA',
        'Danh mục trường dữ liệu truyền vào để đối chiếu không được để trống.',
      );
    }
    try {
      validateDataSchema(candidate.schema);
    } catch (err) {
      return fail('INVALID_SCHEMA', `Danh mục trường dữ liệu không hợp lệ: ${(err as Error).message}`);
    }
    if (
      canonicalStringify(sanitizeSchema(candidate.schema)) !==
      canonicalStringify(sanitizeSchema(snapshot.schema))
    ) {
      return fail(
        'CONFIG_CONTENT_MISMATCH',
        'Schema hiện tại đã thay đổi so với phiên bản cấu hình đã gửi.',
      );
    }
  }

  let verifiedRuleSet: { targetRuleSet: ManagedRuleSet; release: SetVersion } | undefined;
  if (candidate.ruleSet !== undefined) {
    const res = verifySingleRuleSetAgainstSnapshot(enterprise.id, snapshot, candidate.ruleSet);
    if (!res.ok) return res;
    verifiedRuleSet = res;
  }

  let verifiedFromList: { targetRuleSet: ManagedRuleSet; release: SetVersion } | undefined;
  if (candidate.ruleSets !== undefined) {
    const res = resolveTargetFromRuleSets(enterprise.id, snapshot, candidate.ruleSets);
    if (!res.ok) return res;
    verifiedFromList = res;
  }

  if (verifiedRuleSet && verifiedFromList) {
    if (
      canonicalStringify(verifiedRuleSet.targetRuleSet) !==
      canonicalStringify(verifiedFromList.targetRuleSet)
    ) {
      return fail(
        'CONFIG_CONTENT_MISMATCH',
        'Dữ liệu giữa ruleSet và phần tử mục tiêu trong ruleSets không đồng nhất.',
      );
    }
  }

  return null;
}

function verifySnapshotLock(
  enterprise: Enterprise,
  snapshot: EnterpriseConfigSnapshot,
  expected: {
    configVersion: string;
    submissionId?: string;
    contentHash?: string;
    ruleSet?: ManagedRuleSet;
    ruleSets?: ManagedRuleSet[];
    schema?: ClarifiedFieldItem[];
  },
): EnterpriseLifecycleError | null {
  const integrityError = verifySnapshotIntegrity(snapshot, enterprise.id);
  if (integrityError) return integrityError;

  if (typeof expected.configVersion !== 'string' || !expected.configVersion.trim()) {
    return fail('MISSING_CONFIG_VERSION', 'Phải chỉ rõ mã phiên bản cấu hình để xác thực.');
  }
  if (expected.configVersion.trim() !== snapshot.configVersion) {
    return fail(
      'VERSION_MISMATCH',
      `Phiên bản xác nhận (${expected.configVersion.trim()}) không khớp phiên bản đang hiệu lực (${snapshot.configVersion}).`,
    );
  }
  if (expected.submissionId !== undefined && expected.submissionId.trim() !== snapshot.submissionId) {
    return fail('VERSION_MISMATCH', 'Mã lượt gửi duyệt không khớp bản cấu hình đang xử lý.');
  }
  if (expected.contentHash !== undefined && expected.contentHash.trim() !== snapshot.contentHash) {
    return fail('CONFIG_CONTENT_MISMATCH', 'Mã toàn vẹn cấu hình không khớp bản đã gửi.');
  }

  return verifyLiveCandidateAgainstSnapshot(enterprise, snapshot, {
    ruleSet: expected.ruleSet,
    ruleSets: expected.ruleSets,
    schema: expected.schema,
  });
}

function verifySubmissionTestEvidence(args: {
  enterprise: Enterprise;
  ruleSet: ManagedRuleSet;
  release: SetVersion;
  schema: ClarifiedFieldItem[];
  test: SetTest | undefined;
  schemaOverridden: boolean;
  hasExplicitTest: boolean;
  latestRevisionRequest?: SMERevisionRequestRecord;
}): { ok: true; evidence: EnterpriseConfigTestEvidence } | EnterpriseLifecycleError {
  const { enterprise, ruleSet, release, schema, test, schemaOverridden, hasExplicitTest, latestRevisionRequest } =
    args;

  if (schemaOverridden && !hasExplicitTest) {
    return fail(
      'STALE_TEST_EVIDENCE',
      'Schema đã thay đổi so với bản phát hành tập quy tắc; cần chạy kiểm thử lại trước khi gửi duyệt.',
    );
  }
  if (!schema.length) {
    return fail('MISSING_SCHEMA', 'Doanh nghiệp chưa có danh mục trường dữ liệu (schema) hợp lệ.');
  }
  try {
    validateDataSchema(schema);
  } catch (err) {
    return fail('INVALID_SCHEMA', `Danh mục trường dữ liệu không hợp lệ: ${(err as Error).message}`);
  }

  if (!release.rules.length) {
    return fail('INVALID_RULESET_SCOPE', 'Phiên bản cấu hình không có quy tắc phát hiện nào.');
  }
  if (new Set(release.rules.map(r => r.id)).size !== release.rules.length) {
    return fail('INVALID_RULESET_SCOPE', 'Phiên bản cấu hình chứa quy tắc trùng mã định danh.');
  }
  if (
    release.rules.some(
      r =>
        r.appliesTo.projects.includes('*') ||
        r.appliesTo.projects.length === 0 ||
        r.appliesTo.projects.some(p => !enterprise.projectIds.includes(p) || !ruleSet.projectIds.includes(p)),
    )
  ) {
    return fail(
      'INVALID_RULESET_SCOPE',
      'Có quy tắc không gắn đúng phạm vi dự án của doanh nghiệp.',
    );
  }

  if (!isPlainObject(test)) {
    return fail('MISSING_TEST_EVIDENCE', 'Chưa có bằng chứng kiểm thử hợp lệ cho phiên bản cấu hình.');
  }
  const testedAtParsed = parseStrictIsoTimestamp(test.testedAt);
  if (!testedAtParsed.ok) {
    return fail('MISSING_TEST_EVIDENCE', 'Thời điểm kiểm thử không hợp lệ.');
  }
  if (!Array.isArray(test.samples) || test.samples.length === 0) {
    return fail('MISSING_TEST_EVIDENCE', 'Bằng chứng kiểm thử phải có ít nhất một dữ liệu mẫu.');
  }
  if (!Array.isArray(test.results) || test.results.length !== test.samples.length) {
    return fail('FAILED_TEST_EVIDENCE', 'Kết quả kiểm thử không khớp với số lượng dữ liệu mẫu.');
  }

  const cleanRules = release.rules.map(sanitizeRule);
  if (test.signature !== setSignature(release.rules) && test.signature !== setSignature(cleanRules)) {
    return fail(
      'STALE_TEST_EVIDENCE',
      'Bằng chứng kiểm thử không khớp nội dung bộ quy tắc hiện tại.',
    );
  }

  let labeled = 0;
  const coveredRules = new Set<string>();

  for (let i = 0; i < test.samples.length; i++) {
    const sample = test.samples[i];
    if (
      !isPlainObject(sample) ||
      typeof sample.projectId !== 'string' ||
      !ruleSet.projectIds.includes(sample.projectId) ||
      !enterprise.projectIds.includes(sample.projectId)
    ) {
      return fail(
        'INVALID_RULESET_SCOPE',
        `Dữ liệu mẫu thứ ${i + 1} không thuộc phạm vi dự án của doanh nghiệp.`,
      );
    }

    let normalizedFields: Record<string, string | number | boolean>;
    try {
      normalizedFields = normalizeFields(sample.fields, schema) as Record<
        string,
        string | number | boolean
      >;
    } catch (err) {
      return fail(
        'FAILED_TEST_EVIDENCE',
        `Dữ liệu mẫu thứ ${i + 1} không khớp schema hiện tại: ${(err as Error).message}`,
      );
    }

    const freshEval = evaluateRuleSet(cleanRules, {
      projectId: sample.projectId,
      transactionType: sample.transactionType,
      fields: normalizedFields,
    });
    if (freshEval.status !== 'Complete') {
      return fail(
        'FAILED_TEST_EVIDENCE',
        `Dữ liệu mẫu thứ ${i + 1} không hoàn tất đánh giá toàn bộ quy tắc áp dụng.`,
      );
    }
    const recordedEval = test.results[i];
    if (
      !isPlainObject(recordedEval) ||
      canonicalStringify(normalizeEvalForDigest(recordedEval as RuleSetEvaluation)) !==
        canonicalStringify(normalizeEvalForDigest(freshEval))
    ) {
      return fail(
        'FAILED_TEST_EVIDENCE',
        `Kết quả kiểm thử ghi nhận ở mẫu thứ ${i + 1} không khớp với bộ quy tắc thực tế.`,
      );
    }

    for (const ruleOutcome of freshEval.rules) {
      if (ruleOutcome.outcome !== 'Error') coveredRules.add(ruleOutcome.id);
    }

    if (sample.expected !== undefined) {
      labeled++;
      if (sample.expected !== freshEval.result) {
        return fail(
          'FAILED_TEST_EVIDENCE',
          `Dữ liệu mẫu thứ ${i + 1} sai kết quả mong đợi (kỳ vọng ${sample.expected}, thực tế ${freshEval.result}).`,
        );
      }
    }
  }

  if (!cleanRules.every(r => coveredRules.has(r.id))) {
    return fail(
      'FAILED_TEST_EVIDENCE',
      'Chưa kiểm thử bao phủ tất cả quy tắc trong phiên bản cấu hình.',
    );
  }
  if (test.complete !== true || test.mismatched !== 0 || test.labeled !== labeled) {
    return fail(
      'FAILED_TEST_EVIDENCE',
      'Bằng chứng kiểm thử chưa đạt trạng thái hoàn tất và không sai lệch.',
    );
  }

  const testDigest = computeTestDigest(test);
  if (latestRevisionRequest) {
    const reqParsed = parseStrictIsoTimestamp(latestRevisionRequest.requestedAt);
    if (reqParsed.ok && testedAtParsed.ms < reqParsed.ms) {
      return fail(
        'STALE_TEST_EVIDENCE',
        'Bằng chứng kiểm thử được tạo trước khi SME Admin yêu cầu bổ sung; phải kiểm thử lại bản sửa.',
      );
    }
  }

  return {
    ok: true,
    evidence: {
      signature: test.signature,
      testedAt: testedAtParsed.iso,
      sampleCount: test.samples.length,
      labeled,
      mismatched: 0,
      complete: true,
      testDigest,
      test: structuredClone(test),
    },
  };
}

export function initializeEnterpriseLifecycle(
  input: InitializeEnterpriseLifecycleInput,
): EnterpriseLifecycleResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp hợp lệ để khởi tạo vòng đời.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;
  if (input.actor.role !== 'Platform Admin') {
    return fail('FORBIDDEN_ROLE', 'Chỉ Platform Admin mới được phép khởi tạo vòng đời doanh nghiệp.');
  }
  if (!input.enterprise.deploymentStaffId?.trim()) {
    return fail(
      'MISSING_DEPLOYMENT_STAFF',
      'Doanh nghiệp cần được phân công Implementation Staff trước khi khởi tạo vòng đời.',
    );
  }
  if (input.enterprise.lifecycle) {
    return fail('ALREADY_INITIALIZED', 'Doanh nghiệp đã được khởi tạo vòng đời trước đó.');
  }

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  const plan = resolveEffectivePlan(input.enterprise);
  let subscriptionConfig: SubscriptionDuration | undefined;
  if (input.subscriptionDuration !== undefined) {
    if (plan !== 'Subscription') {
      return fail(
        'PLAN_NOT_SUBSCRIPTION',
        'Chỉ doanh nghiệp thuộc gói Subscription mới được cấu hình thời lượng gói.',
      );
    }
    const durResult = validateSubscriptionDuration(input.subscriptionDuration);
    if (!durResult.ok) return durResult;
    subscriptionConfig = durResult.value;
  }

  const nextEnterprise = structuredClone(input.enterprise);
  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'INITIALIZED',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: null,
    toStatus: 'SettingUp',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(subscriptionConfig ? { duration: structuredClone(subscriptionConfig) } : {}),
  };

  const lifecycle: EnterpriseLifecycle = {
    enterpriseId: nextEnterprise.id,
    status: 'SettingUp',
    initializedAt: timeResult.iso,
    initializedBy: structuredClone(actorResult.ref),
    usedConfigVersions: [],
    ...(subscriptionConfig ? { subscriptionConfig: structuredClone(subscriptionConfig) } : {}),
    approvalHistory: [],
    revisionHistory: [],
    history: [structuredClone(event)],
  };

  nextEnterprise.lifecycle = lifecycle;
  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
  };
}

export function configureEnterpriseSubscriptionDuration(
  input: ConfigureSubscriptionDurationInput,
): EnterpriseLifecycleResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;
  if (input.actor.role !== 'Platform Admin') {
    return fail(
      'FORBIDDEN_ROLE',
      'Chỉ Platform Admin mới được phép cấu hình thời lượng gói Subscription.',
    );
  }
  const current = input.enterprise.lifecycle;
  if (!current) {
    return fail('UNINITIALIZED_LIFECYCLE', 'Doanh nghiệp chưa được khởi tạo vòng đời WF-01.');
  }
  if (current.status === 'Operating' || current.activation || current.subscription) {
    return fail(
      'ALREADY_OPERATING',
      'Không thể thay đổi cấu hình thời lượng gói sau khi doanh nghiệp đã kích hoạt vận hành.',
    );
  }
  if (resolveEffectivePlan(input.enterprise) !== 'Subscription') {
    return fail('PLAN_NOT_SUBSCRIPTION', 'Doanh nghiệp không sử dụng gói Subscription.');
  }
  const durResult = validateSubscriptionDuration(input.duration);
  if (!durResult.ok) return durResult;

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  const nextEnterprise = structuredClone(input.enterprise);
  const nextLifecycle = nextEnterprise.lifecycle!;
  nextLifecycle.subscriptionConfig = structuredClone(durResult.value);

  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'SUBSCRIPTION_CONFIGURED',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: current.status,
    toStatus: current.status,
    duration: structuredClone(durResult.value),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  nextLifecycle.history = [...nextLifecycle.history, structuredClone(event)];

  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
  };
}

export function submitEnterpriseConfigForApproval(
  input: SubmitEnterpriseConfigInput,
): EnterpriseLifecycleResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;

  if (input.actor.role !== 'Implementation Staff') {
    return fail(
      'FORBIDDEN_ROLE',
      'Chỉ Implementation Staff được phân công mới được phép gửi duyệt cấu hình.',
    );
  }
  if (
    !input.enterprise.deploymentStaffId?.trim() ||
    input.actor.id.trim() !== input.enterprise.deploymentStaffId.trim()
  ) {
    return fail(
      'FORBIDDEN_STAFF',
      'Chỉ Implementation Staff được phân công phụ trách doanh nghiệp mới được phép gửi duyệt.',
    );
  }

  const current = input.enterprise.lifecycle;
  if (!current) {
    return fail('UNINITIALIZED_LIFECYCLE', 'Doanh nghiệp chưa được khởi tạo vòng đời WF-01.');
  }
  if (current.status !== 'SettingUp') {
    return fail(
      'INVALID_STATE',
      `Chỉ được gửi duyệt khi doanh nghiệp đang ở trạng thái SettingUp (hiện tại: ${current.status}).`,
    );
  }
  if (!Array.isArray(input.enterprise.projectIds) || input.enterprise.projectIds.length === 0) {
    return fail(
      'MISSING_PROJECT_SCOPE',
      'Doanh nghiệp chưa có phạm vi dự án triển khai (projectIds).',
    );
  }

  const cleanVersion = typeof input.configVersion === 'string' ? input.configVersion.trim() : '';
  if (!cleanVersion) {
    return fail('MISSING_CONFIG_VERSION', 'Phải cung cấp định danh phiên bản cấu hình gửi duyệt.');
  }
  if (current.usedConfigVersions.includes(cleanVersion)) {
    return fail(
      'DUPLICATE_CONFIG_VERSION',
      `Phiên bản cấu hình '${cleanVersion}' đã được sử dụng trong lần gửi trước đó; cần định danh phiên bản mới.`,
    );
  }

  if (!isPlainObject(input.ruleSet)) {
    return fail('RULESET_NOT_FOUND', 'Thiếu bộ quy tắc của doanh nghiệp.');
  }
  if (input.ruleSet.enterpriseId !== input.enterprise.id) {
    return fail(
      'INVALID_RULESET_SCOPE',
      'Bộ quy tắc không thuộc doanh nghiệp đang xử lý.',
    );
  }
  if (
    !Array.isArray(input.ruleSet.projectIds) ||
    input.ruleSet.projectIds.length === 0 ||
    input.ruleSet.projectIds.some(p => !input.enterprise.projectIds.includes(p))
  ) {
    return fail(
      'INVALID_RULESET_SCOPE',
      'Phạm vi dự án của bộ quy tắc không khớp doanh nghiệp.',
    );
  }

  const release = input.ruleSet.versions?.find(v => v.version === input.ruleSetVersion);
  if (!release) {
    return fail(
      'RELEASE_NOT_FOUND',
      `Không tìm thấy phiên bản ${String(input.ruleSetVersion)} trong bộ quy tắc đã chọn.`,
    );
  }

  const releaseSchema = release.schema ? sanitizeSchema(release.schema) : undefined;
  const effectiveSchema = input.schema ? sanitizeSchema(input.schema) : releaseSchema ?? [];
  const schemaOverridden = Boolean(
    input.schema &&
      releaseSchema &&
      canonicalStringify(sanitizeSchema(input.schema)) !== canonicalStringify(releaseSchema),
  );

  const testResult = verifySubmissionTestEvidence({
    enterprise: input.enterprise,
    ruleSet: input.ruleSet,
    release,
    schema: effectiveSchema,
    test: input.test ?? release.test,
    schemaOverridden,
    hasExplicitTest: input.test !== undefined,
    latestRevisionRequest: current.latestRevisionRequest,
  });
  if (!testResult.ok) return testResult;

  if (current.latestRevisionRequest) {
    if (
      testResult.evidence.testedAt === current.latestRevisionRequest.targetTestedAt &&
      testResult.evidence.testDigest === current.latestRevisionRequest.targetTestDigest
    ) {
      return fail(
        'STALE_TEST_EVIDENCE',
        'Bằng chứng kiểm thử trùng với bản đã bị yêu cầu bổ sung; phải kiểm thử lại sau khi chỉnh sửa.',
      );
    }
  }

  if (
    !Array.isArray(release.schema) ||
    release.schema.length === 0 ||
    canonicalStringify(sanitizeSchema(release.schema)) !== canonicalStringify(effectiveSchema)
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Schema truyền vào không khớp với schema của phiên bản phát hành trong bộ quy tắc; cần phát hành phiên bản bộ quy tắc mới trước khi gửi duyệt.',
    );
  }

  const releaseTestTime = isPlainObject(release.test)
    ? parseStrictIsoTimestamp(release.test.testedAt)
    : { ok: false as const };
  if (
    !isPlainObject(release.test) ||
    !releaseTestTime.ok ||
    releaseTestTime.iso !== testResult.evidence.testedAt ||
    computeTestDigest(release.test) !== testResult.evidence.testDigest
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Bằng chứng kiểm thử truyền vào không khớp với phiên bản phát hành trong bộ quy tắc; cần phát hành phiên bản bộ quy tắc mới trước khi gửi duyệt.',
    );
  }

  if (
    current.revisionHistory.some(
      rev =>
        rev.targetRuleSetId === input.ruleSet.id && rev.targetRuleSetVersion === release.version,
    ) ||
    current.approvalHistory.some(
      appr => appr.ruleSetId === input.ruleSet.id && appr.ruleSetVersion === release.version,
    )
  ) {
    return fail(
      'CONFIG_CONTENT_MISMATCH',
      'Không được ghi đè hoặc gửi lại cùng số version của phiên bản bộ quy tắc đã qua duyệt/yêu cầu bổ sung; cần phát hành phiên bản bộ quy tắc mới.',
    );
  }

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  const submissionId = nextId(input.submissionId, 'sub');
  const cleanRules = release.rules.map(sanitizeRule);
  const projectIds = [...input.ruleSet.projectIds];
  const contentHash = computeConfigContentHash({
    enterpriseId: input.enterprise.id,
    configVersion: cleanVersion,
    ruleSetId: input.ruleSet.id,
    ruleSetName: input.ruleSet.name,
    ruleSetVersion: release.version,
    projectIds,
    rules: cleanRules,
    schema: effectiveSchema,
  });

  const specVersion =
    input.enterprise.specification?.confirmedSnapshot?.version ??
    input.enterprise.specification?.sentSnapshot?.version;

  const snapshot: EnterpriseConfigSnapshot = {
    submissionId,
    enterpriseId: input.enterprise.id,
    configVersion: cleanVersion,
    ruleSetId: input.ruleSet.id,
    ruleSetName: input.ruleSet.name,
    ruleSetVersion: release.version,
    projectIds,
    rules: structuredClone(cleanRules),
    schema: structuredClone(effectiveSchema),
    testEvidence: structuredClone(testResult.evidence),
    internalReview: {
      reviewer: release.reviewer,
      reviewNote: release.reviewNote,
      publishedAt: release.publishedAt,
    },
    submittedAt: timeResult.iso,
    submittedBy: structuredClone(actorResult.ref),
    ...(specVersion ? { specificationVersion: specVersion } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    contentHash,
  };

  const nextEnterprise = structuredClone(input.enterprise);
  const nextLifecycle = nextEnterprise.lifecycle!;
  nextLifecycle.status = 'PendingPlatformApproval';
  nextLifecycle.pendingSubmission = structuredClone(snapshot);
  nextLifecycle.approvedConfig = undefined;
  nextLifecycle.usedConfigVersions = [...nextLifecycle.usedConfigVersions, cleanVersion];

  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'SUBMITTED_FOR_APPROVAL',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: 'SettingUp',
    toStatus: 'PendingPlatformApproval',
    submissionId,
    configVersion: cleanVersion,
    contentHash,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  nextLifecycle.history = [...nextLifecycle.history, structuredClone(event)];

  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
  };
}

export function approveEnterpriseConfig(
  input: ApproveEnterpriseConfigInput,
): EnterpriseLifecycleResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;

  if (input.actor.role !== 'Platform Admin') {
    return fail(
      'FORBIDDEN_ROLE',
      'Chỉ Platform Admin mới được phép phê duyệt cấu hình doanh nghiệp.',
    );
  }

  const current = input.enterprise.lifecycle;
  if (!current) {
    return fail('UNINITIALIZED_LIFECYCLE', 'Doanh nghiệp chưa được khởi tạo vòng đời WF-01.');
  }
  if (current.status !== 'PendingPlatformApproval' || !current.pendingSubmission) {
    return fail(
      'INVALID_STATE',
      `Không thể duyệt khi doanh nghiệp không ở trạng thái PendingPlatformApproval (hiện tại: ${current.status}).`,
    );
  }

  const pending = current.pendingSubmission;
  const lockError = verifySnapshotLock(input.enterprise, pending, {
    configVersion: input.configVersion,
    submissionId: input.submissionId,
    contentHash: input.contentHash,
    ruleSet: input.ruleSet,
    ruleSets: input.ruleSets,
    schema: input.schema,
  });
  if (lockError) return lockError;

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  const approval: PlatformApprovalRecord = {
    approvalId: nextId(input.approvalId, 'appr'),
    approvedAt: timeResult.iso,
    approvedBy: structuredClone(actorResult.ref),
    submissionId: pending.submissionId,
    configVersion: pending.configVersion,
    ruleSetId: pending.ruleSetId,
    ruleSetVersion: pending.ruleSetVersion,
    contentHash: pending.contentHash,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  const nextEnterprise = structuredClone(input.enterprise);
  const nextLifecycle = nextEnterprise.lifecycle!;
  nextLifecycle.status = 'PendingSMEActivation';
  nextLifecycle.approvedConfig = structuredClone(pending);
  nextLifecycle.pendingSubmission = undefined;
  nextLifecycle.approvalHistory = [...nextLifecycle.approvalHistory, structuredClone(approval)];

  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'PLATFORM_APPROVED',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: 'PendingPlatformApproval',
    toStatus: 'PendingSMEActivation',
    submissionId: pending.submissionId,
    configVersion: pending.configVersion,
    contentHash: pending.contentHash,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  nextLifecycle.history = [...nextLifecycle.history, structuredClone(event)];

  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
  };
}

export function requestEnterpriseRevision(
  input: RequestEnterpriseRevisionInput,
): EnterpriseLifecycleResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;

  if (input.actor.role !== 'SME Admin') {
    return fail(
      'FORBIDDEN_ROLE',
      'Chỉ SME Admin của doanh nghiệp mới được phép yêu cầu bổ sung trước kích hoạt.',
    );
  }
  if (!input.actor.enterpriseId?.trim() || input.actor.enterpriseId.trim() !== input.enterprise.id) {
    return fail(
      'FORBIDDEN_TENANT',
      'SME Admin không thuộc doanh nghiệp này nên không có quyền yêu cầu bổ sung.',
    );
  }

  const current = input.enterprise.lifecycle;
  if (!current) {
    return fail('UNINITIALIZED_LIFECYCLE', 'Doanh nghiệp chưa được khởi tạo vòng đời WF-01.');
  }
  if (current.status === 'Operating' || current.activation) {
    return fail(
      'ALREADY_OPERATING',
      'Doanh nghiệp đã kích hoạt vận hành; không thể yêu cầu bổ sung theo nhánh WF-01.',
    );
  }
  if (current.status !== 'PendingSMEActivation' || !current.approvedConfig) {
    return fail(
      'INVALID_STATE',
      `Chỉ được yêu cầu bổ sung ở trạng thái PendingSMEActivation (hiện tại: ${current.status}).`,
    );
  }

  const cleanReason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!cleanReason) {
    return fail('MISSING_REASON', 'Vui lòng nhập lý do yêu cầu bổ sung trước khi gửi.');
  }

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  const approved = current.approvedConfig;
  const revisionRecord: SMERevisionRequestRecord = {
    requestId: nextId(input.requestId, 'rev'),
    requestedAt: timeResult.iso,
    requestedBy: structuredClone(actorResult.ref),
    reason: cleanReason,
    targetSubmissionId: approved.submissionId,
    targetConfigVersion: approved.configVersion,
    targetRuleSetId: approved.ruleSetId,
    targetRuleSetVersion: approved.ruleSetVersion,
    targetContentHash: approved.contentHash,
    targetTestedAt: approved.testEvidence.testedAt,
    targetTestDigest: approved.testEvidence.testDigest,
  };

  const nextEnterprise = structuredClone(input.enterprise);
  const nextLifecycle = nextEnterprise.lifecycle!;
  nextLifecycle.status = 'SettingUp';
  nextLifecycle.approvedConfig = undefined;
  nextLifecycle.pendingSubmission = undefined;
  nextLifecycle.latestRevisionRequest = structuredClone(revisionRecord);
  nextLifecycle.revisionHistory = [...nextLifecycle.revisionHistory, structuredClone(revisionRecord)];

  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'REVISION_REQUESTED',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: 'PendingSMEActivation',
    toStatus: 'SettingUp',
    submissionId: approved.submissionId,
    configVersion: approved.configVersion,
    contentHash: approved.contentHash,
    reason: cleanReason,
  };
  nextLifecycle.history = [...nextLifecycle.history, structuredClone(event)];

  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
  };
}

export function activateEnterprise(input: ActivateEnterpriseInput): ActivateEnterpriseResult {
  if (!isValidEnterpriseInput(input?.enterprise)) {
    return fail('ENTERPRISE_NOT_FOUND', 'Không tìm thấy doanh nghiệp.');
  }
  const actorResult = validateActor(input.actor);
  if (!actorResult.ok) return actorResult;

  if (input.actor.role !== 'SME Admin') {
    return fail(
      'FORBIDDEN_ROLE',
      'Chỉ SME Admin của doanh nghiệp mới được phép xác nhận bàn giao và kích hoạt.',
    );
  }
  if (!input.actor.enterpriseId?.trim() || input.actor.enterpriseId.trim() !== input.enterprise.id) {
    return fail(
      'FORBIDDEN_TENANT',
      'SME Admin không thuộc doanh nghiệp này nên không có quyền kích hoạt.',
    );
  }

  const current = input.enterprise.lifecycle;
  if (!current) {
    return fail('UNINITIALIZED_LIFECYCLE', 'Doanh nghiệp chưa được khởi tạo vòng đời WF-01.');
  }
  if (current.status === 'Operating' || current.activation) {
    return fail(
      'ALREADY_OPERATING',
      'Doanh nghiệp đã được kích hoạt trước đó; thao tác lặp không đặt lại hoặc gia hạn kỳ Subscription.',
    );
  }
  if (current.status !== 'PendingSMEActivation' || !current.approvedConfig) {
    return fail(
      'INVALID_STATE',
      `Doanh nghiệp phải ở trạng thái PendingSMEActivation và có cấu hình đã được Platform Admin duyệt (hiện tại: ${current.status}).`,
    );
  }

  const approved = current.approvedConfig;
  const matchingApproval = current.approvalHistory.find(
    a =>
      a.submissionId === approved.submissionId &&
      a.configVersion === approved.configVersion &&
      a.contentHash === approved.contentHash,
  );
  if (!matchingApproval) {
    return fail(
      'INVALID_STATE',
      'Không tìm thấy lịch sử phê duyệt hợp lệ của Platform Admin cho phiên bản cấu hình hiện tại.',
    );
  }

  const lockError = verifySnapshotLock(input.enterprise, approved, {
    configVersion: input.configVersion,
    submissionId: input.submissionId,
    contentHash: input.contentHash,
    ruleSet: input.ruleSet,
    ruleSets: input.ruleSets,
    schema: input.schema,
  });
  if (lockError) return lockError;

  const plan = resolveEffectivePlan(input.enterprise);
  if (!plan) {
    return fail(
      'MISSING_SERVICE_PLAN',
      'Doanh nghiệp chưa được cấu hình gói dịch vụ (Free hoặc Subscription).',
    );
  }

  const timeResult = resolveEventTimestamp(input.at);
  if (!timeResult.ok) return timeResult;

  let subscriptionConfig: SubscriptionDuration | undefined = current.subscriptionConfig
    ? structuredClone(current.subscriptionConfig)
    : undefined;
  let subscription: EnterpriseSubscriptionRecord | undefined;

  if (plan === 'Subscription') {
    if (
      current.subscriptionConfig &&
      input.subscriptionDuration &&
      !durationsEqual(current.subscriptionConfig, input.subscriptionDuration)
    ) {
      return fail(
        'SUBSCRIPTION_CONFIG_MISMATCH',
        'Thời lượng Subscription truyền vào khác với cấu hình đã thiết lập cho doanh nghiệp.',
      );
    }
    const candidateDuration = current.subscriptionConfig ?? input.subscriptionDuration;
    const durResult = validateSubscriptionDuration(candidateDuration);
    if (!durResult.ok) return durResult;

    subscriptionConfig = structuredClone(durResult.value);
    subscription = {
      duration: structuredClone(durResult.value),
      startedAt: timeResult.iso,
      expiresAt: addSubscriptionDurationUtc(timeResult.iso, durResult.value),
    };
  }

  const activationRecord: EnterpriseActivationRecord = {
    activatedAt: timeResult.iso,
    activatedBy: structuredClone(actorResult.ref),
    submissionId: approved.submissionId,
    configVersion: approved.configVersion,
    contentHash: approved.contentHash,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  const nextEnterprise = structuredClone(input.enterprise);
  const nextLifecycle = nextEnterprise.lifecycle!;
  nextLifecycle.status = 'Operating';
  nextLifecycle.activatedConfig = structuredClone(approved);
  nextLifecycle.approvedConfig = undefined;
  nextLifecycle.activation = structuredClone(activationRecord);
  if (subscriptionConfig) nextLifecycle.subscriptionConfig = structuredClone(subscriptionConfig);
  if (subscription) nextLifecycle.subscription = structuredClone(subscription);

  const event: EnterpriseLifecycleEvent = {
    id: nextId(input.eventId, 'evt'),
    type: 'SME_ACTIVATED',
    at: timeResult.iso,
    actor: structuredClone(actorResult.ref),
    fromStatus: 'PendingSMEActivation',
    toStatus: 'Operating',
    submissionId: approved.submissionId,
    configVersion: approved.configVersion,
    contentHash: approved.contentHash,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(subscription ? { duration: structuredClone(subscription.duration) } : {}),
  };
  nextLifecycle.history = [...nextLifecycle.history, structuredClone(event)];

  const activationCommand: EnterpriseRuleSetActivationCommand = {
    enterpriseId: nextEnterprise.id,
    submissionId: approved.submissionId,
    ruleSetId: approved.ruleSetId,
    ruleSetName: approved.ruleSetName,
    activeVersion: approved.ruleSetVersion,
    configVersion: approved.configVersion,
    projectIds: structuredClone(approved.projectIds),
    rules: structuredClone(approved.rules),
    schema: structuredClone(approved.schema),
    testEvidence: structuredClone(approved.testEvidence),
    contentHash: approved.contentHash,
    activatedAt: timeResult.iso,
    activatedBy: structuredClone(actorResult.ref),
  };

  let nextRuleSets: ManagedRuleSet[] | undefined;
  if (input.ruleSets !== undefined) {
    const applied = applyEnterpriseActivationCommand(input.ruleSets, activationCommand);
    if (!applied.ok) return applied;
    nextRuleSets = applied.ruleSets;
  }

  return {
    ok: true,
    enterprise: structuredClone(nextEnterprise),
    event: structuredClone(event),
    activationCommand: structuredClone(activationCommand),
    ...(nextRuleSets ? { ruleSets: nextRuleSets } : {}),
  };
}

export function applyEnterpriseActivationCommand(
  ruleSets: ManagedRuleSet[],
  command: EnterpriseRuleSetActivationCommand,
): ApplyEnterpriseActivationCommandResult {
  if (!isPlainObject(command) || typeof command.enterpriseId !== 'string' || !command.enterpriseId.trim()) {
    return fail('SNAPSHOT_TAMPERED', 'Command kích hoạt doanh nghiệp không hợp lệ.');
  }
  const timeParsed = parseStrictIsoTimestamp(command.activatedAt);
  if (!timeParsed.ok) {
    return fail('INVALID_TIMESTAMP', 'Thời điểm kích hoạt trong command không hợp lệ.');
  }
  if (!isPlainObject(command.activatedBy) || typeof command.activatedBy.id !== 'string' || !command.activatedBy.id.trim()) {
    return fail('INVALID_ACTOR', 'Thông tin người kích hoạt trong command không hợp lệ.');
  }

  const syntheticSnapshot: EnterpriseConfigSnapshot = {
    submissionId: command.submissionId,
    enterpriseId: command.enterpriseId,
    configVersion: command.configVersion,
    ruleSetId: command.ruleSetId,
    ruleSetName: command.ruleSetName,
    ruleSetVersion: command.activeVersion,
    projectIds: command.projectIds,
    rules: command.rules,
    schema: command.schema,
    testEvidence: command.testEvidence,
    internalReview: {
      reviewer: '',
      reviewNote: '',
      publishedAt: command.activatedAt,
    },
    submittedAt: command.activatedAt,
    submittedBy: command.activatedBy,
    contentHash: command.contentHash,
  };

  const integrityError = verifySnapshotIntegrity(syntheticSnapshot, command.enterpriseId);
  if (integrityError) return integrityError;

  const targetResult = resolveTargetFromRuleSets(command.enterpriseId, syntheticSnapshot, ruleSets);
  if (!targetResult.ok) return targetResult;

  const nextRuleSets = structuredClone(ruleSets).map(set => {
    if (set.enterpriseId !== command.enterpriseId) return set;
    if (set.id !== command.ruleSetId) {
      return { ...set, activeVersion: undefined };
    }
    return {
      ...set,
      activeVersion: command.activeVersion,
      handover: {
        version: command.activeVersion,
        by: command.activatedBy.name?.trim() ? command.activatedBy.name.trim() : command.activatedBy.id.trim(),
        at: timeParsed.iso,
      },
    };
  });

  const activatedSet = nextRuleSets.find(
    s => s.enterpriseId === command.enterpriseId && s.id === command.ruleSetId,
  )!;
  const activeRelease = activatedSet.versions.find(v => v.version === activatedSet.activeVersion)!;

  return {
    ok: true,
    ruleSets: structuredClone(nextRuleSets),
    activeRelease: structuredClone(activeRelease),
  };
}

export function enterpriseLifecycleReducer(
  enterprise: Enterprise,
  command: EnterpriseLifecycleCommand,
): EnterpriseLifecycleResult | ActivateEnterpriseResult {
  switch (command.type) {
    case 'INITIALIZE':
      return initializeEnterpriseLifecycle({ ...command, enterprise });
    case 'CONFIGURE_SUBSCRIPTION':
      return configureEnterpriseSubscriptionDuration({ ...command, enterprise });
    case 'SUBMIT_CONFIG':
      return submitEnterpriseConfigForApproval({ ...command, enterprise });
    case 'APPROVE_CONFIG':
      return approveEnterpriseConfig({ ...command, enterprise });
    case 'REQUEST_REVISION':
      return requestEnterpriseRevision({ ...command, enterprise });
    case 'ACTIVATE':
      return activateEnterprise({ ...command, enterprise });
  }
}

export function resolveEnterpriseLifecycle(
  enterprise: Enterprise | undefined,
): ResolvedEnterpriseLifecycle {
  if (!enterprise || !enterprise.lifecycle) {
    return {
      initialized: false,
      isLegacy: true,
      status: null,
      isOperating: false,
    };
  }
  const operating = isEnterpriseOperating(enterprise);
  return {
    initialized: true,
    isLegacy: false,
    status: enterprise.lifecycle.status,
    isOperating: operating,
    lifecycle: structuredClone(enterprise.lifecycle),
  };
}

export function isEnterpriseOperating(enterprise: Enterprise | undefined): boolean {
  const lifecycle = enterprise?.lifecycle;
  if (!enterprise || !lifecycle) return false;
  if (lifecycle.status !== 'Operating') return false;
  if (!lifecycle.activation?.activatedAt || !lifecycle.activatedConfig) return false;
  if (verifySnapshotIntegrity(lifecycle.activatedConfig, enterprise.id) !== null) return false;
  return (
    lifecycle.activation.submissionId === lifecycle.activatedConfig.submissionId &&
    lifecycle.activation.configVersion === lifecycle.activatedConfig.configVersion &&
    lifecycle.activation.contentHash === lifecycle.activatedConfig.contentHash
  );
}

/**
 * Checks whether an enterprise holds an active Subscription at `at` (defaulting to current UTC time).
 * Uses half-open interval `[startedAt, expiresAt)`: valid before `expiresAt`, expired at and after `expiresAt`.
 */
export function isEnterpriseSubscriptionActive(
  enterprise: Enterprise | undefined,
  at?: string,
): boolean {
  if (!isEnterpriseOperating(enterprise)) return false;
  if (!enterprise || resolveEffectivePlan(enterprise) !== 'Subscription') return false;
  const sub = enterprise.lifecycle?.subscription;
  if (!sub) return false;

  const startParsed = parseStrictIsoTimestamp(sub.startedAt);
  const endParsed = parseStrictIsoTimestamp(sub.expiresAt);
  const atParsed = parseStrictIsoTimestamp(at === undefined ? new Date().toISOString() : at);
  if (!startParsed.ok || !endParsed.ok || !atParsed.ok) return false;

  return atParsed.ms >= startParsed.ms && atParsed.ms < endParsed.ms;
}

export function checkEnterpriseOperationalEligibility(
  enterprise: Enterprise | undefined,
  options?: { at?: string; requireSubscription?: boolean },
): EnterpriseOperationalEligibility {
  if (!enterprise) {
    return {
      eligible: false,
      initialized: false,
      isLegacy: true,
      status: null,
      isOperating: false,
      subscriptionActive: false,
      reasonCode: 'ENTERPRISE_NOT_FOUND',
      reason: 'Không tìm thấy hồ sơ doanh nghiệp.',
    };
  }

  const plan = resolveEffectivePlan(enterprise);
  const resolved = resolveEnterpriseLifecycle(enterprise);
  if (!resolved.initialized) {
    return {
      eligible: false,
      initialized: false,
      isLegacy: true,
      status: null,
      plan,
      isOperating: false,
      subscriptionActive: false,
      reasonCode: 'UNINITIALIZED_LEGACY',
      reason: 'Hồ sơ doanh nghiệp chưa khởi tạo vòng đời WF-01 (legacy/uninitialized).',
    };
  }

  if (!resolved.isOperating) {
    return {
      eligible: false,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: false,
      subscriptionActive: false,
      reasonCode: 'NOT_OPERATING',
      reason: `Doanh nghiệp chưa ở trạng thái vận hành (hiện tại: ${resolved.status}).`,
    };
  }

  if (!plan) {
    return {
      eligible: false,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      isOperating: true,
      subscriptionActive: false,
      reasonCode: 'MISSING_SERVICE_PLAN',
      reason: 'Doanh nghiệp chưa có gói dịch vụ hợp lệ.',
    };
  }

  const requireSubscription = options?.requireSubscription === true;
  if (plan !== 'Subscription') {
    return {
      eligible: !requireSubscription,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: true,
      subscriptionActive: false,
      ...(requireSubscription
        ? {
            reasonCode: 'PLAN_NOT_SUBSCRIPTION' as const,
            reason: 'Chức năng yêu cầu gói Subscription đang hoạt động.',
          }
        : {}),
    };
  }

  const sub = enterprise.lifecycle?.subscription;
  const atStr = options?.at === undefined ? new Date().toISOString() : options.at;
  const atParsed = parseStrictIsoTimestamp(atStr);
  if (!atParsed.ok) {
    return {
      eligible: false,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: true,
      subscriptionActive: false,
      reasonCode: 'INVALID_TIMESTAMP',
      reason: 'Thời điểm kiểm tra không hợp lệ.',
    };
  }

  const startParsed = sub ? parseStrictIsoTimestamp(sub.startedAt) : { ok: false as const };
  const endParsed = sub ? parseStrictIsoTimestamp(sub.expiresAt) : { ok: false as const };
  if (!startParsed.ok || !endParsed.ok) {
    return {
      eligible: !requireSubscription,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: true,
      subscriptionActive: false,
      ...(requireSubscription
        ? {
            reasonCode: 'SUBSCRIPTION_NOT_STARTED' as const,
            reason: 'Kỳ Subscription của doanh nghiệp chưa hợp lệ hoặc chưa bắt đầu.',
          }
        : {}),
    };
  }

  if (atParsed.ms < startParsed.ms) {
    return {
      eligible: !requireSubscription,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: true,
      subscriptionActive: false,
      ...(requireSubscription
        ? {
            reasonCode: 'SUBSCRIPTION_NOT_STARTED' as const,
            reason: 'Chưa tới thời điểm bắt đầu kỳ Subscription.',
          }
        : {}),
    };
  }

  if (atParsed.ms >= endParsed.ms) {
    return {
      eligible: !requireSubscription,
      initialized: true,
      isLegacy: false,
      status: resolved.status,
      plan,
      isOperating: true,
      subscriptionActive: false,
      ...(requireSubscription
        ? {
            reasonCode: 'SUBSCRIPTION_EXPIRED' as const,
            reason: 'Gói Subscription của doanh nghiệp đã hết hạn.',
          }
        : {}),
    };
  }

  return {
    eligible: true,
    initialized: true,
    isLegacy: false,
    status: resolved.status,
    plan,
    isOperating: true,
    subscriptionActive: true,
  };
}
