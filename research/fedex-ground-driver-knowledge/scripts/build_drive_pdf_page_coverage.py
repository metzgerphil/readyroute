#!/usr/bin/env python3
"""Build page-level coverage for all 15 reviewed PDFs in the Drive snapshot."""

from __future__ import annotations
import csv, json, re
from collections import defaultdict
from pathlib import Path
from build_forge_page_coverage import build_rows as build_forge_rows
from build_op117_page_coverage import build_rows as build_op117_rows

ROOT=Path(__file__).resolve().parent.parent
OUTPUT=ROOT/'knowledge/drive_pdf_page_coverage.csv'
FIELDS=['source_id','title','page','page_count','section_or_subject','coverage_disposition','knowledge_ids','reference_record_count','coverage_basis','required_follow_up']

PDFS={
 'SRC-GDRIVE-FILE-0001':(2,'Customer Experience Quick Reference MGB-119'),
 'SRC-GDRIVE-FILE-0002':(16,'Customer Experience On the Road Reference Guide OP-119'),
 'SRC-GDRIVE-FILE-0004':(12,'Focus on Package Placement'),
 'SRC-GDRIVE-FILE-0005':(1,'FORGE Business Closure'),
 'SRC-GDRIVE-FILE-0006':(3,'FORGE Call Tags'),
 'SRC-GDRIVE-FILE-0007':(5,'FORGE Delayed Login'),
 'SRC-GDRIVE-FILE-0008':(246,'FORGE P&D Application Guide 3.00 / FORGE 2.8.0'),
 'SRC-GDRIVE-FILE-0009':(8,'FORGE Quick Start 1.0'),
 'SRC-GDRIVE-FILE-0010':(6,'FORGE Settings 2.0.0'),
 'SRC-GDRIVE-FILE-0011':(1,'Hand sheet 2 image-only PDF'),
 'SRC-GDRIVE-FILE-0012':(1,'Hand sheet image-only PDF'),
 'SRC-GDRIVE-FILE-0013':(14,'Manifest Preview 4.5.0 Application Guide'),
 'SRC-GDRIVE-FILE-0014':(89,'On the Road Reference Guide OP-117 v2'),
 'SRC-GDRIVE-FILE-0015':(2,'Package Placement Quick Reference'),
 'SRC-GDRIVE-FILE-0016':(1,'Personnel Qualification Verification Flow'),
}

SUBJECT_RANGES={
 'SRC-GDRIVE-FILE-0001':[(1,1,'Signature, release, package care, scanning, and time-definite expectations'),(2,2,'Security and delivery/pickup status-code quick reference')],
 'SRC-GDRIVE-FILE-0002':[(1,1,'Authority, confidentiality, and controlling-agreement notice'),(2,2,'Table of contents'),(3,3,'Customer-experience and agreement-obligation overview'),(4,5,'Pickup flow, packaging, escalation, and pickup-service types'),(6,8,'Delivery classification, attempt expectations, package care, and appearance'),(9,11,'Tracking events, scan integrity, and delivery-status reference'),(12,15,'Signature, alcohol, release, PPOD, indirect, premium, and security'),(16,16,'Recording, media, and publication restrictions')],
 'SRC-GDRIVE-FILE-0004':[(1,3,'Purpose, agenda, and customer-feedback context'),(4,11,'Placement, access, package size, PPOD, and scan integrity'),(12,12,'Service-results and metrics context')],
 'SRC-GDRIVE-FILE-0005':[(1,1,'Business Closure message workflow')],
 'SRC-GDRIVE-FILE-0006':[(1,3,'Call-tag creation, action scope, status, and individual handling')],
 'SRC-GDRIVE-FILE-0007':[(1,5,'Delayed Login entry, limitations, recovery, merge, and EOD')],
 'SRC-GDRIVE-FILE-0009':[(1,3,'Older safety, launch, authentication, vehicle, and dispatch workflow'),(4,6,'Older delivery, pickup, release, indirect, and status workflow'),(7,8,'Older scan deletion, EOD, and messaging workflow')],
 'SRC-GDRIVE-FILE-0010':[(1,2,'Settings entry, display, and audio preferences'),(3,4,'Navigation, map, and stop-list preferences'),(5,5,'Camera scanning'),(6,6,'About and version information')],
 'SRC-GDRIVE-FILE-0011':[(1,1,'Unidentified Delivery Record examples and code tables')],
 'SRC-GDRIVE-FILE-0012':[(1,1,'Unidentified manual sheeting barcode and notation guide')],
 'SRC-GDRIVE-FILE-0013':[(1,1,'Identity, contents, and version'),(2,3,'Purpose, launch, and permissions'),(4,6,'Preview, summary, and map'),(7,12,'Modify, discrepancy, refresh, and dispatch'),(13,14,'Premium filters and manifest search')],
 'SRC-GDRIVE-FILE-0015':[(1,1,'Customer-reported placement photo examples'),(2,2,'Placement and PPOD quick reference')],
 'SRC-GDRIVE-FILE-0016':[(1,1,'Qualification and activation flowchart')],
}

