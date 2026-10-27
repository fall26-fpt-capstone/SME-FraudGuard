import type { TransactionRisk } from '../components/fraudguard-dashboard/types';
export function isSandboxTransaction(transaction: TransactionRisk): boolean {
 if (transaction.dataOrigin) return transaction.dataOrigin === 'sandbox';
 return transaction.id?.startsWith('demo-') === true && transaction.explanation?.startsWith('Sandbox demo: ') === true;
}
