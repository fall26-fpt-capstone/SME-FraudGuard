"""Render the agreed package scaffold using the reference's rectangular UML tabs."""
from html import escape
from math import hypot
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parents[3] / 'backend/src/main/java/com/fraudguard'
MODULES = ('auth', 'workspace', 'member', 'subscription', 'configuration', 'ingestion',
           'detection', 'investigation', 'reporting', 'notification', 'audit')
SCALE = 2


def render(name, height, packages, labels=(), paths=()):
    width = 760
    im = Image.new('RGB', (width * SCALE, height * SCALE), 'white')
    draw = ImageDraw.Draw(im)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
           '<rect width="100%" height="100%" fill="white"/>',
           '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#333"/></marker></defs>']

    def text(x, y, value, size=16, bold=False):
        font = ImageFont.truetype('C:/Windows/Fonts/' + ('arialbd.ttf' if bold else 'arial.ttf'), size * SCALE)
        draw.text((x * SCALE, y * SCALE), value, font=font, fill='#222', anchor='mt')
        svg.append(f'<text x="{x}" y="{y + size * .82}" text-anchor="middle" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="#222">{escape(value)}</text>')

    for x, y, w, h, title, size in packages:
        assert 0 <= x < x + w <= width and 0 <= y - 12 < y + h <= height
        for a, b, c, d in [(x, y - 12, 42, 12), (x, y, w, h)]:
            draw.rectangle((a * SCALE, b * SCALE, (a + c) * SCALE, (b + d) * SCALE),
                           fill='white', outline='#444', width=2)
            svg.append(f'<rect x="{a}" y="{b}" width="{c}" height="{d}" fill="white" stroke="#444" stroke-width="0.85"/>')
        text(x + w / 2, y + 10, title, size, True)

    for x, y, value, size in labels:
        text(x, y, value, size)

    for points in paths:
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            assert x1 == x2 or y1 == y2
            length = hypot(x2 - x1, y2 - y1)
            for start in range(0, int(length), 7):
                end = min(start + 3, length)
                draw.line(((x1 + (x2 - x1) * start / length) * SCALE,
                           (y1 + (y2 - y1) * start / length) * SCALE,
                           (x1 + (x2 - x1) * end / length) * SCALE,
                           (y1 + (y2 - y1) * end / length) * SCALE), fill='#333', width=2)
        x, y = points[-1]
        px, py = points[-2]
        length = hypot(x - px, y - py)
        dx, dy = (x - px) / length, (y - py) / length
        draw.polygon([(x * SCALE, y * SCALE),
                      ((x - dx * 6 - dy * 3) * SCALE, (y - dy * 6 + dx * 3) * SCALE),
                      ((x - dx * 6 + dy * 3) * SCALE, (y - dy * 6 - dx * 3) * SCALE)], fill='#333')
        coords = ' '.join(f'{x},{y}' for x, y in points)
        svg.append(f'<polyline points="{coords}" fill="none" stroke="#333" stroke-width="0.85" stroke-dasharray="3 4" marker-end="url(#arrow)"/>')

    svg.append('</svg>')
    (ROOT / 'exports' / f'{name}.svg').write_text('\n'.join(svg), encoding='utf-8')
    im.save(ROOT / 'exports' / f'{name}.png')


def main():
    assert {p.name for p in BACKEND.iterdir() if p.is_dir()} == set(MODULES) | {'common', 'integration'}
    for module in MODULES:
        for layer in ('controller', 'service/impl', 'repository', 'entity', 'mapper', 'dto/request', 'dto/response'):
            assert (BACKEND / module / layer).is_dir()
    overview = [(12, 22, 736, 696, 'com.fraudguard', 18)]
    for i, module in enumerate(MODULES):
        overview.append((35 + i % 4 * 180, 78 + i // 4 * 100, 150, 64, module, 16))
    for base, x, children in [('common', 35, ('config', 'exception', 'security', 'persistence')),
                              ('integration', 395, ('ai', 'payment', 'email', 'storage'))]:
        overview.append((x, 396, 330, 284, base, 17))
        for i, child in enumerate(children):
            assert (BACKEND / base / child).is_dir()
            overview.append((x + 16 + i % 2 * 155, 454 + i // 2 * 110, 140, 70, child, 15))
    render('package-overview', 740, overview)
    render('package-layers', 900, [
        (12, 22, 736, 800, 'com.fraudguard.investigation', 18),
        (42, 80, 280, 125, 'controller', 17),
        (410, 80, 290, 155, 'service', 17),
        (550, 142, 126, 63, 'impl', 16),
        (42, 260, 280, 125, 'repository', 17),
        (42, 454, 280, 126, 'entity', 17),
        (410, 454, 290, 156, 'dto', 17),
        (430, 520, 114, 62, 'request', 15),
        (566, 520, 114, 62, 'response', 15),
        (42, 660, 280, 125, 'mapper', 17)],
        labels=[(477, 154, 'Public', 14), (477, 174, 'interfaces', 14),
                (380, 844, 'Same layered layout applies to all eleven business modules.', 15),
                (380, 868, 'Dashed arrows represent permitted design dependencies.', 15)],
        paths=[[(322, 135), (410, 135)],
               [(322, 175), (340, 175), (340, 420), (435, 420), (435, 454)],
               [(490, 235), (490, 454)],
               [(610, 205), (610, 245), (355, 245), (355, 315), (322, 315)],
               [(650, 205), (730, 205), (730, 568), (700, 568)],
               [(570, 205), (570, 225), (373, 225), (373, 714), (322, 714)],
               [(182, 385), (182, 454)],
               [(182, 660), (182, 580)],
               [(322, 748), (390, 748), (390, 550), (410, 550)]])
    print('Rendered two reference-style package figures; scaffold names and bounds checked.')


if __name__ == '__main__':
    main()
