import type { ClarifiedFieldItem, DeploymentSpecification, Enterprise } from "@/types/enterprise";
import type { SubscriptionDuration } from "@/types/enterprise-lifecycle";
import type {
  ProjectItem,
  RuleTemplate,
  TransactionRisk,
  UserProfile,
} from "@/types/fraudguard";
import type { InvestigationCase } from "@/types/investigation-case";
import type { InvestigationReportFeedback } from "@/types/report-feedback";
import {
  activateEnterprise,
  approveEnterpriseConfig,
  configureEnterpriseSubscriptionDuration,
  initializeEnterpriseLifecycle,
  submitEnterpriseConfigForApproval,
} from "@/utils/enterprise-lifecycle";
import { createInvestigationCase, assignInvestigatorToCase, submitInvestigationReport, confirmInvestigationCaseReport } from "@/utils/investigation-case";
import type { InvestigationCaseCommandResult } from "@/types/investigation-case";
import {
  handoverSet,
  publishSet,
  snapshotRules,
  testDraft,
  type ManagedRuleSet,
} from "@/utils/rule-set-lifecycle";
import { type RuleSetSample } from "@/utils/rule-set";
import {
  isValidPreDemoSnapshotShape,
  persistWorkspaceAndUsers,
  WORKSPACE_SCHEMA_VERSION,
  type PersistCoordinatedResult,
  type PreDemoWorkspaceSnapshot,
  type StorageLike,
  type WorkspacePayloadV4,
  type WorkspaceRestoreStatus,
} from "@/utils/workspace-storage";

const DEMO_SCHEMA: ClarifiedFieldItem[] = [
  { name: "meter_id", type: "string", required: true, description: "Mã công tơ điện khu vực" },
  { name: "kwh_delta", type: "number", required: true, description: "Sản lượng điện chênh lệch (kWh/giờ)" },
  { name: "off_hours", type: "boolean", required: true, description: "Ghi nhận ngoài giờ hoạt động" },
  { name: "amount", type: "number", required: true, description: "Chi phí điện quy đổi (VND)" },
];

export const WF04_DEMO_RULES: readonly RuleTemplate[] = [
  {
    id: "rule-wf04-elec-offhours",
    name: "Off-Hours Power Surge",
    description: "Cảnh báo tiêu thụ điện vượt ngưỡng 45 kWh/giờ trong khung giờ nghỉ tại trường học/văn phòng.",
    category: "behavior",
    version: "v1.0",
    status: "Published",
    conditionGroup: {
      type: "group",
      id: "g-wf04-1",
      logic: "AND",
      children: [
        { type: "condition", id: "c-wf04-1a", field: "kwh_delta", operator: ">", value: 45 },
        { type: "condition", id: "c-wf04-1b", field: "off_hours", operator: "==", value: true },
      ],
    },
    enabled: true,
    appliesTo: { transactionTypes: ["*"], projects: ["*"] },
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-20T09:00:00.000Z",
    publishedAt: "2026-07-20T09:00:00.000Z",
  },
];

export const WF04_DEMO_PROJECTS: readonly ProjectItem[] = [
  {
    id: "proj-wf04-campus-main",
    name: "Campus Main Meter",
    code: "CAMPUS_MAIN_GRID",
    description: "Hệ thống đo điện khu hiệu bộ và giảng đường chính",
    environment: "Production",
    apiKey: "fg_live_campus_main_01",
    webhookUrl: "https://telemetry.campusgrid.vn/hooks/wf04",
    quota: { used: 18420, total: 100000, resetDate: "2026-12-01" },
    status: "Active",
    createdAt: "2026-10-20T08:00:00.000Z",
  },
  {
    id: "proj-wf04-campus-lab",
    name: "Campus Lab Meter",
    code: "CAMPUS_LAB_GRID",
    description: "Hệ thống đo điện khu phòng thí nghiệm và máy chủ nội bộ",
    environment: "Production",
    apiKey: "fg_live_campus_lab_02",
    webhookUrl: "https://telemetry.campusgrid.vn/hooks/lab",
    quota: { used: 9240, total: 50000, resetDate: "2026-12-01" },
    status: "Active",
    createdAt: "2026-10-20T08:15:00.000Z",
  },
  {
    id: "proj-wf04-branch-meter",
    name: "North Branch Meter",
    code: "NORTH_BRANCH_GRID",
    description: "Hệ thống đo phụ tải điện chi nhánh phía Bắc",
    environment: "Production",
    apiKey: "fg_live_branch_north_01",
    quota: { used: 5310, total: 50000, resetDate: "2026-12-01" },
    status: "Active",
    createdAt: "2026-10-22T08:00:00.000Z",
  },
  {
    id: "proj-wf04-expired-meter",
    name: "Dormitory Grid Meter",
    code: "DORM_GRID_ARCHIVE",
    description: "Hệ thống đo điện ký túc xá dùng kiểm thử kịch bản hết hạn Subscription",
    environment: "Production",
    apiKey: "fg_live_dorm_expired_01",
    quota: { used: 4100, total: 30000, resetDate: "2026-09-01" },
    status: "Active",
    createdAt: "2026-07-20T08:00:00.000Z",
  },
];

