"""Builds the meal-suggestion mock-up screens as HTML; shoot.mjs renders them to PNG."""
import json, pathlib
HERE = pathlib.Path(__file__).parent

CSS = """
*{box-sizing:border-box}
body{margin:0;background:#f1ece1;color:#2b2721;font-family:Inter,Heebo,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.screen{width:390px;padding:22px 16px 28px}
.title{font-family:Fraunces,'Frank Ruhl Libre',serif;font-size:36px;margin:0}
.date{font-size:14px;color:#656056;padding:2px 0 16px}
.card{background:#e8e1d1;border-radius:22px;padding:20px}
.lab{font-size:11px;font-weight:600;color:#656056;letter-spacing:.14em;text-transform:uppercase}
[dir=rtl] .lab{letter-spacing:0}
.head{display:flex;justify-content:space-between;align-items:center;padding-bottom:12px}
.how{font-size:12px;color:#504c45;text-decoration:underline}
.big{font-family:Fraunces,'Frank Ruhl Libre',serif;font-size:42px;line-height:1}
.of{font-size:14px;color:#656056}
.row1{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px}
.status{font-size:14px;font-weight:600}
.bar{height:10px;border-radius:99px;background:#ddd4c2;margin-top:12px;overflow:hidden}
.bar i{display:block;height:100%;background:#c2673e;border-radius:99px}
.bar.leaf i{background:#6f7f53}
.macro{display:grid;grid-template-columns:70px 1fr auto;gap:10px;align-items:center;font-size:13px;padding-top:12px}
.macro .bar{margin:0;height:6px}
.macro .bar.m i{background:#9d968a}
.num{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.ask{margin-top:18px;border-top:1px solid #ddd4c2;padding-top:16px}
.left{font-size:14px;font-weight:600}
.left span{font-weight:400;color:#504c45}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:99px;background:#2b2721;color:#f1ece1;font-size:14px;font-weight:500;padding:10px 18px;border:0}
.btn.ghost{background:#faf7f0;color:#2b2721;border:1px solid #ddd4c2}
.btn.small{padding:7px 14px;font-size:13px}
.link{font-size:13px;color:#504c45;text-decoration:underline;text-underline-offset:2px}
.muted{font-size:12px;color:#656056;line-height:1.5}
.note{margin-top:10px;background:#faf7f0;border:1px solid #ddd4c2;border-radius:14px;padding:10px 12px;font-size:14px;color:#9d968a}
.sug{background:#faf7f0;border:1px solid #ddd4c2;border-radius:18px;padding:14px;margin-top:10px}
.sug.best{border-color:#c2673e}
.badge{display:inline-block;font-size:11px;font-weight:600;border-radius:99px;padding:3px 9px;background:#eaf1da;color:#3f4a2c}
.badge.new{background:#e8d3c4;color:#7a3a1c}
.badge.foods{background:#eee8da;color:#504c45}
.sname{font-size:15.5px;font-weight:600;padding:8px 0 4px}
.items{font-size:13px;color:#504c45;line-height:1.55;margin:0;padding:0;list-style:none}
.items li{display:flex;justify-content:space-between;gap:8px}
.nums{display:flex;gap:12px;font-size:12.5px;color:#504c45;padding-top:8px;flex-wrap:wrap}
.nums b{color:#2b2721}
.fit{font-size:12.5px;font-weight:600;color:#3f4a2c;padding-top:6px}
.why{font-size:12.5px;color:#656056;line-height:1.5;padding-top:4px}
.sugfoot{display:flex;justify-content:space-between;align-items:center;padding-top:10px}
.dot{width:10px;height:10px;border-radius:99px;background:#c2673e;box-shadow:0 0 0 6px #e8d3c4}
.think{display:flex;gap:14px;align-items:center;padding:6px 2px}
.toast{background:#eaf1da;border-radius:16px;padding:12px 14px;font-size:13.5px;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}
.caption{font-size:12px;color:#656056;padding:6px 2px 10px;font-style:italic}
.sep{height:14px}
.alert{background:#faf7f0;border-radius:16px;padding:14px;margin-top:10px;font-size:13.5px;line-height:1.5}
"""

