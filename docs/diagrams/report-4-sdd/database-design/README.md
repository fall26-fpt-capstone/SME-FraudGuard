# Database Design Diagram

The publication diagram uses the requested flat database-tool style: blue table headers, column names/types, PK/FK labels and orthogonal crow's-foot connectors. It contains all 33 proposed tables, 229 columns and 81 FK references from `schema.json`, without duplicate table cards or domain frames.

- [SVG](exports/database-design.svg): self-contained vector diagram for zooming/export.
- [PNG](exports/database-design.png): complete raster export, without PlantUML's image-size clipping.
- [draw.io](database-design.drawio): editable table rows, FK anchors and routed connectors; open in diagrams.net.
- [DBML](database-design.dbml): portable table/reference source for database-diagram tools.
- [Model](schema.json): proposed table/field/reference definitions and design constraints.

Regenerate the primary SVG, draw.io and DBML files with Python 3 (standard library only):

```powershell
python docs/diagrams/report-4-sdd/database-design/render_database_design.py
```

Export the SVG as PNG with an SVG-capable renderer. The current PNG uses the existing bundled Sharp renderer at the SVG's full 3320 × 2514 size. The routing self-check verifies that every FK is represented, all connector segments are orthogonal, and no connector passes through a table interior.

This is a proposed documentation model, not an applied migration. State enums, maximum simultaneously assigned Staff, retention, key management and alert-reconciliation details remain unselected. Case–Alert uses the delegated proposal: one case may contain multiple AI Alerts, each AI Alert belongs to at most one case. `schema.json` retains the workspace/composite-key and AI-only case-link constraints; the simple DBML references do not implement all compound constraints or partial indexes.

Only diagram assets are intended for Report 4 section 2; this README is rendering guidance, not report prose or a data dictionary.