export const WF04_DEMO_USERS: readonly UserProfile[] = [
  {
    id: "usr-wf04-op",
    enterpriseId: "ent-wf04-campus",
    name: "Lê Minh Quân",
    email: "quan.lm@campusgrid.vn",
    role: "Operator",
    title: "Energy Risk Operator",
    avatarLetter: "Q",
    avatarBg: "#2563eb",
    description: "Operator điều phối cảnh báo AI tiêu thụ điện tại Campus PowerGrid SME.",
  },
  {
    id: "usr-wf04-inv-1",
    enterpriseId: "ent-wf04-campus",
    name: "Phạm Bảo Châu",
    email: "chau.pb@campusgrid.vn",
    role: "Investigator",
    title: "Field Power Investigator",
    avatarLetter: "C",
    avatarBg: "#0284c7",
    description: "Investigator kiểm tra hiện trường công tơ khu giảng đường và phòng lab.",
  },
  {
    id: "usr-wf04-inv-2",
    enterpriseId: "ent-wf04-campus",
    name: "Hoàng Gia Huy",
    email: "huy.hg@campusgrid.vn",
    role: "Investigator",
    title: "Electrical Audit Investigator",
    avatarLetter: "H",
    avatarBg: "#0891b2",
    description: "Investigator phụ trách rà soát nhật ký phụ tải điện khu vực campus.",
  },
  {
    id: "usr-wf04-sme",
    enterpriseId: "ent-wf04-campus",
    name: "Võ Thảo Vy",
    email: "vy.vt@campusgrid.vn",
    role: "SME Admin",
    title: "Campus Energy Admin",
    avatarLetter: "V",
    avatarBg: "#7c3aed",
    description: "Quản trị doanh nghiệp Campus PowerGrid SME (chỉ xem báo cáo đã xác nhận).",
  },
  {
    id: "usr-wf04-branch-op",
    enterpriseId: "ent-wf04-branch",
    name: "Đỗ Hải Đăng",
    email: "dang.dh@northutilities.vn",
    role: "Operator",
    title: "Branch Grid Operator",
    avatarLetter: "D",
    avatarBg: "#2563eb",
    description: "Operator của North Branch Utilities dùng kiểm chứng cô lập tenant.",
  },
  {
    id: "usr-wf04-branch-sme",
    enterpriseId: "ent-wf04-branch",
    name: "Ngô Lan Chi",
    email: "chi.nl@northutilities.vn",
    role: "SME Admin",
    title: "Branch Utilities Admin",
    avatarLetter: "L",
    avatarBg: "#7c3aed",
    description: "Quản trị doanh nghiệp North Branch Utilities.",
  },
  {
    id: "usr-wf04-exp-op",
    enterpriseId: "ent-wf04-expired",
    name: "Trịnh Quốc Khánh",
    email: "khanh.tq@dormgrid.vn",
    role: "Operator",
    title: "Dormitory Grid Operator",
    avatarLetter: "K",
    avatarBg: "#2563eb",
    description: "Operator của Dormitory Grid Archive (gói Subscription đã hết hạn).",
  },
  {
    id: "usr-wf04-exp-inv",
    enterpriseId: "ent-wf04-expired",
    name: "Bùi Thu Hà",
    email: "ha.bt@dormgrid.vn",
    role: "Investigator",
    title: "Dormitory Grid Investigator",
    avatarLetter: "B",
    avatarBg: "#0284c7",
    description: "Investigator tiếp nhận hồ sơ đã mở trước hạn tại Dormitory Grid Archive.",
  },
  {
    id: "usr-wf04-exp-sme",
    enterpriseId: "ent-wf04-expired",
    name: "Phan Đức Trọng",
    email: "trong.pd@dormgrid.vn",
    role: "SME Admin",
    title: "Dormitory Grid Admin",
    avatarLetter: "T",
    avatarBg: "#7c3aed",
    description: "Quản trị doanh nghiệp Dormitory Grid Archive.",
  },
];

function buildVerifiedSpecification(args: {
  enterpriseName: string;
  adminName: string;
  adminEmail: string;
  projectIds: string[];
  confirmedAt: string;
  samples: RuleSetSample[];
}): DeploymentSpecification {
  const sampleJson = JSON.stringify(args.samples, null, 2);
  const conditionsList = [
    {
      id: `cond-${args.projectIds[0]}`,
      name: "Bất thường tiêu thụ điện ngoài giờ hành chính",
      criteria: "kwh_delta > 45 và off_hours == true",
      scope: `Áp dụng cho công tơ thuộc ${args.projectIds.join(", ")}`,
    },
  ];
  const requirements = `Giám sát phụ tải tiêu thụ điện bất thường ngoài giờ tại ${args.enterpriseName}.`;
  const snapshot = {
    version: "v1.0",
    requirements,
    conditionsList,
    schema: structuredClone(DEMO_SCHEMA),
    sampleJson,
    updatedAt: args.confirmedAt,
    sentAt: args.confirmedAt,
    sentBy: "Nguyễn Minh Hà",
  };

  return {
    stage: "confirmed",
    businessModel: `Giám sát tiêu thụ điện cơ quan / trường học (${args.enterpriseName})`,
    deploymentScopeNote: `Phạm vi dự án: ${args.projectIds.join(", ")}`,
    representativeName: args.adminName,
    representativeRole: "Quản trị Doanh nghiệp (SME Admin)",
    representativeEmail: args.adminEmail,
    smeAdminName: args.adminName,
    smeAdminEmail: args.adminEmail,
    conditionsList,
    schema: structuredClone(DEMO_SCHEMA),
    savedDraft: structuredClone(snapshot),
    sentSnapshot: structuredClone(snapshot),
    confirmedSnapshot: structuredClone(snapshot),
    enterpriseConfirmation: {
      confirmedAt: args.confirmedAt,
      confirmedBy: args.adminName,
      channel: "Portal",
      note: "Xác nhận đặc tả triển khai WF-04 demo.",
      version: "v1.0",
    },
    dataAndEvaluationClarified: true,
    dataClarifiedAt: args.confirmedAt,
    dataClarifiedBy: "Nguyễn Minh Hà",
    requirements,
    fields: "meter_id, kwh_delta, off_hours, amount",
    conditions: "kwh_delta > 45 && off_hours == true",
    sampleJson,
    updatedAt: args.confirmedAt,
    confirmedAt: args.confirmedAt,
    confirmedBy: args.adminName,
  };
}