T = {
 'en': dict(dir='ltr', today='Today', date='Thursday 26 November · 20:40', tt="Today's targets", how='How?',
   of='of 2,150 kcal', left300='300 left', ontarget='On target ✓', prot='Protein', carbs='Carbs', fat='Fat', g='g',
   leftLine='Left today:', leftNums='300 kcal · 38 g protein', ask='Suggest what to eat', addNote='Add a note',
   costs='Uses one written analysis. Built from what you usually eat.', notePh='Quick, no cooking, vegetarian tonight…',
   thinking='Looking through what you usually eat…', usually='usually about 10 seconds', cancel='Cancel',
   forLeft='For the 300 kcal and 38 g protein left', logit='Log it', again='Ask again', close='Close',
   notMed='General suggestions, not medical advice.', report='Report this answer',
   usual='Your usual', foods='From your foods', new='New idea', kcal='kcal', P='protein', C='carbs', F='fat',
   logged='Logged as dinner: Tuna and cottage on rice cakes · 286 kcal', undo='Undo'),
 'he': dict(dir='rtl', today='היום', date='יום חמישי, 26 בנובמבר · 20:40', tt='היעדים של היום', how='איך?',
   of='מתוך 2,150 קלוריות', left300='נשארו 300', ontarget='ביעד ✓', prot='חלבון', carbs='פחמימות', fat='שומן', g='גרם',
   leftLine='נשאר להיום:', leftNums='300 קלוריות · 38 גרם חלבון', ask='מה לאכול עכשיו?', addNote='הוספת הערה',
   costs='משתמש בניתוח טקסט אחד. מבוסס על מה שאתם אוכלים בדרך כלל.', notePh='משהו מהיר, בלי בישול, צמחוני…',
   thinking='מחפשים במה שאתם אוכלים בדרך כלל…', usually='בדרך כלל כ־10 שניות', cancel='ביטול',
   forLeft='ל־300 הקלוריות ו־38 גרם החלבון שנשארו', logit='לרשום', again='לשאול שוב', close='סגירה',
   notMed='הצעות כלליות, לא ייעוץ רפואי.', report='דיווח על התשובה',
   usual='הרגיל שלכם', foods='מהמזונות שלכם', new='רעיון חדש', kcal='קלוריות', P='חלבון', C='פחמימות', F='שומן',
   logged='נרשם כארוחת ערב: טונה וקוטג׳ על פריכיות · 286 קלוריות', undo='ביטול'),
}

