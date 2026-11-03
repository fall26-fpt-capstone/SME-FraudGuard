# Report 4 — Software Design Description

Project **FA26SE215**, group **GFA26SE97**.

- [Native working Google Doc](https://docs.google.com/document/d/1mDsSmFO3WhotavmjuqLDiMffQZpjJftQtttvYGJf-a4/edit).
- [Review PDF export](SEP490_FA26SE215_R2_Report4_SDD.pdf), exported from the native document. It is a review snapshot, not a finalized submission.
- [Organized PlantUML source and image exports](../../diagrams/report-4-sdd/README.md).
- [Database Design Diagram](../../diagrams/report-4-sdd/database-design/README.md): the approved provisional figure is inserted in native Report 4 section 2 with its caption only. Maximum simultaneous Staff assignment remains open.
- [Editable architecture section](sections/system-architecture.md) and its linked figure contain the selected AWS/Cloudflare/Neon/VNPay design. Synchronize the native Google Doc with this section before exporting the submission PDF. The existing review PDF remains the last native-document export.

The local architecture source shows the selected technology architecture: AWS hosting, Cloudflare DNS, Next.js/React portals, a Spring Boot modular-monolith backend, Neon/PostgreSQL, a generic AI service, domain email and the current VNPay gateway choice. Its exact logo layout is generated as SVG alongside its PlantUML relationship source. AWS product selection, AI placement/framework and the email vendor remain unspecified. Section 3 is deferred by the team; only the architecture and database diagrams are retained in the diagram sources.

The Package Diagram and detailed class/state design remain deferred. Section 2 contains a proposed database diagram, not an applied schema or migration. AI recovery eligibility is confirmed by event time: fallback events inside a historical Subscription period remain eligible after current expiry. Alert reconciliation, recovery scheduling and exact expiry boundaries remain retained in the Report 5 workbook's Decisions sheet.

Use current registration v2 and confirmed SRS decisions. The diagram labels express logical responsibilities, not unapproved Java packages, endpoints or database state names. Preserve module API boundaries when translating this design into code.
