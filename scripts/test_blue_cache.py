import sys,types,importlib,ast,tempfile,os,io,queue,traceback
from pathlib import Path
from PIL import Image
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parents[1]
if len(sys.argv)<4:
 import subprocess
 for variant,asset in [('open','Ultra_Stalker_Final.ipk'),('dream','Ultra_Stalker_DreamOS_Py2.deb')]:
  with tempfile.TemporaryDirectory() as td:
   subprocess.run(['dpkg-deb','-x',str(BASE/'packages'/asset),td],check=True)
   root=Path(td)/'usr/lib/enigma2/python/Plugins/Extensions/UltraStalker'
   for scenario in ('seed','rescue','gallery','manual','mixed','failure'):
    subprocess.run([sys.executable,'-B',str(Path(__file__).resolve()),variant,scenario,str(root)],check=True)
 print('PASS: both packaged BLUE workers and actual artwork components')
 raise SystemExit(0)
variant,scenario=sys.argv[1:3]
root=Path(sys.argv[3])
mode='new'
p=types.ModuleType('realtest');p.__path__=[str(root)];p._=lambda x:x;sys.modules[p.__name__]=p
m=importlib.import_module('realtest.artwork_v2_impl')
t=importlib.import_module('realtest.tmdb_impl')
lib=importlib.import_module('realtest.media_library')
rawio=io.BytesIO();Image.effect_noise((780,1170),50).convert('RGB').save(rawio,'JPEG');raw=rawio.getvalue()
class Response(io.BytesIO):
 status=200
 headers={'Content-Length':str(len(raw)), 'Content-Type':'image/jpeg'}
class Opener:
 def open(self,*a,**kw):
  if scenario=='failure':raise IOError('fixture connection failure')
  return Response(raw)
m.build_safe_https_media_opener=lambda **kw:Opener()
requests=[]
original_identity=m.ArtworkV2._resolve_identity
if scenario=='rescue':
 m.ArtworkV2._resolve_identity=lambda self,media,item,hot:('movie',None,0,'none',None)
 m.ArtworkV2._resolve_poster_rescue=lambda self,media,item:('movie',123,1,{'id':123,'title':'The Ghost Killer','release_date':'2025-01-01','poster_path':'/newposter.jpg'},True)
def get(self,path,params=None):
 requests.append(path)
 if path.endswith('/images'):return {'posters':[{'file_path':'/galleryposter.jpg','width':780,'height':1170}]}
 if scenario in ('rescue','gallery') and not path.startswith('/search/'):raise IOError('temporary details failure')
 if path.startswith('/search/'):
  q=params.get('query','');return {'results':[{'id':123,'title':q,'original_title':q,'release_date':'2025-01-01','poster_path':(None if scenario=='gallery' else '/newposter.jpg'),'popularity':10,'vote_count':20}]}
 return {'id':int(path.split('/')[2]),'title':'The Ghost Killer','original_title':'The Ghost Killer','release_date':'2025-01-01','poster_path':'/poster%s.jpg'%path.split('/')[2],'images':{'posters':[]}}