SUGS = {
 'en': [
  dict(kind='foods', name='Tuna and cottage on rice cakes', items=[('Tuna in water, 1 tin','112 g'),('Cottage cheese 5%','100 g'),('Rice cakes, 2','18 g')],
       k=286,p=38.5,c=17.5,f=6.5, fit='Leaves 14 kcal · protein 140 of 140 g ✓', why='Closes the whole 38 g protein gap inside the 300 kcal, from two foods you log most weeks.'),
  dict(kind='usual', name='Cottage cheese 5% and cucumber', items=[('Cottage cheese 5%','250 g'),('Cucumber','150 g')],
       k=273,p=28.5,c=12,f=12.5, fit='Leaves 27 kcal · protein 131 of 140 g', why='Your usual evening snack, 9 times this month. 9 g short of the protein.'),
  dict(kind='new', name='Greek yogurt 0% with berries', items=[('Greek yogurt 0%','300 g'),('Mixed berries','100 g')],
       k=227,p=31,c=24,f=0, fit='Leaves 73 kcal · protein 133 of 140 g', why='Something different: no fat, and the carbs fit what is left.'),
 ],
 'he': [
  dict(kind='foods', name='טונה וקוטג׳ על פריכיות', items=[('טונה במים, קופסה','112 גרם'),('קוטג׳ 5%','100 גרם'),('2 פריכיות אורז','18 גרם')],
       k=286,p=38.5,c=17.5,f=6.5, fit='נשארות 14 קלוריות · חלבון 140 מתוך 140 גרם ✓', why='סוגר את כל 38 גרם החלבון בתוך 300 הקלוריות, משני מזונות שאתם רושמים כמעט כל שבוע.'),
  dict(kind='usual', name='קוטג׳ 5% עם מלפפון', items=[('קוטג׳ 5%','250 גרם'),('מלפפון','150 גרם')],
       k=273,p=28.5,c=12,f=12.5, fit='נשארות 27 קלוריות · חלבון 131 מתוך 140 גרם', why='הנשנוש הרגיל שלכם בערב, 9 פעמים החודש. חסרים 9 גרם חלבון.'),
  dict(kind='new', name='יוגורט יווני 0% עם פירות יער', items=[('יוגורט יווני 0%','300 גרם'),('פירות יער','100 גרם')],
       k=227,p=31,c=24,f=0, fit='נשארות 73 קלוריות · חלבון 133 מתוך 140 גרם', why='משהו אחר: בלי שומן, והפחמימות מתאימות למה שנשאר.'),
 ],
}

def fmt(n): return f"{n:g}"

def targets(L, eaten=1850, prot=102, carbs=190, fat=63, done=False):
    share = min(eaten/2150,1)*100
    status = L['ontarget'] if done else L['left300']
    return f"""
<div class="head"><span class="lab">{L['tt']}</span><span class="how">{L['how']}</span></div>
<div class="row1"><div><span class="big num">{eaten:,}</span> <span class="of">{L['of']}</span></div><span class="status">{status}</span></div>
<div class="bar {'leaf' if done else ''}"><i style="width:{share:.0f}%"></i></div>
<div class="macro"><span>{L['prot']}</span><div class="bar"><i style="width:{min(prot/140,1)*100:.0f}%"></i></div><span class="num">{fmt(prot)} / 140 {L['g'] if L['dir']=='ltr' else ''}</span></div>
<div class="macro"><span>{L['carbs']}</span><div class="bar m"><i style="width:{carbs/215*100:.0f}%"></i></div><span class="num">{fmt(carbs)} / 215</span></div>
<div class="macro"><span>{L['fat']}</span><div class="bar m"><i style="width:{fat/72*100:.0f}%"></i></div><span class="num">{fmt(fat)} / 72</span></div>"""

def sug(L, s, best=False):
    badge = {'usual':('', L['usual']), 'foods':('foods', L['foods']), 'new':('new', L['new'])}[s['kind']]
    items = ''.join(f"<li><span>{a}</span><span class='num'>{b}</span></li>" for a,b in s['items'])
    return f"""<div class="sug {'best' if best else ''}"><span class="badge {badge[0]}">{badge[1]}</span>
<div class="sname">{s['name']}</div><ul class="items">{items}</ul>
<div class="nums"><span><b class="num">{s['k']}</b> {L['kcal']}</span><span><b class="num">{fmt(s['p'])}</b> {L['g']} {L['P']}</span><span><b class="num">{fmt(s['c'])}</b> {L['g']} {L['C']}</span><span><b class="num">{fmt(s['f'])}</b> {L['g']} {L['F']}</span></div>
<div class="fit">{s['fit']}</div><div class="why">{s['why']}</div>
<div class="sugfoot"><span></span><button class="btn small">{L['logit']}</button></div></div>"""

def page(L, body):
    return f"""<!doctype html><html dir="{L['dir']}" lang="{'he' if L['dir']=='rtl' else 'en'}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=Frank+Ruhl+Libre:wght@400;600&family=Heebo:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="screen"><h1 class="title">{L['today']}</h1><div class="date">{L['date']}</div>{body}</div></body></html>"""