function buildLifecycledTenant(args: {
  id: string;
  code: string;
  name: string;
  projectIds: string[];
  smeAdmin: UserProfile;
  ruleSetId: string;
  ruleSetName: string;
  duration: SubscriptionDuration;
  initAt: string;
  configureAt: string;
  submitAt: string;
  approveAt: string;
  activateAt: string;
}): { enterprise: Enterprise; ruleSet: ManagedRuleSet } {
  const platformAdmin = {
    id: "usr-platform-admin",
    role: "Platform Admin" as const,
    name: "Lê Hoàng Phúc",
  };
  const implStaff = {
    id: "usr-deployment",
    role: "Implementation Staff" as const,
    name: "Nguyễn Minh Hà",
  };

  const samples: RuleSetSample[] = args.projectIds.flatMap((projectId, idx) => [
    {
      id: `${args.id}-sample-abn-${idx + 1}`,
      ref: `SAMPLE-${args.code}-${idx * 2 + 1}`,
      projectId,
      transactionType: "telemetry",
      fields: {
        meter_id: `MTR-${args.code}-${idx + 1}`,
        kwh_delta: 68,
        off_hours: true,
        amount: 215000,
      },
      expected: "Abnormal",
    },
    {
      id: `${args.id}-sample-nrm-${idx + 1}`,
      ref: `SAMPLE-${args.code}-${idx * 2 + 2}`,
      projectId,
      transactionType: "telemetry",
      fields: {
        meter_id: `MTR-${args.code}-${idx + 1}`,
        kwh_delta: 14,
        off_hours: false,
        amount: 42000,
      },
      expected: "Normal",
    },
  ]);

  const scopedRules = snapshotRules([...WF04_DEMO_RULES], args.projectIds);
  const draftSet: ManagedRuleSet = {
    id: args.ruleSetId,
    name: args.ruleSetName,
    enterpriseId: args.id,
    projectIds: [...args.projectIds],
    versions: [],
    draft: { rules: scopedRules },
  };
  draftSet.draft!.test = testDraft(draftSet, samples, DEMO_SCHEMA);
  const publishedSet = publishSet(
    draftSet,
    "Nguyễn Minh Hà",
    `Kiểm thử đạt 100% mẫu điện năng cho ${args.name}`,
    DEMO_SCHEMA,
  );
  const handedSet = handoverSet(publishedSet, 1, "Nguyễn Minh Hà");

  const baseEnterprise: Enterprise = {
    id: args.id,
    code: args.code,
    name: args.name,
    plan: "Subscription",
    projectIds: [...args.projectIds],
    deploymentStaffId: implStaff.id,
    specification: buildVerifiedSpecification({
      enterpriseName: args.name,
      adminName: args.smeAdmin.name,
      adminEmail: args.smeAdmin.email,
      projectIds: args.projectIds,
      confirmedAt: args.initAt,
      samples,
    }),
  };

  const initRes = initializeEnterpriseLifecycle({
    enterprise: baseEnterprise,
    actor: platformAdmin,
    at: args.initAt,
    eventId: `${args.id}-evt-init`,
  });
  if (!initRes.ok) {
    throw new Error(`WF-04 demo init failed (${args.id}): ${initRes.code} - ${initRes.error}`);
  }

  const configRes = configureEnterpriseSubscriptionDuration({
    enterprise: initRes.enterprise,
    actor: platformAdmin,
    duration: args.duration,
    at: args.configureAt,
    eventId: `${args.id}-evt-config`,
  });
  if (!configRes.ok) {
    throw new Error(`WF-04 demo config failed (${args.id}): ${configRes.code} - ${configRes.error}`);
  }

  const submitRes = submitEnterpriseConfigForApproval({
    enterprise: configRes.enterprise,
    actor: implStaff,
    configVersion: "cfg-v1.0",
    ruleSet: handedSet,
    ruleSetVersion: 1,
    schema: DEMO_SCHEMA,
    test: handedSet.versions[0].test,
    at: args.submitAt,
    eventId: `${args.id}-evt-submit`,
    submissionId: `${args.id}-sub-v1`,
  });
  if (!submitRes.ok) {
    throw new Error(`WF-04 demo submit failed (${args.id}): ${submitRes.code} - ${submitRes.error}`);
  }

  const approveRes = approveEnterpriseConfig({
    enterprise: submitRes.enterprise,
    actor: platformAdmin,
    configVersion: "cfg-v1.0",
    ruleSets: [handedSet],
    schema: DEMO_SCHEMA,
    at: args.approveAt,
    eventId: `${args.id}-evt-approve`,
    approvalId: `${args.id}-appr-v1`,
  });
  if (!approveRes.ok) {
    throw new Error(`WF-04 demo approve failed (${args.id}): ${approveRes.code} - ${approveRes.error}`);
  }

  const activateRes = activateEnterprise({
    enterprise: approveRes.enterprise,
    actor: args.smeAdmin,
    configVersion: "cfg-v1.0",
    ruleSets: [handedSet],
    schema: DEMO_SCHEMA,
    subscriptionDuration: args.duration,
    at: args.activateAt,
    eventId: `${args.id}-evt-activate`,
  });
  if (!activateRes.ok || !activateRes.ruleSets?.[0]) {
    throw new Error(
      `WF-04 demo activate failed (${args.id}): ${!activateRes.ok ? activateRes.error : "missing ruleSet"}`,
    );
  }

  return {
    enterprise: activateRes.enterprise,
    ruleSet: activateRes.ruleSets[0],
  };
}

const campusSme = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-sme")!;
const branchSme = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-branch-sme")!;
const expiredSme = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-exp-sme")!;

const builtCampus = buildLifecycledTenant({
  id: "ent-wf04-campus",
  code: "CAMPUS-2026",
  name: "Campus PowerGrid SME",
  projectIds: ["proj-wf04-campus-main", "proj-wf04-campus-lab"],
  smeAdmin: campusSme,
  ruleSetId: "rset-wf04-campus",
  ruleSetName: "Campus PowerGrid Rules",
  duration: { value: 6, unit: "months" },
  initAt: "2026-10-25T08:00:00.000Z",
  configureAt: "2026-10-26T08:00:00.000Z",
  submitAt: "2026-10-28T09:00:00.000Z",
  approveAt: "2026-10-30T10:00:00.000Z",
  activateAt: "2026-11-01T08:00:00.000Z",
});

