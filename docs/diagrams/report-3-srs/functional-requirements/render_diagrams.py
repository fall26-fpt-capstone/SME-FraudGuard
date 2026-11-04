"""Render the SRS screen flows and conceptual ERD (Python + Pillow)."""
import html
import json
import heapq
from pathlib import Path
import textwrap
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
MODEL = json.loads((ROOT / 'diagram-model.json').read_text(encoding='utf-8'))
OUT = ROOT / 'exports'
OUT.mkdir(exist_ok=True)
FONT = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
TITLE = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 27)


def route_erd(na, nb, nodes):
    ax,ay,aw,ah=na[2:6]
    bx,by,bw,bh=nb[2:6]
    if ax==bx:
        start=(ax+aw/2, ay+ah if by>ay else ay)
        end=(bx+bw/2, by if by>ay else by+bh)
    else:
        start=(ax+aw if bx>ax else ax, ay+ah/2)
        end=(bx if bx>ax else bx+bw, by+bh/2)
    xs=sorted({10,1110,start[0],end[0],*[v for n in nodes for v in (n[2]-20,n[2]+n[4]+20)]})
    ys=sorted({75,850,start[1],end[1],*[v for n in nodes for v in (n[3]-25,n[3]+n[5]+25)]})
    def clear(p,q):
        for n in nodes:
            x,y,w,h=n[2:6]
            if n[0] not in (na[0],nb[0]):
                x,y,w,h=x-8,y-8,w+16,h+16
            if p[0]==q[0] and x<p[0]<x+w and max(min(p[1],q[1]),y)<min(max(p[1],q[1]),y+h): return False
            if p[1]==q[1] and y<p[1]<y+h and max(min(p[0],q[0]),x)<min(max(p[0],q[0]),x+w): return False
        return True
    queue=[(0,start,0)]
    best={(start,0):0}
    previous={}
    final=None
    while queue:
        cost,p,direction=heapq.heappop(queue)
        if cost!=best.get((p,direction)): continue
        if p==end:
            final=(p,direction)
            break
        ix,iy=xs.index(p[0]),ys.index(p[1])
        candidates=[]
        if ix: candidates.append(((xs[ix-1],p[1]),1))
        if ix+1<len(xs): candidates.append(((xs[ix+1],p[1]),1))
        if iy: candidates.append(((p[0],ys[iy-1]),2))
        if iy+1<len(ys): candidates.append(((p[0],ys[iy+1]),2))
        for q,d in candidates:
            if not clear(p,q): continue
            new=cost+abs(p[0]-q[0])+abs(p[1]-q[1])+(18 if direction and d!=direction else 0)
            state=(q,d)
            if new<best.get(state,float('inf')):
                best[state]=new
                previous[state]=(p,direction)
                heapq.heappush(queue,(new,q,d))
    assert final, (na[0],nb[0])
    pts=[]
    while final:
        pts.append(final[0])
        final=previous.get(final)
    pts.reverse()
    assert all(clear(p,q) for p,q in zip(pts,pts[1:]))
    return pts


