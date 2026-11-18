# Báo cáo triển khai WF-01 Phase 1 (Domain Model, State Machine & Unit Tests - Cập nhật sau Review)

Ngày báo cáo: 11/11/2026  
Phạm vi: `frontend/LCS` (chỉ lớp domain thuần và unit test, chưa nối UI/hooks/`localStorage`).  
Nhánh làm việc: `feat/FE-DashboardPage`.

---

## 1. Danh sách file thêm mới / chỉnh sửa và mục đích

| Đường dẫn (`frontend/LCS/...`) | Hành động | Mục đích |
|---|---|---|
| `src/types/enterprise-lifecycle.ts` | Thêm mới & cập nhật | Định nghĩa trạng thái vòng đời WF-01 (`EnterpriseLifecycleStatus`), mã lỗi (`EnterpriseLifecycleErrorCode`), cấu trúc snapshot bất biến (`EnterpriseConfigSnapshot`), bản ghi duyệt/bổ sung/kích hoạt (`PlatformApprovalRecord`, `SMERevisionRequestRecord` kèm `targetRuleSetId` và `targetRuleSetVersion`), nhật ký sự kiện (`EnterpriseLifecycleEvent`), cấu hình/kỳ `Subscription`, command kích hoạt đầy đủ (`EnterpriseRuleSetActivationCommand`), kiểu trả về `ApplyEnterpriseActivationCommandResult`, và kiểu đánh giá điều kiện vận hành. |
| `src/types/enterprise.ts` | Chỉnh sửa tối thiểu | Thêm type-only import `EnterpriseLifecycle` và thuộc tính tùy chọn `lifecycle?: EnterpriseLifecycle;` trên `Enterprise` để tương thích ngược hoàn toàn với dữ liệu legacy (`demoEnterprises`) mà không phá chữ ký cũ. |
| `src/utils/enterprise-lifecycle.ts` | Thêm mới & sửa lỗi P1 | Triển khai hàm chuyển trạng thái thuần và bất biến (`initializeEnterpriseLifecycle`, `configureEnterpriseSubscriptionDuration`, `submitEnterpriseConfigForApproval`, `approveEnterpriseConfig`, `requestEnterpriseRevision`, `activateEnterprise`, `applyEnterpriseActivationCommand`, `enterpriseLifecycleReducer`), hàm SHA-256 chuẩn FIPS 180-4 thuần JS (`sha256Hex`), parser ISO-8601 bắt buộc múi giờ (`parseStrictIsoTimestamp`), tính kỳ UTC `addSubscriptionDurationUtc`, kiểm chứng độc lập bằng chứng `SetTest`, và các helper đọc trạng thái/kiểm tra điều kiện vận hành (`resolveEnterpriseLifecycle`, `isEnterpriseOperating`, `isEnterpriseSubscriptionActive`, `checkEnterpriseOperationalEligibility`). |
| `tests/enterprise-lifecycle.test.cjs` | Thêm mới & bổ sung regression test | 11 subtest bao phủ toàn bộ 13 kịch bản WF-01 Phase 1 cùng 9 kịch bản regression P1 sau review (chữ ký SHA-256 & ISO timezone, luồng hợp lệ, phân quyền actor/tenant, chặn sai thứ tự, chặn thiếu/sai/giả mạo/không phủ rule trong `SetTest`, khóa snapshot/contentHash khi giữ nguyên số version, yêu cầu bổ sung và chỉnh sửa riêng schema qua release mới, chặn mâu thuẫn `ruleSet`/`ruleSets`, chặn dùng `input.schema` che giấu release cũ, kiểm chứng `normalizeFields` trên release vận hành và đường command-only qua `applyEnterpriseActivationCommand`, bất biến input/output, tương thích bản ghi legacy). |
| `docs/task.md` | Chỉnh sửa bảo thủ | Đánh dấu `[x]` mục tách rõ trạng thái đặc tả / duyệt cấu hình / vận hành doanh nghiệp ở Phần 3 và bổ sung ghi nhận mốc Phase 1 + đợt sửa lỗi P1 tại Phần 11; giữ nguyên `[ ]` toàn bộ checkbox nối UI/luồng Bước 2 và các mục còn lại. |
| `docs/wf01-phase1-report.md` | Cập nhật | Tài liệu bàn giao Phase 1 và kết quả khắc phục 2 lỗi P1 sau review trước khi sang Phase 2 nối UI. |