const builtBranch = buildLifecycledTenant({
  id: "ent-wf04-branch",
  code: "BRANCH-2026",
  name: "North Branch Utilities",
  projectIds: ["proj-wf04-branch-meter"],
  smeAdmin: branchSme,
  ruleSetId: "rset-wf04-branch",
  ruleSetName: "North Branch Rules",
  duration: { value: 6, unit: "months" },
  initAt: "2026-10-25T08:30:00.000Z",
  configureAt: "2026-10-26T08:30:00.000Z",
  submitAt: "2026-10-28T09:30:00.000Z",
  approveAt: "2026-10-30T10:30:00.000Z",
  activateAt: "2026-11-01T08:00:00.000Z",
});

const builtExpired = buildLifecycledTenant({
  id: "ent-wf04-expired",
  code: "EXPIRED-2026",
  name: "Dormitory Grid Archive",
  projectIds: ["proj-wf04-expired-meter"],
  smeAdmin: expiredSme,
  ruleSetId: "rset-wf04-expired",
  ruleSetName: "Dormitory Grid Rules",
  duration: { value: 1, unit: "months" },
  initAt: "2026-07-25T08:00:00.000Z",
  configureAt: "2026-07-26T08:00:00.000Z",
  submitAt: "2026-07-28T09:00:00.000Z",
  approveAt: "2026-07-30T10:00:00.000Z",
  activateAt: "2026-08-01T08:00:00.000Z",
});

export const WF04_DEMO_ENTERPRISES: readonly Enterprise[] = [
  builtCampus.enterprise,
  builtBranch.enterprise,
  builtExpired.enterprise,
];

export const WF04_DEMO_RULE_SETS: readonly ManagedRuleSet[] = [
  builtCampus.ruleSet,
  builtBranch.ruleSet,
  builtExpired.ruleSet,
];

export const WF04_DEMO_TRANSACTIONS: readonly TransactionRisk[] = [
  {
    id: "tx-wf04-campus-01",
    transactionReference: "ELEC-CMP-261112-01",
    projectId: "proj-wf04-campus-main",
    projectName: "Campus Main Meter",
    transactionType: "telemetry",
    entityReference: "MTR-BLD-A1",
    amount: 3420000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.94,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: ["ai_night_hvac_surge"],
    explanation: "Phụ tải công tơ M-A1 tăng đột biến 68 kWh/h lúc 23:15 khi tòa nhà hiệu bộ đã đóng cửa.",
    alertId: "ALT-WF04-CAMPUS-01",
    alertName: "Tăng tải HVAC khu hiệu bộ ban đêm",
    processedAt: "2026-11-12T23:15:00.000Z",
  },
  {
    id: "tx-wf04-campus-02",
    transactionReference: "ELEC-CMP-261113-02",
    projectId: "proj-wf04-campus-main",
    projectName: "Campus Main Meter",
    transactionType: "telemetry",
    entityReference: "MTR-PUMP-02",
    amount: 2890000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.91,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: ["ai_continuous_offhours_load"],
    explanation: "Cụm bơm tăng áp giảng đường chạy liên tục vượt ngưỡng nền 52 kWh/h từ 01:00 đến 02:30.",
    alertId: "ALT-WF04-CAMPUS-02",
    alertName: "Bơm tăng áp giảng đường chạy ngoài giờ",
    processedAt: "2026-11-13T01:40:00.000Z",
  },
  {
    id: "tx-wf04-campus-03",
    transactionReference: "ELEC-CMP-261113-03",
    projectId: "proj-wf04-campus-lab",
    projectName: "Campus Lab Meter",
    transactionType: "telemetry",
    entityReference: "MTR-LAB-04",
    amount: 4650000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.95,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: ["ai_phase_imbalance_spike"],
    explanation: "Tủ điện phòng thí nghiệm lệch pha bất thường, công suất đỉnh tăng gấp 3.4 lần mức bình thường.",
    alertId: "ALT-WF04-CAMPUS-03",
    alertName: "Lệch pha tủ điện phòng thí nghiệm",
    processedAt: "2026-11-13T19:20:00.000Z",
  },
  {
    id: "tx-wf04-campus-04",
    transactionReference: "ELEC-CMP-261114-04",
    projectId: "proj-wf04-campus-lab",
    projectName: "Campus Lab Meter",
    transactionType: "telemetry",
    entityReference: "MTR-LAB-07",
    amount: 2150000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.89,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: ["ai_weekend_lighting_surge"],
    explanation: "Hệ thống chiếu sáng và điều hòa tầng 3 phòng thực hành tiêu thụ cao bất thường vào sáng Chủ nhật.",
    alertId: "ALT-WF04-CAMPUS-04",
    alertName: "Tiêu thụ điện cao cuối tuần tầng 3",
    processedAt: "2026-11-14T02:10:00.000Z",
  },
  {
    id: "tx-wf04-campus-rule",
    transactionReference: "ELEC-CMP-261114-05",
    projectId: "proj-wf04-campus-main",
    projectName: "Campus Main Meter",
    transactionType: "telemetry",
    entityReference: "MTR-BLD-B2",
    amount: 1980000,
    currency: "VND",
    riskLevel: "Abnormal",
    scoringSource: "RULE",
    triggeredRules: ["Off-Hours Power Surge"],
    explanation: "Rule Engine phát hiện kWh vượt ngưỡng 45 kWh/h ngoài giờ (không đưa vào case điều tra AI).",
    alertId: "ALT-WF04-CAMPUS-RULE-05",
    alertName: "Rule vượt ngưỡng kWh ngoài giờ",
    processedAt: "2026-11-14T04:00:00.000Z",
  },
  {
    id: "tx-wf04-campus-normal",
    transactionReference: "ELEC-CMP-261114-06",
    projectId: "proj-wf04-campus-main",
    projectName: "Campus Main Meter",
    transactionType: "telemetry",
    entityReference: "MTR-BLD-A1",
    amount: 640000,
    currency: "VND",
    riskLevel: "Normal",
    confidence: 0.96,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: [],
    explanation: "Phụ tải điện giờ hành chính ổn định theo biểu đồ nền.",
    processedAt: "2026-11-14T09:00:00.000Z",
  },
  {
    id: "tx-wf04-branch-01",
    transactionReference: "ELEC-BRN-261113-01",
    projectId: "proj-wf04-branch-meter",
    projectName: "North Branch Meter",
    transactionType: "telemetry",
    entityReference: "MTR-NORTH-09",
    amount: 5120000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.92,
    modelVersion: "elec-anomaly-v2.4",
    scoringSource: "AI",
    triggeredRules: ["ai_night_transformer_load"],
    explanation: "Trạm biến áp chi nhánh Bắc ghi nhận công suất phản kháng tăng vọt lúc 22:10.",
    alertId: "ALT-WF04-BRANCH-01",
    alertName: "Tăng tải trạm biến áp chi nhánh Bắc",
    processedAt: "2026-11-13T22:10:00.000Z",
  },
  {
    id: "tx-wf04-exp-pre-01",
    transactionReference: "ELEC-EXP-260815-01",
    projectId: "proj-wf04-expired-meter",
    projectName: "Dormitory Grid Meter",
    transactionType: "telemetry",
    entityReference: "MTR-DORM-01",
    amount: 2740000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.9,
    modelVersion: "elec-anomaly-v2.1",
    scoringSource: "AI",
    triggeredRules: ["ai_night_hvac_surge"],
    explanation: "Cảnh báo AI phát sinh trước ngày hết hạn gói Subscription (đã mở case trước hạn).",
    alertId: "ALT-WF04-EXP-PRE-01",
    alertName: "Bất thường công tơ ký túc xá trước hết hạn gói",
    processedAt: "2026-08-15T09:15:00.000Z",
  },
  {
    id: "tx-wf04-exp-new-02",
    transactionReference: "ELEC-EXP-261113-02",
    projectId: "proj-wf04-expired-meter",
    projectName: "Dormitory Grid Meter",
    transactionType: "telemetry",
    entityReference: "MTR-DORM-03",
    amount: 3110000,
    currency: "VND",
    riskLevel: "Abnormal",
    confidence: 0.88,
    modelVersion: "elec-anomaly-v2.1",
    scoringSource: "AI",
    triggeredRules: ["ai_continuous_offhours_load"],
    explanation: "Cảnh báo AI phát sinh sau khi gói Subscription đã hết hạn (phải bị chặn mở case mới).",
    alertId: "ALT-WF04-EXP-NEW-02",
    alertName: "Bất thường công tơ ký túc xá sau hết hạn gói",
    processedAt: "2026-11-13T08:30:00.000Z",
  },
];

