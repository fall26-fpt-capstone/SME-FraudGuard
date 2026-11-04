# Report 4 design diagrams

The following diagram sources support Report 4:

| Section | Source and exports |
| --- | --- |
| 1.1 System Architecture | [PlantUML relationship model](system-design/architecture.puml), [SVG layout renderer](system-design/render_architecture.py), [PNG](system-design/exports/architecture.png), [SVG](system-design/exports/architecture.svg) |
| 1.2 Package Diagram | [Overview source](system-design/package-overview.puml), [layer source](system-design/package-layers.puml), [overview PNG](system-design/exports/package-overview.png), [layer PNG](system-design/exports/package-layers.png) |
| 2. Database Design | [Model, editable sources and exports](database-design/README.md) |
| 3. Detailed Design | [SRS-aligned class, sequence and state sources, catalogue and exports](detailed-design/README.md) |

Package diagrams reflect the agreed backend scaffold: eleven business modules, common infrastructure and integration adapters. The layer diagram shows permitted design dependencies, not implemented runtime calls. The ERD is a proposed documentation model, not an applied database migration. Detailed Design follows the finalized functional requirements; older provisional ERD notes are not overrides of confirmed SRS decisions. No application contracts, schema or migrations are changed by these documentation assets.

The architecture's publication image is rendered from its fixed-layout SVG with local logo assets. The PlantUML file preserves the same relationships; automatic PlantUML layout differs from the publication image. Validate it with Java 21 / PlantUML 1.2026.9:

```powershell
java -jar path/to/plantuml.jar -checkonly system-design/architecture.puml
```

Keep source and exports synchronized and check the final report page after changing labels or layout. Uploaded Google Docs images do not refresh automatically.

## Architecture layout and assets

Run `python docs/diagrams/report-4-sdd/system-design/render_architecture.py` from the repository root to regenerate the self-contained SVG. Export it to PNG with an SVG-capable image renderer; this snapshot uses the existing bundled Sharp renderer at 150 dpi. No application dependency or deployment configuration is added.

Cloudflare is shown for DNS resolution, consistent with the team's selected scope and [Cloudflare DNS documentation](https://developers.cloudflare.com/dns/). The diagram does not select Tunnel, proxy mode, an AWS compute product, AI hosting placement, or an email vendor. The separate AI node represents a logical service, not a claim that an external AI vendor hosts it. VNPay is the team's current gateway choice.

Brand SVG snapshots for AWS, Cloudflare, Next.js, React, Spring, PostgreSQL and Neon are from the [SVG Logos collection](https://github.com/gilbarbara/logos); VNPay's SVG comes from its [official site](https://vnpay.vn/). Exact asset URLs are retained in [sources.json](system-design/assets/sources.json). Logos retain their respective owners' marks. Browser, AI and email symbols are generic vector artwork in the renderer.

## Package diagrams

The publication figures follow the supplied reference: thin rectangular UML package tabs, nested package frames and orthogonal dashed dependency arrows. The overview matches the current backend directories. The second figure expands `com.fraudguard.investigation` as the layout used by every business module. It does not introduce global Controller/Core packages or additional interfaces/middleware/utils packages absent from the agreed scaffold.

`system-design/render_packages.py` creates both SVG and PNG publication images using Python and the already installed Pillow library with Windows Arial fonts. It checks current package names, layer folders, figure bounds and orthogonal paths. Run from the repository root:

```powershell
python docs/diagrams/report-4-sdd/system-design/render_packages.py
```

The `package-overview.puml` and `package-layers.puml` sources retain semantic package containment and allowed dependencies. Validate them with Java 21 and PlantUML 1.2026.9; automatic PlantUML layout differs from the publication renderer:

```powershell
java -jar path/to/plantuml.jar -checkonly system-design/package-overview.puml system-design/package-layers.puml
```

Run the Java command from `docs/diagrams/report-4-sdd/`. [Editable section 1.2](../../02_Reports/Report4_SDD/sections/package-diagram.md) links the publication images. Business classes and runtime calls are not implemented; dependency arrows document the design convention. Cross-module access uses service interfaces and DTOs, with entity/repository/mapper/implementation packages private to their module. AI training stays outside the backend. Reinsert changed images in the native report and inspect its PDF before submission.