Các ràng buộc giữ nguyên được tuân thủ:
- `src/services/` giữ nguyên chỉ có `.gitkeep`, không thêm mock service hay fake API.
- Không sửa các file UI (`.tsx`, `.css`), `translations.ts`, `useOnboardingWorkflow.ts`, `src/utils/enterprise.ts`, `src/utils/rule-set-lifecycle.ts`, hoặc `OnboardingStage`.
- Không thêm dependency npm mới.

---

## 2. Phân tích nguyên nhân và cách sửa 2 lỗi P1 sau Review

### 2.1. Lỗi P1 #1: Kiểm tra một `ruleSet` nhưng kích hoạt một danh sách `ruleSets` khác

- **Nguyên nhân:**
  - Trong bản trước, `verifyLiveCandidateAgainstSnapshot` viết `let targetRuleSet = candidate.ruleSet; if (!targetRuleSet && Array.isArray(candidate.ruleSets)) ...`, tức là khi caller truyền đồng thời `ruleSet` hợp lệ và `ruleSets` bị sửa ngưỡng/thiếu target/trùng target/sai tenant, hàm chỉ kiểm tra `candidate.ruleSet` rồi bỏ qua hoàn toàn việc kiểm tra `candidate.ruleSets`.
  - Sau đó `activateEnterprise` lại cập nhật `activeVersion` trực tiếp trên `input.ruleSets` và trả về danh sách chưa được kiểm chứng.
- **Cách sửa (`src/utils/enterprise-lifecycle.ts`):**
  1. Tách rõ `verifySingleRuleSetAgainstSnapshot` (kiểm tra một `ManagedRuleSet` với `snapshot`) và `resolveTargetFromRuleSets` (kiểm tra toàn bộ mảng `ruleSets`).
  2. Trong `resolveTargetFromRuleSets(enterpriseId, snapshot, ruleSets)`:
     - Kiểm tra `Array.isArray(ruleSets)` và mọi phần tử đều có `id`, `enterpriseId` hợp lệ (`INVALID_RULESET_SCOPE`).
     - Chặn trùng target (`matchingById.length > 1`) hoặc trùng `id` trong phạm vi doanh nghiệp (`INVALID_RULESET_SCOPE`).
     - Chặn thiếu target (`matchingById.length === 0`, kể cả `ruleSets: []` -> `RULESET_NOT_FOUND`).
     - Chặn target thuộc tenant khác (`candidateTarget.enterpriseId !== enterpriseId` -> `FORBIDDEN_TENANT`).
     - Kiểm chứng phần tử target trong danh sách bằng `verifySingleRuleSetAgainstSnapshot` (bắt buộc có đúng 1 release `version === snapshot.ruleSetVersion`, khớp `projectIds`, `rules`, `schema`, `contentHash` và `testEvidence`).
  3. **Quy ước khi truyền đồng thời `ruleSet` và `ruleSets`:**
     - Không tham số nào được bỏ qua kiểm tra của tham số kia: cả `candidate.ruleSet` và phần tử target trong `candidate.ruleSets` đều phải vượt qua `verifySingleRuleSetAgainstSnapshot`, đồng thời `canonicalStringify(verifiedRuleSet.targetRuleSet)` phải khớp chính xác `canonicalStringify(verifiedFromList.targetRuleSet)` (nếu lệch trả `CONFIG_CONTENT_MISMATCH`).
     - Khi `input.ruleSets` được truyền vào `activateEnterprise`, danh sách cập nhật trả về được tạo qua chính `applyEnterpriseActivationCommand(input.ruleSets, activationCommand)`, chỉ đổi `activeVersion`/`handover` cho đúng enterprise đang kích hoạt và giữ nguyên hoàn toàn các enterprise khác.