const expiredOperator = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-exp-op")!;
const preExpiryCaseResult = createInvestigationCase({
  caseId: "CASE-WF04-EXP-01",
  enterprise: builtExpired.enterprise,
  actor: expiredOperator,
  alertIds: ["ALT-WF04-EXP-PRE-01"],
  alerts: WF04_DEMO_TRANSACTIONS,
  existingCases: [],
  enterprises: WF04_DEMO_ENTERPRISES,
  projects: WF04_DEMO_PROJECTS,
  at: "2026-08-15T10:00:00.000Z",
  eventId: "CASE-WF04-EXP-01-evt-1",
  note: "Mở case hợp lệ trước thời điểm hết hạn gói Subscription (2026-09-01).",
});
if (!preExpiryCaseResult.ok) {
  throw new Error(
    `WF-04 pre-expiry demo case failed: ${preExpiryCaseResult.code} - ${preExpiryCaseResult.error}`,
  );
}

export const WF04_DEMO_INITIAL_CASES: readonly InvestigationCase[] = [
  preExpiryCaseResult.investigationCase,
];

export const WF04_DEMO_INITIAL_FEEDBACKS: readonly InvestigationReportFeedback[] = [];

// Optional review fixtures use separate alerts so existing interactive cases remain untouched.
export function getWf04ReviewSamples() {
  const operator = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-op")!;
  const investigator = WF04_DEMO_USERS.find(u => u.id === "usr-wf04-inv-1")!;
  const names = ["Bơm nước khu A chạy ban đêm", "HVAC khu A vượt lịch vận hành", "Điện phòng máy tăng cuối tuần", "Chiếu sáng thư viện ngoài giờ"];
  const transactions: TransactionRisk[] = names.map((name, i) => ({
    ...structuredClone(WF04_DEMO_TRANSACTIONS[0]),
    id: `tx-wf04-review-${i + 1}`,
    alertId: `ALT-WF04-REVIEW-${i + 1}`,
    transactionReference: `ELEC-REVIEW-${i + 1}`,
    entityReference: `MTR-REVIEW-${i + 1}`,
    alertName: name,
    explanation: `${name}. Dữ liệu giả lập để kiểm thử báo cáo và phản hồi.`,
    processedAt: "2026-11-16T01:00:00.000Z",
  }));
  const unwrap = (result: InvestigationCaseCommandResult): InvestigationCase => {
    if (!result.ok) throw new Error(`Invalid review sample: ${result.code}: ${result.error}`);
    return result.investigationCase;
  };
  const cases: InvestigationCase[] = [];
  for (const [index, alertIds] of [[transactions[0].alertId!, transactions[1].alertId!], [transactions[2].alertId!], [transactions[3].alertId!]].entries()) {
    const caseId = ["CASE-SAMPLE-CLOSED", "CASE-SAMPLE-REVIEW", "CASE-SAMPLE-WORKING"][index];
    let c = unwrap(createInvestigationCase({
      caseId, enterprise: builtCampus.enterprise, actor: operator, alertIds,
      alerts: transactions, existingCases: cases, enterprises: WF04_DEMO_ENTERPRISES,
      projects: WF04_DEMO_PROJECTS, at: "2026-11-16T02:00:00.000Z",
      note: "Hồ sơ mẫu để kiểm thử; không phải kết quả điều tra thực tế.",
    }));
    c = unwrap(assignInvestigatorToCase({ investigationCase: c, actor: operator, assigneeId: investigator.id, users: WF04_DEMO_USERS, at: "2026-11-16T02:10:00.000Z" }));
    if (index < 2) {
      c = unwrap(submitInvestigationReport({
        investigationCase: c, actor: investigator, at: "2026-11-16T03:00:00.000Z",
        reportId: `${caseId}-report-v1`,
        summary: index === 0 ? "Bơm nước chạy theo phiếu bảo trì; HVAC hoạt động ngoài lịch đã duyệt. Hai cảnh báo có kết quả khác nhau." : "Phòng máy tăng tải cuối tuần; cần Operator xem xét bằng chứng và kết luận.",
        alertResults: alertIds.map((alertId, j) => ({
          alertId,
          resultText: index === 0 && j === 0 ? "Hoạt động bảo trì hợp lệ theo lịch đã duyệt." : "Ghi nhận hoạt động ngoài lịch; đề nghị kiểm tra lịch điều khiển.",
          evidence: index === 0 && j === 0 ? "Phiếu bảo trì mẫu BT-016, nhật ký vận hành bơm 01:00–02:00." : "Nhật ký công tơ mẫu ngày 16/11 và lịch sử bật/tắt thiết bị; chưa có phiếu cho phép ngoài giờ.",
        })),
      }));
    }
    if (index === 0) c = unwrap(confirmInvestigationCaseReport({
      investigationCase: c, actor: operator, at: "2026-11-16T04:00:00.000Z",
      reportId: c.reports[0].reportId, reportVersion: 1,
      finalSummary: "Xác nhận bảo trì bơm hợp lệ; HVAC chạy ngoài lịch cần điều chỉnh. Giữ kết quả riêng từng cảnh báo.",
    }));
    cases.push(c);
  }
  return { transactions, cases };
}