t.TMDBClient._get=get
with tempfile.TemporaryDirectory() as tmp:
 def dirs(*paths):
  for path in paths:
   assert os.path.commonpath([os.path.abspath(path),tmp])==tmp,('Test path escaped sandbox',path)
   os.makedirs(path,exist_ok=True)
  return True
 for name,module in list(sys.modules.items()):
  if not name.startswith('realtest') or module is None:continue
  for key in ('ROOT','ART_ROOT','V3_ROOT','MANUAL_RESCUE_ROOT'): 
   if hasattr(module,key):setattr(module,key,tmp)
  for key,sub in [('POSTERS','posters'),('POSTER_ROOT','posters'),('BACKDROPS','backdrops'),('BACKDROP_ROOT','backdrops'),('INDEX','index'),('MANIFEST_ROOT','index'),('LOOKUP','lookup'),('LOGS','logs'),('ART_LOG_ROOT','logs'),('GENERATED','generated'),('CACHE_DIR','index'),('POSTER_CACHE_DIR','posters'),('BACKDROP_CACHE_DIR','backdrops'),('IMAGE_CACHE_DIR','generated'),('SOURCE_POSTER_CACHE_DIR','source_posters'),('SOURCE_BACKDROP_CACHE_DIR','source_backdrops')]:
   if hasattr(module,key):setattr(module,key,tmp+'/'+sub);dirs(tmp+'/'+sub)
  if hasattr(module,'ART_LOG_PATH'):module.ART_LOG_PATH=tmp+'/logs/artwork.log'
  if hasattr(module,'ART_DIRS'):module.ART_DIRS=tuple(tmp+'/'+sub for sub in ('posters','backdrops','index','logs'))
  if hasattr(module,'hdd_ready'):module.hdd_ready=lambda *a,**kw:True
  if hasattr(module,'hdd_read_ready'):module.hdd_read_ready=lambda *a,**kw:True
  if hasattr(module,'persistent_write_gate'):module.persistent_write_gate=lambda *a,**kw:True
  if hasattr(module,'ensure_persistent_dirs'):module.ensure_persistent_dirs=dirs
 storage=importlib.import_module('realtest.storage');storage.CONFIG_DIR=tmp+'/config'
 errors=[]
 source=(root/'ui_grid_mixin_posters.py').read_text()
 tree=ast.parse(source)
 cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='GridPostersMixin')
 node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='_cache_current_page_backdrops_worker')
 env=dict(__name__='realtest.worker',__package__='realtest',os=os,load_settings=lambda:{},load_artwork_v2_manifest=m.load_manifest,canonical_art_paths=m.canonical_art_paths,_=lambda x:x,optional_failure=lambda tag,exc:errors.append((tag,type(exc).__name__,str(exc))))
 if variant=='dream':env['us_casefold']=importlib.import_module('realtest.us_env').us_casefold
 exec(compile(ast.Module(body=[node],type_ignores=[]),'worker','exec'),env)
 rows=[{'id':'abc','name':'The Ghost Killer','year':'2025'}]
 if scenario=='mixed':rows=[{'id':i,'name':'The Ghost Killer '+str(i),'year':'2025','_locked_tmdb_id':1000+i,'_ultra_search_verified_tmdb_id':1000+i} for i in range(25)]
 obj=types.SimpleNamespace(artwork_cache_backdrops=False,_grid_settings={'tmdb_credential':'offline-test'},profile={'name':'test'},media_type='vod',_folder_artwork_progress=queue.Queue(),_cache_backdrop_category_total=lambda:len(rows),_cache_backdrop_category_rows=lambda e:rows)
 if scenario=='manual':
  manual=importlib.import_module('realtest.manual_identity')
  manual.set_choice(obj.profile,'vod',rows[0],{'id':123,'media_type':'movie','title':'The Ghost Killer','year':'2025'})
 if scenario=='mixed':
  for item in rows[:13]:
   tid=item['_locked_tmdb_id'];target=m.canonical_art_paths('movie',tid)['poster'];Path(target).write_bytes(raw)
   assert m.save_manifest(obj.profile,'vod',item,{'tmdb_id':tid,'media_type':'movie','identity_verified':True,'poster_local':target})
 result=env['_cache_current_page_backdrops_worker'](obj)
 print(variant,scenario,mode,'RESULT',result,'ERRORS',errors)
 expected=(13,12,0) if scenario=='mixed' else ((0,0,1) if scenario=='failure' else (0,1,0))
 assert (result['cached'],result['downloaded'],result['failed'])==expected,(result,errors)
 if scenario!='failure':
  repeat=env['_cache_current_page_backdrops_worker'](obj)
  assert repeat['cached']==len(rows) and repeat['downloaded']==0 and repeat['failed']==0,repeat
 else:
  assert not list(Path(tmp,'posters').glob('*.jpg'))
 assert not list(Path(tmp,'backdrops').glob('*'))
 print('PASS: actual resolver/downloader/manifests; truthful counts; no backdrops')
 importlib.import_module('realtest.core.shared_executors').shutdown_shared_executors(wait=True)
 m.shutdown_artwork_workers(wait=True)
 import threading,time
 deadline=time.monotonic()+10
 while True:
  bridges=[t for t in threading.enumerate() if t.name=='ultrastalker-cache-bridge']
  if not bridges:break
  if time.monotonic()>deadline:raise AssertionError('Cache bridge did not finish')
  for bridge in bridges:bridge.join(timeout=.5)

