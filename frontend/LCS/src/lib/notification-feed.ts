import { isSandboxTransaction } from './transaction-origin';
import type { TransactionRisk } from '../components/fraudguard-dashboard/types';
export function notificationId(tx: TransactionRisk) {
 return JSON.stringify([tx.id, tx.caseStatus, tx.assignedInvestigatorId ?? tx.assignedInvestigator, tx.assignedAt, tx.caseDecision?.decidedAt, tx.investigationReport?.submittedAt]);
}
export function notificationTime(tx: TransactionRisk) {
 return [tx.processedAt, tx.assignedAt, tx.caseDecision?.decidedAt, tx.investigationReport?.submittedAt]
  .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
  .sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
}
export function notificationFeed(transactions: TransactionRisk[]) {
 return transactions.filter(tx=>!isSandboxTransaction(tx) && tx.riskLevel==='Abnormal' && (tx.alertId || tx.caseId)).slice()
  .sort((a,b)=>(Date.parse(notificationTime(b) ?? '')||0)-(Date.parse(notificationTime(a) ?? '')||0));
}
export function notificationLabel(tx: TransactionRisk, vi: boolean) {
 if(tx.scoringSource !== 'AI') return vi ? (tx.scoringSource === 'RULE_FALLBACK' ? 'Cảnh báo từ quy tắc dự phòng' : 'Giao dịch cần kiểm tra') : (tx.scoringSource === 'RULE_FALLBACK' ? 'Rules fallback alert' : 'Transaction to review');
 const labels: Record<string,[string,string]> = {
  Open:['Có cảnh báo AI mới','New AI alert'], Assigned:['Đã giao người điều tra','Investigator assigned'],
  Investigating:['Đang điều tra','Investigation in progress'],Reported:['Đã gửi báo cáo điều tra','Investigation report submitted'],
  'Confirmed Fraud':['Đã xác nhận gian lận','Fraud confirmed'], 'False Alarm':['Đã xác nhận cảnh báo nhầm','False alarm confirmed'],Resolved:['Đã hoàn tất xử lý','Case resolved']
 };
 return (labels[tx.caseStatus ?? 'Open'] ?? labels.Open)[vi ? 0 : 1];
}