export function getWf04DemoBundle(): {
  rules: RuleTemplate[];
  ruleSets: ManagedRuleSet[];
  enterprises: Enterprise[];
  projects: ProjectItem[];
  users: UserProfile[];
  transactions: TransactionRisk[];
  initialCases: InvestigationCase[];
  initialFeedbacks: InvestigationReportFeedback[];
} {
  return {
    rules: structuredClone([...WF04_DEMO_RULES]),
    ruleSets: structuredClone([...WF04_DEMO_RULE_SETS]),
    enterprises: structuredClone([...WF04_DEMO_ENTERPRISES]),
    projects: structuredClone([...WF04_DEMO_PROJECTS]),
    users: structuredClone([...WF04_DEMO_USERS]),
    transactions: structuredClone([...WF04_DEMO_TRANSACTIONS]),
    initialCases: structuredClone([...WF04_DEMO_INITIAL_CASES]),
    initialFeedbacks: structuredClone([...WF04_DEMO_INITIAL_FEEDBACKS]),
  };
}

function mergeUniqueBy<T>(
  existing: readonly T[],
  additions: readonly T[],
  getKey: (item: T) => string,
): T[] {
  const seen = new Set(existing.map(getKey));
  const next = structuredClone([...existing]);
  for (const item of additions) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      next.push(structuredClone(item));
    }
  }
  return next;
}

function mergeUniqueFeedbacks(
  existing: readonly InvestigationReportFeedback[],
  additions: readonly InvestigationReportFeedback[],
): InvestigationReportFeedback[] {
  const seenIds = new Set(existing.map(item => item.feedbackId));
  const seenCompositeKeys = new Set(
    existing.map(
      item => `${item.enterpriseId}::${item.caseId}::${item.reportId}::${item.reportVersion}`,
    ),
  );
  const next = structuredClone([...existing]);
  for (const item of additions) {
    const compositeKey = `${item.enterpriseId}::${item.caseId}::${item.reportId}::${item.reportVersion}`;
    if (!seenIds.has(item.feedbackId) && !seenCompositeKeys.has(compositeKey)) {
      seenIds.add(item.feedbackId);
      seenCompositeKeys.add(compositeKey);
      next.push(structuredClone(item));
    }
  }
  return next;
}

/**
 * Non-destructively merges WF-04 demo fixtures into workspace v4 while backing up the
 * prior workspace into `preDemoSnapshot`. Idempotent when already active.
 */
export function applyWf04DemoWorkspace(args: {
  currentPayload: WorkspacePayloadV4;
  currentUsers: readonly UserProfile[];
  savedAt: string;
  includeReviewSamples?: boolean;
}): {
  readonly payload: WorkspacePayloadV4;
  readonly users: UserProfile[];
  readonly applied: boolean;
} {
  const { currentPayload, currentUsers, savedAt } = args;
  const bundle = getWf04DemoBundle();
  if (args.includeReviewSamples) {
    const samples = getWf04ReviewSamples();
    bundle.transactions.push(...samples.transactions);
    bundle.initialCases.push(...samples.cases);
  }

  const snapshot: PreDemoWorkspaceSnapshot =
    currentPayload.wf04DemoActive &&
    isValidPreDemoSnapshotShape(currentPayload.preDemoSnapshot)
      ? structuredClone(currentPayload.preDemoSnapshot)
      : {
          savedAt,
          rules: structuredClone([...currentPayload.rules]),
          ruleSets: structuredClone([...currentPayload.ruleSets]),
          enterprises: structuredClone([...currentPayload.enterprises]),
          legacyUnassigned: structuredClone([...currentPayload.legacyUnassigned]),
          projects: structuredClone([...currentPayload.projects]),
          transactions: structuredClone([...currentPayload.transactions]),
          auditLogs: structuredClone([...currentPayload.auditLogs]),
          users: structuredClone([...currentUsers]),
          investigationCases: structuredClone([...currentPayload.investigationCases]),
          legacyCaseArchive: structuredClone([...currentPayload.legacyCaseArchive]),
          reportFeedbacks: structuredClone([...(currentPayload.reportFeedbacks ?? [])]),
          migrationMeta: structuredClone(currentPayload.migrationMeta),
        };

  const nextPayload: WorkspacePayloadV4 = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    rules: mergeUniqueBy(currentPayload.rules, bundle.rules, r => r.id),
    ruleSets: mergeUniqueBy(currentPayload.ruleSets, bundle.ruleSets, s => s.id),
    enterprises: mergeUniqueBy(currentPayload.enterprises, bundle.enterprises, e => e.id),
    legacyUnassigned: structuredClone([...currentPayload.legacyUnassigned]),
    projects: mergeUniqueBy(currentPayload.projects, bundle.projects, p => p.id),
    transactions: mergeUniqueBy(currentPayload.transactions, bundle.transactions, tx => tx.id),
    auditLogs: structuredClone([...currentPayload.auditLogs]),
    investigationCases: mergeUniqueBy(
      currentPayload.investigationCases,
      bundle.initialCases,
      c => c.caseId,
    ),
    legacyCaseArchive: structuredClone([...currentPayload.legacyCaseArchive]),
    reportFeedbacks: mergeUniqueFeedbacks(
      currentPayload.reportFeedbacks ?? [],
      bundle.initialFeedbacks,
    ),
    migrationMeta: structuredClone(currentPayload.migrationMeta),
    wf04DemoActive: true,
    preDemoSnapshot: snapshot,
  };

  const nextUsers = mergeUniqueBy(currentUsers, bundle.users, u => u.id);
  return {
    payload: nextPayload,
    users: nextUsers,
    applied: !currentPayload.wf04DemoActive,
  };
}