def ask(L, noteOpen=False):
    note = f"<div class='note'>{L['notePh']}</div>" if noteOpen else ''
    return f"""<div class="card">{targets(L)}
<div class="ask"><div class="left">{L['leftLine']} <span>{L['leftNums']}</span></div>
<div style="display:flex;gap:14px;align-items:center;padding-top:12px;flex-wrap:wrap"><button class="btn">✦ {L['ask']}</button><span class="link">{L['addNote']}</span></div>{note}
<p class="muted" style="margin:10px 0 0">{L['costs']}</p></div></div>"""

def thinking(L):
    return f"""<div class="card">{targets(L)}
<div class="ask"><div class="think"><span class="dot"></span><div><div style="font-size:14.5px;font-weight:500">{L['thinking']}</div><div class="muted">{L['usually']}</div></div></div>
<div style="padding-top:12px"><button class="btn ghost small">{L['cancel']}</button></div></div></div>"""

def answer(L, lang):
    s = SUGS[lang]
    return f"""<div class="card">{targets(L)}
<div class="ask"><div class="left">{L['forLeft']}</div>
{sug(L,s[0],True)}{sug(L,s[1])}{sug(L,s[2])}
<div style="display:flex;gap:10px;padding-top:14px"><button class="btn ghost small">{L['again']}</button><button class="btn ghost small">{L['close']}</button></div>
<p class="muted" style="margin:12px 0 0">{L['notMed']} <span class="link" style="font-size:12px">{L['report']}</span></p></div></div>"""

def logged(L):
    return f"""<div class="card">{targets(L, eaten=2136, prot=140.5, carbs=207.5, fat=69.5, done=True)}
<div class="toast"><span>{L['logged']}</span><span class="link" style="font-weight:600">{L['undo']}</span></div></div>"""

def states():
    L = T['en']
    blocks = [
     ("Out of analyses (signed in, no plan left)", f"""<div class="alert"><b>That was the last free analysis.</b><br>Suggestions are written analyses: the subscription includes 200 a month.<div style="display:flex;gap:10px;padding-top:10px;flex-wrap:wrap"><button class="btn small">Subscribe — $4.99 a month</button><span class="link">Use your own OpenAI key</span></div></div>"""),
     ("Signed out, no key", f"""<div class="alert">Suggestions come from the model, with an account.<div style="padding-top:10px"><button class="btn small">Sign in for 10 free analyses</button></div></div>"""),
     ("Too little left for a meal (model says so)", f"""<div class="alert">Only 40 kcal left and 25 g of protein short: a full portion would go over. This closes most of it, or leave the gap: one evening does not decide a week.</div>{sug(L, dict(kind='usual', name='Cottage cheese 5%', items=[('Cottage cheese 5%','120 g')], k=120,p=13,c=4,f=6, fit='80 kcal over · protein 128 of 140 g', why='The smallest portion of your usual that moves the protein.'), True)}"""),
     ("On target or over: no button at all", f"""<div class="alert">The targets card says <b>On target ✓</b> or <b>120 over</b>, and nothing more. Suggesting food past the target would be wrong.</div>"""),
    ]
    body = ''.join(f"<div class='caption'>{c}</div>{b}<div class='sep'></div>" for c,b in blocks)
    return page(L, body)

screens = {
 '01-ask': page(T['en'], ask(T['en'])),
 '02-ask-with-note': page(T['en'], ask(T['en'], True)),
 '03-thinking': page(T['en'], thinking(T['en'])),
 '04-suggestions': page(T['en'], answer(T['en'],'en')),
 '05-logged': page(T['en'], logged(T['en'])),
 '06-he-ask': page(T['he'], ask(T['he'])),
 '07-he-suggestions': page(T['he'], answer(T['he'],'he')),
 '08-other-states': states(),
}
for name, html in screens.items():
    (HERE / f"{name}.html").write_text(html)