def render(key, title, nodes, edges, width, height, arrows=True):
    assert len({n[0] for n in nodes}) == len(nodes)
    by_id = {n[0]: n for n in nodes}
    assert all(a in by_id and b in by_id for a, b, *_ in edges)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
           '<rect width="100%" height="100%" fill="white"/>',
           '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#888"/></marker></defs>',
           f'<text x="24" y="37" font-family="Arial" font-size="27" font-weight="bold">{html.escape(title)}</text>']
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((24, 13), title, font=TITLE, fill='#222222')
    mx = ET.Element('mxfile', host='app.diagrams.net')
    diagram = ET.SubElement(mx, 'diagram', name=title)
    model = ET.SubElement(diagram, 'mxGraphModel', page='1', pageWidth=str(width), pageHeight=str(height))
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    for i, (a, b, label) in enumerate(edges):
        na, nb = by_id[a], by_id[b]
        x1, y1, x2, y2 = na[2] + na[4], na[3] + na[5]/2, nb[2], nb[3] + nb[5]/2
        if x2 > x1:
            mid = (x1+x2)/2
            pts = [(x1,y1),(mid,y1),(mid,y2),(x2,y2)]
        elif nb[3] > na[3]+na[5]:
            x1,y1 = na[2]+na[4]/2, na[3]+na[5]
            x2,y2 = nb[2]+nb[4]/2, nb[3]
            mid=(y1+y2)/2
            pts=[(x1,y1),(x1,mid),(x2,mid),(x2,y2)]
        else:
            route = max(na[3]+na[5],nb[3]+nb[5])+24+(i%3)*12
            pts=[(x1,y1),(x1+18,y1),(x1+18,route),(x2-18,route),(x2-18,y2),(x2,y2)]
        if not arrows:
            pts=route_erd(na,nb,nodes)
            label=''
        svg.append('<polyline points="'+ ' '.join(f'{x},{y}' for x,y in pts) +'" fill="none" stroke="#888" stroke-width="1.6"'+(' marker-end="url(#arrow)"' if arrows else '')+'/>')
        draw.line(pts, fill='#888888', width=2)
        if not arrows:
            cardinality=('1','1') if (a,b)==('Enterprise','Workspace') else ('1..*','0..1') if (a,b)==('Alert','Investigation Case') else ('0..1','0..*') if (a,b) in [('Workspace','Account'),('Account','Investigation Case')] else ('1','0..1') if (a,b)==('Detection Attempt','Alert') else ('1','0..*')
            for point,next_point,value in [(pts[0],pts[1],cardinality[0]),(pts[-1],pts[-2],cardinality[1])]:
                dx,dy=next_point[0]-point[0],next_point[1]-point[1]
                length=abs(dx)+abs(dy)
                tx=point[0]+(7 if dy else 5 if dx>0 else -5)
                ty=point[1]+dy/length*18-(7 if dx else 0)
                anchor='end' if dx<0 else 'start'
                svg.append(f'<text x="{tx}" y="{ty}" text-anchor="{anchor}" font-family="Arial" font-size="18" fill="#333">{value}</text>')
                draw.text((tx,ty-16),value,font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18),fill='#333333',anchor='ra' if dx<0 else 'la')
        if arrows:
            draw.polygon([(x2,y2),(x2-8,y2-4),(x2-8,y2+4)],fill='#888888')
        if label:
            lx,ly = pts[1][0]+5, min(y1,y2)-8
            svg.append(f'<text x="{lx}" y="{ly}" font-family="Arial" font-size="16" fill="#555">{html.escape(label)}</text>')
            draw.text((lx,ly-16),label,font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16),fill='#555555')
        cell=ET.SubElement(root,'mxCell',id=f'e{i}',value=label if arrows else ' : '.join(cardinality),source=a,target=b,parent='1',edge='1',style='edgeStyle=orthogonalEdgeStyle;rounded=0;strokeColor=#888888;'+('endArrow=classic;' if arrows else 'endArrow=none;')+'fontSize=16;')
        geo=ET.SubElement(cell,'mxGeometry',relative='1',**{'as':'geometry'})
        points=ET.SubElement(geo,'Array',**{'as':'points'})
        for x,y in pts[1:-1]: ET.SubElement(points,'mxPoint',x=str(x),y=str(y))
    for ident,label,x,y,w,h,kind in nodes:
        assert x>=0 and y>=0 and x+w<=width and y+h<=height
        fill='#fff2cc' if kind=='entry' else '#f5f5f5' if kind!='action' else '#ffffff'
        radius=18 if kind=='action' else 0
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="#aaa" stroke-width="1.3"/>')
        draw.rounded_rectangle((x,y,x+w,y+h),radius=radius,fill=fill,outline='#aaaaaa',width=2)
        wrap_width=24
        lines=textwrap.wrap(label,width=wrap_width)
        while max(FONT.getlength(line) for line in lines)>w-18:
            wrap_width-=1
            lines=textwrap.wrap(label,width=wrap_width)
        for j,line in enumerate(lines):
            ty=y+h/2+(j-(len(lines)-1)/2)*26
            svg.append(f'<text x="{x+w/2}" y="{ty}" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="22" fill="#333">{html.escape(line)}</text>')
            draw.text((x+w/2,ty),line,font=FONT,fill='#333333',anchor='mm')
        cell=ET.SubElement(root,'mxCell',id=ident,value=label,parent='1',vertex='1',style=f'rounded={1 if radius else 0};whiteSpace=wrap;html=1;fillColor={fill};strokeColor=#aaaaaa;fontFamily=Arial;fontSize=22;')
        ET.SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
    svg.append('</svg>')
    (OUT / f'{key}.svg').write_text('\n'.join(svg),encoding='utf-8')
    image.save(OUT / f'{key}.png')
    ET.indent(mx)
    ET.ElementTree(mx).write(ROOT / f'{key}.drawio',encoding='utf-8',xml_declaration=True)


