# Product overview diagrams

`system-context.puml` defines the context diagram in Report 3, section 1. It treats SME-FraudGuard as one system; the Rule Engine, AI Service, portals and storage are internal. The five human roles and customer transaction systems interact across that boundary.

The diagram follows context-level DFD notation: the circle labelled SME-FraudGuard represents the entire system, rectangles represent external entities, and each labelled arrow represents one directed data flow. Request and response flows have separate arrows; labels name the exchanged data. The team omits the process number from this context view. Customer systems submit transactions through REST API or Webhook. Authorized enterprise users upload CSV/Excel files through the portal; the diagram does not assign that permission to a specific role before the authorization section is defined.

The diagram follows the current Registration v2 and BM03 in [`01_Registration`](../../../01_Registration/). It does not use the retired v1 business specification.

`exports/system-context-drawio.png` is the image inserted into Google Docs. It was restyled with the built-in imagegen tool at the team's request, using the PlantUML render as content reference. Its central process is a true circle, with six external entities and twelve directed flows. Labels and arrow directions were checked against the source. The generation prompt is in `system-context.imagegen.txt`.

Only the final report image is retained in `exports/`. The PlantUML source and generation prompt preserve its semantic content and reconstruction instructions. Automatic PlantUML rendering differs from the styled final image.

## Render and verify

Use Java 21 and PlantUML 1.2026.9 to validate the semantic source:

```sh
java -jar path/to/plantuml.jar -checkonly system-context.puml
```

If a temporary reference render is needed, export it outside the publication `exports/` folder. After changing a flow, update the final styled image and inspect labels, arrow directions and report page fit. Uploaded Google Docs images do not refresh automatically.