print(json.dumps(list(screens)))


# --- 2026-11-26, second round: over today, protein short; the week decides ---
OVER = {
 'en': dict(eaten='2,476', of='of 2,150 kcal', status='326 over', p='134 / 145 g', c='241 / 215', f='78 / 72',
   line='326 kcal over today · 11 g protein short',
   weekRoom='Week so far: 450 kcal under your targets, so a light protein snack still fits.',
   weekNote='Sunday to today. Days your watch reported count what you really burned.',
   askProtein='Suggest a protein snack',
   stopTitle='Better to stop for today.',
   stopBody="You're 326 kcal over today and 180 over for the week so far. The 11 g of protein can wait: start tomorrow with it.",
   weekOver='Week so far: 180 kcal over your targets.',
   hungry='Hungry anyway? Suggest something light',
   forProtein='A light protein snack: up to 250 kcal, the most protein for it',
   s1=('Your usual','Cottage cheese 1%',[('Cottage cheese 1%','150 g')],'105 kcal · 17 g protein · 5 g carbs · 1.5 g fat','+105 kcal today · protein 151 of 145 g ✓ · week 345 under','Closes the 11 g with the fewest calories of anything you eat.'),
   s2=('From your foods','Tuna in water',[('Tuna in water, half a tin','56 g')],'58 kcal · 13 g protein · 0 g carbs · 0.5 g fat','+58 kcal today · protein 147 of 145 g ✓ · week 392 under','Half a tin is enough for the 11 g.')),
 'he': dict(eaten='2,476', of='מתוך 2,150 קלוריות', status='326 מעל', p='134 / 145', c='241 / 215', f='78 / 72',
   line='326 קלוריות מעל היום · חסרים 11 גרם חלבון',
   weekRoom='השבוע עד עכשיו: 450 קלוריות מתחת ליעדים, אז נשנוש חלבון קל עדיין נכנס.',
   weekNote='מיום ראשון עד היום. בימים שהשעון דיווח נספר מה ששרפתם באמת.',
   askProtein='הצעה לנשנוש חלבון',
   stopTitle='עדיף לעצור להיום.',
   stopBody='אתם 326 קלוריות מעל היום ו־180 מעל לשבוע עד עכשיו. 11 גרם החלבון יכולים לחכות: התחילו איתם את מחר.',
   weekOver='השבוע עד עכשיו: 180 קלוריות מעל היעדים.',
   hungry='רעבים בכל זאת? הצעה למשהו קל',
   forProtein='נשנוש חלבון קל: עד 250 קלוריות, הכי הרבה חלבון בשבילן',
   s1=('הרגיל שלכם','קוטג׳ 1%',[('קוטג׳ 1%','150 גרם')],'105 קלוריות · 17 גרם חלבון · 5 גרם פחמימות · 1.5 גרם שומן','‎+105 קלוריות היום · חלבון 151 מתוך 145 גרם ✓ · השבוע 345 מתחת','סוגר את 11 הגרם בהכי מעט קלוריות מכל מה שאתם אוכלים.'),
   s2=('מהמזונות שלכם','טונה במים',[('טונה במים, חצי קופסה','56 גרם')],'58 קלוריות · 13 גרם חלבון · 0 גרם פחמימות · 0.5 גרם שומן','‎+58 קלוריות היום · חלבון 147 מתוך 145 גרם ✓ · השבוע 392 מתחת','חצי קופסה מספיקה ל־11 הגרם.')),
}

def over_card(L, O, inner):
    return f"""<div class="card">
<div class="head"><span class="lab">{L['tt']}</span><span class="how">{L['how']}</span></div>
<div class="row1"><div><span class="big num">{O['eaten']}</span> <span class="of">{O['of']}</span></div><span class="status">{O['status']}</span></div>
<div class="bar" style="background:#ddd4c2"><i style="width:100%;background:#2b2721"></i></div>
<div class="macro"><span>{L['prot']}</span><div class="bar"><i style="width:92%"></i></div><span class="num">{O['p']}</span></div>
<div class="macro"><span>{L['carbs']}</span><div class="bar m"><i style="width:100%"></i></div><span class="num">{O['c']}</span></div>
<div class="macro"><span>{L['fat']}</span><div class="bar m"><i style="width:100%"></i></div><span class="num">{O['f']}</span></div>
<div class="ask">{inner}</div></div>"""