EXPLICIT={
 ('SRC-GDRIVE-FILE-0001',2):('OLDER_STATUS_REFERENCE_PARTIALLY_MODELED','Current vehicle/package security standards are mapped to operational knowledge. The same page\'s quick-reference code tables remain bounded by the legacy crosswalk and current OP-117/OP-324/OP-321 source gates; no procedure is inferred from code labels.'),
 ('SRC-GDRIVE-FILE-0002',1):('GOVERNING_FRONT_MATTER','Authority, confidentiality, and ISP Agreement precedence; not a standalone driver procedure.'),
 ('SRC-GDRIVE-FILE-0002',2):('TABLE_OF_CONTENTS','Navigation/front matter only.'),
 ('SRC-GDRIVE-FILE-0002',3):('PRESENTATION_CONTEXT','High-level customer-experience and agreement-obligation context; specific operational rules are mapped on later pages.'),
 ('SRC-GDRIVE-FILE-0002',11):('OLDER_STATUS_REFERENCE_PARTIALLY_MODELED','Older OP-119 status table; code 030 is preserved as potentially outdated and the newer OP-117/current OP-324 obligations remain controlling.'),
 ('SRC-GDRIVE-FILE-0004',1):('PRESENTATION_CONTEXT','Purpose/agenda/customer-feedback context; no standalone procedure.'),
 ('SRC-GDRIVE-FILE-0004',2):('PRESENTATION_CONTEXT','Customer-feedback context; no standalone procedure.'),
 ('SRC-GDRIVE-FILE-0004',3):('PRESENTATION_CONTEXT','Customer-feedback problem framing; no standalone procedure.'),
 ('SRC-GDRIVE-FILE-0004',12):('METRICS_CONTEXT','Service-results/metrics context; no independent on-route procedure.'),
 ('SRC-GDRIVE-FILE-0009',2):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 UI superseded by later reviewed guides; unique differences remain version-risk evidence, not current procedure.'),
 ('SRC-GDRIVE-FILE-0009',3):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 UI superseded by later reviewed guides; not current procedure.'),
 ('SRC-GDRIVE-FILE-0009',4):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 standard stop workflow superseded by later reviewed guides.'),
 ('SRC-GDRIVE-FILE-0009',5):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 release/indirect UI differs from later guidance and remains version-risk evidence.'),
 ('SRC-GDRIVE-FILE-0009',6):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 status-scope UI is superseded by later mapped guidance.'),
 ('SRC-GDRIVE-FILE-0009',7):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 scan-delete/EOD UI is superseded by later mapped guidance.'),
 ('SRC-GDRIVE-FILE-0009',8):('OLDER_VERSION_REFERENCE_ONLY','FORGE 1.0.0 messaging UI is superseded by later mapped guidance.'),
 ('SRC-GDRIVE-FILE-0013',1):('GOVERNING_FRONT_MATTER','Document identity, contents, and version; not a standalone procedure.'),
 ('SRC-GDRIVE-FILE-0015',1):('VISUAL_EXAMPLE_ONLY','Customer-reported placement photographs illustrate dissatisfaction but do not independently establish a complete rule.'),
}