### 2.2. Lỗi P1 #2: Schema duyệt mới nhưng release vận hành vẫn dùng schema cũ

- **Nguyên nhân:**
  - Luồng vận hành hiện hữu trong `FraudGuardDashboard.tsx` (`importPreview`, `RuleTestingView`, `ProjectsView`) đọc trực tiếp `set.versions.find(v => v.version === set.activeVersion)?.schema` và `.rules`.
  - Ở bản trước, `submitEnterpriseConfigForApproval` cho phép truyền `input.schema` và `input.test` đè lên một `release` cũ (`ruleSetVersion: 1`) mà không bắt buộc phát hành `SetVersion` mới trong `ruleSet.versions`, còn `verifyLiveCandidateAgainstSnapshot` lại ưu tiên `candidate.schema ?? release.schema`. Hệ quả là `activatedConfig.schema` mang schema mới nhưng `release.schema` trong `ruleSets` đang active vẫn mang schema cũ (`meter_id.required = false`).
- **Cách sửa và quy ước bảo toàn lịch sử (`src/utils/enterprise-lifecycle.ts`):**
  1. **Nguồn dữ liệu cấu hình duy nhất là phiên bản phát hành (`SetVersion`) trong `ruleSet.versions`:**
     - Khi gửi duyệt (`submitEnterpriseConfigForApproval`), `release = input.ruleSet.versions.find(v => v.version === input.ruleSetVersion)` bắt buộc phải có `release.schema` và `release.test` hợp lệ.
     - Nếu caller truyền thêm `input.schema` hoặc `input.test`, chúng chỉ đóng vai trò đối chiếu xác nhận: nếu `input.schema` khác `release.schema` hoặc `input.test` khác `release.test` (sau khi đã kiểm tra tính hợp lệ/độ mới của bằng chứng test), hàm từ chối với `CONFIG_CONTENT_MISMATCH`. Tuyệt đối không cho `input.schema` che giấu một `release.schema` khác bên trong `ruleSet`.
  2. **Hỗ trợ sửa riêng schema sau yêu cầu bổ sung mà không ghi đè lịch sử:**
     - Khi SME Admin gọi `requestEnterpriseRevision`, bản ghi `SMERevisionRequestRecord` lưu `targetRuleSetId` và `targetRuleSetVersion` (cùng `PlatformApprovalRecord` lưu `ruleSetId` và `ruleSetVersion`).
     - Để sửa riêng schema (giữ nguyên `rules`), Implementation Staff chạy `testDraft` với `rules` giữ nguyên và `schema` mới, sau đó gọi `publishSet` để tạo phiên bản phát hành mới (`ruleSetVersion` tăng lên, ví dụ từ `1` lên `2`) chứa cùng `rules`, `schema` mới và `SetTest` mới, rồi gửi duyệt với `configVersion` mới.
     - Phiên bản lịch sử (`version: 1`) trong `ruleSet.versions` được giữ nguyên bất biến. Mọi nỗ lực gửi lại cùng `(ruleSetId, ruleSetVersion)` đã qua duyệt/yêu cầu bổ sung hoặc ghi đè tại chỗ release cũ đều bị từ chối với `CONFIG_CONTENT_MISMATCH`.
  3. **Kiểm tra đầy đủ `rules`, `schema` và `test` của release khi duyệt và kích hoạt:**
     - `verifySingleRuleSetAgainstSnapshot` kiểm tra trực tiếp `release.schema` khớp `snapshot.schema`, `computeConfigContentHash(..., release.rules, release.schema) === snapshot.contentHash`, và `release.test` khớp `snapshot.testEvidence` (`testedAt` và `testDigest`). `candidate.schema` truyền vào (nếu có) được kiểm tra bổ sung chứ không bao giờ thay thế `release.schema`.
  4. **Đường chỉ trả `activationCommand` (`applyEnterpriseActivationCommand`):**
     - `EnterpriseRuleSetActivationCommand` được bổ sung đầy đủ `submissionId`, `ruleSetName`, `projectIds`, `rules`, `schema`, `testEvidence`, `contentHash`.
     - Hàm thuần `applyEnterpriseActivationCommand(ruleSets, command)` kiểm tra toàn vẹn chữ ký `command` (`SNAPSHOT_TAMPERED` nếu bị sửa), xác thực target release trong `ruleSets` khớp toàn bộ `rules`, `schema`, `testEvidence` và `contentHash`, rồi mới kích hoạt `activeVersion` + `handover` và trả kèm `activeRelease`.

