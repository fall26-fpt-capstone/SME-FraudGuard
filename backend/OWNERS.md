# OWNERS

> Documentation only — does not affect code or builds.

| Package | Owner | Notes |
|---|---|---|
| `com.fraudguard.ingestion` | **Dev A** | 3 ingestion channels: CSV/Excel, REST + API Key, Webhook |
| `com.fraudguard.dashboard` | **Dev A** | Case queue, statistics, export |
| `com.fraudguard.ruleengine` | **Dev B** | Rule/RuleVersion, scoring, **case management** |
| `com.fraudguard.aiclient` | AI/lab member (contract); Dev B integrates | Dev A/B must not change the contract without prior notice |
| `com.fraudguard.common` | Shared | Minimal shared kernel — notify the whole team when changing it |

**Coordination points between the two developers** (changes require agreement):
- `ingestion.api.TransactionIngestedEvent` — ingestion → ruleengine contract.
- `ruleengine.api.CaseQueryPort` (+ `CaseSummary`, `CaseStatus`, `Severity`) — dashboard → ruleengine contract.
