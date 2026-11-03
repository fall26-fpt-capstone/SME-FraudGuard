"""Build the overall UML source and a fixed-layout, straight-line SVG from one catalogue."""
import html
import json
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = json.loads((ROOT / 'overall-catalogue.json').read_text(encoding='utf-8'))
BY_ID = {int(u['id'][3:]): u for u in CASES}
# Fixed positions keep the shared-goal connections clear of other use cases.
POSITIONS = {
    1: (369.0, 132.7),
    2: (624.1, 190.8),
    3: (922.9, 239.8),
    4: (374.9, 267.2),
    5: (417.4, 351.1),
    6: (505.9, 425.7),
    7: (945.8, 451.1),
    8: (1462.3, 140.5),
    9: (1026.8, 148.3),
    10: (419.6, 659.6),
    11: (422.9, 739.3),
    12: (623.6, 1022.7),
    13: (420.2, 1097.0),
    14: (436.1, 1175.7),
    15: (359.0, 1268.8),
    16: (638.4, 508.7),
    17: (1302.2, 216.1),
    18: (381.1, 955.7),
    19: (417.9, 816.3),
    20: (850.0, 1450.0),
    21: (850.0, 1570.0),
    22: (850.0, 1690.0),
    23: (1207.9, 368.6),
    24: (889.3, 824.1),
    25: (644.7, 890.3),
    26: (1016.7, 930.1),
    27: (1186.3, 997.3),
    28: (1116.4, 1073.2),
    29: (932.8, 1306.3),
    30: (983.1, 1379.2),
    31: (972.5, 1149.8),
    32: (1286.1, 726.5),
    33: (1334.0, 571.7),
    34: (1303.7, 652.4),
    35: (1294.1, 803.5),
    36: (449.9, 581.0),
    37: (1497.3, 1488.5),
    38: (1004.4, 1223.7),
    39: (1410.6, 291.4),
    40: (940.8, 313.0),
    41: (370.0, 1570.0),
    42: (1500.0, 1750.0),
}
ACTORS = {
    'PU': (140.0, 190.0, 'Portal User'),
    'PA': (140.0, 530.0, 'Platform Admin'),
    'ST': (140.0, 970.0, 'Implementation Staff'),
    'CS': (140.0, 1490.0, 'Customer Transaction System'),
    'SA': (1800.0, 250.0, 'SME Admin'),
    'PG': (1800.0, 350.0, 'Payment Gateway'),
    'OP': (1800.0, 870.0, 'Operator'),
    'IN': (1800.0, 1150.0, 'Investigator'),
}
INCLUDES = [(n,target) for n in [20,21,22] for target in [41,42]]
RX, RY = 180, 27
assert set(BY_ID) == set(range(1,43)) and set(POSITIONS) == set(BY_ID)
assert len(CASES)==42

def roles(n):
    if n in [1,2,3]: return ['PU']
    return BY_ID[n]['actors']

ASSOCIATIONS = [(a,n) for n in BY_ID for a in roles(n)]
assert all(a in ACTORS for a,n in ASSOCIATIONS)
assert len(ACTORS)==8 and len({v[2] for v in ACTORS.values()})==8
assert all(x+18<170 or x-18>1690 for x,y,name in ACTORS.values())

def misses_other_ellipses(ax,ay,bx,by,allowed):
    for n,(cx,cy) in POSITIONS.items():
        if n in allowed: continue
        dx,dy=(bx-ax)/RX,(by-ay)/RY
        px,py=(ax-cx)/RX,(ay-cy)/RY
        t=max(0,min(1,-(px*dx+py*dy)/(dx*dx+dy*dy)))
        assert (px+t*dx)**2+(py+t*dy)**2>=.999, ('Line crosses use case',allowed,n)

def label(x,y,content,size=16,anchor='middle',weight='normal'):
    rows=content.split('\n')
    return ''.join(f'<text x="{x}" y="{y+(i-(len(rows)-1)/2)*(size+2)}" text-anchor="{anchor}" dominant-baseline="middle" font-size="{size}" font-weight="{weight}">{html.escape(row)}</text>' for i,row in enumerate(rows))

svg=['<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1860" viewBox="0 0 2000 1860">',
 '<rect width="2000" height="1860" fill="white"/>',
 '<style>text{font-family:Arial,sans-serif;fill:#111} .association{stroke:#475569;stroke-width:1.1;fill:none} .include{stroke:#475569;stroke-width:1.2;stroke-dasharray:5 4;fill:none}</style>',
 '<defs><marker id="openArrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#475569"/></marker></defs>',
 '<rect x="170" y="90" width="1520" height="1700" fill="white" stroke="#64748B"/>',
 label(1200,112,'SME-FraudGuard',20,weight='bold')]

