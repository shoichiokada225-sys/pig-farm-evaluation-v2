#!/usr/bin/env python3
"""G2-G13,G25 を works-v2.js (--from-works-v2) か new/*.json に当てる。"""
import json,re,sys,unicodedata,glob,os,itertools
REPO='/Users/okadashoichi/pig-farm-evaluation-v2'
NEW=['patrol-check','water-check','vent-temp','vent-controller','density-grouping']
SRC=REPO+'/review/fin-works-sources.md'
def loadwd():
    t=open(REPO+'/works-v2.js',encoding='utf-8').read()
    return json.loads(t[t.index('{',t.index('WORKDATA_V2=')):t.rindex('};')+1])
nfkc=lambda s:unicodedata.normalize('NFKC',s)
nk=lambda s:re.sub(r'\s','',nfkc(s))
bad=[]
def NG(*a): bad.append(' | '.join(map(str,a)))
if '--from-works-v2' in sys.argv:
    wd=loadwd(); allw=wd['works']; presets=wd['presets']
    new=[w for w in allw if w['id'] in NEW]
else:
    S=os.path.dirname(os.path.abspath(__file__))
    new=[json.load(open(f'{S}/new/{i}.json')) for i in NEW]
    wd=loadwd(); allw=wd['works']; presets=wd['presets']
exist=[w for w in allw if w['id'] not in NEW]
def lv(a,l): return a['levels'] if l=='ja' else a['levels_'+l]
def kt(a,l): return a['kanten'] if l=='ja' else a['kanten_'+l]
def texts(w,l):
    o=[w['name'] if l=='ja' else w['name_'+l], w['purposeShort'] if l=='ja' else w['purposeShort_'+l]]
    for a in w['aspects']:
        o+= [a['name'] if l=='ja' else a['name_'+l], kt(a,l)]+lv(a,l)
    return o
LG=['ja','en','vi','id']
ids={w['id'] for w in exist}
for w in new:
    if w['id'] in ids: NG('G3',w['id'],'既存id重複')
    if len(w['aspects'])!=5: NG('G2',w['id'],'aspects',len(w['aspects']))
    if len({a['id'] for a in w['aspects']})!=5: NG('G3',w['id'],'aspect id重複')
    if len(nk(w['name']))>14: NG('G11',w['id'],'作業名長',len(nk(w['name'])))
    ex_names={nk(x['name']).lower() for x in exist}|{nk(p['name']).lower() for p in presets}|{nk(x.get('no','')).lower() for x in exist if x.get('no')}
    if nk(w['name']).lower() in ex_names: NG('G12',w['id'],w['name'])
    for a in w['aspects']:
        if len(nk(a['name']))>24: NG('G11',w['id'],a['id'],'種目名長',len(nk(a['name'])))
        for l in LG:
            if len(lv(a,l))!=5: NG('G2',w['id'],a['id'],l,'levels数')
            if not kt(a,l).strip(): NG('G2',w['id'],a['id'],l,'kanten空')
        L=a['levels']
        if '指示があれば' not in L[2]: NG('G10',w['id'],a['id'],'L3')
        if '指示がなくても' not in L[3]: NG('G10',w['id'],a['id'],'L4')
        if '新人に指導' not in L[4]: NG('G10',w['id'],a['id'],'L5')
        if any('指導' in x for x in L[:2]): NG('G10',w['id'],a['id'],'L1/L2に指導')
        if len(set(L))!=5: NG('G10',w['id'],a['id'],'段階重複')
        for i,x in enumerate(L,1):
            if not 25<=len(x)<=110: NG('G10',w['id'],a['id'],f'L{i}字数',len(x))
        num=lambda s:sorted(re.findall(r'\d+(?:\.\d+)?',nfkc(s).replace(',','.') if False else re.sub(r'(?<=\d),(?=\d{3}\b)','',nfkc(s)).replace(',','.')))
        for i in range(5):
            n=[num(lv(a,l)[i]) for l in LG]
            if any(x!=n[0] for x in n): NG('G8',w['id'],a['id'],f'L{i+1}',n)
        n=[num(kt(a,l)) for l in LG]
        if any(x!=n[0] for x in n): NG('G8',w['id'],a['id'],'kanten',n)
    pat={'ja':'母豚|産次|泌乳|BCS|妊娠|繁殖|分娩|子豚|離乳|哺乳|候補豚','en':'sow|farrow|lactat|gestat|piglet|wean','vi':'nái|đẻ|lợn con|cai sữa','id':'induk|beranak|anak babi|sapih'}
    for l in LG:
        t=' '.join(texts(w,l)); m=re.findall(pat[l],t,re.I)
        if m: NG('G4',w['id'],l,m)
    tv=' '.join(texts(w,'vi'))
    if re.search(r'\bheo\b',tv,re.I): NG('G5',w['id'],'heo')
    for l in ['en','vi','id']:
        if '〜' in ' '.join(texts(w,l)): NG('G6',w['id'],l,'〜')
    allt=json.dumps(w,ensure_ascii=False)
    m=re.findall('多古|睦沢|大田原|那須|十余三|丸山|旭ヶ丘|穂積|桜田|九美上|福田|ヒラノ|hirano|キム',allt,re.I)
    if m: NG('G25',w['id'],m)
