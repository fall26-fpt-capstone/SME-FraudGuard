"""Generate the editable architecture SVG using local, attributed brand assets."""
from pathlib import Path
from base64 import b64encode
from html import escape
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1200, 900
parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">
<title>SME-FraudGuard system architecture</title>
<desc>Cloudflare provides DNS resolution. Web portals and the modular-monolith backend are hosted on AWS. The backend integrates with Neon PostgreSQL, customer systems, an AI service, domain email and VNPay. AI hosting and the email provider are unspecified.</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#263746"/></marker></defs>
<rect width="1200" height="900" fill="white"/>
<g font-family="Arial, sans-serif" fill="#15232f" stroke-linecap="round" stroke-linejoin="round">''']


def text(x, y, value, size=20, anchor='middle', bold=False):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{700 if bold else 400}">{escape(value)}</text>')


def box(x, y, w, h, label=None, fill='white', dash=False):
    assert 0 <= x < x+w <= WIDTH and 0 <= y < y+h <= HEIGHT
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20" fill="{fill}" stroke="#263746" stroke-width="2"'+(' stroke-dasharray="7 5"' if dash else '')+'/>')
    if label:
        text(x+w/2, y+29, label, 21, bold=True)


def logo(name, x, y, w, h):
    source = ROOT/'assets'/f'{name}.svg'
    raw = source.read_bytes()
    ET.fromstring(raw)
    encoded = b64encode(raw).decode('ascii')
    parts.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;base64,{encoded}"/>')


def line(points, both=False, dash=False):
    parts.append(f'<polyline points="{points}" fill="none" stroke="#263746" stroke-width="2" marker-end="url(#arrow)"'+(' marker-start="url(#arrow)"' if both else '')+(' stroke-dasharray="6 5"' if dash else '')+'/>')


# The AWS frame states the selected hosting platform without choosing EC2/ECS/etc.
box(300, 50, 570, 610, fill='#fcfdff')
logo('aws', 325, 68, 68, 44)
text(410, 99, 'AWS hosting', 25, 'start', True)
box(410, 155, 350, 160, 'Frontend')
logo('nextjs', 442, 205, 175, 45)
logo('react', 650, 201, 64, 62)
text(585, 290, 'Platform and SME web portals', 20)
box(410, 425, 350, 160, 'Backend')
logo('spring', 454, 476, 66, 66)
text(544, 518, 'Spring Boot', 29, 'start')
text(585, 565, 'Java · Modular monolith', 19)

# DNS is a separate lookup, not a tunnel or an HTTP reverse-proxy claim.
box(30, 45, 190, 100)
logo('cloudflare', 55, 59, 140, 46)
text(125, 129, 'DNS', 20, bold=True)
box(45, 200, 160, 140, 'Browser')
parts.append('<rect x="79" y="250" width="92" height="58" rx="7" fill="none" stroke="#263746" stroke-width="3"/><path d="M79 267 H171 M91 258h1 M103 258h1 M115 258h1" fill="none" stroke="#263746" stroke-width="3"/>')
line('125,200 125,145', both=True, dash=True)
text(138, 177, 'DNS lookup', 19, 'start')
line('205,252 410,252', both=True)
text(255, 231, 'HTTPS', 19, bold=True)

line('560,315 560,425')
line('610,425 610,315', dash=True)
text(634, 366, 'REST API', 21, 'start', True)
text(634, 390, 'HTTPS', 20, 'start')

box(920, 425, 250, 160, 'Database')
logo('neon', 955, 466, 48, 48)
text(1020, 499, 'NEON', 29, 'start', True)
logo('postgresql', 956, 526, 42, 43)
text(1012, 555, 'PostgreSQL', 20, 'start')
line('760,505 920,505', both=True)
text(812, 484, 'TLS / SQL', 19)

box(20, 505, 210, 112)
text(125, 540, 'Customer', 22)
text(125, 565, 'transaction systems', 20)
text(125, 594, 'REST API / Webhook', 20)
line('230,561 275,561 275,540 410,540', both=True)
text(350, 522, 'HTTPS', 20)

# AI is a separate logical service; this group does not assign its hosting platform.
box(310, 750, 230, 130, 'AI Service')
parts.append('<rect x="341" y="797" width="55" height="47" rx="8" fill="#eef3fb" stroke="#415b7c" stroke-width="2"/><path d="M349 789v8 M369 789v8 M389 789v8 M349 844v8 M369 844v8 M389 844v8 M333 807h8 M333 830h8 M396 807h8 M396 830h8" stroke="#415b7c" stroke-width="2"/>')
text(368, 828, 'AI', 23, bold=True)
text(460, 814, 'Normal /', 20)
text(460, 838, 'Anomaly', 20)
text(425, 865, 'Model / service version', 19)
box(600, 750, 230, 130, 'Email Service')
parts.append('<rect x="622" y="803" width="54" height="38" rx="5" fill="#eef3fb" stroke="#415b7c" stroke-width="2"/><path d="M623 805l26 20 26-20" fill="none" stroke="#415b7c" stroke-width="2"/>')
text(749, 820, 'Domain email', 20)
text(715, 864, 'Notifications', 20)
box(890, 750, 230, 130, 'Payment Gateway')
logo('vnpay', 928, 804, 155, 45)
text(1005, 866, 'VNPay', 20)

line('540,585 540,681 425,681 425,750', both=True)
text(417, 642, 'Inference', 21)
line('650,585 650,691 715,691 715,750')
text(620, 719, 'Send email', 21)
line('760,558 841,558 841,695 1005,695 1005,750', both=True)
text(1010, 649, 'Payment request /', 20)
text(1010, 675, 'verified confirmation', 20)
parts.append('</g></svg>')
svg='\n'.join(parts)
ET.fromstring(svg)
output=ROOT/'exports'/'architecture.svg'
output.parent.mkdir(exist_ok=True)
output.write_text(svg,encoding='utf-8')
print(f'Generated {output}; validated 8 logo assets and SVG bounds.')