/**
 * Restores the exact workspace and users captured before activating WF-04 demo fixtures.
 * Validates `preDemoSnapshot` structurally so corrupted snapshots never crash or overwrite source.
 */
export function restorePreDemoWorkspace(args: {
  currentPayload: WorkspacePayloadV4;
}): {
  readonly payload: WorkspacePayloadV4;
  readonly users: UserProfile[];
  readonly restored: boolean;
} {
  const { currentPayload } = args;
  if (
    !currentPayload.wf04DemoActive ||
    !isValidPreDemoSnapshotShape(currentPayload.preDemoSnapshot)
  ) {
    return {
      payload: structuredClone(currentPayload),
      users: [],
      restored: false,
    };
  }

  const snap = structuredClone(currentPayload.preDemoSnapshot);
  const restoredPayload: WorkspacePayloadV4 = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    rules: snap.rules,
    ruleSets: snap.ruleSets,
    enterprises: snap.enterprises,
    legacyUnassigned: snap.legacyUnassigned,
    projects: snap.projects,
    transactions: snap.transactions,
    auditLogs: snap.auditLogs,
    investigationCases: snap.investigationCases,
    legacyCaseArchive: snap.legacyCaseArchive,
    reportFeedbacks: snap.reportFeedbacks ?? [],
    migrationMeta: snap.migrationMeta,
    wf04DemoActive: false,
  };

  return {
    payload: restoredPayload,
    users: [...snap.users],
    restored: true,
  };
}

/**
 * Applies WF-04 demo fixtures and coordinates persisting both workspace v4 and users v1
 * with rollback on failure.
 */
export function applyAndPersistWf04Demo(args: {
  currentPayload: WorkspacePayloadV4;
  currentUsers: readonly UserProfile[];
  savedAt: string;
  includeReviewSamples?: boolean;
  restoreStatus: WorkspaceRestoreStatus;
  storage?: StorageLike;
  allowRecoveryOverwrite?: boolean;
}): PersistCoordinatedResult & {
  readonly applied: boolean;
  readonly payload: WorkspacePayloadV4;
  readonly users: UserProfile[];
} {
  const applied = applyWf04DemoWorkspace({
    currentPayload: args.currentPayload,
    currentUsers: args.currentUsers,
    savedAt: args.savedAt,
    includeReviewSamples: args.includeReviewSamples,
  });

  const writeRes = persistWorkspaceAndUsers({
    payload: applied.payload,
    users: applied.users,
    restoreStatus: args.restoreStatus,
    storage: args.storage,
    operation: "applyWf04Demo",
    allowRecoveryOverwrite: args.allowRecoveryOverwrite,
  });

  if (!writeRes.ok) {
    if (writeRes.committed && writeRes.cleanupPending) {
      return {
        ...writeRes,
        applied: applied.applied,
        payload: applied.payload,
        users: applied.users,
      };
    }
    const fallbackPayload = writeRes.rolledBack
      ? structuredClone(args.currentPayload)
      : applied.payload;
    const fallbackUsers = writeRes.rolledBack
      ? structuredClone([...args.currentUsers])
      : applied.users;
    return {
      ...writeRes,
      applied: false,
      payload: fallbackPayload,
      users: fallbackUsers,
    };
  }

  return {
    ...writeRes,
    applied: applied.applied,
    payload: applied.payload,
    users: applied.users,
  };
}

/**
 * Restores pre-demo workspace and users through the shared two-key coordinator, keeping
 * `preDemoSnapshot` intact until both workspace v4 and users v1 writes succeed.
 */