for a,n in ASSOCIATIONS:
    ax,ay,_=ACTORS[a];cx,cy=POSITIONS[n];ex,ey=(cx-RX if ax<cx else cx+RX),cy
    misses_other_ellipses(ax,ay,ex,ey,{n})
    svg.append(f'<line x1="{ax}" y1="{ay}" x2="{ex:.2f}" y2="{ey:.2f}" stroke="white" stroke-width="3.5"/>')
    svg.append(f'<line class="association" data-actor="{a}" data-uc="{n}" x1="{ax}" y1="{ay}" x2="{ex:.2f}" y2="{ey:.2f}"/>')
include_segments=[]
for a,b in INCLUDES:
    x1,y1=POSITIONS[a];x2,y2=POSITIONS[b]
    sx,sy=(x1-RX,y1) if b==41 else (x1+RX,y1)
    tx,ty=(x2+RX,y2) if b==41 else (x2-RX,y2)
    misses_other_ellipses(sx,sy,tx,ty,{a,b})
    include_segments.append(((sx,sy),(tx,ty)))
    svg.append(f'<line class="include" data-source="{a}" data-target="{b}" x1="{sx:.2f}" y1="{sy:.2f}" x2="{tx:.2f}" y2="{ty:.2f}" marker-end="url(#openArrow)"/>')
    t=.45
    lx,ly=sx+(tx-sx)*t,sy+(ty-sy)*t
    svg.append(f'<rect x="{lx-30}" y="{ly-7}" width="60" height="14" fill="white"/>')
    svg.append(label(lx,ly,'\u00abinclude\u00bb',11))
def cross(a,b,c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
for i,(a,b) in enumerate(include_segments):
    for c,d in include_segments[i+1:]:
        assert not (cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0), 'Include lines cross'
for n,(cx,cy) in POSITIONS.items():
    u=BY_ID[n]
    rows=textwrap.wrap(u['id']+' '+u['name'],width=34)
    assert len(rows)<=2, (n,rows)
    svg.append(f'<ellipse data-uc="{n}" cx="{cx}" cy="{cy}" rx="{RX}" ry="{RY}" fill="white" stroke="#475569"/>')
    svg.append(label(cx,cy,'\n'.join(rows),17))
for a,(ax,ay,name) in ACTORS.items():
    svg.append(f'<g data-actor="{a}" stroke="#475569" stroke-width="1.3" fill="white"><circle cx="{ax}" cy="{ay-30}" r="9"/><path d="M{ax},{ay-21} L{ax},{ay+16} M{ax-18},{ay-6} L{ax+18},{ay-6} M{ax},{ay+16} L{ax-15},{ay+38} M{ax},{ay+16} L{ax+15},{ay+38}"/></g>')
    lx,anchor=(ax-28,'end') if ax<700 else (ax+28,'start')
    svg.append(label(lx,ay+2,'\n'.join(textwrap.wrap(name,15 if a=='ST' else 13)),15,anchor))
svg.append(label(1000,1823,'Portal User represents the five human roles. Each actor is shown once.',13))
svg.append(label(1000,1845,'Crossing lines do not indicate a connection.',13))
svg.append('</svg>')
export=ROOT/'exports';export.mkdir(exist_ok=True)
(export/'overall-use-cases.svg').write_text('\n'.join(svg),encoding='utf-8')

puml=['@startuml','left to right direction','skinparam linetype polyline','skinparam shadowing false','skinparam defaultFontName Arial']
for a,(_,_,name) in ACTORS.items(): puml.append(f'actor "{name}" as {a}')
puml.append('rectangle "SME-FraudGuard" {')
for n,u in sorted(BY_ID.items()):puml.append(f'usecase "{u["id"]}\\n{u["name"]}" as U{n}')
puml.append('}')
for a,n in ASSOCIATIONS:
    puml.append(f'{a} -- U{n}' if ACTORS[a][0]<170 else f'U{n} -- {a}')
for a,b in INCLUDES:puml.append(f'U{a} .> U{b} : <<include>>')
puml.extend(['note "Portal User represents the five human roles." as N','@enduml'])
(ROOT/'overall-use-cases.puml').write_text('\n'.join(puml)+'\n',encoding='utf-8')
assert sum(1 for line in svg if '<ellipse data-uc=' in line)==42
assert sum(1 for line in svg if 'class="association"' in line)==len(ASSOCIATIONS)
print('Verified 42 use cases,',len(ASSOCIATIONS),'actor associations and 6 include relationships.')
