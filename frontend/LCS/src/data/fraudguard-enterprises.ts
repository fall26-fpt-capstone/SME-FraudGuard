import type { Enterprise } from "@/types/enterprise";

// Synthetic ownership and staff assignments used by the local demo.
export const demoEnterprises: Enterprise[] = [
 { id: 'tenant-techpay', name: 'TechPay Solution JSC', projectIds: ['proj-checkout', 'proj-wallet'], deploymentStaffId: 'usr-deployment' },
 { id: 'tenant-fastretail', name: 'FastRetail Commerce SME', projectIds: ['proj-market'], deploymentStaffId: 'usr-deployment' },
 { id: 'tenant-edulearn', name: 'EduLearn EdTech Academy', projectIds: ['proj-edtech'], deploymentStaffId: 'usr-deployment-2' },
 { id: 'tenant-abc', name: 'ABC Fashion', projectIds: ['proj-abc-cod'], deploymentStaffId: 'usr-deployment' },
 { id: 'tenant-greenmart', name: 'GreenMart Global Online', projectIds: [], deploymentStaffId: 'usr-deployment-2' },
];