for flow in MODEL['flows']:
    total=sum(max(1,len(children))*90+35 for _,children in flow['branches'])
    height=total+120
    nodes=[('login',flow['entry'],20,height//2,170,64,'entry'),('home',flow['home'],230,height//2,195,64,'screen')]
    edges=[('login','home','')]
    cursor=95
    for i,(label,children) in enumerate(flow['branches']):
        span=max(1,len(children))*90
        ident=f'b{i}'
        nodes.append((ident,label,500,cursor+span//2-32,235,64,'screen'))
        edges.append(('home',ident,''))
        for j,child in enumerate(children):
            cid=f'b{i}c{j}'
            nodes.append((cid,child,825,cursor+j*90,245,68,'action'))
            edges.append((ident,cid,''))
        cursor+=span+35
    render(flow['key'],flow['title'],nodes,edges,1100,height)

views=[('erd-workspace-configuration','Conceptual ERD - Workspace, Configuration and Plans',[
    ['Enterprise','Workspace','Account'],
    ['Staff Assignment','Onboarding Specification','Handover Decision'],
    ['Detection Configuration','Internal Field','Channel Mapping','Detection Rule','Test Run Metadata'],
    ['Plan Offer','Workspace Entitlement','Purchase / Payment','Integration Credential','Field Permission']
],[('Enterprise','Workspace',''),('Workspace','Account',''),('Workspace','Staff Assignment',''),('Workspace','Onboarding Specification',''),('Onboarding Specification','Handover Decision',''),('Workspace','Detection Configuration',''),('Detection Configuration','Internal Field',''),('Detection Configuration','Channel Mapping',''),('Detection Configuration','Detection Rule',''),('Detection Configuration','Test Run Metadata',''),('Plan Offer','Workspace Entitlement',''),('Workspace','Workspace Entitlement',''),('Workspace Entitlement','Purchase / Payment',''),('Workspace','Integration Credential',''),('Account','Field Permission','')]),
('erd-processing-investigation','Conceptual ERD - Processing and Investigation',[
    ['Workspace','Account','Field Permission'],
    ['Transaction','Ingestion Attempt / Import','Detection Attempt'],
    ['Alert','Investigation Case','Investigation Record'],
    ['Notification','Audit Entry']
],[('Workspace','Account',''),('Workspace','Transaction',''),('Account','Field Permission',''),('Transaction','Ingestion Attempt / Import',''),('Transaction','Detection Attempt',''),('Detection Attempt','Alert',''),('Alert','Investigation Case',''),('Investigation Case','Investigation Record',''),('Account','Investigation Case',''),('Account','Notification',''),('Investigation Record','Audit Entry','')])]
for key,title,columns,relations in views:
    nodes=[]
    for col,labels in enumerate(columns):
        for row,label in enumerate(labels): nodes.append((label,label,25+col*280,105+row*145,210,76,'entity'))
    render(key,title,nodes,relations,1120,875,arrows=False)
print('Rendered 5 role screen flows and 2 conceptual ERD views; model references and image bounds checked.')
