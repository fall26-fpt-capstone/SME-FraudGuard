# Functional requirement diagrams

These sources support Report 3 section 3.1. Five role-specific screen flows use a pale login box, gray rectangular main views, rounded action/detail nodes and orthogonal arrows. They describe planned navigation, not implemented UI or automatic lifecycle transitions. Shared first-login setup, backend authorization, production activation and sensitive-field checks still apply.

Two conceptual ERD views show workspace/configuration/plans and processing/investigation. Shared Workspace and Account concepts are the same entities across views. The SRS groups some implementation records into business concepts; Report 4 contains the provisional attribute-level database model. Multiple Staff may be assigned concurrently and historical assignment records are preserved. Only AI Alerts can originate cases; Rule Alerts cannot.

Files:

- `diagram-model.json`: role navigation and entity descriptions.
- `render_diagrams.py`: SVG, PNG and editable draw.io export with model, bounds and ERD obstacle-routing checks.
- `*.drawio`: editable nodes/connectors for diagrams.net.
- `exports/*.svg`: vector images.
- `exports/*.png`: images inserted into the native SRS.

Regenerate on Windows with Python and the installed Pillow library:

```powershell
python docs/diagrams/report-3-srs/functional-requirements/render_diagrams.py
```

The renderer uses the standard Windows Arial fonts. Its assertions check unique nodes, valid relationships, image bounds and orthogonal ERD paths outside entity interiors. Geometric checks do not replace inspection of the images and the report pages. Google Docs images do not refresh when these files change: replace the image and preserve its aspect ratio.

Cardinality labels describe the conceptual relationship. An Alert-to-Case connection is AI-only. Case alert grouping follows the current proposed Report 4 model and still needs final team review with the detailed SRS. No database migration is created by these diagrams.
