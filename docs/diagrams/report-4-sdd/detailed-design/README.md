# Report 4 detailed design diagrams

Section 3 follows Report 3 functional requirements 3.2-3.15: all 65 detailed functions are covered in 14 groups. The 68 monochrome UML figures comprise 14 class diagrams, 43 sequence diagrams and 11 state diagrams. Sequence figures group related functions; the catalogue gives exact SRS references for each figure. The State Diagram headings follow the reference report: processing activities, decisions and guarded branches are shown for applicable operations.

- `build_design.py`: source-generation entry point.
- `design_model.json`: editable group, domain and SRS coverage model.
- `technical_design.py`: technical class layout, typed sequence flows and reference-style activity diagrams, with coverage/participant consistency assertions.
- `*.puml`: generated editable PlantUML source per figure.
- `catalogue.json`: ordered figures, captions, SRS references and report paragraphs.
- `exports/*.svg`: vector figures for inspection and reuse.
- `exports/*.png`: publication images inserted into Google Docs, preserving aspect ratio.
- [Section 3 text source](../../../02_Reports/Report4_SDD/sections/detailed-design.md).

The reference report's style is retained: black/white UML class compartments and relationships, sequence lifelines with activation bars, numbered method calls/returns, participant footboxes and conditional fragments, and processing activities with decision diamonds, yes/no branches and start/end nodes under the State Diagram headings. Images and centered numbered captions appear under class, sequence and applicable state headings. Each figure occupies its own report page so captions stay with their diagrams.

Regenerate from the repository root with Python 3, Java 21 and PlantUML 1.2026.9 (Graphviz is required for class layouts):

```powershell
python docs/diagrams/report-4-sdd/detailed-design/build_design.py
java -jar path/to/plantuml.jar -checkonly docs/diagrams/report-4-sdd/detailed-design
java -jar path/to/plantuml.jar -tsvg -o exports docs/diagrams/report-4-sdd/detailed-design
java "-DPLANTUML_LIMIT_SIZE=16384" -jar path/to/plantuml.jar -Sdpi=200 -tpng -o exports docs/diagrams/report-4-sdd/detailed-design
```

The generator checks complete SRS-function coverage and unique figure IDs. PlantUML checks syntax; visual inspection is still required for labels, relationships and layout. Google Docs images do not automatically refresh when local images change. Reinsert changed figures and inspect the native report's PDF before submission.

This is target design, not implementation evidence. Logical services/classes/operations do not prescribe Java packages, endpoints or migrations. Cross-module interactions must use module public APIs/ports, preserving the modular monolith's `api`/`internal` boundary. Session state, field grants, draft revisions and operation metadata are logical requirements; the provisional section 2 model may need later schema alignment. No unconfirmed Webhook/payment/AI wire formats, technical limits, timeout values or retry schedules are selected here.

Current SRS decisions govern roles, sensitive disclosure, configuration application, Subscription boundaries, recovery alert reconciliation and case transitions. External email failure is separate from committed business effects. Business conclusions are retained history, not automatic model-error/training labels or authorization to enforce customer-system actions.
