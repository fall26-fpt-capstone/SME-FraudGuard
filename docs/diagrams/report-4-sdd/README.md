# Report 4 design diagrams

The following diagram sources support Report 4:

| Section | Source and exports |
| --- | --- |
| 1.1 System Architecture | [PlantUML relationship model](system-design/architecture.puml), [SVG layout renderer](system-design/render_architecture.py), [PNG](system-design/exports/architecture.png), [SVG](system-design/exports/architecture.svg) |
| 2. Database Design | [Model, editable sources and exports](database-design/README.md) |
| 3. Detailed Design | [SRS-aligned class, sequence and state sources, catalogue and exports](detailed-design/README.md) |

Package Diagram remains outside the section 3 task. The ERD is a proposed documentation model, not an applied database migration. Detailed Design follows the finalized functional requirements; older provisional ERD notes are not overrides of confirmed SRS decisions. No application contracts, schema or migrations are changed by these documentation assets.

The architecture's publication image is rendered from its fixed-layout SVG with local logo assets. The PlantUML file preserves the same relationships; automatic PlantUML layout differs from the publication image. Validate it with Java 21 / PlantUML 1.2026.9:

```powershell
java -jar path/to/plantuml.jar -checkonly system-design/architecture.puml
```

Keep source and exports synchronized and check the final report page after changing labels or layout. Uploaded Google Docs images do not refresh automatically.

## Architecture layout and assets

Run `python docs/diagrams/report-4-sdd/system-design/render_architecture.py` from the repository root to regenerate the self-contained SVG. Export it to PNG with an SVG-capable image renderer; this snapshot uses the existing bundled Sharp renderer at 150 dpi. No application dependency or deployment configuration is added.

Cloudflare is shown for DNS resolution, consistent with the team's selected scope and [Cloudflare DNS documentation](https://developers.cloudflare.com/dns/). The diagram does not select Tunnel, proxy mode, an AWS compute product, AI hosting placement, or an email vendor. The separate AI node represents a logical service, not a claim that an external AI vendor hosts it. VNPay is the team's current gateway choice.

Brand SVG snapshots for AWS, Cloudflare, Next.js, React, Spring, PostgreSQL and Neon are from the [SVG Logos collection](https://github.com/gilbarbara/logos); VNPay's SVG comes from its [official site](https://vnpay.vn/). Exact asset URLs are retained in [sources.json](system-design/assets/sources.json). Logos retain their respective owners' marks. Browser, AI and email symbols are generic vector artwork in the renderer.