---

## 3. Bảng chuyển trạng thái WF-01 cuối cùng

| Từ trạng thái | Hàm / Event | Actor hợp lệ | Điều kiện & Ràng buộc chính | Sang trạng thái | Tác động chính lên `lifecycle` |
|---|---|---|---|---|---|
| `(uninitialized)` (`lifecycle === undefined`) | `initializeEnterpriseLifecycle` (`INITIALIZED`) | `Platform Admin` | `enterprise.deploymentStaffId` không rỗng; `enterprise.lifecycle` chưa tồn tại; nếu truyền `subscriptionDuration` thì `plan` phải là `'Subscription'` và duration hợp lệ. | `SettingUp` | Tạo `EnterpriseLifecycle` ở `SettingUp`, lưu `initializedAt`, `initializedBy`, `usedConfigVersions: []`, tùy chọn `subscriptionConfig`; **chưa** tạo `subscription`. |
| `SettingUp` / `PendingPlatformApproval` / `PendingSMEActivation` | `configureEnterpriseSubscriptionDuration` (`SUBSCRIPTION_CONFIGURED`) | `Platform Admin` | Doanh nghiệp đã khởi tạo, chưa `Operating` / chưa có `activation` hoặc `subscription`; `plan === 'Subscription'`; `duration` nguyên dương. | Giữ nguyên `status` hiện tại | Cập nhật `subscriptionConfig` và ghi sự kiện vào `history`. |
| `SettingUp` | `submitEnterpriseConfigForApproval` (`SUBMITTED_FOR_APPROVAL`) | `Implementation Staff` có `actor.id === enterprise.deploymentStaffId` | `enterprise.projectIds` không rỗng; `configVersion` mới; `ruleSet` thuộc `enterpriseId`; tìm thấy `release` theo `ruleSetVersion` chưa từng dùng trong lần duyệt/bổ sung trước; `release.schema` và `release.test` hợp lệ, vượt qua đánh giá lại 100% mẫu & độ phủ rule và khớp `input.schema`/`input.test` (nếu truyền). | `PendingPlatformApproval` | Tạo `pendingSubmission` đóng băng `rules`, `schema`, `testEvidence`, `internalReview`, `contentHash` (SHA-256); thêm `configVersion` vào `usedConfigVersions`; xóa `approvedConfig`. |
| `PendingPlatformApproval` | `approveEnterpriseConfig` (`PLATFORM_APPROVED`) | `Platform Admin` | Có `pendingSubmission`; vượt qua `verifySnapshotLock` (khớp `configVersion`, khớp tùy chọn `submissionId`/`contentHash`/`ruleSet`/`ruleSets`/`schema`, xác thực lại `contentHash` và `testEvidence` của snapshot). **Không** khởi chạy `subscription`. | `PendingSMEActivation` | Chuyển `pendingSubmission` sang `approvedConfig`, xóa `pendingSubmission`, thêm `PlatformApprovalRecord` vào `approvalHistory`. |
| `PendingSMEActivation` | `requestEnterpriseRevision` (`REVISION_REQUESTED`) | `SME Admin` có `actor.enterpriseId === enterprise.id` | Có `approvedConfig`, chưa `Operating`; `reason.trim()` không rỗng. | `SettingUp` | Lưu `SMERevisionRequestRecord` (gồm `reason`, `targetConfigVersion`, `targetRuleSetId`, `targetRuleSetVersion`, `targetTestedAt`, `targetTestDigest`) vào `revisionHistory` và `latestRevisionRequest`; giữ nguyên `approvalHistory` & `usedConfigVersions`; xóa `approvedConfig` và `pendingSubmission`. |
| `PendingSMEActivation` | `activateEnterprise` (`SME_ACTIVATED`) | `SME Admin` có `actor.enterpriseId === enterprise.id` | Có `approvedConfig` khớp một bản ghi trong `approvalHistory`; vượt qua `verifySnapshotLock` trên mọi tham số (`ruleSet`, `ruleSets`, `schema`); có `plan` hợp lệ (`Free` hoặc `Subscription`); nếu `Subscription` thì phải có `subscriptionConfig` hoặc `subscriptionDuration` hợp lệ và khớp nhau. | `Operating` | Lưu `activatedConfig` và `activation`; xóa `approvedConfig`; nếu `Subscription` thì khởi tạo `subscription` với `startedAt = at` và `expiresAt = addSubscriptionDurationUtc(at, duration)`; trả `activationCommand` đầy đủ và cập nhật `ruleSets` qua `applyEnterpriseActivationCommand` nếu truyền `ruleSets`. |
| `Operating` | Mọi lệnh thay đổi vòng đời | Bất kỳ | Bị chặn bằng `ALREADY_OPERATING`, `ALREADY_INITIALIZED` hoặc `INVALID_STATE`. | Không đổi | Bảo toàn dữ liệu vận hành, không gia hạn/đặt lại kỳ `Subscription`. |