def pages_from_locator(locator,page_count):
 if 'Single image page' in locator or 'full page' in locator.lower(): return {1}
 m=re.search(r'\bpages?\s+(.+)$',locator,re.I)
 if not m:return set()
 pages=set()
 for a,b in re.findall(r'\b(\d{1,3})(?:\s*-\s*(\d{1,3}))?\b',m.group(1).replace(' and ',', ')):
  a=int(a);b=int(b or a)
  if 1<=a<=b<=page_count:pages.update(range(a,b+1))
 return pages

def subject_for(sid,page):
 for a,b,s in SUBJECT_RANGES[sid]:
  if a<=page<=b:return s
 raise ValueError((sid,page))

def build_rows():
 maps=defaultdict(set)
 with (ROOT/'knowledge/source_to_knowledge.csv').open(newline='') as h:
  for r in csv.DictReader(h):
   if r['source_id'] in PDFS:
    for p in pages_from_locator(r['locator'],PDFS[r['source_id']][0]):maps[(r['source_id'],p)].add(r['knowledge_id'])
 refs=defaultdict(int)
 for fn in ('status_codes.jsonl','pickup_reason_codes.jsonl'):
  for raw in (ROOT/'knowledge'/fn).read_text().splitlines():
   if raw.strip():
    r=json.loads(raw);sid=r['source_id']
    if sid in PDFS:
     for p in pages_from_locator(r['locator'],PDFS[sid][0]):refs[(sid,p)]+=1
 rows=[]
 nested={'SRC-GDRIVE-FILE-0008':build_forge_rows(),'SRC-GDRIVE-FILE-0014':build_op117_rows()}
 for sid,(count,title) in PDFS.items():
  if sid in nested:
   for r in nested[sid]:
    rows.append({'source_id':sid,'title':title,'page':r['page'],'page_count':str(count),'section_or_subject':r['section_or_subject'],'coverage_disposition':r['coverage_disposition'],'knowledge_ids':r['knowledge_ids'],'reference_record_count':r.get('reference_record_count','0'),'coverage_basis':r['coverage_basis'],'required_follow_up':r['required_follow_up']})
   continue
  for p in range(1,count+1):
   ids=sorted(maps[(sid,p)]);rc=refs[(sid,p)]
   if (sid,p) in EXPLICIT:disp,basis=EXPLICIT[(sid,p)];follow=''
   elif ids and rc:disp='KNOWLEDGE_AND_REFERENCE_MAPPED';basis='Mapped to operational knowledge and normalized reference data.';follow=''
   elif ids:disp='KNOWLEDGE_MAPPED';basis='Mapped to one or more operational knowledge records with exact source evidence.';follow=''
   elif rc:disp='REFERENCE_DATA_MODELED';basis='Normalized in a reference dataset without inferring a complete procedure.';follow=''
   else:disp='UNRECONCILED';basis='No mapping or explicit disposition found.';follow='Review and map or explicitly classify.'
   rows.append({'source_id':sid,'title':title,'page':str(p),'page_count':str(count),'section_or_subject':subject_for(sid,p),'coverage_disposition':disp,'knowledge_ids':';'.join(ids),'reference_record_count':str(rc),'coverage_basis':basis,'required_follow_up':follow})
 return rows

def main():
 rows=build_rows()
 with OUTPUT.open('w',newline='') as h:w=csv.DictWriter(h,fieldnames=FIELDS,lineterminator='\n');w.writeheader();w.writerows(rows)
 print(f'wrote {len(rows)} Drive PDF page-coverage rows to {OUTPUT}')

if __name__=='__main__':main()
