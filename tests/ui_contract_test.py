import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'id' and value:
                self.ids.add(value)

html = (ROOT / 'index.html').read_text(encoding='utf-8')
app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
parser = IdParser()
parser.feed(html)
references = set(re.findall(r'\$\("([A-Za-z0-9_-]+)"\)', app))
missing = sorted(references - parser.ids)
assert not missing, f'ID usati dal JavaScript ma assenti nell HTML: {missing}'

required = {
    'clusterSelect', 'clusterAll', 'clusterSelectLabel', 'clusterChips',
    'cutMode', 'referenceWeight', 'quantityWeight', 'manualWeights',
    'analyzeButton', 'assortmentFile', 'salesFile'
}
assert required <= parser.ids, f'Controlli mancanti: {sorted(required - parser.ids)}'
assert '<details id="clusterSelect"' in html, 'La selezione cluster deve usare un controllo nativo details'
assert 'id="cutMode"' in html and '<select id="cutMode"' in html, 'La modalità taglio deve usare un select nativo'
assert 'v=20260715-3' in html, 'Manca il cache busting delle risorse'
print('OK - contratto UI superato')