---

## 4. Model, chữ ký hàm công khai và ví dụ sử dụng

### 4.1. Chữ ký các hàm public (`src/utils/enterprise-lifecycle.ts`)

```ts
export function sha256Hex(text: string): string;
export function parseStrictIsoTimestamp(
  value: string,
): { ok: true; iso: string; ms: number } | { ok: false };
export function addSubscriptionDurationUtc(
  startedAtIso: string,
  duration: SubscriptionDuration,
): string;

export function initializeEnterpriseLifecycle(
  input: InitializeEnterpriseLifecycleInput,
): EnterpriseLifecycleResult;
export function configureEnterpriseSubscriptionDuration(
  input: ConfigureSubscriptionDurationInput,
): EnterpriseLifecycleResult;
export function submitEnterpriseConfigForApproval(
  input: SubmitEnterpriseConfigInput,
): EnterpriseLifecycleResult;
export function approveEnterpriseConfig(
  input: ApproveEnterpriseConfigInput,
): EnterpriseLifecycleResult;
export function requestEnterpriseRevision(
  input: RequestEnterpriseRevisionInput,
): EnterpriseLifecycleResult;
export function activateEnterprise(
  input: ActivateEnterpriseInput,
): ActivateEnterpriseResult;
export function applyEnterpriseActivationCommand(
  ruleSets: ManagedRuleSet[],
  command: EnterpriseRuleSetActivationCommand,
): ApplyEnterpriseActivationCommandResult;
export function enterpriseLifecycleReducer(
  enterprise: Enterprise,
  command: EnterpriseLifecycleCommand,
): EnterpriseLifecycleResult | ActivateEnterpriseResult;

export function resolveEnterpriseLifecycle(
  enterprise: Enterprise | undefined,
): ResolvedEnterpriseLifecycle;
export function isEnterpriseOperating(
  enterprise: Enterprise | undefined,
): boolean;
export function isEnterpriseSubscriptionActive(
  enterprise: Enterprise | undefined,
  at?: string,
): boolean;
export function checkEnterpriseOperationalEligibility(
  enterprise: Enterprise | undefined,
  options?: { at?: string; requireSubscription?: boolean },
): EnterpriseOperationalEligibility;
```

### 4.2. Ví dụ 1: Luồng thành công sửa riêng schema qua release mới và kích hoạt đồng nhất

