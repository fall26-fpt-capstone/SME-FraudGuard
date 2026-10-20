# OWNERS

> Chỉ để tài liệu hóa — không ảnh hưởng code hay build.

| Package | Owner | Ghi chú |
|---|---|---|
| `com.fraudguard.ingestion` | **Dev A** | 3 kênh ingest: CSV/Excel, REST + API Key, Webhook |
| `com.fraudguard.dashboard` | **Dev A** | Case queue, thống kê, export |
| `com.fraudguard.ruleengine` | **Dev B** | Rule/RuleVersion, scoring, **case management** |
| `com.fraudguard.aiclient` | Thành viên AI/lab (contract); Dev B tích hợp | Dev A/B không sửa contract mà không báo trước |
| `com.fraudguard.common` | Chung | Shared kernel tối thiểu — sửa thì báo cả nhóm |

**Điểm giao nhau giữa hai dev** (đổi là phải thỏa thuận):
- `ingestion.api.TransactionIngestedEvent` — hợp đồng ingestion → ruleengine.
- `ruleengine.api.CaseQueryPort` (+ `CaseSummary`, `CaseStatus`, `Severity`) — hợp đồng dashboard → ruleengine.