# G9/G7: 根拠
src=open(SRC,encoding='utf-8').read().split('\n')
BG='/Users/okadashoichi/swine-manual-app/swine-manual/docs/beginner-guide'
cur=None; sec={}  # work id -> aspect -> list of (path,a,b,line)
wid=None
for ln in src:
    m=re.match(r'#\s*(\S+)\s*(根拠行|重複)?',ln)
    if ln.startswith('# ') :
        for i in NEW:
            if ln[2:].startswith(i): wid=i
    if ln.startswith('## '):
        cur=ln[3:].split('/')[-1].split('（')[0].strip().split(' ')[0]
        for i in NEW:
            if ln[3:].startswith(i+' /') or ln[3:].startswith(i+'/'): wid=i
        continue
    t=ln.replace('D/',BG+'/').replace('D=',' ')
    for m in re.finditer(r'((?:/[^\s:]+?)\.md):L(\d+)(?:-L?(\d+))?',t):
        p=m.group(1); a=int(m.group(2)); b=int(m.group(3) or a)
        aid=cur
        mm=re.match(r'\s*-?\s*([a-z0-9-]+):\s*/',ln)
        if mm: aid=mm.group(1)
        sec.setdefault((wid,aid),[]).append((p,a,b,ln))
filecache={}
def lines(p):
    if p not in filecache:
        filecache[p]=open(p,encoding='utf-8').read().split('\n') if os.path.exists(p) else None
    return filecache[p]
for w in new:
    for a in w['aspects']:
        ent=sec.get((w['id'],a['id']),[])
        if not ent: NG('G9',w['id'],a['id'],'根拠行なし'); continue
        pool=''
        for p,x,y,ln in ent:
            f=lines(p)
            if f is None: NG('G9',w['id'],a['id'],'ファイルなし',p); continue
            if y>len(f) or x<1 or x>y: NG('G9',w['id'],a['id'],'行範囲不正',p,x,y,len(f)); continue
            pool+='\n'.join(f[x-1:y])+'\n'+ln+'\n'
        pool=nfkc(pool).replace(',','')
        ja=' '.join([a['name'],a['kanten']]+a['levels'])
        for n in set(re.findall(r'\d+(?:\.\d+)?',nfkc(ja))):
            if not re.search(r'(?<![\d.])'+re.escape(n)+r'(?![\d])',pool): NG('G7',w['id'],a['id'],'数値の根拠なし',n)
# G13
def gr(s):
    s=re.sub(r'\s','',nfkc(s)); return {s[i:i+2] for i in range(len(s)-1)}
def jac(a,b): return len(a&b)/len(a|b) if a|b else 0
ex_k=[(w['id'],a['id'],gr(a['kanten'])) for w in exist for a in w['aspects']]
mx=0
for w in new:
    ks=[(a['id'],gr(a['kanten'])) for a in w['aspects']]
    for a in w['aspects']:
        g=gr(a['kanten'])
        for wi,ai,h in ex_k:
            j=jac(g,h); mx=max(mx,j)
            if j>=0.5: NG('G13',w['id'],a['id'],'既存と類似',wi,ai,round(j,2))
    for (i1,g1),(i2,g2) in itertools.combinations(ks,2):
        j=jac(g1,g2)
        if j>=0.4: NG('G13',w['id'],i1,i2,'作業内類似',round(j,2))
print(f'works={len(new)} aspects={sum(len(w["aspects"]) for w in new)} 既存との最大Jaccard={mx:.3f}')
print('NG件数:',len(bad))
for b in bad: print(' NG',b)
sys.exit(1 if bad else 0)