```ts
const rev = requestEnterpriseRevision({
  enterprise: approvedV1Enterprise,
  actor: smeAdmin,
  reason: 'Bắt buộc nhập trường meter_id trong schema vận hành',
  at: '2026-11-11T09:40:00Z',
});

// Giữ nguyên rules của v1, kiểm thử lại với requiredMeterSchema và phát hành release v2
const freshTestV2 = testDraft(
  { ...publishedV1, draft: { rules: publishedV1.versions[0].rules } },
  samples,
  requiredMeterSchema,
);
const publishedV2 = publishSet(
  {
    ...publishedV1,
    draft: { rules: publishedV1.versions[0].rules, test: freshTestV2 },
  },
  'Implementation Internal Reviewer',
  'Release v2 with meter_id required',
  requiredMeterSchema,
);

const subV2 = submitEnterpriseConfigForApproval({
  enterprise: rev.enterprise,
  actor: assignedStaff,
  configVersion: 'cfg-2',
  ruleSet: publishedV2,
  ruleSetVersion: 2,
  schema: requiredMeterSchema,
  test: freshTestV2,
  at: '2026-11-11T10:00:00Z',
});

const appV2 = approveEnterpriseConfig({
  enterprise: subV2.enterprise,
  actor: platformAdmin,
  configVersion: 'cfg-2',
  ruleSet: publishedV2,
  schema: requiredMeterSchema,
  at: '2026-11-11T10:05:00Z',
});

const actV2 = activateEnterprise({
  enterprise: appV2.enterprise,
  actor: smeAdmin,
  configVersion: 'cfg-2',
  ruleSet: publishedV2,
  ruleSets: [publishedV2, otherEnterpriseSet],
  schema: requiredMeterSchema,
  at: '2026-11-11T10:15:00Z',
});
// actV2.ok === true
// Active release (version 2) trong actV2.ruleSets có schema[2].required === true
// Lịch sử version 1 trong actV2.ruleSets vẫn giữ nguyên schema[2].required === false
```

### 4.3. Ví dụ 2: Các trường hợp bị từ chối khi dữ liệu lệch hoặc cố che giấu release cũ

```ts
// 1. Truyền ruleSet hợp lệ nhưng phần tử trong ruleSets bị đổi ngưỡng giữ nguyên version -> bị từ chối
const badListRes = activateEnterprise({
  enterprise: approvedV1Enterprise,
  actor: smeAdmin,
  configVersion: 'cfg-1',
  ruleSet: publishedV1,
  ruleSets: [driftedThresholdRuleSetV1],
  at: '2026-11-11T09:30:00Z',
});
// badListRes === { ok: false, code: 'CONFIG_CONTENT_MISMATCH', ... }

// 2. Truyền schema mới qua input.schema nhưng ruleSets vẫn chứa release có schema cũ -> bị từ chối
const maskedSchemaRes = activateEnterprise({
  enterprise: appV2.enterprise,
  actor: smeAdmin,
  configVersion: 'cfg-2',
  ruleSets: [staleSchemaInV2],
  schema: requiredMeterSchema,
  at: '2026-11-11T10:10:00Z',
});
// maskedSchemaRes === { ok: false, code: 'CONFIG_CONTENT_MISMATCH', ... }
```

### 4.4. Ví dụ 3: Contract đường chỉ trả `activationCommand` (`applyEnterpriseActivationCommand`)

```ts
// Kích hoạt không truyền ruleSets -> nhận activationCommand tự chứa đầy đủ snapshot đã duyệt
const actCmdOnly = activateEnterprise({
  enterprise: appV2.enterprise,
  actor: smeAdmin,
  configVersion: 'cfg-2',
  at: '2026-11-11T10:20:00Z',
});

// Consumer áp dụng command vào danh sách ruleSets hiện có:
// Hàm tự kiểm tra chữ ký SHA-256 của command, tìm đúng 1 target thuộc enterprise,
// đối chiếu rules, schema, testDigest của release đích rồi mới bật activeVersion.
const applied = applyEnterpriseActivationCommand(
  currentRuleSets,
  actCmdOnly.activationCommand,
);
if (applied.ok) {
  // applied.ruleSets: danh sách đã cập nhật activeVersion + handover
  // applied.activeRelease: bản phát hành đang hoạt động đã được kiểm chứng khớp snapshot
}
```

