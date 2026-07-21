import re
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class P(HTMLParser):
 def __init__(self): super().__init__(); self.ids=set()
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k=='id' and v:self.ids.add(v)
html=(ROOT/'index.html').read_text(encoding='utf-8');app=(ROOT/'js'/'app-v4.js').read_text(encoding='utf-8');p=P();p.feed(html)
refs=set(re.findall(r'\$\("([A-Za-z0-9_-]+)"\)',app));missing=sorted(refs-p.ids);assert not missing,missing
required={'proposalTab','proposalTable','proposalSearchInput','salePriceColumn','costColumn','vatColumn','defaultVatRate','attributeEnabled1','attributeName1','attributeRules1','attributeMode1','attributeValue1','planogramTab','planogramLevel','planogramCommercialField','planogramOrientation','generatePlanogramButton','printPlanogramButton','planogramShelves','clusterMenuButton','clusterMenu','clusterAll','clusterSelectLabel','clusterChips','cutModeAuto','cutModeManual','referenceWeight','analyzeButton','assortmentFile','salesFile'}
assert required<=p.ids,sorted(required-p.ids)
assert 'engine-v3.js?v=4.0.0' in html and 'enrichment-v1.js?v=1.1.0' in html and 'planogram-v3.js?v=3.0.0' in html and 'app-v4.js?v=4.0.1' in html
assert 'presence-dot alto' in html and 'presence-dot medio' in html and 'presence-dot basso' in html
assert 'Presenza proposta' in app and 'renderProposalTable' in app and 'attribute_1' in app
print('OK - contratto UI v4.0.1 margine netto IVA')