def protein_idle(lang):
    L, O = T[lang], OVER[lang]
    return page(L, over_card(L, O, f"""<div class="left">{O['line']}</div>
<p class="muted" style="margin:6px 0 0;font-size:13px;color:#504c45">{O['weekRoom']}</p>
<div style="display:flex;gap:14px;align-items:center;padding-top:12px;flex-wrap:wrap"><button class="btn">✦ {O['askProtein']}</button><span class="link">{L['addNote']}</span></div>
<p class="muted" style="margin:10px 0 0">{O['weekNote']} {L['costs'].split('.')[0]}.</p>"""))

def stop_idle(lang):
    L, O = T[lang], OVER[lang]
    return page(L, over_card(L, O, f"""<div class="left">{O['line']}</div>
<div class="alert" style="background:#eaf1da"><b>{O['stopTitle']}</b><br>{O['stopBody']}</div>
<p class="muted" style="margin:8px 0 0">{O['weekOver']} {O['weekNote']}</p>
<div style="padding-top:10px"><span class="link">{O['hungry']}</span></div>"""))

def protein_answer(lang):
    L, O = T[lang], OVER[lang]
    def card(s, best):
        items = ''.join(f"<li><span>{a}</span><span class='num'>{b}</span></li>" for a,b in s[2])
        cls = '' if s[0] in ('Your usual','הרגיל שלכם') else 'foods'
        return f"""<div class="sug {'best' if best else ''}"><span class="badge {cls}">{s[0]}</span><div class="sname">{s[1]}</div><ul class="items">{items}</ul>
<div class="nums"><span>{s[3]}</span></div><div class="fit">{s[4]}</div><div class="why">{s[5]}</div>
<div class="sugfoot" style="justify-content:flex-start;gap:8px"><button class="btn small">{L['logit']}</button><button class="btn ghost small">{'Take a photo' if lang=='en' else 'לצלם'}</button></div></div>"""
    return page(L, over_card(L, O, f"""<div class="left">{O['forProtein']}</div>{card(O['s1'],True)}{card(O['s2'],False)}
<div style="display:flex;gap:10px;padding-top:14px"><button class="btn ghost small">{L['again']}</button><button class="btn ghost small">{L['close']}</button></div>
<p class="muted" style="margin:12px 0 0">{L['notMed']}</p>"""))

for name, html in {
  '13-over-protein-ask': protein_idle('en'),
  '14-over-protein-suggestions': protein_answer('en'),
  '15-over-stop': stop_idle('en'),
  '16-he-over-protein-ask': protein_idle('he'),
  '17-he-over-stop': stop_idle('he'),
}.items():
    (HERE / f"{name}.html").write_text(html)


# --- 2026-11-26, third round: the week's macros, meals to come, training, preferences ---
def card_with(L, big, of, status, p, c, f, inner, barcolor='#c2673e', share=86):
    return f"""<div class="card">
<div class="head"><span class="lab">{L['tt']}</span><span class="how">{L['how']}</span></div>
<div class="row1"><div><span class="big num">{big}</span> <span class="of">{of}</span></div><span class="status">{status}</span></div>
<div class="bar"><i style="width:{share}%;background:{barcolor}"></i></div>
<div class="macro"><span>{L['prot']}</span><div class="bar"><i style="width:70%"></i></div><span class="num">{p}</span></div>
<div class="macro"><span>{L['carbs']}</span><div class="bar m"><i style="width:60%"></i></div><span class="num">{c}</span></div>
<div class="macro"><span>{L['fat']}</span><div class="bar m"><i style="width:75%"></i></div><span class="num">{f}</span></div>
<div class="ask">{inner}</div></div>"""