---

## 5. Các quyết định thiết kế cho phần tài liệu chưa quy định chi tiết

1. **Cấu trúc cấu hình kỳ `Subscription` (`SubscriptionDuration`):**
   - Định nghĩa `SubscriptionDuration = { value: number; unit: 'days' | 'months' }` với `value` nguyên dương.
   - Chỉ bắt đầu tính `startedAt` / `expiresAt` đúng tại thời điểm `activateEnterprise` thành công. Gói `Free` không tạo `subscription` (`PLAN_NOT_SUBSCRIPTION` nếu cấu hình duration).
2. **Biên hiệu lực nửa mở `[startedAt, expiresAt)` và lịch tháng UTC:**
   - Khoảng hiệu lực là `[startedAt, expiresAt)`: hợp lệ tại `startedAt`, hết hạn tại và sau `expiresAt` (`SUBSCRIPTION_EXPIRED`).
   - Cộng theo `months` giữ ngày/giờ UTC và kẹp về ngày cuối tháng đích khi vượt quá (`daysInUtcMonth`).
3. **Chuẩn hóa mốc thời gian độc lập múi giờ máy chạy:**
   - `parseStrictIsoTimestamp` yêu cầu chuỗi ISO-8601 có múi giờ tường minh (`Z` hoặc `[+-]HH:MM`) và chuẩn hóa về UTC.
4. **Tương thích dữ liệu legacy (`enterprise.lifecycle === undefined`):**
   - `resolveEnterpriseLifecycle` trả `{ initialized: false, isLegacy: true, status: null, isOperating: false }` và `checkEnterpriseOperationalEligibility` trả `eligible: false, reasonCode: 'UNINITIALIZED_LEGACY'`.
5. **Ghi chú truy cập 2 file `.docx` gốc trong `Downloads`:**
   - Hai file `C:\Users\gmt\Downloads\Phieu_FA26SE215_v3_EN.docx` và `C:\Users\gmt\Downloads\SME-FraudGuard_Du-thao-dang-ky-workflow.docx` tồn tại trên đĩa (`Test-Path -> True`) nhưng `Get-FileHash` bị khóa bởi tiến trình khác đang mở file (`The process cannot access the file ... because it is being used by another process`). Yêu cầu chi tiết được đọc từ 2 bản đính kèm tương ứng trong phiên hội thoại và các tài liệu đặc tả trong `docs/`.

---

## 6. Kết quả kiểm tra và phạm vi đã kiểm chứng

### 6.1. `npm run check` (`eslint src --max-warnings=0 && npm run typecheck && npm test`)

