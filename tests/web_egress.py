from playwright.sync_api import sync_playwright
from urllib.parse import urlparse,parse_qs
from collections import Counter
import json, shutil
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page()
 counts=Counter(); errors=[]
 def fixture(r):
  req=r.request; u=urlparse(req.url); t=u.path.split('/')[-1];q=parse_qs(u.query); obj={}
  if u.path.startswith('/api/oms'):
   a=(req.post_data_json or {}).get('action') if req.method=='POST' else q.get('action',[''])[0]
   obj={'user':{'id':'aaa','role':'admin','username':'QA','is_active':True}} if a=='accountProfile' else {'token':'fixture-proof'} if a=='editSession' else {'revision':4,'changes':[],'reset':False,'more':False} if a=='samplingChanges' else {}
  elif u.hostname=='nzos-test.invalid':
   counts[(req.method,t)]+=1
   if t=='nzos_read_versions':obj={k:'authorized-v1' for k in ['samples','sample_comments','orders','buyers','parcels','shipment_lines','order_queues','bom_items','fitting_blocks','size_groups']}
   elif t=='nzos_dashboard_summary':obj={'active':3,'buyers':[['Denim',100]],'months':[]}
   elif t=='orders' and q.get('select')==['style_image_base64']:
    obj={'style_image_base64':'data:image/png;base64,iVBORw0KGgo='}
    counts['images']+=1
   elif t=='orders':obj=[{'id':'order1','style_number':'DENIM01','status':'Active','buyer_name':'QA','buyer_id':'buyer1','nzos_image_version':'hash1'}]
   elif t=='samples' and req.method=='GET':obj=[{'id':'sample1','order_id':'order1','stage':'Pattern','sample_number':'SAM-QA','status':'Requested','version':'V1'}]
   elif t=='sample_comments' and req.method=='POST':obj={**req.post_data_json,'id':'comment1'}
   else:obj=[]
  elif u.hostname=='127.0.0.1' and not u.path.startswith('/api/'):return r.continue_()
  r.fulfill(status=200,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PATCH,POST,OPTIONS'},content_type='application/json',body=json.dumps(obj))
 page.route('**/*',fixture);page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5099/orders');page.wait_for_timeout(1800)
 def check(flag,why):
  if not flag: raise AssertionError((why,errors,page.locator('body').inner_text()[:750],counts))
 page.get_by_text('DENIM01',exact=False).first.wait_for(state='attached',timeout=30000)
 page.wait_for_timeout(500)
 print('Order fixture:',page.locator('body').inner_text()[-1000:],counts,errors,flush=True)
 before=counts['images']
 check(before==1,'one visible image')
 page.locator('a[href="/sampling"]:visible').first.click()
 row=page.locator('tr').filter(has_text='SAM-QA').last
 row.wait_for(timeout=8000); before_counts=counts.copy()
 row.locator('select').first.select_option(label='Cutting')
 page.wait_for_timeout(600)
 check(counts[('PATCH','samples')]==1,'stage save')
 check(all(counts[('GET',t)]==before_counts[('GET',t)] for t in ['samples','orders','buyers','bom_items','fitting_blocks','sample_comments','parcels']),'no seven-table reload')
 page.locator('a[href="/orders"]:visible').first.click();page.wait_for_timeout(600)
 check(counts['images']==before,'cached image')
 page.locator('a[href="/"]:visible,a[href="/dashboard"]:visible').first.click();page.wait_for_timeout(500)
 check(counts[('POST','nzos_dashboard_summary')]>0 and not errors,'dashboard')
 print('Chromium passed: one visible photo, repeat visit zero photo bodies, sample edit zero full-list requests, dashboard summary rendered.')
 b.close()
