import re
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class P(HTMLParser):
 def __init__(self): super().__init__(); self.ids=set()
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k=='id' and v:self.ids.add(v)
html=(ROOT/'index.html').read_text(encoding='utf-8');app=(ROOT/'js'/'app-v3-3.js').read_text(encoding='utf-8');p=P();p.feed(html)
refs=set(re.findall(r'\$\("([A-Za-z0-9_-]+)"\)',app));missing=sorted(refs-p.ids);assert not missing,missing
required={'planogramTab','planogramLevel','planogramCommercialField','planogramOrientation','generatePlanogramButton','printPlanogramButton','planogramShelves','planogramLegendCharacteristic','planogramLegendCommercial','clusterMenuButton','clusterMenu','clusterAll','clusterSelectLabel','clusterChips','cutModeAuto','cutModeManual','referenceWeight','referenceWeightLabel','quantityWeightLabel','analyzeButton','assortmentFile','salesFile'}
assert required<=p.ids,sorted(required-p.ids)
assert 'engine-v3.js?v=3.3.0' in html and 'planogram-v2.js?v=2.0.0' in html and 'app-v3-3.js?v=3.3.0' in html
assert 'columnTooltip' in p.ids
assert 'Caratteristica' in app and 'planogramCommercialField' in app and 'planogramOrientation' in app
print('OK - contratto UI v3.3 Caratteristica + attributo commerciale')