- **ESLint**: `eslint src --max-warnings=0` -> đạt (0 lỗi, 0 cảnh báo).
- **TypeScript**: `next typegen && tsc --noEmit` -> đạt (`✓ Route types generated successfully`, 0 lỗi).
- **Unit test (`node --test tests/*.test.cjs`)**: **94/94 test đạt** (`# tests 94`, `# pass 94`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`), trong đó:
  - **11 subtest** trong `tests/enterprise-lifecycle.test.cjs` (10 subtest Phase 1 + 1 subtest regression P1 tổng hợp kiểm chứng toàn bộ 9 tình huống bắt buộc sau review).
  - **83 subtest hiện có** giữ nguyên ổn định, không phát sinh hồi quy.

### 6.2. `npm run build` (`next build`)

- **Next.js 15.5.25 production build**: đạt (exit code `0`).
  - `✓ Compiled successfully`
  - `Linting and checking validity of types ...` đạt
  - `✓ Generating static pages (6/6)` (`/`, `/_not-found`, `/fraud-monitoring`, `/login`).

### 6.3. Giới hạn kiểm chứng hiện tại

- Các unit test chạy bằng Node test runner (`node --test`) qua VM biên dịch TypeScript cho lớp domain/utils thuần (bao gồm kiểm chứng `normalizeFields` trực tiếp với schema của active release sau kích hoạt); chưa có UI render test, E2E trình duyệt, tích hợp React hooks/`localStorage` hoặc backend API (thuộc phạm vi Phase 2).

---

## 7. Checklist điểm nối và nghĩa vụ tích hợp cho Phase 2 (UI & State Persistence)

1. **`src/components/fraudguard-dashboard/FraudGuardDashboard.tsx`**:
   - Khởi tạo/di chuyển dữ liệu trong `localStorage` (`fraudguard-demo-workspace-v3`) để enterprise mới gọi `initializeEnterpriseLifecycle`, giữ `reconcileEnterpriseProjects` bảo toàn field `lifecycle`.
   - Khi SME Admin kích hoạt: truyền trực tiếp `ruleSets` hiện tại vào `activateEnterprise` (hoặc gọi `applyEnterpriseActivationCommand(ruleSets, result.activationCommand)`) và chỉ lưu state khi hàm trả `ok: true`. **Tuyệt đối không** tự gán `set.activeVersion = command.activeVersion` chỉ theo ID/version mà bỏ qua bước đối chiếu `contentHash`, `schema`, `rules` và `testEvidence`.
   - Thay thế kiểm tra trực tiếp `canChangeEnterpriseSets` ở luồng `RuleSetsView` (`onAssign` / `onChange`) bằng điều phối theo trạng thái WF-01.
   - Chặn thao tác nghiệp vụ / nhập dữ liệu (`importPreview`) / đánh giá vận hành khi `!isEnterpriseOperating(ent)` hoặc `!checkEnterpriseOperationalEligibility(ent, { requireSubscription: ... }).eligible`.
2. **`src/components/fraudguard-dashboard/RuleSetsView.tsx` & `src/utils/rule-set-lifecycle.ts`**:
   - Giữ `publishSet` ở vai trò chốt `SetVersion` đánh giá nội bộ của Implementation Team (bao gồm trường hợp sửa riêng schema cần kiểm thử lại và phát hành `SetVersion` mới trước khi gửi duyệt).
   - Thay nút `"Áp dụng và bàn giao"` (hiện gọi thẳng `handoverSet`) bằng hành động gọi `submitEnterpriseConfigForApproval`.
   - Rào/thay thế các đường gọi trực tiếp `handoverSet`, `activateSet`, `canChangeEnterpriseSets` để không thể kích hoạt `activeVersion` mà bỏ qua Platform Admin phê duyệt và SME Admin kích hoạt.
3. **`src/components/fraudguard-dashboard/OnboardingPlatformAdminScreen.tsx`**:
   - Hiển thị hàng chờ `pendingSubmission`, lịch sử `approvalHistory` / `revisionHistory`, form cấu hình `SubscriptionDuration` (`configureEnterpriseSubscriptionDuration`) cho gói `Subscription`, và nút phê duyệt của Platform Admin gọi `approveEnterpriseConfig`.
4. **Màn hình SME Admin (`OnboardingView.tsx` / chế độ xem doanh nghiệp)**:
   - Hiển thị bản `approvedConfig` (quy tắc, schema, bằng chứng `SetTest`, `contentHash`, trạng thái Subscription) cho SME Admin của đúng `enterpriseId`.
   - Nối nút kích hoạt gọi `activateEnterprise` (kèm `ruleSets`) và nút yêu cầu bổ sung kèm input `reason` bắt buộc gọi `requestEnterpriseRevision`.
5. **Giữ tách biệt `OnboardingStage` (`src/utils/enterprise.ts`)**:
   - Đảm bảo xác nhận đặc tả (`OnboardingStage`) và duyệt/kích hoạt cấu hình WF-01 (`EnterpriseLifecycleStatus`) hiển thị độc lập trên UI, không gộp đè trạng thái của nhau.