WEEKROW = {
 'en': ('Week so far', [('Calories','450 under'),('Protein','62 g behind'),('Fat','40 g over'),('Carbs','on target')], 'Sunday to today, against each day’s targets.'),
 'he': ('השבוע עד עכשיו', [('קלוריות','450 מתחת'),('חלבון','חסרים 62 גרם'),('שומן','40 גרם מעל'),('פחמימות','ביעד')], 'מיום ראשון עד היום, מול היעדים של כל יום.'),
}
def week_table(lang):
    title, rows, note = WEEKROW[lang]
    cells = ''.join(f"<div style='display:flex;justify-content:space-between;font-size:13px;padding:3px 0'><span style='color:#504c45'>{a}</span><span class='num' style='font-weight:600'>{b}</span></div>" for a,b in rows)
    return f"""<div style="background:#eee8da;border-radius:14px;padding:10px 12px;margin-top:10px"><div style="font-size:12px;font-weight:600;color:#656056;padding-bottom:4px">{title}</div>{cells}<div class="muted" style="padding-top:4px">{note}</div></div>"""

def r3_week(lang):
    L = T[lang]
    line = '326 kcal over today · 11 g protein short' if lang=='en' else '326 קלוריות מעל היום · חסרים 11 גרם חלבון'
    hint = ('The week is behind on protein and over on fat: a lean protein snack makes sense.' if lang=='en'
            else 'השבוע חסר חלבון ויש עודף שומן: נשנוש חלבון רזה הגיוני.')
    btn = 'Suggest a protein snack' if lang=='en' else 'הצעה לנשנוש חלבון'
    return page(L, card_with(L, '2,476', OVER[lang]['of'], OVER[lang]['status'], OVER[lang]['p'], OVER[lang]['c'], OVER[lang]['f'],
      f"""<div class="left">{line}</div>{week_table(lang)}<p style="font-size:13px;color:#504c45;margin:10px 0 0">{hint}</p>
<div style="padding-top:12px"><button class="btn">✦ {btn}</button></div>""", '#2b2721', 100))

def r3_stop_protein_ahead():
    L = T['en']
    rows = [('Calories','120 under'),('Protein','58 g ahead'),('Fat','on target'),('Carbs','on target')]
    cells = ''.join(f"<div style='display:flex;justify-content:space-between;font-size:13px;padding:3px 0'><span style='color:#504c45'>{a}</span><span class='num' style='font-weight:600'>{b}</span></div>" for a,b in rows)
    table = f"""<div style="background:#eee8da;border-radius:14px;padding:10px 12px;margin-top:10px"><div style="font-size:12px;font-weight:600;color:#656056;padding-bottom:4px">Week so far</div>{cells}</div>"""
    return page(L, card_with(L, '2,476', OVER['en']['of'], OVER['en']['status'], OVER['en']['p'], OVER['en']['c'], OVER['en']['f'],
      f"""<div class="left">326 kcal over today · 11 g protein short</div>
<div class="alert" style="background:#eaf1da"><b>Better to stop for today.</b><br>You’re 326 kcal over today, and this week’s protein is 58 g ahead of its targets: today’s 11 g can wait.</div>{table}
<div style="padding-top:10px"><span class="link">Hungry anyway? Suggest something light</span></div>""", '#2b2721', 100))

