# Report 4 — Software Design Description

Project **FA26SE215**, group **GFA26SE97**.

- [Native working Google Doc](https://docs.google.com/document/d/1mDsSmFO3WhotavmjuqLDiMffQZpjJftQtttvYGJf-a4/edit).
- [Review PDF export](SEP490_FA26SE215_R2_Report4_SDD.pdf), exported from the native document. It is a review snapshot, not a finalized submission.
- [Organized PlantUML source and image exports](../../diagrams/report-4-sdd/README.md).
- [Database Design Diagram](../../diagrams/report-4-sdd/database-design/README.md): the approved provisional figure is inserted in native Report 4 section 2 with its caption only. Maximum simultaneous Staff assignment remains open.
- [Editable architecture section](sections/system-architecture.md) and its linked figure contain the selected AWS/Cloudflare/Neon/VNPay design. Synchronize the native Google Doc with this section before exporting the submission PDF. The existing review PDF remains the last native-document export.
- [Package diagram section](sections/package-diagram.md): backend scaffold overview and the permitted layered dependency convention, with editable PlantUML and publication images.
- [Editable detailed design](sections/detailed-design.md) and [UML sources and exports](../../diagrams/report-4-sdd/detailed-design/README.md) cover all 65 SRS detailed functions in 14 business groups. The 68 figures comprise 14 class, 43 sequence and 11 state diagrams.

The local architecture source shows the selected technology architecture: AWS hosting, Cloudflare DNS, Next.js/React portals, a Spring Boot modular-monolith backend, Neon/PostgreSQL, a generic AI service, domain email and the current VNPay gateway choice. Its exact logo layout is generated as SVG alongside its PlantUML relationship source. AWS product selection, AI placement/framework and the email vendor remain unspecified.

Section 1.2 reflects the agreed layered backend scaffold; its dependency arrows describe the implementation convention rather than existing business calls. Section 2 contains a proposed database diagram, not an applied schema or migration. Section 3 follows the current detailed SRS, including concurrent Staff assignment, exact-revision configuration testing/application, [start, expiry) validity in Asia/Ho_Chi_Minh with UTC storage, historical event-time AI recovery, one AI Alert per transaction and the four-stage case lifecycle. These confirmed details supersede older provisional notes or unresolved-decision entries. Exact recovery scheduling and external wire contracts remain unspecified.

Use current registration v2 and confirmed SRS decisions. The diagram labels express logical responsibilities, not unapproved Java packages, endpoints or database state names. Preserve module API boundaries when translating this design into code.
