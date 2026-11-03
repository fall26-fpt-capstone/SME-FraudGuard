"""Render a flat database-table diagram and matching editable draw.io/DBML sources."""
import base64
import heapq
import itertools
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from html import escape

ROOT = Path(__file__).resolve().parent
MODEL = json.loads((ROOT/'schema.json').read_text(encoding='utf-8'))
TABLES = {t['name']: t for t in MODEL['tables']}
COLS = [
    ['enterprises', 'staff_assignments', 'onboarding_documents', 'onboarding_events', 'notifications', 'audit_events'],
    ['workspaces', 'accounts', 'api_credentials', 'webhook_connections'],
    ['config_versions', 'field_definitions', 'channel_mappings', 'field_mappings', 'rules', 'rule_conditions', 'test_runs'],
    ['import_batches', 'import_rows', 'transactions', 'ingestion_receipts', 'detection_attempts', 'rule_matches', 'alerts'],
    ['plans', 'purchase_orders', 'payment_events', 'subscription_periods', 'cases', 'case_alerts', 'case_assignments'],
    ['investigation_reports', 'case_conclusions'],
]
assert set(itertools.chain.from_iterable(COLS)) == set(TABLES)
assert sum(map(len, COLS)) == len(TABLES)
CELL, TW, RH, HH = 10, 370, 26, 34
XGAP, YGAP, MARGIN = 180, 96, 100
placements = {}
for column, names in enumerate(COLS):
    y = MARGIN + (1300 if column==5 else 0)
    for name in names:
        height = HH + RH*len(TABLES[name]['fields']) + 8
        placements[name] = (MARGIN+column*(TW+XGAP), y, TW, height)
        y = math.ceil((y+height+YGAP)/CELL)*CELL
W = max(x+w for x,y,w,h in placements.values())+MARGIN
H = max(y+h for x,y,w,h in placements.values())+MARGIN
GW, GH = math.ceil(W/CELL)+1, math.ceil(H/CELL)+1
blocked = set()
for x,y,w,h in placements.values():
    blocked.update((gx,gy) for gx in range(math.floor((x-8)/CELL),math.ceil((x+w+8)/CELL)+1) for gy in range(math.floor((y-8)/CELL),math.ceil((y+h+8)/CELL)+1))
used, segments = {}, {}


def route(start, end):
    """A* on free corridors; penalize shared lanes and bends."""
    assert start not in blocked and end not in blocked
    queue = [(0,0,start[0],start[1],-1)]
    distances, previous = {(start[0],start[1],-1):0}, {}
    final = None
    while queue:
        _, cost, x, y, direction = heapq.heappop(queue)
        state = (x,y,direction)
        if cost != distances.get(state):
            continue
        if (x,y)==end:
            final = state
            break
        for nd,(dx,dy) in enumerate(((1,0),(0,1),(-1,0),(0,-1))):
            nx,ny = x+dx,y+dy
            if not(2<=nx<GW-2 and 2<=ny<GH-2) or (nx,ny) in blocked:
                continue
            edge = tuple(sorted(((x,y),(nx,ny))))
            price = 10 + (12 if direction!=-1 and direction!=nd else 0) + 7*used.get((nx,ny),0) + 30*segments.get(edge,0)
            nc = cost+price
            ns = (nx,ny,nd)
            if nc < distances.get(ns,10**12):
                distances[ns] = nc
                previous[ns] = state
                heapq.heappush(queue,(nc+10*(abs(nx-end[0])+abs(ny-end[1])),nc,nx,ny,nd))
    assert final is not None, (start,end)
    points = []
    while final in previous:
        points.append(final[:2]); final = previous[final]
    points.append(start);points.reverse()
    for a,b in zip(points,points[1:]):
        edge = tuple(sorted((a,b)));segments[edge]=segments.get(edge,0)+1
    for point in points:used[point]=used.get(point,0)+1
    simple = [points[0]]
    for a,b,c in zip(points,points[1:],points[2:]):
        if (b[0]-a[0],b[1]-a[1]) != (c[0]-b[0],c[1]-b[1]):simple.append(b)
    simple.append(points[-1])
    return [(x*CELL,y*CELL) for x,y in simple]