export function restoreAndPersistPreDemoWorkspace(args: {
  currentPayload: WorkspacePayloadV4;
  currentUsers?: readonly UserProfile[];
  restoreStatus: WorkspaceRestoreStatus;
  storage?: StorageLike;
  allowRecoveryOverwrite?: boolean;
}): PersistCoordinatedResult & {
  readonly restored: boolean;
  readonly payload: WorkspacePayloadV4;
  readonly users: UserProfile[];
} {
  const { currentPayload } = args;
  const fallbackUsers = args.currentUsers
    ? structuredClone([...args.currentUsers])
    : isValidPreDemoSnapshotShape(currentPayload.preDemoSnapshot)
      ? structuredClone([...currentPayload.preDemoSnapshot.users])
      : [];

  if (
    !currentPayload.wf04DemoActive ||
    !isValidPreDemoSnapshotShape(currentPayload.preDemoSnapshot)
  ) {
    return {
      ok: false,
      errorCode: "INVALID_WORKSPACE_SHAPE",
      error: "Không tìm thấy bản chụp trước demo (preDemoSnapshot) hợp lệ để khôi phục.",
      rolledBack: false,
      rollbackFailed: false,
      recoveryRequired: false,
      restored: false,
      payload: structuredClone(currentPayload),
      users: fallbackUsers,
    };
  }

  const preservedSnapshot = structuredClone(currentPayload.preDemoSnapshot);
  const restored = restorePreDemoWorkspace({ currentPayload });

  const writeRes = persistWorkspaceAndUsers({
    payload: restored.payload,
    users: restored.users,
    restoreStatus: args.restoreStatus,
    storage: args.storage,
    operation: "restorePreDemoWorkspace",
    allowRecoveryOverwrite: args.allowRecoveryOverwrite,
    preservePreDemoSnapshotUntilCommitted: preservedSnapshot,
  });

  if (!writeRes.ok) {
    if (writeRes.committed && writeRes.cleanupPending) {
      return {
        ...writeRes,
        preservePreDemoSnapshot: undefined,
        restored: true,
        payload: restored.payload,
        users: restored.users,
      };
    }
    const safePayload: WorkspacePayloadV4 = {
      ...structuredClone(currentPayload),
      wf04DemoActive: true,
      preDemoSnapshot: preservedSnapshot,
    };
    return {
      ...writeRes,
      preservePreDemoSnapshot: preservedSnapshot,
      restored: false,
      payload: safePayload,
      users: fallbackUsers,
    };
  }

  return {
    ...writeRes,
    restored: true,
    payload: restored.payload,
    users: restored.users,
  };
}

export const WF04_DEV_TOOLS_QUERY_PARAM = "wf04Dev";
export const WF04_DEV_TOOLS_STORAGE_KEY = "fg_wf04_dev_tools";

export interface FraudGuardWf04DevTools {
  loadSampleData: () => void;
  restorePreDemo: () => void;
  isDemoActive: () => boolean;
}

export interface Wf04DevToolsEnvInput {
  readonly NODE_ENV?: string;
  readonly NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS?: string;
}

export interface ResolveWf04DevToolsOptions {
  readonly env?: Wf04DevToolsEnvInput;
  readonly search?: string | null;
  readonly storage?: Pick<Storage, "getItem"> | null;
  readonly getStorage?: () => Pick<Storage, "getItem"> | null | undefined;
}

/**
 * Checks whether the current build/runtime environment allows WF-04 sample tools.
 * Uses direct static process.env property reads so Next.js client bundling inlines flags cleanly.
 */
export function isWf04DevToolsEnvironmentAllowed(env?: Wf04DevToolsEnvInput): boolean {
  let nodeEnv: string | undefined;
  if (env && "NODE_ENV" in env) {
    nodeEnv = env.NODE_ENV;
  } else {
    try {
      nodeEnv = process.env.NODE_ENV;
    } catch {
      nodeEnv = undefined;
    }
  }

  let enableFlag: string | undefined;
  if (env && "NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS" in env) {
    enableFlag = env.NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS;
  } else {
    try {
      enableFlag = process.env.NEXT_PUBLIC_ENABLE_WF04_DEV_TOOLS;
    } catch {
      enableFlag = undefined;
    }
  }

  return nodeEnv === "development" || enableFlag === "true";
}

/**
 * Checks whether the current client context explicitly opted into WF-04 sample tools
 * via URL query parameter or localStorage flag without throwing on storage access errors.
 */
export function isWf04DevToolsExplicitlyRequested(
  options?: Omit<ResolveWf04DevToolsOptions, "env">,
): boolean {
  try {
    const search = options?.search ?? "";
    if (search) {
      const normalized = search.startsWith("?") ? search : `?${search}`;
      const searchParams = new URL(`http://localhost/${normalized}`).searchParams;
      if (searchParams.get(WF04_DEV_TOOLS_QUERY_PARAM) === "1") {
        return true;
      }
    }
  } catch {
    // Ignore malformed query strings and continue to storage check.
  }

  try {
    const storage = options?.getStorage ? options.getStorage() : options?.storage;
    if (storage && storage.getItem(WF04_DEV_TOOLS_STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Single unified predicate gating both the dev sample bar UI and window.__fgWf04DevTools.
 */
export function resolveWf04DevToolsEnabled(options?: ResolveWf04DevToolsOptions): boolean {
  return (
    isWf04DevToolsEnvironmentAllowed(options?.env) &&
    isWf04DevToolsExplicitlyRequested(options)
  );
}

/**
 * Registers window.__fgWf04DevTools only when enabled, neutralizing stale references on disable/unmount.
 */
export function syncWf04DevToolsWindowBinding(options: {
  readonly targetWindow?: { __fgWf04DevTools?: FraudGuardWf04DevTools } | null;
  readonly enabled: boolean;
  readonly onLoadSampleData: () => void;
  readonly onRestorePreDemo: () => void;
  readonly isDemoActive: () => boolean;
}): () => void {
  const { targetWindow, enabled, onLoadSampleData, onRestorePreDemo, isDemoActive } = options;
  if (!targetWindow) {
    return () => {};
  }

  if (!enabled) {
    delete targetWindow.__fgWf04DevTools;
    return () => {
      delete targetWindow.__fgWf04DevTools;
    };
  }

  let active = true;
  const api: FraudGuardWf04DevTools = {
    loadSampleData: () => {
      if (!active) return;
      onLoadSampleData();
    },
    restorePreDemo: () => {
      if (!active) return;
      onRestorePreDemo();
    },
    isDemoActive: () => (active ? Boolean(isDemoActive()) : false),
  };

  targetWindow.__fgWf04DevTools = api;

  return () => {
    active = false;
    if (targetWindow.__fgWf04DevTools === api) {
      delete targetWindow.__fgWf04DevTools;
    }
  };
}