def r3_to_come(lang):
    L = T[lang]
    if lang == 'en':
        date='Thursday 26 November · 16:30'; left='Left today:'; nums='900 kcal · 52 g protein'
        come='Your usual dinner is still to come, about 650 kcal, so this leaves room for it: up to 250 kcal now.'
        train='Strength today, 62 min: protein first, and some carbs are fine.'
        btn='Suggest what to eat'
    else:
        date='יום חמישי, 26 בנובמבר · 16:30'; left='נשאר להיום:'; nums='900 קלוריות · 52 גרם חלבון'
        come='ארוחת הערב הרגילה שלכם עוד לפניכם, כ־650 קלוריות, אז נשאיר לה מקום: עד 250 קלוריות עכשיו.'
        train='אימון כוח היום, 62 דקות: חלבון קודם, וגם קצת פחמימות זה בסדר.'
        btn='מה לאכול עכשיו?'
    html = page(L, card_with(L, '1,250', T[lang]['of'], '900 left' if lang=='en' else 'נשארו 900', '93 / 145', '120 / 235', '38 / 70',
      f"""<div class="left">{left} <span>{nums}</span></div>
<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#504c45;padding-top:8px"><span>🍽</span><span>{come}</span></div>
<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#504c45;padding-top:6px"><span>🏋</span><span>{train}</span></div>
<div style="padding-top:12px"><button class="btn">✦ {btn}</button></div>""", '#c2673e', 58))
    return html.replace(T[lang]['date'], date)

PREFS = {
 'en': dict(title='Food preferences', lead='The suggestions follow these, every time.', chips=['Vegetarian','Vegan','No meat with dairy','No pork','No fish','Lactose-free','Gluten-free'], on=['No meat with dairy'],
            avoidLabel='Anything else to avoid', avoid='Peanuts (allergy), mushrooms',
            note='Sent to the AI only when you ask for suggestions, with nothing that says who you are. A choice like “no meat with dairy” can say something about your beliefs: write only what you are comfortable sharing.'),
 'he': dict(title='העדפות אוכל', lead='ההצעות יתחשבו בהן, בכל פעם.', chips=['צמחוני','טבעוני','בלי בשר עם חלב','בלי חזיר','בלי דגים','בלי לקטוז','בלי גלוטן'], on=['בלי בשר עם חלב'],
            avoidLabel='עוד משהו להימנע ממנו', avoid='בוטנים (אלרגיה), פטריות',
            note='נשלח ל־AI רק כשמבקשים הצעות, בלי שום דבר שמזהה אתכם. בחירה כמו „בלי בשר עם חלב” יכולה לרמוז על אמונה: כתבו רק מה שנוח לכם לשתף.'),
}
def r3_prefs(lang):
    L = T[lang]; P = PREFS[lang]
    chips = ''.join(f"<span class='pill{' on' if c in P['on'] else ''}' style='display:inline-block;border:1px solid #ddd4c2;border-radius:99px;padding:6px 13px;font-size:13.5px;margin:0 6px 8px 0;{'background:#2b2721;color:#f1ece1' if c in P['on'] else 'background:#faf7f0'}'>{c}</span>" for c in P['chips'])
    body = f"""<div class="card"><div class="lab" style="padding-bottom:10px">{P['title']}</div><p style="font-size:14px;margin:0 0 10px">{P['lead']}</p>{chips}
<div style="font-size:13px;font-weight:500;padding:8px 0 6px">{P['avoidLabel']}</div><div class="note" style="color:#2b2721">{P['avoid']}</div>
<p class="muted" style="margin:10px 0 0">{P['note']}</p></div>"""
    html = page(L, body)
    return html.replace(f">{L['today']}<", '>Settings<' if lang=='en' else '>הגדרות<').replace(L['date'], 'Goals' if lang=='en' else 'יעדים')

for name, html in {
  '22-week-macros': r3_week('en'),
  '23-stop-protein-ahead': r3_stop_protein_ahead(),
  '24-meals-to-come-and-training': r3_to_come('en'),
  '25-food-preferences': r3_prefs('en'),
  '26-he-week-macros': r3_week('he'),
  '27-he-meals-to-come-and-training': r3_to_come('he'),
  '28-he-food-preferences': r3_prefs('he'),
}.items():
    (HERE / f"{name}.html").write_text(html)