edges = []
for child, table in TABLES.items():
    for index, field in enumerate(table['fields']):
        if 'FK' not in field['tags']:
            continue
        parent = field.get('references')
        assert parent in TABLES and field['type']=='uuid'
        cx,cy,cw,ch = placements[child]
        px,py,pw,ph = placements[parent]
        side = 1 if px>cx else -1 if px<cx else (-1 if len(edges)%2 else 1)
        parent_side = -side if px!=cx else side
        sy, ey = cy+HH+RH*(index+.5), py+HH+RH*.5
        sx, ex = cx+(cw if side==1 else 0), px+(pw if parent_side==1 else 0)
        sc, ec = (round((sx+side*30)/CELL),round(sy/CELL)),(round((ex+parent_side*30)/CELL),round(ey/CELL))
        edges.append(dict(child=child,parent=parent,field=field,index=index,source=(sx,sy),target=(ex,ey),side=side,parent_side=parent_side,start=sc,end=ec))
# Route short relationships first; all routes remain outside every table.
edges.sort(key=lambda e:abs(e['start'][0]-e['end'][0])+abs(e['start'][1]-e['end'][1]))
for e in edges:
    middle = route(e['start'],e['end'])
    sx,sy=e['source'];ex,ey=e['target']
    e['points']=[(sx,sy),(middle[0][0],sy),*middle,(middle[-1][0],ey),(ex,ey)]
    for (ax,ay),(bx,by) in zip(e['points'],e['points'][1:]):
        assert ax==bx or ay==by
        for name,(x,y,w,h) in placements.items():
            assert not (ax==bx and x<ax<x+w and max(min(ay,by),y)<min(max(ay,by),y+h)), (e['child'],e['field']['name'],name)
            assert not (ay==by and y<ay<y+h and max(min(ax,bx),x)<min(max(ax,bx),x+w)), (e['child'],e['field']['name'],name)

parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', '<title>SME-FraudGuard Database Design</title>',f'<rect width="{W}" height="{H}" fill="white"/>','<g fill="none" stroke-linejoin="round" stroke-linecap="round">']
for e in edges:
    points=' '.join(f'{x},{y}' for x,y in e['points'])
    parts.extend([f'<polyline points="{points}" stroke="white" stroke-width="5"/>',f'<polyline points="{points}" stroke="#8b98a2" stroke-width="1.1"/>'])
parts.append('</g>')
for name,table in TABLES.items():
    x,y,w,h=placements[name]
    parts.extend([f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="white" stroke="#62717d" stroke-width="1.3"/>',f'<path d="M{x+3} {y} H{x+w-3} Q{x+w} {y} {x+w} {y+3} V{y+HH} H{x} V{y+3} Q{x} {y} {x+3} {y}" fill="#2e6892"/>',f'<text x="{x+12}" y="{y+23}" fill="white" font-family="Arial" font-size="17" font-weight="bold">{escape(name)}</text>'])
    for i,f in enumerate(table['fields']):
        ry=y+HH+RH*i
        if i%2==0:parts.append(f'<rect x="{x+1}" y="{ry}" width="{w-2}" height="{RH}" fill="#f5f7f9"/>')
        mark='PK' if 'PK' in f['tags'] else 'FK' if 'FK' in f['tags'] else ''
        parts.append(f'<text x="{x+9}" y="{ry+18}" font-family="Arial" font-size="10" font-weight="bold" fill="#507491">{mark}</text>')
        parts.append(f'<text x="{x+35}" y="{ry+18}" font-family="Arial" font-size="14" fill="#263746">{escape(f["name"])}</text>')
        typ=f['type'].upper()+(' ?' if 'NULL' in f['tags'] else '')
        parts.append(f'<text x="{x+w-9}" y="{ry+18}" text-anchor="end" font-family="Arial" font-size="12" fill="#637382">{escape(typ)}</text>')
    parts.append(f'<line x1="{x}" y1="{y+HH}" x2="{x+w}" y2="{y+HH}" stroke="#62717d"/>')


def cardinality(x,y,side,many,optional):
    # Crow's-foot branches touch the table; bars and circles remain in its corridor.
    if many:
        parts.append(f'<path d="M{x} {y-5} L{x+side*12} {y} L{x} {y+5} M{x} {y} H{x+side*12}" fill="none" stroke="#596c7b" stroke-width="1.3"/>')
    else:parts.append(f'<path d="M{x+side*9} {y-5} V{y+5}" stroke="#596c7b" stroke-width="1.3"/>')
    if optional:parts.append(f'<circle cx="{x+side*20}" cy="{y}" r="3.2" fill="white" stroke="#596c7b" stroke-width="1.2"/>')
    else:parts.append(f'<path d="M{x+side*19} {y-5} V{y+5}" stroke="#596c7b" stroke-width="1.2"/>')


for e in edges:
    cardinality(*e['source'],e['side'],'UQ' not in e['field']['tags'],True)
    cardinality(*e['target'],e['parent_side'],False,'NULL' in e['field']['tags'])
parts.append('</svg>')
svg='\n'.join(parts)
ET.fromstring(svg)
(ROOT/'exports').mkdir(exist_ok=True)
(ROOT/'exports/database-design.svg').write_text(svg,encoding='utf-8')

# A native draw.io table row is the FK anchor, so every connector stays editable.
mx=ET.Element('mxfile',host='app.diagrams.net',version='24.7.17')
diagram=ET.SubElement(mx,'diagram',id='fraudguard-database',name='Database Design')
graph=ET.SubElement(diagram,'mxGraphModel',grid='1',gridSize='10',page='0',pageWidth=str(W),pageHeight=str(H),connect='1')
cells=ET.SubElement(graph,'root')
ET.SubElement(cells,'mxCell',id='0');ET.SubElement(cells,'mxCell',id='1',parent='0')
for name,t in TABLES.items():
    x,y,w,h=placements[name]
    c=ET.SubElement(cells,'mxCell',id=name,value=name,vertex='1',parent='1',style='swimlane;startSize=34;horizontal=1;rounded=0;fillColor=#2e6892;swimlaneFillColor=#ffffff;strokeColor=#62717d;fontColor=#ffffff;fontStyle=1;fontSize=17;align=left;spacingLeft=12;collapsible=0;')
    ET.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
    for i,f in enumerate(t['fields']):
        prefix='PK ' if 'PK' in f['tags'] else 'FK ' if 'FK' in f['tags'] else ''
        value=f'<table style="width:100%;font-size:14px"><tr><td>{escape(prefix+f["name"])}</td><td style="text-align:right;color:#637382;font-size:12px">{escape(f["type"].upper())}</td></tr></table>'
        c=ET.SubElement(cells,'mxCell',id=name+'.'+f['name'],value=value,vertex='1',parent=name,style='text;html=1;whiteSpace=wrap;overflow=hidden;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=8;strokeColor=none;fillColor='+('#f5f7f9' if i%2==0 else '#ffffff')+';fontColor=#263746;resizable=0;')
        ET.SubElement(c,'mxGeometry',x='0',y=str(HH+i*RH),width=str(w),height=str(RH),attrib={'as':'geometry'})
for i,e in enumerate(edges):
    style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#8b98a2;strokeWidth=1;startArrow='+('ERzeroToOne' if 'UQ' in e['field']['tags'] else 'ERzeroToMany')+';endArrow='+('ERzeroToOne' if 'NULL' in e['field']['tags'] else 'ERmandOne')+f';startFill=0;endFill=0;exitX={1 if e["side"]==1 else 0};exitY=0.5;entryX={1 if e["parent_side"]==1 else 0};entryY=0.5;'
    c=ET.SubElement(cells,'mxCell',id=f'fk-{i}',edge='1',parent='1',source=e['child']+'.'+e['field']['name'],target=e['parent']+'.id',style=style)
    geometry=ET.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'})
    arr=ET.SubElement(geometry,'Array',attrib={'as':'points'})
    for x,y in e['points'][1:-1]:ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
ET.indent(mx)
(ROOT/'database-design.drawio').write_text(ET.tostring(mx,encoding='unicode'),encoding='utf-8')

dbml=['Project SME_FraudGuard {','  database_type: "PostgreSQL"','}']
for name,t in TABLES.items():
    dbml.append(f'Table {name} {{')
    for f in t['fields']:
        attrs=[]
        if 'PK' in f['tags']:attrs.append('pk')
        if 'UQ' in f['tags']:attrs.append('unique')
        if 'NULL' not in f['tags']:attrs.append('not null')
        dbml.append(f'  {f["name"]} {f["type"]}'+(' ['+', '.join(attrs)+']' if attrs else ''))
    if name=='transactions':dbml+=['  indexes {','    (workspace_id, external_id) [unique]','  }']
    if name=='config_versions':dbml+=['  indexes {','    (workspace_id, version_no) [unique]','  }']
    dbml.append('}')
for e in edges:dbml.append(f'Ref: {e["child"]}.{e["field"]["name"]} '+('-' if 'UQ' in e['field']['tags'] else '>')+f' {e["parent"]}.id')
(ROOT/'database-design.dbml').write_text('\n'.join(dbml)+'\n',encoding='utf-8')
assert len(ET.fromstring((ROOT/'database-design.drawio').read_text()).findall('.//mxCell[@edge="1"]')) == len(edges)
assert len(edges)==sum('FK' in f['tags'] for t in TABLES.values() for f in t['fields'])
print(json.dumps({'tables':len(TABLES),'columns':sum(len(t['fields']) for t in TABLES.values()),'foreign_keys':len(edges),'canvas':[W,H],'validated':'all FK routes orthogonal and outside all table interiors'}))
