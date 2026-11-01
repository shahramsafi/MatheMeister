'use strict';

/*
 * V10.7.0 Admin Center visual refresh; existing learning, multiplayer and Supabase logic retained.
 * Some embedded iOS browsers may not synthesize a click consistently after a tap.
 * This delegates touch handling so it also covers buttons created later by innerHTML.
 * It avoids eval/new Function and keeps the existing application handlers intact.
 */
(function installMobileTapCompatibility(){
  if (window.__MM_MOBILE_TAP_BRIDGE__) return;
  window.__MM_MOBILE_TAP_BRIDGE__ = true;

  var startPoint = null;
  var moved = false;
  var dispatchingTouchClick = false;
  var suppressNativeTarget = null;
  var suppressNativeUntil = 0;

  var interactiveSelector = 'button, [onclick], a[href], [role="button"], input[type="button"], input[type="submit"], label.btn';

  document.addEventListener('touchstart', function(event){
    if (!event.touches || event.touches.length !== 1) {
      startPoint = null;
      moved = true;
      return;
    }
    var touch = event.touches[0];
    startPoint = { x: touch.clientX, y: touch.clientY };
    moved = false;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', function(event){
    if (!startPoint || !event.touches || !event.touches.length) return;
    var touch = event.touches[0];
    if (Math.abs(touch.clientX - startPoint.x) > 10 || Math.abs(touch.clientY - startPoint.y) > 10) moved = true;
  }, { capture: true, passive: true });

  document.addEventListener('touchcancel', function(){
    startPoint = null;
    moved = true;
  }, { capture: true, passive: true });

  document.addEventListener('touchend', function(event){
    if (!startPoint || moved || !event.changedTouches || event.changedTouches.length !== 1) {
      startPoint = null;
      return;
    }
    startPoint = null;

    var rawTarget = event.target;
    var element = rawTarget && rawTarget.nodeType === 1 ? rawTarget : (rawTarget && rawTarget.parentElement);
    var action = element && element.closest ? element.closest(interactiveSelector) : null;
    if (!action || action.disabled || action.getAttribute('aria-disabled') === 'true') return;
    if (action.closest('[inert]')) return;

    // Prevent the browser's later synthetic click, then dispatch exactly one click ourselves.
    if (event.cancelable) event.preventDefault();
    suppressNativeTarget = action;
    suppressNativeUntil = Date.now() + 900;
    dispatchingTouchClick = true;
    try {
      action.click();
    } finally {
      dispatchingTouchClick = false;
    }
  }, { capture: true, passive: false });

  document.addEventListener('click', function(event){
    if (dispatchingTouchClick || Date.now() > suppressNativeUntil || !event.isTrusted) return;
    var rawTarget = event.target;
    var element = rawTarget && rawTarget.nodeType === 1 ? rawTarget : (rawTarget && rawTarget.parentElement);
    var action = element && element.closest ? element.closest(interactiveSelector) : null;
    if (action && action === suppressNativeTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressNativeTarget = null;
      suppressNativeUntil = 0;
    }
  }, true);
})();


const $=id=>document.getElementById(id);

// v7: Accessible, styled dialog shared by confirmations and share links.
let appModalResolver = null;
let appModalPreviousFocus = null;
function closeAppModal(value=false) {
  const root=$('appModal'); if(!root)return;
  root.classList.add('hidden');root.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');
  const resolve=appModalResolver;appModalResolver=null;
  if(resolve)resolve(Boolean(value));
  if(appModalPreviousFocus && typeof appModalPreviousFocus.focus==='function')appModalPreviousFocus.focus();
}
function customConfirm({title='Bist du sicher?',message='',confirmText='Bestätigen',cancelText='Abbrechen',icon='✨',tone='primary',extraHtml=''}={}) {
  return new Promise(resolve=>{
    const root=$('appModal'); if(!root){resolve(window.confirm(message));return;}
    if(appModalResolver)closeAppModal(false);
    appModalPreviousFocus=document.activeElement;appModalResolver=resolve;
    $('modalTitle').textContent=title;$('modalMessage').textContent=message;
    $('modalIcon').textContent=icon;$('modalIcon').className='modal-icon '+(tone==='danger'?'danger':'primary');
    $('modalExtra').innerHTML=extraHtml;
    $('modalConfirmBtn').textContent=confirmText;$('modalConfirmBtn').className='btn '+(tone==='danger'?'danger':'primary');
    $('modalCancelBtn').textContent=cancelText;$('modalCancelBtn').classList.toggle('hidden',!cancelText);
    root.classList.remove('hidden');root.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
    setTimeout(()=>{const first=$('modalExtra').querySelector('input,textarea,select')||$('modalConfirmBtn');first?.focus();},20);
  });
}
function showLinkDialog(title, link, confirmLabel='Link kopieren') {
  return customConfirm({title,message:'Hier ist dein teilbarer Link. Du kannst ihn kopieren und an deine Freunde senden.',icon:'🔗',tone:'primary',confirmText:confirmLabel,cancelText:'Schließen',extraHtml:`<input id="modalShareInput" class="modal-link-input" aria-label="Teilbarer Link" readonly value="${esc(link)}">`}).then(async ok=>{
    if(!ok)return false;
    try{await navigator.clipboard.writeText(link);showToast('Link wurde kopiert.');return true;}
    catch(_){const input=$('modalShareInput');if(input){input.focus();input.select();try{document.execCommand('copy');showToast('Link ausgewählt – du kannst ihn kopieren.');}catch(e){showToast('Bitte markiere und kopiere den Link.');}}return false;}
  });
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('appModal')&&!$('appModal').classList.contains('hidden')){e.preventDefault();closeAppModal(false);}});
document.addEventListener('click',e=>{if(e.target===$('appModal'))closeAppModal(false);});

const STUDIO_KEY='mm-studio-active-v1';
function loadActiveStudioConfig(){try{const x=JSON.parse(localStorage.getItem(STUDIO_KEY)||'null');return x&&x.v===1?x:null;}catch(_){return null;}}
function saveActiveStudioConfig(config){localStorage.setItem(STUDIO_KEY,JSON.stringify(config));}
function toggleStudioCustomQuestions(){const custom=$('studioQuestionMode')?.value==='custom';$('studioCustomQuestionsWrap')?.classList.toggle('hidden',!custom);if($('studioCount'))$('studioCount').disabled=custom;if($('studioCountNote'))$('studioCountNote').textContent=custom?'Die Anzahl wird automatisch aus deinen eingegebenen Aufgaben übernommen.':'Wähle zwischen 5 und 100 Fragen.';if(custom){$('studioQuestions')?.focus();}}
function updateStudioQuestionCount(){const parsed=parseStudioQuestions($('studioQuestions').value);$('studioQuestionError').textContent=parsed.error||'';$('studioCountNote').textContent=parsed.error||`${parsed.questions.length} eigene Aufgabe${parsed.questions.length===1?'':'n'} erkannt; diese Anzahl wird gespielt.`;}
function toggleStudioTeamOptions(){const team=$('studioTeams')?.value==='team';['studioTeamCount','studioTeamAssignment'].forEach(id=>{const el=$(id);if(el){el.disabled=!team;el.style.opacity=team?'1':'.55';}});const host=$('studioHostPlays');if(host){const allow=$('studioDisplay').value==='friends';host.disabled=!allow;host.style.opacity=allow?'1':'.55';if(!allow)host.value='false';}}
function parseStudioQuestions(text){
  const lines=String(text||'').split(/\n/).map(s=>s.trim()).filter(Boolean);const out=[];const errors=[];
  if(lines.length>100)return {questions:[],error:'Maximal 100 Aufgaben pro Spiel.'};
  for(let i=0;i<lines.length;i++){
    const clean=lines[i].replace(/[×✕]/g,'x').replace(/\s/g,'');const m=clean.match(/^(\d{1,2})[x*](\d{1,2})$/);
    if(!m){errors.push(`Zeile ${i+1}: „${lines[i]}“ bitte im Format 3x4 eingeben.`);continue;}
    const a=Number(m[1]),b=Number(m[2]);if(a<1||a>99||b<1||b>99){errors.push(`Zeile ${i+1}: Zahlen müssen zwischen 1 und 99 liegen.`);continue;}
    out.push({a,b,answer:a*b});
  }
  return {questions:out,error:errors[0]||(!out.length?'Gib mindestens eine Aufgabe ein.':null)};
}
function readStudioConfig(showErrors=true){
  const mode=$('studioQuestionMode').value;let questions=[];
  if(mode==='custom'){
    const parsed=parseStudioQuestions($('studioQuestions').value);questions=parsed.questions;
    if(parsed.error){if(showErrors)$('studioQuestionError').textContent=parsed.error;return null;}
    $('studioQuestionError').textContent='';
  }
  const count=mode==='custom'?questions.length:Number($('studioCount').value);
  return {v:1,name:($('studioName').value.trim()||'Meine Mathe-Challenge').slice(0,42),questionMode:mode,difficulty:$('studioDifficulty').value,count,seconds:Number($('studioSeconds').value),displayMode:$('studioDisplay').value,scoringMode:$('studioScoring').value,teamMode:$('studioTeams').value==='team',teamCount:Number($('studioTeamCount').value),teamAssignment:$('studioTeamAssignment').value,hostPlays:$('studioHostPlays').value==='true'&&$('studioDisplay').value==='friends',shuffleQuestions:Boolean($('studioShuffleQuestions').checked),questions};
}
function validateStudioConfig(c){
  if(!c||c.v!==1||typeof c.name!=='string'||!['random','custom'].includes(c.questionMode)||!['easy','medium','hard'].includes(c.difficulty)||!['classroom','friends'].includes(c.displayMode)||!['classic','streak'].includes(c.scoringMode))return 'Die Spielvorlage ist ungültig.';
  if(!Number.isInteger(Number(c.count))||Number(c.count)<1||Number(c.count)>100)return 'Wähle 1 bis 100 Fragen.';
  if(!Number.isInteger(Number(c.seconds))||Number(c.seconds)<5||Number(c.seconds)>60)return 'Die Zeit muss zwischen 5 und 60 Sekunden liegen.';
  if(c.teamMode&&(!Number.isInteger(Number(c.teamCount))||c.teamCount<2||c.teamCount>10))return 'Es sind 2 bis 10 Teams möglich.';
  if(c.displayMode==='classroom'&&c.hostPlays)return 'Im Klassenmodus moderiert der Host vom Computer und spielt nicht mit.';
  if(!Array.isArray(c.questions)||c.questions.length>100)return 'Die Aufgabenliste ist ungültig.';
  if(c.questionMode==='custom'&&!c.questions.length)return 'Die eigene Aufgabenliste ist leer.';
  if(c.questions.length&&c.questions.length!==Number(c.count))return 'Die Anzahl deiner eigenen Aufgaben stimmt nicht.';
  if(c.questions.some(q=>!q||!Number.isInteger(Number(q.a))||!Number.isInteger(Number(q.b))||Number(q.a)<1||Number(q.a)>99||Number(q.b)<1||Number(q.b)>99))return 'Die Aufgabenliste enthält ungültige Zahlen.';
  return null;
}
function encodeStudioConfig(c){return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decodeStudioConfig(encoded){const b64=String(encoded).replace(/-/g,'+').replace(/_/g,'/');const padded=b64+'='.repeat((4-b64.length%4)%4);return JSON.parse(decodeURIComponent(escape(atob(padded))));}
function makeStudioBaseUrl(){const isWeb=window.location.protocol==='https:'||window.location.protocol==='http:';const url=new URL(isWeb?window.location.href:LIVE_PUBLIC_FALLBACK);url.search='';url.hash='';return url;}
function applyStudioConfigToLive(c){
  if(!c)return;
  const setSelect=(id,value,labelSuffix='')=>{const el=$(id);if(!el)return;const v=String(value);if(![...el.options].some(o=>o.value===v)){el.add(new Option(`${v}${labelSuffix}`,v));}el.value=v;};
  if($('liveDifficulty'))$('liveDifficulty').value=c.difficulty||'medium';
  setSelect('liveCount',c.count,' Fragen');setSelect('liveSeconds',c.seconds,' Sekunden');
  if($('liveDisplayMode'))$('liveDisplayMode').value=c.displayMode||'friends';
  if($('liveScoringMode'))$('liveScoringMode').value=c.scoringMode||'classic';
  if($('liveGameMode'))$('liveGameMode').value=c.teamMode?'team':'solo';
  if($('liveTeamAssignment'))$('liveTeamAssignment').value=c.teamAssignment||'random';
  if($('liveTeamCount'))$('liveTeamCount').value=String(c.teamCount||2);
  if($('hostPlayToggle'))$('hostPlayToggle').checked=Boolean(c.hostPlays)&&c.displayMode==='friends';
  if(typeof updateLiveOptionsUI==='function')updateLiveOptionsUI();if(typeof updateTeamSetupUI==='function')updateTeamSetupUI();
}
function renderStudioPreview(c){
  const sample=c.questions.length?c.questions.slice(0,3):Array.from({length:3},()=>{const max=c.difficulty==='easy'?5:c.difficulty==='hard'?20:10;const a=Math.floor(Math.random()*max)+1,b=Math.floor(Math.random()*max)+1;return {a,b,answer:a*b};});
  $('studioPreview').innerHTML=sample.map((q,i)=>`<div class="studio-preview-item"><small>FRAGE ${i+1}${c.questions.length?' · DEIN SET':' · BEISPIEL'}</small><strong>${q.a} × ${q.b}</strong><small>4 Antwortmöglichkeiten · ${c.seconds} Sekunden</small></div>`).join('');
}
function createStudioShareLink(){
  const c=readStudioConfig(true);if(!c)return;const err=validateStudioConfig(c);if(err){$('studioQuestionError').textContent=err;showToast(err);return;}
  saveActiveStudioConfig(c);applyStudioConfigToLive(c);const url=makeStudioBaseUrl();url.hash='mmgame='+encodeStudioConfig(c);const link=url.toString();
  $('studioLinkTitle').textContent=c.name;$('studioLinkDescription').textContent=`${c.count} Fragen · ${c.seconds} Sekunden je Frage · ${c.displayMode==='classroom'?'Klassenmodus':'Freunde-Modus'} · ${c.teamMode?c.teamCount+' Teams':'Einzelspieler'}${c.questions.length?' · Eigene Aufgaben':''}`;$('studioShareLink').value=link;$('studioLinkBox').classList.remove('hidden');renderStudioPreview(c);showToast('Deine Spielvorlage wurde erstellt.');
  $('studioLinkBox').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function copyStudioLink(){const link=$('studioShareLink')?.value;if(!link)return;try{await navigator.clipboard.writeText(link);showToast('Vorlagenlink wurde kopiert!');}catch(_){$('studioShareLink').focus();$('studioShareLink').select();try{document.execCommand('copy');showToast('Vorlagenlink ausgewählt.');}catch(e){showToast('Bitte markiere den Link und kopiere ihn.');}}}
function useStudioConfigNow(){const c=loadActiveStudioConfig();if(!c){showToast('Erstelle zuerst eine Spielvorlage.');return;}applyStudioConfigToLive(c);show('live');showToast('Deine Regeln sind übernommen. Erstelle jetzt den Live-Raum und teile seinen Code.');}
function clearStudioConfig(){
  $('studioName').value='Meine Mathe-Challenge';$('studioQuestionMode').value='random';$('studioDifficulty').value='medium';$('studioCount').value='15';$('studioSeconds').value='15';$('studioDisplay').value='friends';$('studioScoring').value='classic';$('studioTeams').value='solo';$('studioTeamCount').value='2';$('studioTeamAssignment').value='random';$('studioHostPlays').value='false';$('studioShuffleQuestions').checked=true;$('studioQuestions').value='';$('studioQuestionError').textContent='';$('studioLinkBox').classList.add('hidden');toggleStudioCustomQuestions();toggleStudioTeamOptions();localStorage.removeItem(STUDIO_KEY);live.customGame=null;showToast('Die lokale Spielvorlage wurde entfernt.');
}
function loadStudioFromLink(){
  const match=window.location.hash.match(/^#mmgame=(.+)$/);let c=null;
  if(match){try{const encoded=decodeURIComponent(match[1]);if(encoded.length>16000)throw new Error('Der Link ist zu groß.');c=decodeStudioConfig(encoded);const err=validateStudioConfig(c);if(err)throw new Error(err);saveActiveStudioConfig(c);history.replaceState(null,'',window.location.pathname+window.location.search);show('studio');$('studioName').value=c.name;$('studioQuestionMode').value=c.questionMode;$('studioDifficulty').value=c.difficulty;$('studioCount').value=String([5,10,15,20,30,50,100].includes(c.count)?c.count:'15');$('studioSeconds').value=String(c.seconds);$('studioDisplay').value=c.displayMode;$('studioScoring').value=c.scoringMode;$('studioTeams').value=c.teamMode?'team':'solo';$('studioTeamCount').value=String(c.teamCount);$('studioTeamAssignment').value=c.teamAssignment;$('studioHostPlays').value=String(c.hostPlays);$('studioShuffleQuestions').checked=Boolean(c.shuffleQuestions);$('studioQuestions').value=(c.questions||[]).map(q=>`${q.a}x${q.b}`).join('\n');toggleStudioCustomQuestions();toggleStudioTeamOptions();applyStudioConfigToLive(c);$('studioLinkTitle').textContent=c.name;$('studioLinkDescription').textContent=`Vorlage übernommen: ${c.count} Fragen · ${c.seconds} Sekunden je Frage.`;$('studioLinkBox').classList.remove('hidden');const url=makeStudioBaseUrl();url.hash='mmgame='+encodeStudioConfig(c);$('studioShareLink').value=url.toString();renderStudioPreview(c);showToast('Spielvorlage geladen! Du kannst sie bearbeiten oder direkt einen Live-Raum erstellen.');return;}catch(e){showToast('Der Spielvorlagen-Link ist ungültig: '+e.message);}}
  const saved=loadActiveStudioConfig();if(saved){applyStudioConfigToLive(saved);}
}
function showFeedbackSuccessIfNeeded(){}
function feedbackClientKey(){
  const key='mm-feedback-client-v1';let value=localStorage.getItem(key);
  if(value && /^[a-f0-9-]{24,80}$/i.test(value))return value;
  const bytes=new Uint8Array(24);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  value=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(key,value);return value;
}
async function handleFeedbackSubmit(event){
  event.preventDefault();const form=event.currentTarget, status=$('feedbackSubmitStatus'), button=form.querySelector('button[type=\"submit\"]');
  const message=$('feedbackMessage')?.value.trim()||'';if(message.length<10){if(status)status.textContent='Bitte beschreibe dein Anliegen mit mindestens 10 Zeichen.';return;}
  if(button)button.disabled=true;if(status)status.textContent='Wird sicher gesendet …';
  try{const sb=await getSb();const {data:result,error}=await sb.rpc('mm_submit_feedback',{p_category:$('feedbackType').value,p_message:message,p_device:$('feedbackDevice').value||null,p_email:$('feedbackEmail')?.value.trim()||null,p_client_key:feedbackClientKey()});if(error)throw error;if(!result?.ok)throw new Error('Der Server konnte den Eingang nicht bestätigen.');form.reset();if(status)status.textContent='Vielen Dank! Deine Nachricht wurde erfolgreich gesendet. ❤️';showToast('Feedback erfolgreich gesendet.');}
  catch(e){if(status)status.textContent='Senden fehlgeschlagen: '+(e.message||'Bitte später erneut versuchen.');}
  finally{if(button)button.disabled=false;}
}

const STORE='matheme-pro-v2';
const defaultData=()=>( {
    name:'Meister',
    avatar:'🦊',
    xp:0,
    coins:250,
    inventory:['frame_basic','title_none','effect_none'],
    equippedFrame:'frame_basic',
    equippedTitle:'title_none',
    equippedEffect:'effect_none',
    missionDate:'',
    missionProgress:{correct:0,played:0,streak:0},
    claimedMissions:[],
    liveRewarded:[],
    sessions:[],
    records: {
        easy:0,
        medium:0,
        hard:0,
        rush:0,
        daily:0
    }
    ,
    errors: {
    }
    ,
    badges:[],
    daily: {
        date:'',
        done:false,
        streak:0,
        lastDate:''
    }
    ,
    lastPlayed:''
}
);
let data=loadData(),
screenBeforeGame='modes';
let game= {
    mode:'',
    level:'easy',
    questions:[],
    index:0,
    correct:0,
    wrong:0,
    streak:0,
    bestStreak:0,
    answered:false,
    correctAnswer:0,
    question:null,
    options:[],
    timer:null,
    startedAt:0,
    remaining:0,
    attempts:0,
    roundErrors:[],
    lastAnswerValue:null,
    lastAnsweredAt:0
}
;
const LEVELS= {
    easy: {
        title:'Einfach',
        max:5,
        total:25
    }
    ,
    medium: {
        title:'Mittel',
        max:10,
        total:100
    }
    ,
    hard: {
        title:'Schwer',
        max:20,
        total:100
    }
}
;
function loadData() {
    try {
        const x=JSON.parse(localStorage.getItem(STORE)||'null');
        return x&&typeof x==='object'? {
            ...defaultData(),
            ...x,
            records: {
                ...defaultData().records,
                ...x.records
            }
            ,
            errors:x.errors|| {
            }
            ,
            daily: {
                ...defaultData().daily,
                ...x.daily
            }
        }
        :defaultData()
    }
    catch {
        return defaultData()
    }
}
function saveData() {
    localStorage.setItem(STORE,
    JSON.stringify(data));
    refreshHome()
}
function esc(s) {
    return String(s).replace(/[&<>"']/g,
    c=>( {
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
    }
    [c]))
}
function showToast(msg) {
    const t=$('toast');
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(showToast.t);
    showToast.t=setTimeout(()=>t.classList.remove('show'),
    2600)
}
function toggleSiteMenu(force) {
  const menu=$('siteMenu'), overlay=$('siteMenuOverlay'), btn=$('siteMenuToggle');
  if(!menu||!overlay||!btn)return;
  const currentlyOpen=!menu.classList.contains('hidden');
  const open=typeof force==='boolean'?force:!currentlyOpen;
  menu.classList.toggle('hidden',!open);overlay.classList.toggle('hidden',!open);
  menu.setAttribute('aria-hidden',String(!open));btn.setAttribute('aria-expanded',String(open));
  const moreTab=document.querySelector('#mobileTabbar [data-mobile-more]');
  if(moreTab)moreTab.classList.toggle('active',open || !['home','modes','live','progress'].includes(document.querySelector('.screen.active')?.id||mmActiveScreen||'home'));
  btn.setAttribute('aria-label',open?'Hauptmenü schließen':'Hauptmenü öffnen');
  if(open){const first=menu.querySelector('button.menu-item');if(first)first.focus();}
}
function menuNavigate(id){toggleSiteMenu(false);if(id==='feedbackScreen')feedbackChooseMode('choose');show(id);}
function openSiteInfo(topic='about'){
  toggleSiteMenu(false);
  const pages={
    how:{title:'So funktioniert MatheMeister',intro:'Lerne das Einmaleins, verbessere deine Bestleistungen und spiele live mit anderen.',html:`<div class="info-grid"><article class="info-card"><h3>🎯 Training</h3><p>Wähle Einfach, Mittel oder Schwer. Nach jeder Runde bekommst du eine Auswertung und sammelst Erfahrungspunkte.</p></article><article class="info-card"><h3>⚡ Math Rush</h3><p>Beantworte in 60 Sekunden so viele Aufgaben wie möglich. Versuche, deinen persönlichen Rekord zu schlagen.</p></article><article class="info-card"><h3>🏫 Klassenmodus</h3><p>Der Host zeigt die Frage am Computer. Auf den Handys antworten alle nur über vier Farbfelder.</p></article><article class="info-card"><h3>🌐 Freunde-Modus</h3><p>Frage und Antwortmöglichkeiten sind auf den Geräten aller Spieler sichtbar. Der Host kann die Runde verwalten und – optional – selbst mitspielen.</p></article><article class="info-card"><h3>👥 Team-Wettkampf</h3><p>Spielt als Einzelspieler oder in Teams. Es gibt eine Ergebnisrunde und eine Siegeransicht.</p></article><article class="info-card"><h3>🪙 Münzen & Shop</h3><p>Verdiene Spielmünzen und schalte kosmetische Profilrahmen, Titel, Avatare und Effekte frei. Diese Extras geben keinen Antwortvorteil.</p></article></div>`},
    privacy:{title:'Datenschutz & Sicherheit',intro:'MatheMeister soll ohne unnötige Hürden nutzbar sein. Deshalb gibt es aktuell keinen verpflichtenden Benutzeraccount.',html:`<div class="info-grid"><article class="info-card"><h3>📱 Lokale Daten</h3><p>Name, Avatar, Übungsstatistik, XP, Münzen und Shop-Käufe werden derzeit in diesem Browser gespeichert. Sie synchronisieren sich nicht automatisch zwischen Geräten und können beim Löschen der Browserdaten verloren gehen.</p></article><article class="info-card"><h3>🌐 Live-Spiel</h3><p>Live-Räume verwenden Supabase-RPC-Funktionen. Der Host verwaltet Spieler und sieht die vollständigen Ergebnisse. Spieler sehen nur die für sie bestimmte Ansicht und die öffentliche Top 10.</p></article><article class="info-card"><h3>🛡️ Schutzmaßnahmen</h3><p>Spieler- und Host-Tokens sind Sitzungsnachweise. Teile keine Host-Tokens und veröffentliche keine privaten Zugangsdaten. Veröffentlichte Browser-Anwendungen dürfen nur öffentliche Supabase-Schlüssel verwenden – niemals einen Service-Role-Schlüssel.</p></article><article class="info-card"><h3>⚠️ Gastkonto: Grenzen</h3><p>Ohne dauerhaftes Konto kann die Website noch nicht zuverlässig erkennen, dass dieselbe Person auf einem anderen Gerät weiterspielt. Browserlokale Münzen sind nicht fälschungssicher. Für eine globale Rangliste oder sichere Wallet brauchen wir später anonyme Authentifizierung oder optionale Kontoverknüpfung und serverseitige Regeln.</p></article></div><p class="muted">Die tatsächlichen Datenbankrechte hängen außerdem davon ab, welche SQL-Migrationen auf dem Supabase-Projekt installiert wurden. Diese Seite ersetzt keine technische Sicherheitsprüfung des Live-Projekts.</p>`},
    about:{title:'Über MatheMeister',intro:'MatheMeister macht Kopfrechnen zu einem kleinen Wettkampf – mit Fortschritt, Belohnungen, synchronen Klassenfarben und fairen Spielregeln.',html:`<div class="info-grid"><article class="info-card"><h3>🚀 Unser Ziel</h3><p>Ein schnelles, freundliches und motivierendes Mathe-Spiel für Lernende, Klassen und Freundesgruppen.</p></article><article class="info-card"><h3>✨ Was uns wichtig ist</h3><ul><li>Schneller Einstieg ohne Pflichtkonto</li><li>Klare, faire Punktevergabe</li><li>Private Einzelergebnisse</li><li>Belohnungen nur zur Personalisierung</li><li>Bedienbar auf Handy und Computer</li></ul></article><article class="info-card"><h3>💡 Feedback</h3><p>Notiere dir Probleme mit Spielcode, Gerät und dem genauen Schritt. So lassen sich Fehler gezielt prüfen, ohne funktionierende Bereiche unnötig zu ändern.</p></article><article class="info-card"><h3>🧭 Nächste Ausbaustufen</h3><p>Serverseitige Münz-Wallet, optionale Gerätesynchronisierung, weitere Fragetypen und ein wachsender Katalog an Spielvorlagen.</p></article></div>`}
,
    developer:{title:'Über mich – der Entwickler von MatheMeister',intro:'Ich entwickle MatheMeister mit dem Ziel, Lernen einfacher, kreativer und spielerischer zu machen.',html:`<div class="info-grid"><article class="info-card" style="grid-column:1/-1"><h3>👋 Hallo und willkommen!</h3><p>Ich bin der Entwickler von MatheMeister und arbeite Schritt für Schritt daran, aus einer eigenen Idee eine Plattform für Lernen und gemeinsames Spielen zu machen. Lernen soll nicht nur aus Aufgaben und richtigen Antworten bestehen. Es darf Spaß machen, Menschen zusammenbringen und Raum für eigene Ideen geben.</p><p>Mir ist besonders wichtig, dass jeder leicht eigene Spiele erstellen kann – auch Kinder, die noch nie programmiert haben. Eine Spielidee soll reichen, um loszulegen – die Technik soll im Hintergrund helfen und nicht im Weg stehen.</p></article><article class="info-card"><h3>🎮 Was ich aufbauen möchte</h3><p>MatheMeister soll ein Ort werden, an dem Menschen eigene Quizze, Puzzle und andere Spiele erstellen, mit Freunden spielen und ihre Ideen miteinander teilen können.</p></article><article class="info-card"><h3>🛠️ Schritt für Schritt</h3><p>Ich entwickle MatheMeister weiter, teste neue Funktionen und verbessere es anhand von Rückmeldungen. Nicht alles ist schon fertig – das Projekt wächst mit seinen Nutzern.</p></article><article class="info-card" style="grid-column:1/-1"><h3>💬 Danke, dass du dabei bist!</h3><p>Wenn du einen Fehler findest oder eine Idee hast, freue ich mich über dein Feedback. So kann MatheMeister gemeinsam besser werden.</p><button type="button" class="btn primary" style="margin-top:12px" onclick="show('feedbackScreen')">💡 Idee oder Problem melden</button></article></div>`}
  };
  const page=pages[topic]||pages.about;
  $('siteInfoTitle').textContent=page.title;$('siteInfoIntro').textContent=page.intro;$('siteInfoContent').innerHTML=page.html;
  show('siteInfo');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape' && $('siteMenu') && !$('siteMenu').classList.contains('hidden'))toggleSiteMenu(false);});

// Screen history is separate from browser history. Each entry remembers the exact scroll offset.
// Keeping the offset on the history entry (rather than only per screen) also handles revisiting a screen.
const mmScreenHistory=[];
let mmActiveScreen='home';
function updateGlobalBackButton(){
  const button=$('globalBackButton');
  if(!button)return;
  const inLiveRoom=document.body.classList.contains('live-room-active');
  const visible=mmActiveScreen!=='home' && !inLiveRoom;
  button.classList.toggle('visible',visible);
  button.setAttribute('aria-hidden',String(!visible));
}
function show(id, options={}) {
    // V10.8.1: Any screen change closes the global menu/drawer so it cannot cover another tab.
    if(typeof toggleSiteMenu==='function')toggleSiteMenu(false);
    const current=document.querySelector('.screen.active')?.id || mmActiveScreen || 'home';
    const changingScreen=current!==id;
    if(changingScreen){
      if(options.replaceCurrent){if(mmScreenHistory.length)mmScreenHistory.pop();}
      else if(!options.fromBack && id!=='home'){
        mmScreenHistory.push({id:current,scrollY:Math.max(0,window.scrollY||window.pageYOffset||0)});
        if(mmScreenHistory.length>40)mmScreenHistory.shift();
      }
    }
    if(id==='home')mmScreenHistory.length=0;
    mmActiveScreen=id;
    if(id==='adminScreen'){try{sessionStorage.setItem('mm-admin-screen-open-v1','1');localStorage.setItem('mm-admin-screen-open-v1','1');}catch(_){}}
    else if(current==='adminScreen'){try{sessionStorage.removeItem('mm-admin-screen-open-v1');localStorage.removeItem('mm-admin-screen-open-v1');}catch(_){}}
    if(id==='feedbackScreen' && current!=='feedbackScreen' && typeof feedbackChooseMode==='function')feedbackChooseMode('choose');
    document.body.classList.toggle('admin-mode',id==='adminScreen');
    if(current==='creator' && id!=='creator' && typeof creatorAutoSaveNow==='function')creatorAutoSaveNow();
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    $(id).classList.add('active');
    document.querySelectorAll('#mobileTabbar [data-mobile-screen]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mobileScreen===id));
    const profileSettingsToggle=$('profileSettingsToggle');if(profileSettingsToggle){profileSettingsToggle.setAttribute('aria-expanded',String(id==='settings'));profileSettingsToggle.setAttribute('aria-label',id==='settings'?'Einstellungen schließen':'Profil & Einstellungen öffnen');}
    const moreTab=document.querySelector('#mobileTabbar [data-mobile-more]');
    if(moreTab)moreTab.classList.toggle('active',!['home','modes','live','progress'].includes(id));
    document.body.classList.toggle('mobile-game-screen',id==='game');
    if(id==='home')refreshHome();
    if(id==='progress')renderProgress();
    if(id==='stats')renderStats();
    if(id==='shop')renderShop();
    if(id==='settings'){ ensureEconomy(); updateAvatarChoices(); $('profileName').value=data.name; $('profileAvatar').value=data.avatar || '🦊'; }
    if(id==='creator' && typeof creatorRenderResumeCard==='function')creatorRenderResumeCard();
    updateGlobalBackButton();
    if(changingScreen){
      const restoreY=options.fromBack?Math.max(0,Number(options.restoreScrollY)||0):0;
      // Restore only after the destination is visible and its layout has settled.
      // A second delayed frame covers the screen entrance animation on slower devices.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        window.scrollTo({top:restoreY,left:0,behavior:'instant'});
        requestAnimationFrame(()=>window.scrollTo({top:restoreY,left:0,behavior:'instant'}));
      }));
    }
    persistAppViewState();
}

// V10.7.1 – keep the current screen and an in-progress local exercise across refreshes.
// sessionStorage is intentionally used: a refresh in the same tab restores the view,
// while a fresh tab/session starts normally. Live rooms keep their existing token flow.
const MM_APP_SCREEN_KEY='mm-app-screen-v1';
const MM_APP_HISTORY_KEY='mm-app-history-v1';
const MM_APP_SCROLL_KEY='mm-app-scroll-v1';
const MM_APP_GAME_KEY='mm-app-game-v1';
const MM_APP_RESULT_KEY='mm-app-result-v1';
const MM_APP_INFO_KEY='mm-app-info-v1';
// Every normal app section is restorable after a refresh in the same browser tab.
const MM_RESTORABLE_SCREENS=new Set(['modes','progress','stats','teacher','settings','shop','studio','creator','feedbackScreen','siteInfo']);
const MM_RESULT_FIELDS=['resultIcon','resultTitle','resultSub','resCorrect','resWrong','resAccuracy','xpEarned','recordMsg'];
function persistAppViewState(){
  try{
    if(new URLSearchParams(window.location.search).has('join'))return;
    const active=document.querySelector('.screen.active')?.id||mmActiveScreen||'home';
    if(active==='home'||active==='adminScreen'){
      sessionStorage.removeItem(MM_APP_SCREEN_KEY);sessionStorage.removeItem(MM_APP_HISTORY_KEY);
      sessionStorage.removeItem(MM_APP_SCROLL_KEY);sessionStorage.removeItem(MM_APP_GAME_KEY);sessionStorage.removeItem(MM_APP_RESULT_KEY);sessionStorage.removeItem(MM_APP_INFO_KEY);
      return;
    }
    sessionStorage.setItem(MM_APP_SCREEN_KEY,active);
    sessionStorage.setItem(MM_APP_HISTORY_KEY,JSON.stringify(mmScreenHistory.slice(-40)));
    sessionStorage.setItem(MM_APP_SCROLL_KEY,String(Math.max(0,window.scrollY||window.pageYOffset||0)));
    if(active==='siteInfo'){
      sessionStorage.setItem(MM_APP_INFO_KEY,JSON.stringify({title:$('siteInfoTitle')?.textContent||'',intro:$('siteInfoIntro')?.textContent||'',content:$('siteInfoContent')?.innerHTML||''}));
      sessionStorage.removeItem(MM_APP_GAME_KEY);sessionStorage.removeItem(MM_APP_RESULT_KEY);
    }else if(active==='game'){
      const feedback=$('feedback');
      const snapshot={v:1,mode:game.mode,level:game.level,questions:game.questions,index:game.index,correct:game.correct,wrong:game.wrong,streak:game.streak,bestStreak:game.bestStreak,answered:game.answered,correctAnswer:game.correctAnswer,question:game.question,options:game.options,startedAt:game.startedAt,remaining:game.remaining,attempts:game.attempts,roundErrors:game.roundErrors,lastAnswerValue:game.lastAnswerValue,lastAnsweredAt:game.lastAnsweredAt,screenBeforeGame,feedbackText:feedback?.textContent||'',feedbackColor:feedback?.style.color||''};
      sessionStorage.setItem(MM_APP_GAME_KEY,JSON.stringify(snapshot));
      sessionStorage.removeItem(MM_APP_RESULT_KEY);
    }else if(active==='result'){
      const result={v:1};MM_RESULT_FIELDS.forEach(id=>{const el=$(id);result[id]=el?.textContent||'';});
      sessionStorage.setItem(MM_APP_RESULT_KEY,JSON.stringify(result));sessionStorage.removeItem(MM_APP_GAME_KEY);
    }else{
      sessionStorage.removeItem(MM_APP_GAME_KEY);sessionStorage.removeItem(MM_APP_RESULT_KEY);
    }
  }catch(_){/* Private browsing or storage restrictions must not block the app. */}
}
function adminOrAppRestoreGame(snapshot){
  if(!snapshot||snapshot.v!==1||!['classic','rush','daily','mistakes'].includes(snapshot.mode)||!Array.isArray(snapshot.questions)||snapshot.questions.length>1000)return false;
  const numberOr=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  game={...game,mode:snapshot.mode,level:['easy','medium','hard'].includes(snapshot.level)?snapshot.level:'medium',questions:snapshot.questions,index:Math.max(0,numberOr(snapshot.index)),correct:Math.max(0,numberOr(snapshot.correct)),wrong:Math.max(0,numberOr(snapshot.wrong)),streak:Math.max(0,numberOr(snapshot.streak)),bestStreak:Math.max(0,numberOr(snapshot.bestStreak)),answered:Boolean(snapshot.answered),correctAnswer:numberOr(snapshot.correctAnswer),question:snapshot.question&&typeof snapshot.question==='object'?snapshot.question:null,options:Array.isArray(snapshot.options)?snapshot.options.map(Number).filter(Number.isFinite).slice(0,4):[],timer:null,startedAt:numberOr(snapshot.startedAt,Date.now()),remaining:numberOr(snapshot.remaining),attempts:Math.max(0,numberOr(snapshot.attempts)),roundErrors:Array.isArray(snapshot.roundErrors)?snapshot.roundErrors.slice(0,300):[],lastAnswerValue:snapshot.lastAnswerValue===null?null:numberOr(snapshot.lastAnswerValue),lastAnsweredAt:numberOr(snapshot.lastAnsweredAt)};
  screenBeforeGame=MM_RESTORABLE_SCREENS.has(snapshot.screenBeforeGame)||snapshot.screenBeforeGame==='home'||snapshot.screenBeforeGame==='modes'?snapshot.screenBeforeGame:'modes';
  if(!game.question||!Number.isFinite(Number(game.question.a))||!Number.isFinite(Number(game.question.b))){loadQuestion();}
  else{
    const timed=game.mode==='rush'||game.mode==='daily';
    if(timed){const total=game.mode==='daily'?120:60;game.remaining=Math.max(0,total-(Date.now()-game.startedAt)/1000);if(game.remaining<=0){finishGame();return true;}}
    $('gameBadge').textContent=game.mode==='rush'?'⚡ Math Rush · 60 Sekunden':game.mode==='daily'?'📅 Daily Challenge · 20 Aufgaben':game.mode==='mistakes'?'🎯 Fehler-Training':'🎯 Klassisch · '+LEVELS[game.level].title;
    $('countTitle').textContent=game.mode==='rush'?'Versuche':'Aufgabe';
    $('qHint').textContent='Wähle die richtige Antwort. Nur eine Antwort ist korrekt.';
    $('progressLabel').textContent=game.mode==='rush'||game.mode==='daily'?'Verbleibende Zeit':game.mode==='mistakes'?'Deine Fehler verbessern':'Dein Fortschritt';
    const shownIndex=game.answered?Math.max(1,game.index):game.index+1;
    $('question').textContent=game.question.a+' × '+game.question.b+' = ?';
    $('qLabel').textContent=game.mode==='rush'?'LEVEL '+(Math.floor((60-game.remaining)/12)+1)+' · BLITZRUNDE':game.mode==='daily'?'DAILY CHALLENGE · '+shownIndex+'/20':game.mode==='mistakes'?'FEHLER-TRAINING · '+shownIndex+'/'+game.questions.length:'AUFGABE '+shownIndex+'/'+game.questions.length;
    $('gCount').textContent=game.mode==='rush'?game.attempts+' Versuche':shownIndex+' / '+(game.mode==='daily'?20:game.questions.length);
    $('gCorrect').textContent=game.correct;$('gStreak').textContent=game.streak;
    const box=$('answers');box.innerHTML='';
    game.options.forEach(value=>{const button=document.createElement('button');button.className='answer';button.type='button';button.textContent=String(value);button.setAttribute('aria-label','Antwort: '+value);if(game.answered){button.disabled=true;if(Number(value)===game.question.answer)button.classList.add('correct');if(Number(value)===Number(game.lastAnswerValue)&&Number(value)!==game.question.answer)button.classList.add('wrong');}else button.onclick=()=>answer(Number(value),button);box.appendChild(button);});
    const feedback=$('feedback');feedback.textContent=snapshot.feedbackText||'';feedback.style.color=snapshot.feedbackColor||'';
    const next=$('nextBtn');if(game.answered&&!timed){next.classList.remove('hidden');next.textContent=game.index>=game.questions.length?'Ergebnis ansehen →':'Nächste Aufgabe →';}else next.classList.add('hidden');
    if(timed){$('progressBar').style.width=(game.remaining/(game.mode==='daily'?120:60)*100)+'%';$('progressText').textContent=Math.ceil(game.remaining)+' s';}
    else{$('progressBar').style.width=(game.index/game.questions.length*100)+'%';$('progressText').textContent=Math.round(game.index/game.questions.length*100)+'%';}
  }
  if(game.mode==='rush'||game.mode==='daily'){
    if(game.answered){const elapsed=Date.now()-game.lastAnsweredAt;const delay=Math.max(0,450-elapsed);if(delay===0)loadQuestion();else setTimeout(()=>{if(document.querySelector('.screen.active')?.id==='game'&&game.answered)loadQuestion();},delay);}
    if(game.timer)clearInterval(game.timer);game.timer=setInterval(tick,100);
  }
  persistAppViewState();
  return true;
}
function restoreAppViewState(){
  try{
    if(new URLSearchParams(window.location.search).has('join'))return;
    const screen=sessionStorage.getItem(MM_APP_SCREEN_KEY);if(!screen||screen==='home'||screen==='adminScreen')return;
    let history=[];try{const saved=JSON.parse(sessionStorage.getItem(MM_APP_HISTORY_KEY)||'[]');if(Array.isArray(saved))history=saved.filter(item=>item&&typeof item.id==='string'&&item.id!=='adminScreen').slice(-40);}catch(_){history=[];}
    const scrollY=Math.max(0,Number(sessionStorage.getItem(MM_APP_SCROLL_KEY))||0);
    if(screen==='live')return; // restoreLiveSession() owns live-room reconnection.
    if(screen==='game'){
      let snapshot=null;try{snapshot=JSON.parse(sessionStorage.getItem(MM_APP_GAME_KEY)||'null');}catch(_){snapshot=null;}
      if(!snapshot){sessionStorage.removeItem(MM_APP_SCREEN_KEY);return;}
      show('game',{fromBack:true});mmScreenHistory.splice(0,mmScreenHistory.length,...history);adminOrAppRestoreGame(snapshot);return;
    }
    if(screen==='result'){
      let result=null;try{result=JSON.parse(sessionStorage.getItem(MM_APP_RESULT_KEY)||'null');}catch(_){result=null;}
      if(!result||result.v!==1){sessionStorage.removeItem(MM_APP_SCREEN_KEY);return;}
      show('result',{fromBack:true});MM_RESULT_FIELDS.forEach(id=>{const el=$(id);if(el)el.textContent=String(result[id]||'');});
      mmScreenHistory.splice(0,mmScreenHistory.length,...history);if(scrollY)requestAnimationFrame(()=>window.scrollTo(0,scrollY));persistAppViewState();return;
    }
    if(MM_RESTORABLE_SCREENS.has(screen)){
      if(screen==='siteInfo'){
        let info=null;try{info=JSON.parse(sessionStorage.getItem(MM_APP_INFO_KEY)||'null');}catch(_){info=null;}
        if(info){$('siteInfoTitle').textContent=String(info.title||'');$('siteInfoIntro').textContent=String(info.intro||'');$('siteInfoContent').innerHTML=String(info.content||'');}
      }
      show(screen,{fromBack:true});mmScreenHistory.splice(0,mmScreenHistory.length,...history);if(scrollY)requestAnimationFrame(()=>window.scrollTo(0,scrollY));
    }
  }catch(_){/* Ignore stale session data and start safely on the home screen. */}
  finally{document.documentElement.classList.remove('app-restoring');}
}

async function goBack(){
  const current=document.querySelector('.screen.active')?.id || mmActiveScreen;
  if(current==='creator'){
    if(!$('creatorPlayPanel').classList.contains('hidden')){creatorStopPreview();return;}
    if(!$('creatorEditorPanel').classList.contains('hidden')){
      if(creatorCurrentStep>1){creatorGoStep(creatorCurrentStep-1);return;}
      creatorAutoSaveNow();creatorBackToHome();return;
    }
  }
  if(current==='live' && live.room){
    if(live.host && live.room.status==='lobby'){await cancelLiveRoom();return;}
    if(await customConfirm({title:'Live-Spiel verlassen?',message:'Möchtest du diesen Live-Raum wirklich verlassen?',confirmText:'Spiel verlassen',cancelText:'Bleiben',icon:'↩️',tone:'danger'})){await leaveLiveRoom();}
    return;
  }
  if(current==='game'){await quitGame();return;}
  const previous=mmScreenHistory.pop()||{id:'home',scrollY:0};
  show(previous.id,{fromBack:true,restoreScrollY:previous.scrollY});
}
function editProfile() {
    const active=document.querySelector('.screen.active')?.id;
    if(active==='settings'){goBack();return;}
    show('settings');
}
function saveProfile() {
    ensureEconomy(); updateAvatarChoices();
    const n=$('profileName').value.trim().slice(0,
    18);
    if(n)data.name=n;
    const chosenAvatar=$('profileAvatar').value || '🦊';
    const avatarUnlocks={'🐺':'avatar_wolf','🦈':'avatar_shark','🦅':'avatar_eagle','🦝':'avatar_raccoon'};
    data.avatar=(avatarUnlocks[chosenAvatar]&&!data.inventory.includes(avatarUnlocks[chosenAvatar]))?'🦊':chosenAvatar;
    saveData();
    showToast('Profil gespeichert!');
    goBack()
}
async function resetData() {
    if(!await customConfirm({title:'Alle lokalen Daten zurücksetzen?',message:'Deine XP, Münzen, Rekorde, Übungsstatistik und Fehlerliste auf diesem Gerät werden gelöscht. Das kann nicht rückgängig gemacht werden.',confirmText:'Daten zurücksetzen',cancelText:'Abbrechen',icon:'🧹',tone:'danger'}))return;
    data=defaultData();
    saveData();
    renderAll();
    showToast('Lokale Daten wurden zurückgesetzt.');
    show('home')
}
function currentLevel() {
    return Math.floor(data.xp/100)+1
}
function refreshHome() {
    const lvl=currentLevel(),
    into=data.xp%100;
    $('avatar').textContent=data.avatar || '🦊';
    $('statusText').textContent='Hallo, '+data.name;
    if($('homeCoins'))$('homeCoins').textContent=Number(data.coins)||0;
    $('homeLevel').textContent='Level '+lvl;
    $('homeXP').textContent=data.xp+' XP';
    const total=data.sessions.reduce((a,
    s)=>a+s.attempted,
    0),
    correct=data.sessions.reduce((a,
    s)=>a+s.correct,
    0);
    $('homeAccuracy').textContent=(total?Math.round(correct/total*100):0)+'%';
    $('xpCaption').textContent='Noch '+(100-into)+' XP bis Level '+(lvl+1);
    $('xpNumbers').textContent=into+' / 100 XP';
    $('xpFill').style.width=into+'%';
    $('rushBest').textContent=data.records.rush||0;
    $('dailyCardLabel').textContent=(data.daily.done&&data.daily.date===today()?'Heute geschafft ✓':'Heutige Challenge →');
    $('mistakeCardLabel').textContent=Object.values(data.errors).reduce((a,
    b)=>a+b,
    0)+' offene Fehler →';
    $('streakCaption').textContent=data.daily.streak?('Du hast '+data.daily.streak+' Tag(e) in Folge trainiert. Bleib dran!'):'Starte heute eine Runde, um deine tägliche Serie aufzubauen.'
}
function refreshRecords() {
    $('rushBest').textContent=data.records.rush||0
}
function renderAll() {
    refreshHome();
    refreshRecords()
}
function today() {
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,
    '0')+'-'+String(d.getDate()).padStart(2,
    '0')
}
function rng(max) {
    return Math.floor(Math.random()*max)+1
}
function shuffle(a) {
    for(let i=a.length-1;
    i>0;
    i--) {
        const j=Math.floor(Math.random()*(i+1));
        [a[i],
        a[j]]=[a[j],
        a[i]]
    }
    return a
}
function makeQuestion(max,
pair) {
    if(pair) {
        return {
            a:pair[0],
            b:pair[1],
            answer:pair[0]*pair[1]
        }
    }
    const a=rng(max),
    b=rng(max);
    return {
        a,
        b,
        answer:a*b
    }
}
function makeOptions(answer,
max) {
    const set=new Set([answer]);
    let safe=0;
    while(set.size<4&&safe++<200) {
        let v;
        if(Math.random()<.65) {
            v=answer+(Math.floor(Math.random()*15)-7);
            if(v===answer)v+=3
        }
        else v=rng(max*max);
        v=Math.max(1,
        Math.min(max*max,
        v));
        set.add(v)
    }
    let n=1;
    while(set.size<4) {
        if(!set.has(n))set.add(n);
        n++
    }
    return shuffle([...set])
}
function startClassic(level) {
    screenBeforeGame=document.querySelector('.screen.active')?.id || 'modes';
    game.mode='classic';
    game.level=level;
    game.questions=[];
    const max=LEVELS[level].max;
    for(let a=1;
    a<=max;
    a++)for(let b=1;
    b<=max;
    b++)game.questions.push([a,
    b]);
    shuffle(game.questions);
    game.questions=game.questions.slice(0,
    LEVELS[level].total);
    resetGame();
    $('gameBadge').textContent='🎯 Klassisch · '+LEVELS[level].title;
    $('countTitle').textContent='Aufgabe';
    $('qHint').textContent='Wähle die richtige Antwort. Nur eine Antwort ist korrekt.';
    $('progressLabel').textContent='Dein Fortschritt';
    show('game');
    loadQuestion()
}
function startRush() {
    screenBeforeGame=document.querySelector('.screen.active')?.id || 'home';
    game.mode='rush';
    game.level='hard';
    game.questions=[];
    resetGame();
    game.remaining=60;
    $('gameBadge').textContent='⚡ Math Rush · 60 Sekunden';
    $('countTitle').textContent='Versuche';
    $('progressLabel').textContent='Verbleibende Zeit';
    show('game');
    loadQuestion();
    game.startedAt=Date.now();
    game.timer=setInterval(tick,
    100)
}
async function startDaily() {
    if(data.daily.done&&data.daily.date===today()) {
        if(!await customConfirm({title:'Tägliche Challenge erneut spielen?',message:'Du hast die heutige Challenge schon abgeschlossen. Du kannst sie erneut spielen, erhältst den Tagesbonus aber nicht ein zweites Mal.',confirmText:'Noch einmal spielen',cancelText:'Abbrechen',icon:'📅',tone:'primary'}))return
    }
    screenBeforeGame=document.querySelector('.screen.active')?.id || 'home';
    game.mode='daily';
    game.level='medium';
    game.questions=[];
    for(let i=0;
    i<20;
    i++)game.questions.push(null);
    resetGame();
    game.remaining=120;
    $('gameBadge').textContent='📅 Daily Challenge · 20 Aufgaben';
    $('countTitle').textContent='Aufgabe';
    $('progressLabel').textContent='Verbleibende Zeit';
    show('game');
    loadQuestion();
    game.startedAt=Date.now();
    game.timer=setInterval(tick,
    100)
}
function startMistakes() {
    screenBeforeGame=document.querySelector('.screen.active')?.id || 'home';
    const pairs=[];
    Object.entries(data.errors).forEach(([k,
    count])=> {
        const [a,
        b]=k.split('x').map(Number);
        for(let i=0;
        i<Math.min(count,
        3);
        i++)pairs.push([a,
        b])
    }
    );
    if(!pairs.length) {
        showToast('Super! Deine Fehlerliste ist leer. Spiele zuerst eine Runde.');
        return
    }
    shuffle(pairs);
    game.mode='mistakes';
    game.level='hard';
    game.questions=pairs.slice(0,
    20);
    resetGame();
    $('gameBadge').textContent='🎯 Fehler-Training';
    $('countTitle').textContent='Aufgabe';
    $('progressLabel').textContent='Deine Fehler verbessern';
    show('game');
    loadQuestion()
}
function resetGame() {
    if(game.timer) {
        clearInterval(game.timer);
        game.timer=null
    }
    game.index=0;
    game.correct=0;
    game.wrong=0;
    game.streak=0;
    game.bestStreak=0;
    game.answered=false;
    game.startedAt=Date.now();
    game.remaining=0;
    game.attempts=0;
    game.roundErrors=[];
    game.lastAnswerValue=null;game.lastAnsweredAt=0;
    $('feedback').textContent='';
    $('progressBar').style.width='0%'
}
function activeMax() {
    if(game.mode==='rush') {
        const sec=60-game.remaining;
        return sec<15?5:sec<30?8:sec<45?12:sec<55?16:20
    }
    if(game.mode==='daily')return 10;
    if(game.mode==='mistakes')return 20;
    return LEVELS[game.level].max
}
function loadQuestion() {
    if((game.mode==='classic'||game.mode==='mistakes')&&game.index>=game.questions.length) {
        finishGame();
        return
    }
    if(game.mode==='daily'&&game.index>=20) {
        finishGame();
        return
    }
    game.answered=false;
    game.lastAnswerValue=null;game.lastAnsweredAt=0;
    game.attempts++;
    let pair=null;
    if(game.mode==='classic'||game.mode==='mistakes')pair=game.questions[game.index];
    const q=makeQuestion(activeMax(),
    pair);
    game.question=q;
    game.correctAnswer=q.answer;
    game.options=makeOptions(q.answer,
    activeMax());
    $('question').textContent=q.a+' × '+q.b+' = ?';
    $('qLabel').textContent=game.mode==='rush'?'LEVEL '+(Math.floor((60-game.remaining)/12)+1)+' · BLITZRUNDE':game.mode==='daily'?'DAILY CHALLENGE · '+(game.index+1)+'/20':game.mode==='mistakes'?'FEHLER-TRAINING · '+(game.index+1)+'/'+game.questions.length:'AUFGABE '+(game.index+1)+'/'+game.questions.length;
    $('gCount').textContent=(game.index+1)+(game.mode==='rush'?'':' / '+(game.mode==='daily'?20:game.questions.length));
    $('gCorrect').textContent=game.correct;
    $('gStreak').textContent=game.streak;
    $('feedback').textContent='';
    $('nextBtn').classList.add('hidden');
    const box=$('answers');
    box.innerHTML='';
    game.options.forEach((v,
    i)=> {
        const b=document.createElement('button');
        b.className='answer';
        b.type='button';
        b.textContent=v;
        b.setAttribute('aria-label',
        'Antwort '+(i+1)+': '+v);
        b.onclick=()=>answer(v,
        b);
        box.appendChild(b)
    }
    );
    if(game.mode==='classic'||game.mode==='mistakes') {
        $('progressBar').style.width=(game.index/game.questions.length*100)+'%';
        $('progressText').textContent=Math.round(game.index/game.questions.length*100)+'%'
    }
    else {
        $('progressBar').style.width=(game.remaining/(game.mode==='daily'?120:60)*100)+'%';
        $('progressText').textContent=Math.ceil(game.remaining)+' s'
    }
    persistAppViewState();
}
function answer(val,
btn) {
    if(game.answered)return;
    game.answered=true;
    game.lastAnswerValue=Number(val);game.lastAnsweredAt=Date.now();
    const q=game.question;
    const key=q.a+'x'+q.b;
    const buttons=[...document.querySelectorAll('#answers .answer')];
    buttons.forEach(b=> {
        b.disabled=true;
        if(Number(b.textContent)===q.answer)b.classList.add('correct')
    }
    );
    if(val===q.answer) {
        game.correct++;
        game.streak++;
        game.bestStreak=Math.max(game.bestStreak,
        game.streak);
        $('feedback').textContent=game.streak>=5?'🔥 COMBO ×'+game.streak+' · Richtig!': 'Richtig! 🎉';
        $('feedback').style.color='var(--green)';
        if(game.mode==='mistakes') {
            if(data.errors[key]) {
                data.errors[key]--;
                if(data.errors[key]<=0)delete data.errors[key]
            }
        }
    }
    else {
        game.wrong++;
        game.streak=0;
        btn.classList.add('wrong');
        $('feedback').textContent='Fast! Richtig ist '+q.answer+'.';
        $('feedback').style.color='var(--pink)';
        data.errors[key]=(data.errors[key]||0)+1;
        game.roundErrors.push(key)
    }
    game.index++;
    $('gCorrect').textContent=game.correct;
    $('gStreak').textContent=game.streak;
    saveData();
    if(game.mode==='classic'||game.mode==='mistakes') {
        $('progressBar').style.width=(game.index/game.questions.length*100)+'%';
        $('progressText').textContent=Math.round(game.index/game.questions.length*100)+'%';
        $('nextBtn').classList.remove('hidden');
        $('nextBtn').textContent=game.index>=game.questions.length?'Ergebnis ansehen →':'Nächste Aufgabe →'
    }
    else {
        if(game.timer===null)return;
        setTimeout(()=> {
            if(!game.timer&&game.mode!=='daily'&&game.mode!=='rush')return;
            if(game.mode==='daily'&&game.remaining<=0||game.mode==='rush'&&game.remaining<=0)return;
            loadQuestion()
        }
        ,
        450)
    }
    persistAppViewState();
}
function nextQuestion() {
    if(!game.answered)return;
    loadQuestion()
}
function tick() {
    const elapsed=(Date.now()-game.startedAt)/1000;
    game.remaining=Math.max(0,
    (game.mode==='daily'?120:60)-elapsed);
    $('progressBar').style.width=(game.remaining/(game.mode==='daily'?120:60)*100)+'%';
    $('progressText').textContent=Math.ceil(game.remaining)+' s';
    if(game.mode==='rush')$('gCount').textContent=game.attempts+' Versuche';
    if(game.remaining<=0) {
        clearInterval(game.timer);
        game.timer=null;
        finishGame()
    }
}
function finishGame() {
    if(game.timer) {
        clearInterval(game.timer);
        game.timer=null
    }
    const attempted=game.correct+game.wrong;
    const accuracy=attempted?Math.round(game.correct/attempted*100):0;
    const perf=game.mode==='rush'?game.correct:accuracy;
    const recordKey=game.mode==='classic'?game.level:(game.mode==='mistakes'?null:game.mode);
    const prior=recordKey?(data.records[recordKey]||0):Infinity;
    const newRecord=Boolean(recordKey&&perf>prior);
    if(recordKey&&newRecord)data.records[recordKey]=perf;
    let xp=game.correct*10+Math.floor(game.bestStreak/3)*5;
    if(accuracy>=90&&attempted>=10)xp+=20;
    if(game.mode==='daily'&&game.correct>=15)xp+=25;
    data.xp+=xp;
    const dt=today();
    const coinsEarned = Math.max(5, game.correct * 2 + Math.floor(game.bestStreak / 5) * 10 + (accuracy >= 90 && attempted >= 10 ? 15 : 0) + (game.mode === 'daily' && game.correct >= 15 ? 20 : 0));
    data.coins = (Number(data.coins) || 0) + coinsEarned;
    if(data.missionDate !== dt){ data.missionDate=dt; data.missionProgress={correct:0,played:0,streak:0}; data.claimedMissions=[]; }
    data.missionProgress = data.missionProgress || {correct:0,played:0,streak:0};
    data.missionProgress.correct += game.correct;
    data.missionProgress.played += 1;
    data.missionProgress.streak = Math.max(Number(data.missionProgress.streak)||0, game.bestStreak);
    if(game.mode==='daily') {
        if(data.daily.lastDate===dt) {
        }
        else if(data.daily.lastDate===yesterday())data.daily.streak++;
        else data.daily.streak=1;
        data.daily.lastDate=dt;
        data.daily.date=dt;
        data.daily.done=true
    }
    data.sessions.unshift( {
        date:dt,
        mode:game.mode,
        level:game.level,
        correct:game.correct,
        wrong:game.wrong,
        attempted,
        accuracy,
        xp,
        bestStreak:game.bestStreak
    }
    );
    data.sessions=data.sessions.slice(0,
    40);
    unlockBadges();
    saveData();
    $('resultIcon').textContent=newRecord?'🏆':accuracy>=80?'🎉':'💪';
    $('resultTitle').textContent=accuracy>=90?'Mathe-Champion!':accuracy>=70?'Stark gemacht!':'Weiter üben – du schaffst das!';
    $('resultSub').textContent='Du hast '+attempted+' Aufgaben versucht und '+game.correct+' richtig gelöst.';
    $('resCorrect').textContent=game.correct;
    $('resWrong').textContent=game.wrong;
    $('resAccuracy').textContent=accuracy+'%';
    $('xpEarned').textContent='✨ +'+xp+' XP gesammelt! · 🪙 +'+coinsEarned+' Münzen · Insgesamt: '+data.xp+' XP · Level '+currentLevel();
    $('recordMsg').textContent=newRecord?'🎉 Neue persönliche Bestleistung! Du hast dich selbst übertroffen.':'';
    show('result')
}
function replayGame() {
    const m=game.mode,
    l=game.level;
    if(m==='rush')startRush();
    else if(m==='daily')startDaily();
    else if(m==='mistakes')startMistakes();
    else startClassic(l)
}
async function quitGame() {
    if(!await customConfirm({title:'Runde wirklich beenden?',message:'Dein aktuelles Ergebnis wird nicht als abgeschlossene Runde gespeichert. Möchtest du wirklich aufhören?',confirmText:'Runde beenden',cancelText:'Weiterspielen',icon:'⏸️',tone:'danger'}))return;
    if(game.timer) {
        clearInterval(game.timer);
        game.timer=null
    }
    const fallbackDestination=screenBeforeGame || (game.mode==='classic'?'modes':'home');
    const previous=mmScreenHistory.length?mmScreenHistory[mmScreenHistory.length-1]:null;
    // The game screen was pushed onto this stack when it opened. Pop that exact
    // origin entry so leaving a game behaves like the global Back button.
    if(previous){
        mmScreenHistory.pop();
        show(previous.id,{fromBack:true,restoreScrollY:previous.scrollY});
    }else{
        // Defensive fallback for entry paths that did not create a history item.
        show(fallbackDestination,{fromBack:true,restoreScrollY:0});
    }
}
function yesterday() {
    const d=new Date();
    d.setDate(d.getDate()-1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,
    '0')+'-'+String(d.getDate()).padStart(2,
    '0')
}
const BADGES=[['first',
'🚀',
'Erste Schritte',
'Schließe deine erste Runde ab',
d=>d.sessions.length>=1],
['hundred',
'💯',
'100 Antworten',
'Beantworte 100 Aufgaben',
d=>d.sessions.reduce((n,
s)=>n+s.attempted,
0)>=100],
['perfect',
'💎',
'Fehlerfrei',
'Erreiche 100% in einer Runde mit 10+ Fragen',
d=>d.sessions.some(s=>s.accuracy===100&&s.attempted>=10)],
['rush',
'⚡',
'Rush-Meister',
'Löse mindestens 15 Aufgaben im Math Rush',
d=>d.records.rush>=15],
['week',
'📅',
'Dranbleiber',
'Trainiere an 3 verschiedenen Tagen',
d=>new Set(d.sessions.map(s=>s.date)).size>=3],
['xp500',
'👑',
'XP-Sammler',
'Sammle 500 XP',
d=>d.xp>=500],
['combo',
'🔥',
'Combo-König',
'Erreiche eine Serie von mindestens 10 richtigen Antworten',
d=>d.sessions.some(s=>(s.bestStreak||0)>=10)],
['daily',
'🏆',
'Daily-Held',
'Schließe eine Tages-Challenge ab',
d=>d.sessions.some(s=>s.mode==='daily')]];
function unlockBadges() {
    BADGES.forEach(b=> {
        if(b[4](data)&&!data.badges.includes(b[0])) {
            data.badges.push(b[0]);
            showToast('Abzeichen freigeschaltet: '+b[2]+' '+b[1])
        }
    }
    )
}
function renderProgress() {
    const l=currentLevel(),
    into=data.xp%100;
    $('pLevel').textContent=l;
    $('pXP').textContent=data.xp;
    $('pSessions').textContent=data.sessions.length;
    $('pNextTitle').textContent='Level '+(l+1);
    $('pNextText').textContent='Noch '+(100-into)+' XP bis zum nächsten Level.';
    $('pXPTxt').textContent=into+' / 100';
    $('pXPFill').style.width=into+'%';
    $('badgeGrid').innerHTML=BADGES.map(b=>`<div class="badge ${data.badges.includes(b[0])?'earned':''}">
    <span>${b[1]}</span>
    <b>${b[2]}</b>
    <small>${b[3]}</small>
    </div>`).join('')
}
function renderStats() {
    const total=data.sessions.reduce((a,
    s)=>a+s.attempted,
    0),
    cor=data.sessions.reduce((a,
    s)=>a+s.correct,
    0);
    $('sSessions').textContent=data.sessions.length;
    $('sAccuracy').textContent=(total?Math.round(cor/total*100):0)+'%';
    $('sRush').textContent=data.records.rush||0;
    const sess=data.sessions.slice(0,
    7).reverse();
    $('sessionBars').innerHTML=sess.length?sess.map((s,
    i)=>`<div class="barrow">
    <span>${s.mode==='rush'?'Rush':s.mode==='daily'?'Daily':s.mode==='mistakes'?'Fehler':s.level}</span>
    <div class="bar">
    <i style="width:${Math.max(2,
    s.accuracy)}%">
    </i>
    </div>
    <b>${s.accuracy}%</b>
    </div>`).join(''):'<p class="muted">Noch keine Runden gespielt.</p>';
    const errs=Object.entries(data.errors).sort((a,
    b)=>b[1]-a[1]).slice(0,
    6);
    $('weakList').innerHTML=errs.length?errs.map(([k,
    n])=>`<div class="mistake-row">
    <span>
    <b>${k.replace('x',
    ' × ')}</b>
    </span>
    <span class="muted">${n} Fehler</span>
    </div>`).join(''):'<p class="muted">Keine Fehler gespeichert. Weiter so! 🎉</p>'
}
function downloadPersonalStats(){
  const rows=[['Typ','Datum','Modus','Schwierigkeit','Versuche','Richtig','Falsch','Quote','Beste Serie']];
  (data.sessions||[]).forEach(s=>rows.push(['Training',s.date?String(s.date):(s.timestamp?new Date(Number(s.timestamp)).toLocaleString('de-DE'):'nicht angegeben'),s.mode||'classic',s.level||'',Number(s.attempted)||0,Number(s.correct)||0,Number(s.wrong)||0,Number(s.accuracy)||0,Number(s.bestStreak)||0]));
  Object.entries(data.errors||{}).sort((a,b)=>b[1]-a[1]).forEach(([q,n])=>rows.push(['Fehlerliste','',q.split('x').join(' × '),'',Number(n)||0,'','','','']));
  rows.push(['Profil','','Level '+currentLevel(),'XP',Number(data.xp)||0,'Münzen',Number(data.coins)||0,'','']);
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='MatheMeister-Statistik-'+today()+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('Statistik wurde als CSV exportiert.');
}
async function clearStatsHistory(){
  if(!await customConfirm({title:'Rundenverlauf wirklich löschen?',message:'Die gespeicherten Runden und deine Fehlerliste werden entfernt. XP, Münzen, Profil, Rekorde und Abzeichen bleiben erhalten. Diese Aktion kann nicht rückgängig gemacht werden.',confirmText:'Verlauf löschen',cancelText:'Abbrechen',icon:'🧹',tone:'danger'}))return;
  data.sessions=[];data.errors={};saveData();renderStats();refreshHome();showToast('Rundenverlauf und Fehlerliste wurden gelöscht.');
}

function applyTeacherSettings() {
    const count=Number($('teacherCount').value),
    sec=Number($('teacherTime').value);
    $('liveCount').value=String(count);
    $('liveSeconds').value=String(sec);
    showToast('Einstellungen übernommen. Du kannst jetzt einen Live-Raum erstellen.');
    show('live')
}
function leaveLiveUI() {
    document.body.classList.remove('live-room-active','friends-player-lobby','classroom-player');
    if (live.poll) {
        clearInterval(live.poll);
        live.poll = null;
    }
    if (live.reviewTimer) {
        clearTimeout(live.reviewTimer);
        live.reviewTimer = null;
    }
    if (live.subscription && live.sb) {
        live.sb.removeChannel(live.subscription);
        live.subscription = null;
    }
    show('home');
}

// Profil-Shop: kosmetische Inhalte sind rein optisch und werden lokal gespeichert.
const SHOP_ITEMS = [
 {id:'frame_basic',kind:'frame',name:'Klassisch',cost:0,preview:'🦊',css:'',desc:'Der zeitlose Standardrahmen.'},
 {id:'frame_neon',kind:'frame',name:'Neonblitz',cost:250,preview:'⚡',css:'frame-neon',desc:'Leuchtender cyanfarbener Rahmen.'},
 {id:'frame_gold',kind:'frame',name:'Gold-Elite',cost:600,preview:'👑',css:'frame-gold',desc:'Ein goldener Rahmen für starke Spieler.'},
 {id:'frame_galaxy',kind:'frame',name:'Galaxie',cost:1200,preview:'🌌',css:'frame-galaxy',desc:'Kosmischer violetter Look.'},
 {id:'frame_royal',kind:'frame',name:'Königlich',cost:2500,preview:'💎',css:'frame-royal',desc:'Ein seltener Prestige-Rahmen.'},
 {id:'title_none',kind:'title',name:'Ohne Titel',cost:0,preview:'—',css:'',desc:'Kein zusätzlicher Titel.'},
 {id:'title_blitz',kind:'title',name:'Blitz-Rechner',cost:150,preview:'⚡',css:'',desc:'Für schnelle Kopfrechner.'},
 {id:'title_streak',kind:'title',name:'Serienmeister',cost:800,preview:'🔥',css:'',desc:'Für lange Antwortserien.'},
 {id:'title_champion',kind:'title',name:'Champion',cost:500,preview:'🏆',css:'',desc:'Zeig, dass du regelmäßig gewinnst.'},
 {id:'title_legend',kind:'title',name:'Legende',cost:1500,preview:'👑',css:'',desc:'Ein Titel für echte MatheMeister.'},
 {id:'avatar_wolf',kind:'avatar',name:'Schattenwolf',cost:400,preview:'🐺',emoji:'🐺',css:'',desc:'Ein seltener Wolf-Avatar.'},
 {id:'avatar_shark',kind:'avatar',name:'Stahlhai',cost:500,preview:'🦈',emoji:'🦈',css:'',desc:'Für furchtlose Herausforderer.'},
 {id:'avatar_eagle',kind:'avatar',name:'Adlerauge',cost:650,preview:'🦅',emoji:'🦅',css:'',desc:'Ein besonderer Adler-Avatar.'},
 {id:'avatar_raccoon',kind:'avatar',name:'Waschbär',cost:350,preview:'🦝',emoji:'🦝',css:'',desc:'Klein, schnell und clever.'},
 {id:'effect_none',kind:'effect',name:'Ohne Effekt',cost:0,preview:'—',css:'',desc:'Keine zusätzliche Animation.'},
 {id:'effect_confetti',kind:'effect',name:'Konfetti-Finale',cost:900,preview:'🎉',css:'',desc:'Konfetti in deiner Siegeransicht.'}
];
function ensureEconomy(){
  if(!Array.isArray(data.inventory))data.inventory=['frame_basic','title_none'];
  for(const id of ['frame_basic','title_none','effect_none'])if(!data.inventory.includes(id))data.inventory.push(id);
  if(!data.equippedFrame || !data.inventory.includes(data.equippedFrame))data.equippedFrame='frame_basic';
  if(!data.equippedTitle || !data.inventory.includes(data.equippedTitle))data.equippedTitle='title_none';
  if(!data.equippedEffect || !data.inventory.includes(data.equippedEffect))data.equippedEffect='effect_none';
  if(!Number.isFinite(Number(data.coins)))data.coins=250;
  if(data.missionDate!==today()){data.missionDate=today();data.missionProgress={correct:0,played:0,streak:0};data.claimedMissions=[];}
  if(!data.missionProgress)data.missionProgress={correct:0,played:0,streak:0};
  if(!Array.isArray(data.claimedMissions))data.claimedMissions=[];
  if(!Array.isArray(data.liveRewarded))data.liveRewarded=[];
  const avatarUnlocks={'🐺':'avatar_wolf','🦈':'avatar_shark','🦅':'avatar_eagle','🦝':'avatar_raccoon'};
  if(avatarUnlocks[data.avatar] && !data.inventory.includes(avatarUnlocks[data.avatar])) data.avatar='🦊';
}
function updateAvatarChoices(){
  const select=$('profileAvatar');
  if(!select)return;
  ensureEconomy();
  const unlocks={'🐺':'avatar_wolf','🦈':'avatar_shark','🦅':'avatar_eagle','🦝':'avatar_raccoon'};
  [...select.options].forEach(option=>{
    const required=unlocks[option.value];
    option.disabled=Boolean(required&&!data.inventory.includes(required));
    if(option.disabled && option.value===data.avatar){data.avatar='🦊';select.value='🦊';}
    if(required) option.textContent=(option.disabled?'🔒 ':'')+option.textContent.replace(/^🔒\s*/,'');
  });
}
function frameCss(id){return (SHOP_ITEMS.find(x=>x.id===id&&x.kind==='frame')||SHOP_ITEMS[0]).css;}
function titleName(id){const item=SHOP_ITEMS.find(x=>x.id===id&&x.kind==='title');return item&&id!=='title_none'?item.name:'';}
function avatarMarkup(avatar,frame='frame_basic',extra=''){
  return `<span class="cosmetic-frame ${frameCss(frame)} ${extra}" style="font-size:22px">${esc(avatar||'🦊')}</span>`;
}
function profileMarkup(p){
  const title=titleName(p.profile_title||'title_none');
  return `${avatarMarkup(p.avatar,p.frame_id)} ${esc(p.nickname||'Spieler')}${title?` <span class="profile-title-tag">${esc(title)}</span>`:''}`;
}
function renderShop(){
  ensureEconomy();
  $('shopCoins').textContent=Number(data.coins)||0;
  $('shopAvatarPreview').className='shop-avatar-preview '+frameCss(data.equippedFrame);
  $('shopAvatarPreview').textContent=data.avatar||'🦊';
  $('shopProfileSummary').textContent=`Level ${currentLevel()}${titleName(data.equippedTitle)?' · '+titleName(data.equippedTitle):' · Mathe-Abenteurer'}${data.equippedEffect==='effect_confetti'?' · 🎉 Konfetti':''}`;
  const missions=[
    {id:'correct',title:'20 richtige Antworten',desc:'Löse heute 20 Aufgaben richtig.',goal:20,progress:Number(data.missionProgress.correct)||0,reward:60},
    {id:'played',title:'Eine Runde spielen',desc:'Schließe heute eine Trainingsrunde ab.',goal:1,progress:Number(data.missionProgress.played)||0,reward:35},
    {id:'streak',title:'Combo ×5',desc:'Schaffe fünf richtige Antworten in Folge.',goal:5,progress:Number(data.missionProgress.streak)||0,reward:50}
  ];
  $('missionList').innerHTML=missions.map(m=>{const done=m.progress>=m.goal, claimed=data.claimedMissions.includes(m.id);return `<div class="mission-card"><strong>${esc(m.title)}</strong><p class="muted" style="font-size:12px;margin:5px 0">${esc(m.desc)}</p><div class="mission-track"><span style="width:${Math.min(100,m.progress/m.goal*100)}%"></span></div><div class="row" style="justify-content:space-between;align-items:center"><small>${Math.min(m.progress,m.goal)} / ${m.goal} · 🪙 ${m.reward}</small><button class="btn ${done&&!claimed?'primary':'secondary'}" style="padding:7px 9px;font-size:11px" ${!done||claimed?'disabled':''} onclick="claimMission('${m.id}',${m.reward})">${claimed?'Abgeholt':done?'Abholen':'Weiter'}</button></div></div>`;}).join('');
  const renderItems=(kind,target)=>{$(target).innerHTML=SHOP_ITEMS.filter(i=>i.kind===kind).map(i=>{
    const owned=data.inventory.includes(i.id);
    let equipped=false;
    if(kind==='frame')equipped=data.equippedFrame===i.id;
    else if(kind==='title')equipped=data.equippedTitle===i.id;
    else if(kind==='avatar')equipped=data.avatar===i.emoji;
    else if(kind==='effect')equipped=data.equippedEffect===i.id;
    const locked=kind==='avatar'&&!owned;
    const label=equipped?'Ausgerüstet':owned?'Ausrüsten':`🪙 ${i.cost} kaufen`;
    return `<div class="shop-item"><div class="shop-item-preview ${kind==='frame'?i.css:''}">${kind==='frame'?esc(data.avatar||'🦊'):esc(i.preview)}</div><strong>${esc(i.name)} ${equipped?'✓':''}</strong><small>${esc(i.desc)}</small><button class="btn ${equipped?'secondary':'primary'}" ${locked?'disabled':''} onclick="handleShopItem('${i.id}')">${label}</button></div>`;
  }).join('');};
  renderItems('frame','frameShop');renderItems('title','titleShop');renderItems('avatar','avatarShop');renderItems('effect','effectShop');
  updateAvatarChoices();
}
function handleShopItem(id){
  ensureEconomy();const item=SHOP_ITEMS.find(x=>x.id===id);if(!item)return;
  if(!data.inventory.includes(id)){if(Number(data.coins)<item.cost){showToast('Dafür fehlen dir noch Münzen.');return;}data.coins-=item.cost;data.inventory.push(id);showToast(`${item.name} freigeschaltet!`);}
  if(item.kind==='frame')data.equippedFrame=id;else if(item.kind==='title')data.equippedTitle=id;else if(item.kind==='avatar')data.avatar=item.emoji;else if(item.kind==='effect')data.equippedEffect=id;
  saveData();renderShop();updateAvatarChoices();
}
function claimMission(id,reward){
  ensureEconomy();if(data.claimedMissions.includes(id))return;
  const values={correct:[Number(data.missionProgress.correct)||0,20],played:[Number(data.missionProgress.played)||0,1],streak:[Number(data.missionProgress.streak)||0,5]};
  if(!values[id]||values[id][0]<values[id][1])return;
  data.claimedMissions.push(id);data.coins=(Number(data.coins)||0)+Number(reward);saveData();renderShop();showToast(`Mission abgeschlossen: +${reward} Münzen!`);
}
function syncMissionsForLive(correct,bestStreak){
  ensureEconomy();data.missionProgress.correct+=Number(correct)||0;data.missionProgress.played+=1;data.missionProgress.streak=Math.max(Number(data.missionProgress.streak)||0,Number(bestStreak)||0);saveData();
}

// Live-Modus: Daten werden über geprüfte Supabase-RPC-Funktionen verarbeitet.
const SUPABASE_URL = 'https://yerwkqqvudbgqqxpqrgn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NDeJpCuOhRKeyaFRcaKMHw_2ZcBJiBc';
// QR-Codes dürfen nie auf file://-Pfade zeigen. Auf Netlify wird die aktuelle öffentliche URL verwendet.
const LIVE_PUBLIC_FALLBACK = 'https://melodious-raindrop-ace533.netlify.app/';
function liveJoinUrl(code) {
    const isWeb = window.location.protocol === 'https:' || window.location.protocol === 'http:';
    const base = new URL(isWeb ? window.location.href : LIVE_PUBLIC_FALLBACK);
    base.search = '';
    base.hash = '';
    base.searchParams.set('join', String(code));
    return base.toString();
}

const live = {
    sb: null,
    room: null,
    player: null,
    players: [],
    host: false,
    subscription: null,
    poll: null,
    timerInterval: null,
    renderSignature: null,
    advancing: false,
    reviewTimer: null,
    token: null,
    joinRoomInfo: null,
    reactionsOpen: false,
    chatOpen: false,
    chatSending: false,
    replyTo: null,
    chatMessages: [],
    reactionFeed: [],
    activityAvailable: false,
    displayMode: 'friends',
    hostPlaying: false,
    hostPlayerToken: null,
    qrOpen: false,
    joinOpen: true,
    playerAhead: null,
    teamTotals: [],
    answerCounts: [],
    colorQuestionIndex: null,
    selectedColorIndex: null,
    customGame: null
};

const TEAM_NAMES = ['Team Blau','Team Rot','Team Grün','Team Gelb','Team Lila','Team Orange','Team Türkis','Team Pink','Team Weiß','Team Schwarz'];
const TEAM_EMOJIS = ['🔵','🔴','🟢','🟡','🟣','🟠','🩵','🩷','⚪','⚫'];
const TEAM_COLORS = ['#60a5fa','#fb7185','#34d399','#facc15','#c084fc','#fb923c','#67e8f9','#f9a8d4','#e5e7eb','#9ca3af'];
const REACTIONS = ['👏','🔥','😂','😮','💪','🎉'];
function teamName(number) {
    const n = Number(number);
    return n >= 1 && n <= TEAM_NAMES.length ? TEAM_NAMES[n - 1] : '';
}
function teamEmoji(number) {
    const n = Number(number);
    return n >= 1 && n <= TEAM_EMOJIS.length ? TEAM_EMOJIS[n - 1] : '👥';
}
function teamBadge(number) {
    const n = Number(number);
    if (!n || n < 1 || n > TEAM_NAMES.length) return '';
    const color = TEAM_COLORS[n - 1];
    return `<span class="team-badge" style="background:${color}22;color:${color};border-color:${color}55">${TEAM_EMOJIS[n - 1]} ${esc(TEAM_NAMES[n - 1])}</span>`;
}
function updateLiveOptionsUI() {
    const isTeam = $('liveGameMode')?.value === 'team';
    $('teamOptions')?.classList.toggle('hidden', !isTeam);
    const friendMode = $('liveDisplayMode')?.value === 'friends';
    const hostToggle = $('hostPlayWrap');
    if (hostToggle) hostToggle.classList.toggle('hidden', !friendMode);
    if (!friendMode && $('hostPlayToggle')) $('hostPlayToggle').checked = false;
    const hostTeamWrap = $('hostTeamWrap');
    if (hostTeamWrap) hostTeamWrap.classList.toggle('hidden', !(friendMode && isTeam && $('liveTeamAssignment')?.value === 'choose' && $('hostPlayToggle')?.checked));
    if ($('liveHostTeam') && $('liveTeamCount')) { [...$('liveHostTeam').options].forEach((o,i)=>o.hidden=i>=Number($('liveTeamCount').value||2)); if(Number($('liveHostTeam').value)>Number($('liveTeamCount').value||2))$('liveHostTeam').value='1'; }
}
function updateTeamSetupUI() { updateLiveOptionsUI(); }
async function checkJoinRoomSettings() {
    const code = $('joinCode')?.value.trim() || '';
    const wrap = $('joinTeamWrap');
    const note = $('joinTeamNote');
    if (!wrap || !note) return;
    if (!/^\d{5}$/.test(code)) {
        wrap.classList.add('hidden');
        note.textContent = 'Gib den Spielcode ein, um die Team-Einstellungen zu sehen.';
        live.joinRoomInfo = null;
        return;
    }
    try {
        const sb = await getSb();
        const { data: info, error } = await sb.rpc('mm_room_info_v4', { p_code: code });
        if (error) throw error;
        live.joinRoomInfo = info;
        if (info.status === 'finished' || info.join_open === false) {
            wrap.classList.add('hidden');
            note.textContent = info.status === 'finished' ? 'Diese Runde ist bereits beendet.' : 'Der Gastgeber hat den Beitritt geschlossen.';
        } else if (info.status !== 'lobby') {
            if (!info.team_mode) { wrap.classList.add('hidden'); note.textContent = 'Die Runde läuft bereits. Du kannst ab der aktuellen Frage einsteigen.'; }
            else if (info.team_assignment === 'random') { wrap.classList.add('hidden'); note.textContent = 'Die Runde läuft bereits; du wirst beim Beitreten einem Team zugeteilt.'; }
            else { const count = Math.max(2, Math.min(10, Number(info.team_count) || 2)); [...$('joinTeam').options].forEach((option,i)=>{option.hidden=i>=count;}); wrap.classList.remove('hidden'); note.textContent='Die Runde läuft; wähle dein Team und steige ab dieser Frage ein.'; }
        } else if (!info.team_mode) {
            wrap.classList.add('hidden');
            note.textContent = 'Dieser Raum spielt im Einzelspieler-Modus.';
        } else if (info.team_assignment === 'random') {
            wrap.classList.add('hidden');
            note.textContent = '🎲 Team-Modus: Du wirst beim Beitreten automatisch einem Team zugeteilt.';
        } else {
            const count = Math.max(2, Math.min(10, Number(info.team_count) || 2));
            const select = $('joinTeam');
            [...select.options].forEach((option, i) => { option.hidden = i >= count; });
            if (Number(select.value) > count) select.value = '1';
            wrap.classList.remove('hidden');
            note.textContent = '👥 Team-Modus: Wähle dein Team und tritt dem Spiel bei.';
        }
    } catch (e) {
        live.joinRoomInfo = null;
        wrap.classList.add('hidden');
        note.textContent = 'Raum-Einstellungen konnten nicht geladen werden. Prüfe den Code und versuche es erneut.';
    }
}
function teamTotals(players, teamCount) {
    const count = Math.max(2, Math.min(10, Number(teamCount) || 2));
    const totals = Array.from({ length: count }, (_, i) => ({
        number: i + 1, name: TEAM_NAMES[i], emoji: TEAM_EMOJIS[i],
        score: 0, correct: 0, members: []
    }));
    (players || []).forEach(p => {
        const n = Number(p.team_number);
        if (n >= 1 && n <= count) {
            const t = totals[n - 1];
            t.score += Number(p.score) || 0;
            t.correct += Number(p.correct_count) || 0;
            t.members.push(p);
        }
    });
    return totals.sort((a, b) => b.score - a.score || b.correct - a.correct || a.number - b.number);
}
function renderTeamScores(players, room) {
    if (!room.team_mode) return '';
    const teams = teamTotals(players, room.team_count);
    return `<div class="team-score-grid">${teams.map((t, i) => `<div class="team-score-card"><div class="team-name">${i === 0 ? '🏆 ' : ''}${t.emoji} ${esc(t.name)}</div><div class="team-points">${t.score.toLocaleString('de-DE')} P.</div><div class="team-member-count">${t.members.length} Spieler${room.display_mode==='friends'?` · ${t.correct} richtig`:''}</div></div>`).join('')}</div>`;
}
function renderSoloPodium(players, {showCorrectCount=true}={}) {
    const sorted = [...players].sort((a, b) => Number(b.score) - Number(a.score) || (showCorrectCount ? Number(b.correct_count) - Number(a.correct_count) : 0));
    if (!sorted.length) return '<p class="muted">Es waren keine Spieler dabei.</p>';
    const places = [
        { p: sorted[1], medal: '🥈', rank: '2. Platz', className: 'second' },
        { p: sorted[0], medal: '🥇', rank: '1. Platz', className: 'first' },
        { p: sorted[2], medal: '🥉', rank: '3. Platz', className: 'third' }
    ].filter(x => x.p);
    const podium = places.map(x => `<div class="podium-person"><div class="podium-medal">${x.medal}</div><div class="podium-avatar">${avatarMarkup(x.p.avatar,x.p.frame_id)}</div><div class="podium-name">${esc(x.p.nickname)}${titleName(x.p.profile_title)?` <span class="profile-title-tag">${esc(titleName(x.p.profile_title))}</span>`:''}</div><div class="podium-points">${Number(x.p.score) || 0} Punkte</div><div class="podium-step ${x.className}">${x.rank}${showCorrectCount?`<br>${Number(x.p.correct_count)||0} richtig`:''}</div></div>`).join('');
    const rest = sorted.map((p, i) => `<div class="player"><span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${esc(p.avatar || '🦊')} ${esc(p.nickname)}</span><b>${Number(p.score) || 0} P.${showCorrectCount?` · ${Number(p.correct_count)||0} richtig`:''}</b></div>`).join('');
    return `<div class="championship"><div style="font-size:40px">🏆</div><h2>Die Champions!</h2><p class="champion-subtitle">Herzlichen Glückwunsch an die Gewinner!</p><div class="podium-row">${podium}</div><div class="championship-ranking"><h3>Endgültige Rangliste</h3><div class="player-list">${rest}</div></div></div>`;
}
function renderTeamPodium(players, room) {
    const teams = teamTotals(players, room.team_count);
    const winner = teams[0];
    if (!winner || winner.members.length === 0) return `<div class="championship"><div style="font-size:40px">🏆</div><h2>Spiel beendet!</h2><p class="champion-subtitle">Es gab keine Team-Ergebnisse.</p></div>`;
    const winners = [...winner.members].sort((a, b) => Number(b.score) - Number(a.score));
    const memberCards = winners.map((p, i) => `<div class="podium-team-member" style="animation-delay:${Math.min(i * .1, .8)}s"><span class="podium-chair">🪑</span><div class="podium-avatar">${avatarMarkup(p.avatar,p.frame_id)}</div><div class="podium-member-name">${esc(p.nickname)}${titleName(p.profile_title)?` <span class="profile-title-tag">${esc(titleName(p.profile_title))}</span>`:''}</div><div class="podium-points">${Number(p.score) || 0} Punkte</div><span class="podium-team-label">🥇 Goldmedaille · ${esc(winner.name)}</span></div>`).join('');
    const ranking = teams.map((t, i) => `<div class="player"><span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${t.emoji} ${esc(t.name)} <small class="muted">(${t.members.length} Spieler)</small></span><b>${t.score.toLocaleString('de-DE')} P.</b></div>`).join('');
    return `<div class="championship"><div style="font-size:42px">🏆</div><h2>${esc(winner.name)} gewinnt!</h2><p class="champion-subtitle">Alle Mitglieder des Siegerteams erhalten Gold! 🎉</p><div class="podium-team-stage">${memberCards}</div><div class="championship-ranking"><h3>Team-Endstand</h3><div class="player-list">${ranking}</div><h3 style="margin-top:22px">Alle Spieler</h3><div class="player-list">${[...players].sort((a,b)=>Number(b.score)-Number(a.score)).map((p,i)=>`<div class="player"><span>${i+1}. ${esc(p.avatar || '🦊')} ${esc(p.nickname)} ${teamBadge(p.team_number)}</span><b>${Number(p.score)||0} P.</b></div>`).join('')}</div></div></div>`;
}
function liveSelfCard(room, player) {
    const team = room.team_mode && player && player.team_number ? teamBadge(player.team_number) : '';
    return `<div class="live-self"><span class="live-self-avatar">${esc((player && player.avatar) || data.avatar || '🦊')}</span><div><div class="live-self-name">Du spielst als ${esc((player && player.nickname) || 'Spieler')}</div><div class="live-self-meta">${team || (room.team_mode ? 'Team wird zugeteilt' : 'Einzelspieler')}</div></div></div>`;
}
function liveTimerMarkup(room) {
    const total = Math.max(1, Number(room.seconds_per_question) || 15);
    const remaining = Math.max(0, Math.ceil((new Date(room.question_ends_at).getTime() - Date.now()) / 1000));
    const pct = Math.max(0, Math.min(100, remaining / total * 100));
    return `<div class="live-timer-head"><span>⏱️ Verbleibende Zeit</span><strong id="liveTimerText">${remaining} Sek.</strong></div><div class="live-timer-track"><div id="liveTimerFill" class="live-timer-fill ${remaining <= 5 ? 'low' : ''}" style="width:${pct}%"></div></div>`;
}
function renderReactionFeed() {
    const recent = (live.reactionFeed || []).slice(-8);
    if (!recent.length) return '';
    return `<div class="live-reaction-feed" aria-label="Aktuelle Reaktionen">${recent.map((r,i) => `<span class="live-reaction-bubble" style="--bubble-index:${i}" title="${esc(r.sender_name || 'Spieler')}"><span class="live-reaction-sender">${esc(r.sender_avatar || '🙂')} ${esc(r.sender_name || 'Spieler')}</span><b>${esc(r.reaction || '')}</b></span>`).join('')}</div>`;
}
function renderReactions() {
    if (!live.room || !['playing','review'].includes(live.room.status)) return '';
    const canReact = live.activityAvailable && !(live.host && !live.hostPlaying);
    return `<div class="live-reactions"><button class="live-reaction-toggle" type="button" onclick="toggleLiveReactions()" aria-expanded="${live.reactionsOpen ? 'true' : 'false'}" ${canReact ? '' : 'disabled'}>😊 Reaktion <span>${live.reactionsOpen ? '▴' : '▾'}</span></button><div id="liveReactionMenu" class="live-reaction-menu ${live.reactionsOpen ? '' : 'hidden'}">${canReact ? REACTIONS.map(e => `<button type="button" class="live-reaction-btn" onclick="sendLiveReaction('${e}')" aria-label="Reaktion ${e}">${e}</button>`).join('') : '<span class="muted">Der Gastgeber spielt nicht mit.</span>'}</div></div>`;
}
function renderLiveChat() {
    if (!live.room || !['playing','review'].includes(live.room.status)) return '';
    if (!live.activityAvailable) return '<p class="muted live-activity-warning">Chat und Reaktionen werden nach dem Supabase-Update verfügbar.</p>';
    const messages = (live.chatMessages || []).slice(-25);
    const body = messages.length ? messages.map(m => `<div class="live-chat-message"><span class="live-chat-avatar">${esc(m.sender_avatar || '🙂')}</span><div class="live-chat-message-copy"><b>${esc(m.sender_name || 'Spieler')}</b><p>${esc(m.body || '')}</p><button type="button" class="live-chat-reply" onclick="replyLiveMessage(${Number(m.id)||0})">↩ Antworten</button></div></div>`).join('') : '<p class="muted">Noch keine Nachrichten. Schreib die erste Nachricht! 💬</p>';
    const quick = ['Darf ich kurz auf die Toilette? 🚽','Ich hatte Glück! 😂','Noch eine Runde! 🔁','Ich schaffe das! 💪'];
    const latest = messages.length ? messages[messages.length-1] : null;
    const floating = latest ? `<div class="live-chat-float" key="${Number(latest.id)||0}"><span>${esc(latest.sender_avatar || '🙂')}</span><div><b>${esc(latest.sender_name || 'Spieler')}</b><p>${esc(latest.body || '')}</p></div></div>` : '';
    const reply = live.replyTo ? `<div class="live-chat-replying">Antwort an <b>${esc(live.replyTo.sender_name)}</b><span>${esc(live.replyTo.body).slice(0,70)}</span><button type="button" onclick="clearLiveReply()" aria-label="Antwort abbrechen">×</button></div>` : '';
    return `${floating}<section class="live-chat ${live.chatOpen ? 'is-open' : ''}"><button type="button" class="live-chat-toggle" onclick="toggleLiveChat()" aria-expanded="${live.chatOpen ? 'true' : 'false'}">💬 Klassen-Chat <span>${messages.length}</span> ${live.chatOpen ? '▾' : '▴'}</button>${live.chatOpen ? `<div class="live-chat-panel"><div class="live-chat-messages" id="liveChatMessages">${body}</div><div class="live-chat-quick">${quick.map(q => `<button type="button" onclick='sendLiveMessage(${JSON.stringify(q)})'>${esc(q)}</button>`).join('')}</div>${reply}<form class="live-chat-compose" onsubmit="event.preventDefault();sendLiveMessage()"><input id="liveChatInput" maxlength="180" autocomplete="off" placeholder="Nachricht schreiben …" aria-label="Nachricht schreiben"><button type="submit" ${live.chatSending ? 'disabled' : ''}>Senden</button></form></div>` : ''}</section>`;
}
function replyLiveMessage(id) {
    const message = (live.chatMessages || []).find(m => Number(m.id) === Number(id));
    if (!message) return;
    live.replyTo = {id:message.id, sender_name:message.sender_name || 'Spieler', body:message.body || ''};
    live.chatOpen = true;
    renderLiveRoom();
    $('liveChatInput')?.focus({preventScroll:true});
}
function clearLiveReply() {
    live.replyTo = null;
    renderLiveRoom();
    $('liveChatInput')?.focus({preventScroll:true});
}
function restoreLiveChatFocus(saved) {
    const log = $('liveChatMessages');
    if (log) log.scrollTop = log.scrollHeight;
    if (!saved || !live.chatOpen) return;
    const input = $('liveChatInput');
    if (!input) return;
    input.value = saved.value;
    input.focus({preventScroll:true});
    if (Number.isInteger(saved.start) && Number.isInteger(saved.end)) input.setSelectionRange(saved.start, saved.end);
}
function toggleLiveReactions() {
    live.reactionsOpen = !live.reactionsOpen;
    if (live.reactionsOpen) live.chatOpen = false;
    renderLiveRoom();
}
function toggleLiveChat() {
    live.chatOpen = !live.chatOpen;
    if (live.chatOpen) live.reactionsOpen = false;
    renderLiveRoom();
}
async function sendLiveMessage(text) {
    if (!live.room || !live.token || !['playing','review'].includes(live.room.status) || live.chatSending) return;
    const input = $('liveChatInput');
    let body = String(text ?? input?.value ?? '').trim().slice(0,180);
    if (!body) { input?.focus(); return; }
    if (live.replyTo) {
        const prefix = `↪ ${live.replyTo.sender_name}: `;
        body = (prefix + body).slice(0,180);
    }
    live.chatSending = true;
    try {
        const sb = await getSb();
        const { error } = await sb.rpc('mm_live_send_message', { p_code: live.room.code, p_token: live.token, p_message: body });
        if (error) throw error;
        if (input) input.value = '';
        live.replyTo = null;
        await refreshLive();
    } catch (e) {
        showToast(e.message || 'Nachricht konnte nicht gesendet werden.');
    } finally {
        live.chatSending = false;
        live.renderSignature = null;
        renderLiveRoom();
        $('liveChatInput')?.focus({preventScroll:true});
    }
}
function liveConfigured() {
    return SUPABASE_URL.startsWith('https://')
        && !SUPABASE_URL.includes('PASTE_')
        && SUPABASE_ANON_KEY.length > 20
        && !SUPABASE_ANON_KEY.includes('PASTE_');
}

async function getSb() {
    if (!liveConfigured()) {
        throw new Error('Live-Modus ist noch nicht eingerichtet. Bitte Supabase URL und Publishable Key eintragen und die SQL-Datei ausführen.');
    }
    if (!live.sb) {
        const mod = await import('https://esm.sh/@supabase/supabase-js@2.118.0');
        live.sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
    }
    return live.sb;
}

// Use cryptographically secure randomness for room credentials and room codes.
// Never fall back to Math.random() for security-sensitive identifiers.
function secureRandomInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
        throw new Error('Ungültiger Zufallsbereich.');
    }
    const cryptoApi = window.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
        throw new Error('Sichere Zufallszahlen sind in diesem Browser nicht verfügbar. Bitte öffne MatheMeister über HTTPS in einem aktuellen Browser.');
    }
    const range = 0x100000000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    const values = new Uint32Array(1);
    do { cryptoApi.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % maxExclusive;
}

function token() {
    const cryptoApi = window.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
        const bytes = new Uint8Array(32);
        cryptoApi.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Sichere Sitzungs-Token sind in diesem Browser nicht verfügbar. Bitte nutze HTTPS und einen aktuellen Browser.');
}

async function createLiveRoom() {
    try {
        const sb = await getSb();
        ensureEconomy();
        live.customGame = loadActiveStudioConfig();
        if (live.customGame && Array.isArray(live.customGame.questions) && live.customGame.questions.length) {
          if (live.customGame.shuffleQuestions) live.customGame.questions = shuffle([...live.customGame.questions]);
          $('liveCount').value = String(live.customGame.questions.length);
        }
        const name = ($('hostName').value.trim() || data.name || 'Meister').slice(0, 18);
        const code = String(10000 + secureRandomInt(90000));
        if (live.customGame) localStorage.setItem('mm-live-game-' + code, JSON.stringify(live.customGame));
        const hostToken = token();
        const hostPlayerToken = ($('liveDisplayMode').value === 'friends' && $('hostPlayToggle').checked) ? token() : null;
        const questionCount = Number($('liveCount').value);
        const secondsPerQuestion = Number($('liveSeconds').value);
        const teamMode = $('liveGameMode').value === 'team';
        const teamAssignment = teamMode ? $('liveTeamAssignment').value : 'random';
        const teamCount = teamMode ? Number($('liveTeamCount').value) : 2;
        const displayMode = $('liveDisplayMode').value || 'friends';
        const scoringMode = $('liveScoringMode')?.value || 'classic';
        const hostPlays = Boolean(hostPlayerToken);
        const { data: room, error } = await sb.rpc('mm_create_room_v4', {
            p_code: code, p_host_token: hostToken, p_host_name: name,
            p_question_count: questionCount, p_seconds_per_question: secondsPerQuestion,
            p_team_mode: teamMode, p_team_assignment: teamAssignment, p_team_count: teamCount,
            p_display_mode: displayMode, p_scoring_mode: scoringMode, p_host_plays: hostPlays, p_host_player_token: hostPlayerToken
        });
        if (error) throw error;
        live.room = room;
        live.player = { room_code: code, token: hostPlayerToken, nickname: name, avatar: data.avatar || '🦊', frame_id: data.equippedFrame || 'frame_basic', profile_title: data.equippedTitle || 'title_none', profile_level: currentLevel() };
        live.players = [];
        live.host = true;
        live.hostPlaying = hostPlays;
        live.hostPlayerToken = hostPlayerToken;
        live.displayMode = displayMode;
        live.token = hostToken;
        live.qrOpen = false;
        if (hostPlays) {
            const chosenTeam = teamMode && teamAssignment === 'choose' ? Number($('liveHostTeam').value || 1) : null;
            const { error: joinError } = await sb.rpc('mm_join_room_v4', {
                p_code: code, p_token: hostPlayerToken, p_nickname: name,
                p_team_number: chosenTeam, p_avatar: data.avatar || '🦊',
                p_frame_id: data.equippedFrame || 'frame_basic',
                p_profile_title: data.equippedTitle || 'title_none', p_profile_level: currentLevel()
            });
            if (joinError) throw joinError;
        }
        localStorage.setItem('mm-live-session-v4', JSON.stringify({kind:'host',code,token:hostToken,playerToken:hostPlayerToken,hostPlaying:hostPlays,displayMode,difficulty:$('liveDifficulty').value||'medium',name,avatar:data.avatar||'🦊'}));
        await subscribeRoom();
        renderLiveRoom();
        showToast(hostPlays ? 'Raum erstellt – du bist auch als Spieler dabei!' : 'Spielraum erstellt! Teile QR-Code oder Spielcode.');
    } catch (e) {
        showToast(e.message || 'Raum konnte nicht erstellt werden.');
        $('liveNotice').textContent = 'Fehler: ' + (e.message || 'Unbekannter Fehler');
    }
}
async function joinLiveRoom() {
    if (live.joining) return;
    live.joining = true;
    const joinButton = document.querySelector('[onclick="joinLiveRoom()"]');
    if (joinButton) { joinButton.disabled = true; joinButton.dataset.oldText = joinButton.textContent; joinButton.textContent = 'Bitte warten …'; }
    try {
        const sb = await getSb();
        const code = $('joinCode').value.trim();
        if (!/^\d{5}$/.test(code)) { showToast('Bitte einen 5-stelligen Code eingeben.'); return; }
        await checkJoinRoomSettings();
        if (!live.joinRoomInfo || live.joinRoomInfo.status === 'finished' || live.joinRoomInfo.join_open === false) {
            showToast('Du kannst diesem Spiel gerade nicht beitreten.'); return;
        }
        const name = ($('joinName').value.trim() || data.name || 'Spieler').slice(0, 18);
        const playerToken = token();
        ensureEconomy();
        const chosenTeam = live.joinRoomInfo && live.joinRoomInfo.team_mode && live.joinRoomInfo.team_assignment === 'choose' ? Number($('joinTeam').value || 1) : null;
        const { data: room, error } = await sb.rpc('mm_join_room_v4', {
            p_code: code, p_token: playerToken, p_nickname: name, p_team_number: chosenTeam,
            p_avatar: data.avatar || '🦊', p_frame_id: data.equippedFrame || 'frame_basic',
            p_profile_title: data.equippedTitle || 'title_none', p_profile_level: currentLevel()
        });
        if (error) throw error;
        live.room = room;
        live.player = { room_code: code, token: playerToken, nickname: name, avatar: data.avatar || '🦊', frame_id: data.equippedFrame || 'frame_basic', profile_title: data.equippedTitle || 'title_none', profile_level: currentLevel(), team_number: room.joined_team, active:true };
        live.players = [];
        live.host = false; live.hostPlaying = false; live.hostPlayerToken = null;
        live.displayMode = room.display_mode || live.joinRoomInfo.display_mode || 'friends';
        live.token = playerToken;
        localStorage.setItem('mm-live-session-v4', JSON.stringify({kind:'player',code,token:playerToken,name,avatar:data.avatar||'🦊'}));
        await subscribeRoom();
        renderLiveRoom();
        showToast(room.team_mode ? (room.team_assignment === 'random' ? 'Du bist dabei! Das Spiel teilt dich einem Team zu.' : `Du bist ${teamName(chosenTeam)} beigetreten!`) : 'Du bist beigetreten!');
    } catch (e) {
        showToast(e.message || 'Beitreten fehlgeschlagen.');
        $('liveNotice').textContent = 'Fehler: ' + (e.message || 'Unbekannter Fehler');
    } finally {
        live.joining = false;
        if (joinButton) { joinButton.disabled = false; joinButton.textContent = joinButton.dataset.oldText || 'Beitreten'; }
    }
}
async function subscribeRoom() {
    const sb = await getSb();
    if (live.subscription) {
        await sb.removeChannel(live.subscription);
        live.subscription = null;
    }
    if (live.poll) clearInterval(live.poll);
    if (live.timerInterval) clearInterval(live.timerInterval);
    live.renderSignature = null;
    await refreshLive();
    live.timerInterval = setInterval(updateLiveTimer, 250);
    live.poll = setInterval(async () => {
        try {
            await refreshLive();
            if (live.host) await hostTick();
        } catch (e) {
            // Kleine Netzwerkunterbrechungen werden beim nächsten Poll erneut versucht.
        }
    }, 1000);
}

async function refreshLive() {
    if (!live.sb || !live.room || !live.token) return;
    const { data, error } = await live.sb.rpc('mm_live_state_v4', { p_code: live.room.code, p_token: live.token });
    if (error) throw error;
    try {
        const activityResult = await live.sb.rpc('mm_live_activity_state', { p_code: live.room.code, p_token: live.token });
        if (activityResult.error) throw activityResult.error;
        live.chatMessages = Array.isArray(activityResult.data?.messages) ? activityResult.data.messages : [];
        live.reactionFeed = Array.isArray(activityResult.data?.reactions) ? activityResult.data.reactions : [];
        live.activityAvailable = true;
    } catch (activityError) {
        live.activityAvailable = false;
        live.chatMessages = [];
        live.reactionFeed = [];
    }
    if (data && data.room) live.room = data.room;
    live.players = data && Array.isArray(data.players) ? data.players : [];
    live.playerAhead = data?.player_ahead || null;
    live.teamTotals = data?.team_totals || [];
    live.answerCounts = data?.answer_counts || [];
    if (live.room && live.room.status === 'finished') {
      // The final podium is not a continuation of the last-question review.
      live.room = {...live.room, q_a:null, q_b:null, options:[], correct_answer:null};
      live.answerCounts = [];
    }
    live.joinOpen = data?.room?.join_open !== false;
    if (live.hostPlaying) {
        const own = live.players.find(p=>p.is_self);
        if (own) live.player = {...live.player,...own,token:live.hostPlayerToken};
    }
    const signature = JSON.stringify([live.room, live.players, live.playerAhead, live.teamTotals, live.answerCounts, live.chatMessages, live.reactionFeed, live.activityAvailable]);
    if (live.room && live.room.status === 'review' && (!live.host || live.hostPlaying)) rewardLiveQuestion();
    if (signature !== live.renderSignature) {
        live.renderSignature = signature;
        renderLiveRoom();
    }
    updateLiveTimer();
    if (live.room && live.room.status === 'finished' && live.poll) {
        clearInterval(live.poll);
        live.poll = null;
        if (live.timerInterval) { clearInterval(live.timerInterval); live.timerInterval = null; }
    }
}

function updateLiveTimer() {
    if (!live.room || live.room.status !== 'playing' || !live.room.question_ends_at) return;
    const total = Math.max(1, Number(live.room.seconds_per_question) || 15);
    const remaining = Math.max(0, Math.ceil((new Date(live.room.question_ends_at).getTime() - Date.now()) / 1000));
    const pct = Math.max(0, Math.min(100, remaining / total * 100));
    const classroomFill = $('classroomTimerFill');
    if (classroomFill) {
      classroomFill.style.width = `${pct}%`;
      classroomFill.classList.toggle('low', remaining <= 5);
    }
    const text = $('liveTimerText');
    const fill = $('liveTimerFill');
    if (!text || !fill) return;
    text.textContent = `${remaining} Sek.`;
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', remaining <= 5);
}

function renderLiveRoom() {
    const room = live.room;
    if (!room) return;
    const chatInput = $('liveChatInput');
    const savedChatDraft = chatInput && document.activeElement === chatInput ? {value:chatInput.value,start:chatInput.selectionStart,end:chatInput.selectionEnd} : null;
    const liveQuestionIndex = Number(room.question_index) || 0;
    if (live.colorQuestionIndex !== liveQuestionIndex) {
        live.colorQuestionIndex = liveQuestionIndex;
        live.selectedColorIndex = null;
    }
    document.body.classList.add('live-room-active');
    const isClassroomPhone = !live.host && room.display_mode === 'classroom';
    document.body.classList.toggle('classroom-player', isClassroomPhone);
    document.body.classList.toggle('friends-player-lobby', !live.host && room.display_mode === 'friends' && room.status === 'lobby');
    document.body.classList.toggle('friends-player-playing', !live.host && room.display_mode === 'friends' && room.status === 'playing');
    updateGlobalBackButton();
    $('liveStart').classList.add('hidden'); $('liveRoom').classList.remove('hidden');
    ['liveBackBtn','liveKicker','liveHeading','liveIntro','liveNotice'].forEach(id => $(id)?.classList.add('hidden'));
    const players = live.players || [];
    const me = live.hostPlaying ? (players.find(p=>p.is_self) || live.player || {}) : (live.host ? (live.player||{}) : (players.find(p=>p.is_self) || live.player || {}));
    if (me && typeof me === 'object') {
      if (!me.avatar) me.avatar = data.avatar || '🦊';
      if (!me.frame_id) me.frame_id = data.equippedFrame || 'frame_basic';
      if (!me.profile_title) me.profile_title = data.equippedTitle || 'title_none';
      const selfFromState = players.find(p=>p.is_self); if (selfFromState && selfFromState.team_number) me.team_number = selfFromState.team_number;
    }
    const statusLabel = room.status === 'lobby' ? 'Wartet auf Start' : room.status === 'playing' ? 'Frage live' : room.status === 'review' ? 'Ergebnis' : 'Beendet';
    const canAnswer = !live.host || live.hostPlaying;
    const selfState = players.find(p=>p.is_self) || (live.hostPlaying ? live.player : null);
    const isAnswered = !!(selfState && selfState.answered_at);
    let html = `<div class="subpanel live-room-shell ${live.host ? 'is-host' : 'is-player'} ${live.hostPlaying?'host-playing':''}">`;
    if (isClassroomPhone) {
      html += `<div class="classroom-phone-card">`;
      if (room.status === 'lobby') {
        html += `<div class="classroom-awaiting"><div class="wait-orbit" aria-hidden="true">⏳</div><h3>Bereit?</h3><p class="muted">Warte, bis der Gastgeber startet.</p></div>`;
        html += `<button class="btn secondary" type="button" onclick="leaveLiveRoom()">Spiel verlassen</button>`;
      } else if (room.status === 'playing') {
        const total = Math.max(1, Number(room.seconds_per_question) || 15);
        const remaining = Math.max(0, Math.ceil((new Date(room.question_ends_at).getTime() - Date.now()) / 1000));
        const pct = Math.max(0, Math.min(100, remaining / total * 100));
        const colorLocked = isAnswered || (live.colorQuestionIndex === Number(room.question_index) && live.selectedColorIndex !== null);
        html += `<div class="classroom-timer" aria-label="Verbleibende Zeit"><span id="classroomTimerFill" class="${remaining <= 5 ? 'low' : ''}" style="width:${pct}%"></span></div>`;
        html += `<div class="color-answer-grid" role="group" aria-label="Farbfelder zur Antwort">${[0,1,2,3].map(i=>`<button type="button" class="color-answer color-${i}${live.selectedColorIndex===i?' selected':''}" aria-label="${['Rot','Blau','Gelb','Grün'][i]}" ${colorLocked?'disabled':''} onclick="answerLiveColor(${i})"></button>`).join('')}</div>`;
        html += `<div class="classroom-activity-dock">${renderReactions()}${renderLiveChat()}${renderReactionFeed()}</div>`;
      } else if (room.status === 'review') {
        const answeredThisQuestion = Boolean(selfState && (selfState.answered_at || selfState.answer !== null && selfState.answer !== undefined));
        html += `<div class="classroom-awaiting"><div class="wait-orbit" aria-hidden="true">${answeredThisQuestion?'⌛':'⏱️'}</div><h3>${answeredThisQuestion?'Antwort abgegeben':'Zeit abgelaufen'}</h3><p class="muted">Schau auf den Bildschirm der Klasse. Die Auswertung startet gleich mit der nächsten Frage.</p></div>`;
        html += `<button class="btn secondary" type="button" onclick="leaveLiveRoom()">Spiel verlassen</button>`;
        html += `<div class="classroom-activity-dock">${renderReactions()}${renderLiveChat()}${renderReactionFeed()}</div>`;
      } else {
        html += `<div class="classroom-awaiting"><div class="wait-orbit" aria-hidden="true">🏁</div><h3>Spiel beendet!</h3><p class="muted">Danke fürs Mitspielen. Schau auf den Bildschirm der Klasse für die Siegerehrung.</p></div>`;
        html += `<button class="btn secondary" type="button" onclick="leaveLiveRoom()">Spiel verlassen</button>`;
      }
      html += `</div></div>`;
      $('liveRoom').innerHTML = html; restoreLiveChatFocus(savedChatDraft); return;
    }
    html += `<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap"><div><span class="kicker">LIVE-MODUS</span><h3 style="margin:5px 0">${room.team_mode?'👥 Team-Wettkampf':'🎮 Einzelspieler-Runde'}</h3><p class="muted" style="font-size:12px;margin:0">${room.display_mode==='classroom'?'🏫 Klassenmodus · Antworten per Farbe': '🌐 Online-Freunde · Frage auf den Geräten'}${room.scoring_mode==='streak'?' · 🔥 Streak Challenge':' · 🏁 Classic'}${room.team_mode?` · ${room.team_count} Teams · ${room.team_assignment==='random'?'Zufällige Verteilung':'Freie Teamwahl'}`:''}</p></div><span class="pill"><i class="dot"></i>${statusLabel}</span></div>`;
    if (live.host) {
      html += `<div class="live-host-codebar"><div><span class="live-host-code-label">SPIELCODE</span><strong>${esc(room.code)}</strong></div><div class="live-host-code-actions"><button class="btn secondary" type="button" onclick="copyRoomCode()">Code kopieren</button><button class="btn secondary" type="button" onclick="copyJoinLink()">Link kopieren</button><button class="btn secondary" type="button" onclick="toggleHostQr()">${live.qrOpen?'QR ausblenden':'QR anzeigen'}</button></div></div>`;
      if (live.qrOpen) html += `<div class="live-host-qr-always"><div id="liveQrAlwaysCode" class="live-qr"></div><div><strong>Mit Handy beitreten</strong><p class="muted" style="font-size:12px">QR-Code bleibt auch während der Runde verfügbar.</p></div></div>`;
      html += `<div class="live-host-tools"><button class="btn secondary" onclick="toggleJoinOpen()">${room.join_open===false?'🔓 Beitritt öffnen':'🔒 Beitritt schließen'}</button><span class="muted" style="font-size:12px;align-self:center">${room.join_open===false?'Neue Spieler können nicht beitreten.':'Späte Beitritte sind erlaubt.'}</span></div>`;
    }
    if (room.status === 'lobby') {
      if (live.host) {
        html += `<div class="live-status-card"><span class="kicker">DIREKT BEITRETEN</span><p class="muted">QR-Code scannen oder den fünfstelligen Code teilen. Der Code bleibt oben jederzeit sichtbar.</p><div class="live-qr-wrap"><div id="liveQrCode" class="live-qr" aria-label="QR-Code zum Beitreten"></div><div><button class="btn secondary" onclick="copyJoinLink()">Beitrittslink kopieren</button><p class="muted" style="font-size:12px">QR funktioniert mit Handykamera.</p></div></div></div>`;
        html += `<div class="live-host-meter">👥 ${players.filter(p=>p.active!==false).length} Spieler bereit · ${Number(room.question_count)} Fragen · ${Number(room.seconds_per_question)} Sekunden je Frage${live.hostPlaying?' · Du spielst mit':''}</div><h3>Spieler im Raum (${players.filter(p=>p.active!==false).length})</h3>`;
        html += renderTeamScores(players.filter(p=>p.active!==false), room);
        html += `<div class="player-list">${players.map(p=>`<div class="player ${p.active===false?'player-inactive':''}"><span>${profileMarkup(p)} ${room.team_mode?teamBadge(p.team_number):''}${p.removed_from_match?' · 🚫 aus Runde entfernt':p.active===false?' · ⏸️ pausiert':''}</span>${liveHostPlayerActions(p)}</div>`).join('')}</div>`;
        const waitingPlayers=players.filter(p=>p.active!==false&&!p.removed_from_match&&(!live.hostPlaying||!p.is_self)).length;
        html += waitingPlayers>0?`<button id="liveStartGameBtn" class="btn purple full" style="margin-top:18px" onclick="startLiveGame()">Spiel starten →</button>`:`<button id="liveStartGameBtn" class="btn purple full" style="margin-top:18px;opacity:.55;cursor:not-allowed" disabled>Warte auf den ersten Mitspieler …</button><p class="muted" style="font-size:12px;text-align:center">Sobald mindestens ein anderer Spieler beigetreten ist, kannst du starten.</p>`;
        html += `<button class="btn danger full" style="margin-top:9px" onclick="cancelLiveRoom()">✕ Spielraum absagen</button>`;
      } else {
        html += liveSelfCard(room, me);
        html += `<div class="live-status-card"><div style="font-size:34px">⏳</div><h3>Du bist dabei!</h3><p class="muted">Warte, bis der Gastgeber die Runde startet.</p></div>`;
        if (room.team_mode) html += `<p class="muted">Dein Team: ${me.team_number?teamBadge(me.team_number):'Wird zugeteilt'}</p>`;
      }
    } else if (room.status === 'playing') {
      const answerButtons = (room.options || []).map((v,i)=>`<button type="button" class="answer color-${i}" ${isAnswered?'disabled':''} onclick="answerLive(${Number(v)})">${Number(v)}</button>`).join('');
      if (canAnswer) html += liveSelfCard(room, {...me,team_number:(selfState&&selfState.team_number)||me.team_number});
      html += `<div class="live-question"><div class="q-label">${live.host?`FRAGE ${room.question_index} / ${Number(room.question_count)}`:`FRAGE ${room.question_index}`}</div><div class="question">${room.q_a} × ${room.q_b} = ?</div>${liveTimerMarkup(room)}`;
      if (canAnswer && room.display_mode==='friends') {
        html += `<p class="muted">Antworte schnell und richtig!</p><div class="answers">${isAnswered?'':answerButtons}</div>${isAnswered?'<div class="live-answer-quiet">⏳</div>':''}`;
        if(selfState) html += `<div class="private-gap-card">Dein Punktestand: <strong>${Number(selfState.score)||0} P.</strong>${live.playerAhead?` · Noch <strong>${Math.max(1,Number(live.playerAhead.score)-Number(selfState.score)+1)} Punkte</strong>, um ${esc(live.playerAhead.nickname)} zu überholen.`:' · Spiele weiter, um in die Top 10 zu kommen!'}</div>`;
      } else if(live.host) html += `<p class="muted">${room.display_mode==='classroom'?'Auf den Handys erscheinen nur vier Farbfelder.':'Die Antwortmöglichkeiten erscheinen auf den Geräten der Spieler.'}</p><div class="answers">${answerButtons}</div>`;
      html += `</div>`;
      if (live.host) {
        const activePlayers=players.filter(p=>p.active!==false&&!p.removed_from_match);
        if(room.display_mode==='classroom') {
          const answered=activePlayers.filter(p=>p.answered_at).length;
          html += `<div class="live-host-meter">📊 ${answered} / ${activePlayers.length} Antworten eingegangen · anonym nach Farbe ausgewertet. Es wird nicht angezeigt, welcher Spieler welche Antwort gewählt hat.</div>`;
        } else {
          const answered=activePlayers.filter(p=>p.answered_at).length;
          html += `<div class="live-host-meter">Antworten eingegangen: ${answered} / ${activePlayers.length}. Die Frage endet sofort, sobald alle aktiven Spieler geantwortet haben.</div>`;
        }
        if(room.team_mode) html += renderTeamScores(activePlayers,room);
        html += `<div class="player-list">${players.map(p=>{const state = p.removed_from_match?'🚫 entfernt':p.active===false?'⏸️ pausiert':room.display_mode==='classroom'?'im Spiel':(p.answered_at?'✅ geantwortet':'… wartet');return `<div class="player ${p.active===false?'player-inactive':''}"><span>${profileMarkup(p)} ${room.team_mode?teamBadge(p.team_number):''} <small class="muted">${state}</small> ${p.reaction?`<span class="live-reaction-float">${esc(p.reaction)}</span>`:''}</span>${liveHostPlayerActions(p)}</div>`;}).join('')}</div>`;
      }
    } else if (room.status === 'review') {
      if (canAnswer) html += liveSelfCard(room,{...me,team_number:(selfState&&selfState.team_number)||me.team_number});
      html += `<div class="questionbox live-review-question"><div class="q-label">ERGEBNIS DER FRAGE${live.host?` ${Number(room.question_index)} / ${Number(room.question_count)}`:''}</div><div class="question">${room.q_a} × ${room.q_b} = ${room.correct_answer}</div><div class="live-answer-feedback">✅ Richtige Antwort: <strong>${Number(room.correct_answer)}</strong></div>`;
      if (room.display_mode==='friends' && (!live.host || live.hostPlaying) && selfState) {
        const given=selfState.answer; const correct=selfState.self_correct===true || Number(given)===Number(room.correct_answer);
        html += `<div class="live-answer-feedback ${correct?'':'wrong'}">${given===null||given===undefined?'⌛ Keine Antwort abgegeben.':correct?'🎉 Deine Antwort war richtig!':'❌ Deine Antwort war falsch.'}</div>`;
      }
      html += `<p class="muted">${room.display_mode==='classroom'?'Klassenmodus: Nur die anonyme Verteilung nach Farbe wird angezeigt.':'Freunde-Modus: Deine eigene Antwort ist privat; der Gastgeber sieht die Einzelergebnisse.'}</p></div>`;
      if (room.team_mode) html += live.host ? renderTeamScores(players.filter(p=>p.active!==false),room) : renderPublicTeamScores(room);
      const counts=live.answerCounts||[];
      if (counts.length && (room.display_mode==='friends' || live.host)) {
        html += renderLiveAnswerDistribution(room, counts, players, room.display_mode==='classroom');
      }
      if (live.host) {
        const hostResultRows = [...players].sort((a,b)=>Number(b.score)-Number(a.score)).map(p=>{
          let stateLabel;
          if (room.display_mode === 'classroom') {
            stateLabel = p.removed_from_match ? '🚫 aus Runde entfernt' : p.active===false ? '⏸ pausiert' : 'im Spiel';
          } else {
            stateLabel = p.answer===Number(room.correct_answer) ? '✅ richtig' : (p.answer===null || p.answer===undefined) ? '⌛ keine Antwort' : '❌ falsch';
          }
          return `<div class="player ${p.active===false?'player-inactive':''}"><span>${profileMarkup(p)} ${room.team_mode?teamBadge(p.team_number):''} <small class="muted">${stateLabel}</small></span>${liveHostPlayerActions(p)}</div>`;
        }).join('');
        html += `<h3>${room.display_mode==='classroom'?'Spielerverwaltung · anonymisierte Auswertung':'Alle Spieler & Ergebnisse'}</h3><div class="player-list">${hostResultRows}</div>`;
      } else {
        const publicPlayers=players.filter(p=>p.is_top_ten);
        html += `<h3 class="live-rank-title">🏆 Top 10</h3><div class="player-list">${publicPlayers.map((p,i)=>`<div class="player"><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} ${profileMarkup(p)} ${room.team_mode?teamBadge(p.team_number):''}</span><b>${Number(p.score)||0} P.</b></div>`).join('')}</div>`;
        if(selfState && !selfState.is_top_ten){html+=`<div class="private-gap-card">Dein Punktestand: <strong>${Number(selfState.score)||0} P.</strong>${live.playerAhead?` · Noch <strong>${Math.max(1,Number(live.playerAhead.score)-Number(selfState.score)+1)} Punkte</strong>, um ${esc(live.playerAhead.nickname)} zu überholen.`:' · Weiter so, du kannst es in die Top 10 schaffen!'}</div>`;}
        else if(selfState){html+=`<div class="private-gap-card">Du bist in den Top 10 · Dein Punktestand: <strong>${Number(selfState.score)||0} P.</strong>${live.playerAhead?` · Abstand nach vorn: ${Math.max(0,Number(live.playerAhead.score)-Number(selfState.score))} Punkte.`:''}</div>`;}
      }
      if (live.host) {
        const isLast=Number(room.question_index)>=Number(room.question_count);
        html += `<button class="btn purple full" style="margin-top:18px" onclick="${isLast?'finishLiveGame()':'nextLiveQuestion()'}">${isLast?'🏆 Meisterschaft anzeigen':'Nächste Frage →'}</button><p class="live-keyboard-hint">Tipp: Eingabetaste ↵ startet die nächste Frage.</p>`;
      } else html += `<p class="muted" style="font-size:12px">Warte auf den Gastgeber für die nächste Frage.</p>`;
    } else if (room.status==='finished' && Number(room.question_index||0)===0) {
      html += `<div class="player-removed-notice"><div class="removed-icon">🚫</div><h2>Der Gastgeber hat den Spielraum abgesagt</h2><p>Diese Runde wurde beendet, bevor sie begonnen hat.</p><button class="btn secondary" onclick="leaveLiveRoom()">Zur Startseite</button></div>`;
    } else {
      if (live.host) {
        html += room.team_mode?renderTeamPodium(players.filter(p=>p.active!==false&&!p.removed_from_match),room):renderSoloPodium(players.filter(p=>p.active!==false&&!p.removed_from_match),{showCorrectCount:room.display_mode==='friends'});
        html += `<button class="btn secondary full" style="margin-top:12px" onclick="downloadFinalReport()">📊 Endrangliste herunterladen (CSV)</button>`;
        html += `<button class="btn purple full" style="margin-top:12px" onclick="leaveLiveRoom()">Neue Runde vorbereiten</button>`;
      } else if (room.team_mode) {
        const winner=(live.teamTotals||[])[0];
        html += `<div class="championship"><div style="font-size:42px">🏆</div><h2>${winner?esc(teamName(winner.team_number))+' gewinnt!':'Spiel beendet!'}</h2><p class="champion-subtitle">Danke fürs Mitspielen!</p>${renderPublicTeamScores(room)}</div>`;
        html += `<h3 class="live-rank-title">🏆 Top 10</h3><div class="player-list">${players.filter(p=>p.is_top_ten).map((p,i)=>`<div class="player"><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} ${profileMarkup(p)}</span><b>${Number(p.score)||0} P.</b></div>`).join('')}</div>`;
      } else {
        html += renderSoloPodium(players.filter(p=>p.active!==false && !p.removed_from_match && p.is_top_ten),{showCorrectCount:room.display_mode==='friends'});
      }
      if (!live.host && selfState && !selfState.is_top_ten) html += `<div class="private-gap-card">Dein Endstand: ${Number(selfState.score)||0} Punkte. Deine genaue Platzierung bleibt privat. Trainiere weiter, um die Top 10 zu knacken!</div>`;
    }
    if (room.status === 'playing' || room.status === 'review') {
      html += `<div class="live-activity-area">${renderReactionFeed()}${renderReactions()}${renderLiveChat()}</div>`;
    }
    if (!(room.status==='lobby' && live.host)) html += `<div class="row live-exit-row" style="margin-top:16px"><button class="btn secondary live-exit-button" onclick="leaveLiveRoom()">← Spiel verlassen</button></div>`;
    html += `</div>`;
    if(room.status==='finished' && data.equippedEffect==='effect_confetti') html += `<div class="mm-confetti" aria-hidden="true">${Array.from({length:36},(_,i)=>`<i style="--confetti-left:${(i*29)%100}%;animation-delay:${(i%9)*-.27}s"></i>`).join('')}</div>`;
    $('liveRoom').innerHTML=html;
    restoreLiveChatFocus(savedChatDraft);
    if(live.host && room.status==='lobby'){
      const qr=$('liveQrCode'); if(qr && window.QRCode){qr.innerHTML='';new QRCode(qr,{text:liveJoinUrl(room.code),width:210,height:210,correctLevel:QRCode.CorrectLevel.H});}
    }
    if(live.host && live.qrOpen){const qr=$('liveQrAlwaysCode');if(qr&&window.QRCode){qr.innerHTML='';new QRCode(qr,{text:liveJoinUrl(room.code),width:150,height:150,correctLevel:QRCode.CorrectLevel.H});}}
    if(!live.host && selfState && selfState.removed_from_match){
      $('liveRoom').innerHTML=`<div class="live-room-shell player-removed-notice"><div class="removed-icon">🚫</div><h2>Du wurdest aus dieser Runde entfernt</h2><p>Dein Punktestand und deine Antworten in dieser Runde wurden zurückgesetzt. Das ist keine permanente Sperre für MatheMeister.</p><p class="muted">Der Gastgeber kann dich wieder zulassen. Lass diese Seite geöffnet; sobald die Freigabe erfolgt, kannst du automatisch weiterspielen.</p><div class="live-timer-track" style="max-width:260px;margin:18px auto"><span style="display:block;width:100%;height:100%;background:var(--orange)"></span></div><small class="muted">Warte auf die Freigabe des Gastgebers …</small></div>`;
    } else if(!live.host && selfState && selfState.active===false){
      $('liveRoom').innerHTML=`<div class="live-room-shell player-removed-notice"><div class="removed-icon">⏸️</div><h2>Du wurdest vorübergehend pausiert</h2><p>Deine bisherigen Punkte und Antworten bleiben erhalten.</p><p class="muted">Nur der Gastgeber kann dich wieder aktivieren. Lass diese Seite geöffnet – oder öffne sie später auf demselben Gerät wieder. Sobald der Gastgeber dich zulässt, geht es automatisch weiter.</p><small class="muted">Warte auf die Freigabe des Gastgebers …</small></div>`;
    }
}

function downloadFinalReport(){
  if(!live.host||!live.room||live.room.status!=='finished')return;
  const classroom=live.room.display_mode==='classroom';
  const players=[...(live.players||[])].filter(p=>p.active!==false&&!p.removed_from_match).sort((a,b)=>Number(b.score)-Number(a.score)||(classroom?0:Number(b.correct_count)-Number(a.correct_count)));
  const rows=classroom
    ? [['Rang','Spieler','Team','Punkte','Status']]
    : [['Rang','Spieler','Titel','Team','Punkte','Richtig','Beste Serie','Aktiv']];
  players.forEach((p,i)=>rows.push(classroom
    ? [i+1,p.nickname,live.room.team_mode?teamName(p.team_number):'Einzel',p.score,p.active===false?'Nein':'Ja']
    : [i+1,p.nickname,titleName(p.profile_title),live.room.team_mode?teamName(p.team_number):'Einzel',p.score,p.correct_count,p.best_streak,p.active===false?'Nein':'Ja']));
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`MatheMeister-Endrangliste-${live.room.code}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function renderLiveAnswerDistribution(room, counts, players, classroomMode) {
  const options = Array.isArray(room.options) ? room.options.map(Number) : [];
  if (!options.length || !Array.isArray(counts)) return '';
  const byValue = new Map(counts.map(c => [Number(c.value), Math.max(0, Number(c.count) || 0)]));
  const countByOption = options.map(v => byValue.get(v) || 0);
  const answeredTotal = countByOption.reduce((a, n) => a + n, 0);
  const activeTotal = Array.isArray(players)
    ? players.filter(p => p.active !== false && !p.removed_from_match).length
    : answeredTotal;
  const denominator = live.host ? Math.max(1, activeTotal) : Math.max(1, answeredTotal);
  const title = classroomMode ? '📊 Antwortverteilung nach Farbe' : '📊 Antwortverteilung';
  const note = classroomMode
    ? 'Jede Farbe entspricht exakt dem Farbfeld auf den Handys. Es werden nur Summen gezeigt – niemals, welcher Spieler welche Antwort gewählt hat.'
    : 'Die Antworten werden anonym zusammengefasst.';
  let out = `<section class="live-distribution-card"><h3>${title}</h3><p class="distribution-note">${note}</p><div class="live-answer-distribution">`;
  options.forEach((value, i) => {
    const count = countByOption[i];
    const pct = Math.max(0, Math.min(100, count / denominator * 100));
    const correct = Number(value) === Number(room.correct_answer);
    const label = classroomMode
      ? `<span class="answer-color-dot color-${i}"></span><b>Farbe ${i + 1}</b><small>${value}${correct ? ' · richtig' : ''}</small>`
      : `<span class="answer-color-dot color-${i}"></span><b>${value}</b>${correct ? '<small>✓ richtig</small>' : ''}`;
    out += `<div class="answer-distribution-row"><div class="answer-distribution-label">${label}</div><div class="answer-distribution-track"><span class="distribution-fill color-${i}" style="width:${pct}%"></span></div><strong>${count}</strong></div>`;
  });
  const missing = live.host ? Math.max(0, activeTotal - answeredTotal) : 0;
  if (live.host && missing > 0) out += `<div class="distribution-no-answer"><span>⏱️ Keine Antwort</span><strong>${missing}</strong></div>`;
  out += `</div><p class="distribution-note" style="margin:10px 0 0">${answeredTotal} Antworten eingegangen${live.host ? ` von ${activeTotal} aktiven Spielern` : ''}.</p></section>`;
  return out;
}

function renderPublicTeamScores(room){
  if(!room.team_mode)return '';
  const teams=live.teamTotals||[];
  if(!teams.length)return '';
  return `<div class="team-score-grid">${teams.map((t,i)=>`<div class="team-score-card"><div class="team-name">${i===0?'🏆 ':''}${teamEmoji(t.team_number)} ${esc(teamName(t.team_number))}</div><div class="team-points">${Number(t.score||0).toLocaleString('de-DE')} P.</div><div class="team-member-count">${Number(t.member_count)||0} Spieler · ${Number(t.correct_count)||0} richtig</div></div>`).join('')}</div>`;
}
function toggleHostQr(){if(!live.host)return;live.qrOpen=!live.qrOpen;live.renderSignature=null;renderLiveRoom();}
async function toggleJoinOpen(){
  if(!live.host||!live.room)return;
  try{const sb=await getSb();const next=live.room.join_open===false;const {error}=await sb.rpc('mm_host_set_join_open',{p_code:live.room.code,p_host_token:live.token,p_join_open:next});if(error)throw error;await refreshLive();showToast(next?'Beitritt ist wieder offen.':'Beitritt wurde geschlossen.');}
  catch(e){showToast('Einstellung konnte nicht geändert werden: '+e.message);}
}
function liveHostPlayerActions(p){
  const points=`<b>${Number(p.score)||0} P.</b>`;
  if(p.is_self)return `<div class="host-action-stack">${points}<span class="muted">Du (Host-Spieler)</span></div>`;
  const id=String(p.id||'').replace(/[^A-Za-z0-9_-]/g,'');
  if(p.removed_from_match)return `<div class="host-action-stack">${points}<button class="btn primary" onclick="restoreRemovedLivePlayer('${id}')">Wieder zulassen (0 Punkte)</button></div>`;
  if(p.active===false)return `<div class="host-action-stack">${points}<button class="btn secondary" onclick="toggleLivePlayer('${id}',true)">Wieder zulassen</button><button class="btn danger" onclick="removeLivePlayerFromMatch('${id}')">Aus Runde entfernen + Punkte löschen</button></div>`;
  return `<div class="host-action-stack">${points}<button class="btn secondary" onclick="toggleLivePlayer('${id}',false)">Vorübergehend entfernen</button><button class="btn danger" onclick="removeLivePlayerFromMatch('${id}')">Aus Runde entfernen</button></div>`;
}
async function toggleLivePlayer(id,active){
  if(!live.host||!live.room)return;
  const player=(live.players||[]).find(p=>String(p.id)===String(id));
  if(active===false){
    const name=player?.nickname||'Dieser Spieler';
    if(!await customConfirm({title:`${name} vorübergehend pausieren?`,message:'Der Spieler wird aus der laufenden Runde genommen. Seine bisherigen Punkte und Antworten bleiben erhalten. Er kann sich nicht selbst reaktivieren – nur du als Gastgeber kannst ihn wieder zulassen.',confirmText:'Vorübergehend pausieren',cancelText:'Abbrechen',icon:'⏸️',tone:'danger'}))return;
  }
  try{const sb=await getSb();const {error}=await sb.rpc('mm_host_set_player_active',{p_code:live.room.code,p_host_token:live.token,p_player_id:String(id),p_active:Boolean(active)});if(error)throw error;await refreshLive();showToast(active?'Spieler ist wieder aktiv.':'Spieler wurde vorübergehend pausiert; Punkte bleiben erhalten.');}
  catch(e){showToast('Spielerstatus konnte nicht geändert werden: '+e.message);}
}
async function removeLivePlayerFromMatch(id,name){
  if(!live.host||!live.room)return;
  const player=(live.players||[]).find(p=>String(p.id)===String(id));
  const label=name||player?.nickname||'Dieser Spieler';
  const status=player?.active===false?'bereits pausiert':'gerade aktiv';
  if(!await customConfirm({title:`${label} aus dieser Runde entfernen?`,message:`${label} ist ${status}. Die Punkte, richtigen Antworten, aktuelle Serie und Antworten dieses Spielers in dieser Runde werden zurückgesetzt. Sein dauerhaftes Profil und frühere Trainingsdaten bleiben erhalten. Du kannst ihn später wieder zulassen – dann startet er in dieser Runde mit 0 Punkten.`,confirmText:'Aus Runde entfernen',cancelText:'Abbrechen',icon:'🚫',tone:'danger'}))return;
  try{const sb=await getSb();const {error}=await sb.rpc('mm_host_remove_player_v5',{p_code:live.room.code,p_host_token:live.token,p_player_id:String(id)});if(error)throw error;await refreshLive();showToast(`${label} wurde aus dieser Runde entfernt. Die Rundepunkte sind zurückgesetzt.`);}
  catch(e){showToast('Entfernen fehlgeschlagen: '+e.message);}
}
async function restoreRemovedLivePlayer(id,name){
  if(!live.host||!live.room)return;
  const label=name||(live.players||[]).find(p=>String(p.id)===String(id))?.nickname||'Der Spieler';
  if(!await customConfirm({title:`${label} wieder zulassen?`,message:'Der Spieler darf wieder in diese Runde. Er startet mit 0 Punkten. Name, Profilrahmen und dauerhafte Fortschritte bleiben erhalten.',confirmText:'Wieder zulassen',cancelText:'Abbrechen',icon:'✅',tone:'primary'}))return;
  try{const sb=await getSb();const {error}=await sb.rpc('mm_host_restore_player_v5',{p_code:live.room.code,p_host_token:live.token,p_player_id:String(id)});if(error)throw error;await refreshLive();showToast(`${label} darf wieder mitspielen – mit 0 Punkten.`);}
  catch(e){showToast('Freigabe nicht möglich: '+e.message);}
}
async function rejoinLiveRoom(){
  if(live.host||!live.room||!live.token)return;
  try{const sb=await getSb();const {error}=await sb.rpc('mm_rejoin_room_v4',{p_code:live.room.code,p_token:live.token});if(error)throw error;await refreshLive();showToast('Du bist wieder dabei – deine Punkte bleiben erhalten.');}
  catch(e){showToast('Beitritt nicht möglich: '+e.message);}
}
function rewardLiveQuestion(){
  if(!live.room||live.room.status!=='review')return;
  const self=live.players.find(p=>p.is_self);if(!self)return;
  ensureEconomy();const key=`${live.room.code}:${live.room.question_index}`;
  if(data.liveRewarded.includes(key))return;
  const right=self.self_correct===true || (self.answer!==null && self.answer!==undefined && live.room.correct_answer!==null && live.room.correct_answer!==undefined && Number(self.answer)===Number(live.room.correct_answer));
  const coins=right?15:(self.answer===null||self.answer===undefined?2:4);
  data.coins=(Number(data.coins)||0)+coins;
  if(data.missionDate!==today()){data.missionDate=today();data.missionProgress={correct:0,played:0,streak:0};data.claimedMissions=[];}
  data.missionProgress=data.missionProgress||{correct:0,played:0,streak:0};
  if(right){data.missionProgress.correct+=1;data.missionProgress.streak=Math.max(Number(data.missionProgress.streak)||0,Number(self.current_streak)||0);}
  if(Number(live.room.question_index)===1)data.missionProgress.played+=1;
  data.liveRewarded.push(key);data.liveRewarded=data.liveRewarded.slice(-500);saveData();
  if(right)showToast(`Richtig! +${coins} Münzen 🪙`);
}
async function restoreLiveSession(){
  if(new URLSearchParams(window.location.search).get('join'))return;
  try{const lastScreen=sessionStorage.getItem(MM_APP_SCREEN_KEY);if(lastScreen&&lastScreen!=='live')return;}catch(_){}
  let saved;try{saved=JSON.parse(localStorage.getItem('mm-live-session-v4')||'null');}catch(_){saved=null;}
  if(!saved||!saved.code||!saved.token)return;
  try{
    const sb=await getSb();
    if(saved.kind==='host'){
      live.host=true;live.token=saved.token;live.hostPlayerToken=saved.playerToken||null;live.hostPlaying=Boolean(saved.hostPlaying);live.displayMode=saved.displayMode||'friends';if($('liveDifficulty'))$('liveDifficulty').value=saved.difficulty||'medium';try{live.customGame=JSON.parse(localStorage.getItem('mm-live-game-'+saved.code)||'null');}catch(_){live.customGame=null;}
      live.player={room_code:saved.code,token:live.hostPlayerToken,nickname:saved.name||data.name,avatar:saved.avatar||data.avatar,frame_id:data.equippedFrame||'frame_basic',profile_title:data.equippedTitle||'title_none',profile_level:currentLevel()};
      live.room={code:saved.code};
    }else{
      // A full removal must remain visible as a waiting screen. Do not erase the session
      // merely because the server correctly refuses automatic re-entry.
      const {data:initialState,error:stateError}=await sb.rpc('mm_live_state_v4',{p_code:saved.code,p_token:saved.token});
      if(stateError)throw stateError;
      const selfRow=(initialState?.players||[]).find(p=>p.is_self);
      const hostBlocked=Boolean(selfRow&&(selfRow.removed_from_match||selfRow.active===false));
      if(!hostBlocked){const {error:rejoinError}=await sb.rpc('mm_rejoin_room_v4',{p_code:saved.code,p_token:saved.token});if(rejoinError)throw rejoinError;}
      live.host=false;live.token=saved.token;live.player={room_code:saved.code,token:saved.token,nickname:saved.name||data.name,avatar:saved.avatar||data.avatar};live.room={code:saved.code};
    }
    live.sb=sb;await subscribeRoom();show('live');showToast('Du bist wieder mit deiner Runde verbunden.');
  }catch(e){
    // Preserve the saved session on refresh/network failures. A temporary offline state
    // must not silently destroy the player's ability to reconnect to the same room.
    live.room=null;live.token=null;live.host=false;live.player=null;
    showToast('Verbindung konnte noch nicht wiederhergestellt werden. Bitte Internet prüfen und Seite neu laden.');
  }
}

function copyRoomCode() {
    if (!live.room || !live.host) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast('Spielcode: ' + live.room.code);
        return;
    }
    navigator.clipboard.writeText(live.room.code)
        .then(() => showToast('Spielcode kopiert: ' + live.room.code))
        .catch(() => showToast('Spielcode: ' + live.room.code));
}

async function copyJoinLink() {
    if (!live.room || !live.host) return;
    const link = liveJoinUrl(live.room.code);
    try {
        await navigator.clipboard.writeText(link);
        showToast('Beitrittslink kopiert.');
    } catch (_) {
        await showLinkDialog('Beitrittslink teilen',link,'Link kopieren');
    }
}

async function startLiveGame() {
    if (!live.host || !live.room || live.room.status!=='lobby') return;
    const readyPlayers=(live.players||[]).filter(p=>p.active!==false&&!p.removed_from_match&&(!live.hostPlaying||!p.is_self));
    if(readyPlayers.length<1){showToast('Warte, bis mindestens ein Mitspieler beigetreten ist.');return;}
    try {
        await setNextLiveQuestion(1);
    } catch (e) {
        showToast('Spiel konnte nicht gestartet werden: ' + e.message);
        $('liveNotice').textContent = 'Fehler: ' + e.message;
    }
}

function liveQuestion() {
    const level = $('liveDifficulty')?.value || 'medium';
    const max = level === 'easy' ? 5 : level === 'hard' ? 20 : 10;
    const a = rng(max);
    const b = rng(max);
    const answer = a * b;
    return { a, b, answer, options: makeOptions(answer, max) };
}

function makeCustomAnswerOptions(answer) {
    const set=new Set([Number(answer)]);let guard=0;
    while(set.size<4&&guard++<200){const offset=Math.floor(Math.random()*19)-9;let value=Number(answer)+offset;if(value===Number(answer))value+=Math.random()<.5?2:-2;if(value<1)value=Number(answer)+Math.abs(offset)+1;if(value!==Number(answer))set.add(value);}
    let n=1;while(set.size<4){if(n!==Number(answer))set.add(n);n++;}
    return shuffle([...set]);
}
async function setNextLiveQuestion(index) {
    const sb = await getSb();
    let q;
    const customList = live.customGame && Array.isArray(live.customGame.questions) ? live.customGame.questions : [];
    if (customList.length) {
      const item=customList[index-1];
      if(!item) throw new Error('Für diese Fragennummer wurde keine eigene Aufgabe gefunden. Bitte prüfe deine Spielvorlage.');
      q={a:Number(item.a),b:Number(item.b),answer:Number(item.a)*Number(item.b)};
      q.options=makeCustomAnswerOptions(q.answer);
    } else q = liveQuestion();
    const seconds = Number(live.room.seconds_per_question || $('liveSeconds').value || 10);
    const ends = new Date(Date.now() + seconds * 1000).toISOString();
    const { error } = await sb.rpc('mm_host_set_question', {
        p_code: live.room.code,
        p_host_token: live.token,
        p_index: index,
        p_q_a: q.a,
        p_q_b: q.b,
        p_options: q.options,
        p_correct_answer: q.answer,
        p_question_ends_at: ends
    });
    if (error) throw error;
    await refreshLive();
}

async function answerLive(value) {
    if (!live.room || (live.host && !live.hostPlaying) || live.room.status !== 'playing') return;
    const sb = await getSb();
    const answerToken = live.hostPlaying ? live.hostPlayerToken : live.token;
    const { error } = await sb.rpc('mm_live_answer', { p_code: live.room.code, p_token: answerToken, p_answer: Number(value) });
    if (error) showToast(error.message);
    else await refreshLive(); // Absichtlich keine störende Bestätigungsnachricht.
}
async function answerLiveColor(optionIndex) {
    if (!live.room || live.room.display_mode !== 'classroom' || live.room.status !== 'playing' || (live.host && !live.hostPlaying)) return;
    if (live.selectedColorIndex !== null && live.colorQuestionIndex === Number(live.room.question_index)) return;
    live.colorQuestionIndex = Number(live.room.question_index);
    live.selectedColorIndex = Number(optionIndex);
    live.renderSignature = null;
    renderLiveRoom();
    try {
      const sb = await getSb();
      const answerToken = live.hostPlaying ? live.hostPlayerToken : live.token;
      const { error } = await sb.rpc('mm_live_answer_color', { p_code: live.room.code, p_token: answerToken, p_option_index: Number(optionIndex) });
      if (error) throw error;
      await refreshLive();
    } catch (e) {
      live.selectedColorIndex = null;
      live.renderSignature = null;
      renderLiveRoom();
      showToast(e.message || 'Antwort konnte nicht gesendet werden.');
    }
}

async function hostTick() {
    if (live.advancing || !live.room || !live.host || live.room.status !== 'playing') return;
    live.advancing = true;
    try {
        const { error } = await live.sb.rpc('mm_host_tick', {
            p_code: live.room.code,
            p_host_token: live.token
        });
        if (error) throw error;
        await refreshLive();
    } catch (e) {
        showToast('Live-Spiel: ' + e.message);
    } finally {
        live.advancing = false;
    }
}

async function nextLiveQuestion() {
    if (!live.host || !live.room || live.room.status !== 'review') return;
    try {
        const nextIndex = Number(live.room.question_index) + 1;
        await setNextLiveQuestion(nextIndex);
    } catch (e) {
        showToast('Nächste Frage konnte nicht gestartet werden: ' + e.message);
    }
}

async function finishLiveGame() {
    if (!live.host || !live.room || live.room.status !== 'review' || Number(live.room.question_index) < Number(live.room.question_count)) return;
    try {
        const sb = await getSb();
        const { error } = await sb.rpc('mm_host_finish_room', { p_code: live.room.code, p_host_token: live.token });
        if (error) throw error;
        await refreshLive();
    } catch (e) {
        showToast('Abschluss fehlgeschlagen: ' + (e.message || 'Unbekannter Fehler'));
    }
}
async function sendLiveReaction(reaction) {
    if (!live.room || (live.host && !live.hostPlaying) || !['playing','review'].includes(live.room.status) || !REACTIONS.includes(reaction)) return;
    try {
        const sb = await getSb();
        const reactionToken = live.hostPlaying ? live.hostPlayerToken : live.token;
        const { error } = await sb.rpc('mm_live_react', { p_code: live.room.code, p_token: reactionToken, p_reaction: reaction });
        if (error) throw error;
        live.reactionsOpen = false;
        await refreshLive();
    } catch (e) {
        showToast('Reaktion konnte nicht gesendet werden.');
    }
}

async function cancelLiveRoom(){
  if(!live.host||!live.room||live.room.status!=='lobby')return;
  const code=live.room.code;
  if(!await customConfirm({title:'Spielraum wirklich absagen?',message:'Der Warteraum wird geschlossen. Alle bereits beigetretenen Spieler sehen, dass die Runde abgesagt wurde. Du kannst danach einen neuen Raum erstellen.',confirmText:'Spielraum absagen',cancelText:'Weiter warten',icon:'🚫',tone:'danger'}))return;
  try{
    const sb=await getSb();
    const {error}=await sb.rpc('mm_host_cancel_room',{p_code:code,p_host_token:live.token});
    if(error)throw error;
    showToast('Der Spielraum wurde abgesagt.');
    await leaveLiveRoom({skipServer:true});
  }catch(error){
    showToast('Der Spielraum konnte nicht abgesagt werden: '+(error.message||'Unbekannter Fehler'));
  }
}

async function leaveLiveRoom(options={}) {
    document.body.classList.remove('live-room-active','classroom-player','friends-player-lobby','friends-player-playing');
    live.reactionsOpen = false;
    if (live.timerInterval) { clearInterval(live.timerInterval); live.timerInterval = null; }
    live.renderSignature = null;
    if (live.poll) {
        clearInterval(live.poll);
        live.poll = null;
    }
    if (live.reviewTimer) {
        clearTimeout(live.reviewTimer);
        live.reviewTimer = null;
    }
    if (live.subscription && live.sb) {
        await live.sb.removeChannel(live.subscription);
        live.subscription = null;
    }
    if (!options.skipServer && live.sb && live.room && live.token) {
        const { error } = await live.sb.rpc('mm_leave_room', {
            p_code: live.room.code,
            p_token: live.token
        });
        if (error) showToast(error.message);
    }
    localStorage.removeItem('mm-live-session-v4');
    if (live.room?.code) localStorage.removeItem('mm-live-game-' + live.room.code);
    live.customGame = null;
    live.chatMessages = []; live.reactionFeed = []; live.chatOpen = false; live.reactionsOpen = false; live.replyTo = null; live.activityAvailable = false;
    live.room = null;
    live.player = null;
    live.host = false;
    live.hostPlaying = false;
    live.hostPlayerToken = null;
    live.displayMode = 'friends';
    live.token = null;
    live.players = [];
    live.joinRoomInfo = null;
    $('liveRoom').classList.add('hidden');
    $('liveStart').classList.remove('hidden');
    ['liveBackBtn','liveKicker','liveHeading','liveIntro','liveNotice'].forEach(id => $(id)?.classList.remove('hidden'));
    show('home');
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.repeat) {
        if ($('game').classList.contains('active') && ['1','2','3','4'].includes(e.key) && !game.answered) {
            const b = document.querySelectorAll('#answers .answer')[Number(e.key) - 1];
            if (b) b.click();
        }
        return;
    }
    const target = e.target;
    if (target && ['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(target.tagName)) return;
    if ($('live').classList.contains('active') && live.host && live.room && live.room.status === 'review') {
        e.preventDefault();
        if (Number(live.room.question_index) >= Number(live.room.question_count)) finishLiveGame();
        else nextLiveQuestion();
        return;
    }
    if ($('game').classList.contains('active') && game.answered && !$('nextBtn').classList.contains('hidden')) nextQuestion();
});


/* v9 — Game Creator: no-code templates, secure client randomness, local drafts, playable previews, import/export. */
const CREATOR_DRAFTS_KEY='mm-game-creator-drafts-v1';
const CREATOR_CURRENT_KEY='mm-game-creator-current-v1';
const CREATOR_META={
 quiz:{title:'Quiz mit Auswahl',icon:'🧠',tag:'Einsteiger',desc:'Vier Antwortmöglichkeiten, Punkte und Erklärungen.',help:'Erstelle Fragen und vier Antwortoptionen. Markiere genau eine richtige Antwort.'},
 truefalse:{title:'Richtig oder falsch',icon:'✅',tag:'Schnell',desc:'Kurze Aussagen, die Spieler bewerten müssen.',help:'Schreibe eine klare Aussage und lege fest, ob sie richtig oder falsch ist.'},
 short:{title:'Freie Texteingabe',icon:'⌨️',tag:'Wissen',desc:'Spieler tippen das Wort oder die Lösung ein.',help:'Du kannst mehrere gültige Antworten mit einem | trennen, zum Beispiel Berlin|berlin.'},
 multi:{title:'Mehrere Antworten',icon:'☑️',tag:'Knifflig',desc:'Mehrere Optionen können gleichzeitig richtig sein.',help:'Markiere jede richtige Option. Spieler müssen die vollständige Auswahl finden.'},
 matching:{title:'Paare zuordnen',icon:'🔗',tag:'Logik',desc:'Verbinde zusammengehörige Begriffe, Namen oder Bilderbeschreibungen.',help:'Lege linke und rechte Begriffe als Paare an. Spieler wählen passende Seiten nacheinander.'},
 memory:{title:'Memory',icon:'🃏',tag:'Klassiker',desc:'Decke Karten auf und finde passende Paare.',help:'Jede Zeile ist ein Paar. Verwende zum Beispiel ein Wort und seine Bedeutung oder zwei passende Begriffe.'},
 word:{title:'Wortsalat',icon:'🔤',tag:'Wörter',desc:'Entwirre Buchstaben und finde das gesuchte Wort.',help:'Lege das Zielwort und einen Hinweis an. Beim Spielen werden die Buchstaben gemischt.'},
 story:{title:'Entscheidungs-Story',icon:'🗺️',tag:'Kreativ',desc:'Spieler wählen, wie die Geschichte weitergeht.',help:'Jede Karte ist eine Szene. Jede Antwort kann eine Folge oder einen Ausgang der Geschichte zeigen.'},
 sorting:{title:'Reihenfolge-Puzzle',icon:'🧩',tag:'Puzzle',desc:'Ordne Schritte, Ereignisse oder Wörter in die richtige Reihenfolge.',help:'Schreibe die gewünschte Reihenfolge in die Liste. Im Spiel können Spieler die Elemente verschieben.'},
 reaction:{title:'Reaktions-Challenge',icon:'⚡',tag:'Arcade',desc:'Tippe möglichst oft auf das Ziel, bevor die Zeit endet.',help:'Stelle die Herausforderung ein. In dieser Version zählt jeder Klick auf die Zielschaltfläche.'}
};
let creatorDraft=null;
let creatorRun=null;
let creatorRunTimer=null;
let creatorFlipTimer=null;
let creatorCurrentStep=1;
let creatorAutoSaveTimer=null;
const CREATOR_STEP_KEY='mm-game-creator-current-step-v1';
function creatorReadCurrent(){
 try{const raw=JSON.parse(localStorage.getItem(CREATOR_CURRENT_KEY)||'null');if(!raw)return null;return {draft:raw.draft||raw,step:Math.max(1,Math.min(3,Number(raw.step)||1))};}catch(_){return null;}
}
function creatorAutoSaveNow(){
 if(!creatorDraft)return;
 try{
  creatorDraft.updatedAt=new Date().toISOString();
  const snapshot=JSON.parse(JSON.stringify(creatorDraft));
  if(!creatorIsValidConfig(snapshot))return;
  const all=creatorGetDrafts();const i=all.findIndex(d=>d.id===snapshot.id);
  if(i>=0)all[i]=snapshot;else all.unshift(snapshot);
  creatorStoreDrafts(all);
  localStorage.setItem(CREATOR_CURRENT_KEY,JSON.stringify({draft:snapshot,step:creatorCurrentStep}));
  localStorage.setItem(CREATOR_STEP_KEY,String(creatorCurrentStep));
  creatorRenderResumeCard();
  if($('creatorHomePanel')&&!$('creatorHomePanel').classList.contains('hidden'))creatorRenderLibrary();
 }catch(error){console.warn('Game-Creator-Autospeicherung fehlgeschlagen:',error);}
}
function creatorQueueAutoSave(){
 if(!creatorDraft)return;
 if(creatorAutoSaveTimer)clearTimeout(creatorAutoSaveTimer);
 creatorAutoSaveTimer=setTimeout(()=>{creatorAutoSaveTimer=null;creatorAutoSaveNow();},350);
}
function creatorRenderResumeCard(){
 const card=$('creatorResumeCard');if(!card)return;
 const saved=creatorReadCurrent();
 if(!saved||!creatorIsValidConfig(saved.draft)){card.classList.add('hidden');return;}
 $('creatorResumeText').textContent=`„${saved.draft.title||'Mein Spiel'}“ · Schritt ${saved.step} von 3. Dein Entwurf wurde auf diesem Gerät gespeichert.`;
 card.classList.remove('hidden');
}
function creatorResumeLastDraft(){
 const saved=creatorReadCurrent();if(!saved||!creatorIsValidConfig(saved.draft)){showToast('Kein gespeicherter Entwurf gefunden.');return;}
 creatorDraft=JSON.parse(JSON.stringify(saved.draft));creatorCurrentStep=saved.step;
 creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(creatorCurrentStep);
 showToast('Dein Entwurf ist wieder geöffnet.');
}
function creatorNewId(){return 'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function creatorBaseQuestion(type){
 if(type==='quiz')return {prompt:'Welche Antwort ist richtig?',image:'',options:['Antwort A','Antwort B','Antwort C','Antwort D'],correct:0,explanation:'Hier steht die Erklärung.'};
 if(type==='truefalse')return {prompt:'Diese Aussage ist richtig.',image:'',correct:true,explanation:'Schreibe kurz, warum.'};
 if(type==='short')return {prompt:'Wie lautet die Lösung?',image:'',answers:['Beispiel'],hint:'Ein kleiner Tipp'};
 if(type==='multi')return {prompt:'Wähle alle passenden Antworten.',image:'',options:['Auswahl A','Auswahl B','Auswahl C','Auswahl D'],correct:[0,2],explanation:'Nicht nur eine Antwort kann stimmen.'};
 if(type==='word')return {prompt:'Entwirre das Wort.',image:'',word:'PLANET',hint:'Ein Objekt im Weltraum'};
 if(type==='story')return {prompt:'Du stehst vor einer geheimnisvollen Tür. Was machst du?',image:'',options:[{text:'Ich öffne die Tür',outcome:'Du entdeckst einen hellen Raum.'},{text:'Ich suche einen Schlüssel',outcome:'Du findest eine Truhe.'},{text:'Ich gehe zurück',outcome:'Du entdeckst einen geheimen Weg.'},{text:'Ich rufe nach Hilfe',outcome:'Ein Begleiter kommt dazu.'}]};
 if(type==='sorting')return {prompt:'Ordne die Schritte in die richtige Reihenfolge.',image:'',items:['Erster Schritt','Zweiter Schritt','Dritter Schritt','Vierter Schritt']};
 return {prompt:'Neue Aufgabe',image:''};
}
function creatorBasePair(type){if(type==='memory')return {left:'Katze',right:'🐈'};return {left:'Begriff',right:'Passender Begriff'};}
function creatorStarter(type){
 const q=creatorBaseQuestion(type);const p=creatorBasePair(type);
 const cfg={v:2,id:creatorNewId(),title:`Mein ${CREATOR_META[type].title}`,description:'Ein selbst erstelltes Spiel – ändere den Inhalt nach deinen Ideen.',type,theme:'neon',settings:{seconds:20,points:100,lives:3,feedback:'after',shuffle:true,visibility:'link'},questions:[],pairs:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(['matching','memory'].includes(type))cfg.pairs=[p,{left:'Hund',right:type==='memory'?'🐕':'Treues Haustier'},{left:'Sonne',right:type==='memory'?'☀️':'Unser Stern' }];
 else if(type==='reaction')cfg.challenge='Tippe so oft du kannst!';
 else cfg.questions=[q,{...JSON.parse(JSON.stringify(q)),prompt:type==='story'?'Du findest einen Wegweiser. Wohin gehst du?':q.prompt+' (2)',...(type==='quiz'?{options:['Option 1','Option 2','Option 3','Option 4'],correct:1}:{})}];
 return cfg;
}
function creatorGetDrafts(){try{const a=JSON.parse(localStorage.getItem(CREATOR_DRAFTS_KEY)||'[]');return Array.isArray(a)?a.filter(creatorIsValidConfig).slice(0,30):[]}catch(_){return []}}
function creatorStoreDrafts(a){localStorage.setItem(CREATOR_DRAFTS_KEY,JSON.stringify(a.slice(0,30)))}
function creatorIsValidConfig(c){return !!c&&c.v===2&&typeof c.id==='string'&&/^[a-z0-9_-]{1,80}$/i.test(c.id)&&typeof c.title==='string'&&CREATOR_META[c.type]&&Array.isArray(c.questions)&&Array.isArray(c.pairs)&&c.questions.length<=100&&c.pairs.length<=60}
function creatorSanitizeConfig(c){
 if(!c||c.v!==2||!CREATOR_META[c.type])throw new Error('Unbekannter Spieltyp oder ungültige Datei.');
 const cfg={v:2,id:typeof c.id==='string'?c.id.slice(0,80):creatorNewId(),title:String(c.title||'Mein Spiel').trim().slice(0,70),description:String(c.description||'').slice(0,500),type:c.type,theme:['neon','ocean','sunset','forest','candy'].includes(c.theme)?c.theme:'neon',settings:{seconds:Math.max(5,Math.min(180,Number(c.settings?.seconds)||20)),points:Math.max(0,Math.min(10000,Number(c.settings?.points??100)||0)),lives:[1,2,3,99].includes(Number(c.settings?.lives))?Number(c.settings.lives):3,feedback:['after','end','never'].includes(c.settings?.feedback)?c.settings.feedback:'after',shuffle:c.settings?.shuffle!==false,visibility:c.settings?.visibility==='private'?'private':'link'},questions:[],pairs:[],createdAt:String(c.createdAt||new Date().toISOString()),updatedAt:new Date().toISOString()};
 const cleanText=(x,max=1000)=>String(x??'').trim().slice(0,max);
 if(Array.isArray(c.questions))cfg.questions=c.questions.slice(0,100).map(q=>{
  const o={prompt:cleanText(q.prompt,500),image:cleanText(q.image,500)};
  if(c.type==='quiz'){o.options=Array.isArray(q.options)?q.options.slice(0,4).map(x=>cleanText(x,180)):['A','B','C','D'];while(o.options.length<4)o.options.push('Option');o.correct=Math.max(0,Math.min(3,Number(q.correct)||0));o.explanation=cleanText(q.explanation,500)}
  if(c.type==='truefalse'){o.correct=Boolean(q.correct);o.explanation=cleanText(q.explanation,500)}
  if(c.type==='short'){o.answers=Array.isArray(q.answers)?q.answers.slice(0,10).map(x=>cleanText(x,150)).filter(Boolean):[];o.hint=cleanText(q.hint,250)}
  if(c.type==='multi'){o.options=Array.isArray(q.options)?q.options.slice(0,4).map(x=>cleanText(x,180)):['A','B','C','D'];while(o.options.length<4)o.options.push('Option');o.correct=Array.isArray(q.correct)?[...new Set(q.correct.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<4))]:[0];o.explanation=cleanText(q.explanation,500)}
  if(c.type==='word'){o.word=cleanText(q.word,80).replace(/\s/g,'');o.hint=cleanText(q.hint,250)}
  if(c.type==='story'){o.options=Array.isArray(q.options)?q.options.slice(0,4).map(x=>({text:cleanText(x.text,180),outcome:cleanText(x.outcome,350)})):[{text:'Weiter',outcome:'Die Geschichte geht weiter.'}];while(o.options.length<2)o.options.push({text:'Weitere Möglichkeit',outcome:'Du gehst weiter.'})}
  if(c.type==='sorting'){o.items=Array.isArray(q.items)?q.items.slice(0,12).map(x=>cleanText(x,180)).filter(Boolean):[]}
  return o;
 });
 if(Array.isArray(c.pairs))cfg.pairs=c.pairs.slice(0,60).map(p=>({left:cleanText(p.left,180),right:cleanText(p.right,180)}));
 cfg.challenge=cleanText(c.challenge||'Tippe so oft du kannst!',160);
 if(!cfg.title)cfg.title='Mein Spiel';
 if(['quiz','truefalse','short','multi','word','story','sorting'].includes(cfg.type)&&!cfg.questions.length)throw new Error('Füge mindestens eine Aufgabe hinzu.');
 if(['matching','memory'].includes(cfg.type)&&cfg.pairs.length<2)throw new Error('Füge mindestens zwei Paare hinzu.');
 if(cfg.type==='quiz'&&cfg.questions.some(q=>!q.prompt||q.options.filter(Boolean).length<2))throw new Error('Jede Quizfrage braucht eine Frage und Antwortoptionen.');
 if(cfg.type==='short'&&cfg.questions.some(q=>!q.prompt||!q.answers.length))throw new Error('Jede Texteingabe-Aufgabe braucht mindestens eine gültige Antwort.');
 if(cfg.type==='word'&&cfg.questions.some(q=>!q.word||q.word.length<2))throw new Error('Jedes Wort muss mindestens zwei Buchstaben haben.');
 if(cfg.type==='multi'&&cfg.questions.some(q=>!q.correct.length))throw new Error('Markiere pro Mehrfachauswahl mindestens eine richtige Antwort.');
 if(cfg.type==='sorting'&&cfg.questions.some(q=>q.items.length<2))throw new Error('Jede Sortieraufgabe braucht mindestens zwei Elemente.');
 if(['matching','memory'].includes(cfg.type)&&cfg.pairs.some(p=>!p.left||!p.right))throw new Error('Fülle beide Seiten jedes Paares aus.');
 return cfg;
}
function creatorRenderTemplateGrid(){
 const grid=$('creatorTemplateGrid');if(!grid)return;
 grid.innerHTML=Object.entries(CREATOR_META).map(([type,m])=>`<button type="button" class="creator-template" onclick="creatorStartNew('${type}')"><span class="template-label">${m.tag}</span><span class="template-icon">${m.icon}</span><strong>${m.title}</strong><small>${m.desc}</small></button>`).join('');
}
function creatorRenderLibrary(){
 const root=$('creatorDraftLibrary');if(!root)return;const drafts=creatorGetDrafts();
 if(!drafts.length){root.innerHTML='<div class="creator-empty" style="grid-column:1/-1">Noch keine Entwürfe gespeichert.<br>Wähle oben einen Starttyp und speichere dein erstes Spiel. 🎮</div>';return;}
 root.innerHTML=drafts.map(d=>`<article class="creator-draft-card"><div class="creator-draft-top"><div class="creator-draft-icon">${CREATOR_META[d.type].icon}</div><div style="min-width:0;flex:1"><h4>${esc(d.title)}</h4><p>${esc(CREATOR_META[d.type].title)} · ${d.type==='matching'||d.type==='memory'?d.pairs.length+' Paare':d.type==='reaction'?'Reaktionsmodus':d.questions.length+' Inhalte'} · ${Number(d.settings.seconds)||20} Sek.</p><p style="margin-top:5px">${esc(d.description||'Keine Beschreibung')}</p></div></div><div class="creator-draft-actions"><button class="btn secondary" type="button" onclick="creatorOpenDraft('${d.id}')">✏️ Bearbeiten</button><button class="btn secondary" type="button" onclick="creatorPlayDraft('${d.id}')">▶ Testen</button><button class="btn secondary" type="button" onclick="creatorShareDraft('${d.id}')">🔗 Teilen</button><button class="btn secondary" type="button" onclick="creatorDeleteDraft('${d.id}')">🗑️</button></div></article>`).join('');
}
function creatorStartNew(type){creatorAutoSaveNow();creatorDraft=creatorStarter(type);creatorCurrentStep=1;$('creatorHomePanel').classList.add('hidden');$('creatorEditorPanel').classList.remove('hidden');$('creatorPlayPanel').classList.add('hidden');creatorBindDraftToInputs();creatorGoStep(1);creatorAutoSaveNow();creatorRenderLibrary();}
function creatorIdeaTopic(text){
 const t=text.toLocaleLowerCase('de');
 const banks=[
  {key:/fußball|fussball|soccer|bundesliga|ball/,name:'Fußball',questions:[
   ['Wie viele Spieler einer Mannschaft stehen normalerweise zu Beginn auf dem Feld?',['9','10','11','12'],2,'Eine Mannschaft spielt normalerweise mit elf Spielern.'],
   ['Wie heißt der Spieler, der das Tor verteidigt?',['Stürmer','Torwart','Schiedsrichter','Trainer'],1,'Der Torwart schützt das Tor.'],
   ['Wie lange dauert ein reguläres Fußballspiel ohne Nachspielzeit?',['60 Minuten','90 Minuten','100 Minuten','120 Minuten'],1,'Ein reguläres Spiel dauert 90 Minuten.'] ]},
  {key:/tier|tiere|hund|katze|natur|zoo/,name:'Tiere',questions:[
   ['Welches Tier sagt „Miau“?',['Hund','Katze','Pferd','Kuh'],1,'Eine Katze miaut.'],
   ['Welches Tier hat einen sehr langen Hals?',['Elefant','Giraffe','Fuchs','Pinguin'],1,'Die Giraffe hat einen langen Hals.'],
   ['Wo lebt ein Fisch?',['Im Wasser','Im Baum','In der Wüste','Im Schnee'],0,'Fische leben im Wasser.'] ]},
  {key:/weltraum|planeten|planet|sonne|mond|universum|all/,name:'Weltraum',questions:[
   ['Welcher Planet ist unser Zuhause?',['Mars','Erde','Jupiter','Venus'],1,'Wir leben auf der Erde.'],
   ['Was gibt uns am Tag Licht und Wärme?',['Der Mond','Die Sonne','Der Mars','Ein Sternbild'],1,'Die Sonne gibt uns Licht und Wärme.'],
   ['Welcher Planet ist als roter Planet bekannt?',['Mars','Saturn','Neptun','Merkur'],0,'Der Mars wird roter Planet genannt.'] ]},
  {key:/mathe|mathematik|einmaleins|rechnen|zahlen|multipli|malnehmen/,name:'Mathe',questions:[
   ['Was ist 5 × 5?',['10','20','25','30'],2,'5 mal 5 ist 25.'],
   ['Was ist 8 × 3?',['21','24','27','32'],1,'8 mal 3 ist 24.'],
   ['Was ist 9 + 6?',['14','15','16','17'],1,'9 plus 6 ist 15.'] ]},
  {key:/geografie|geographie|länder|land|hauptstadt|welt/,name:'Geografie',questions:[
   ['Wie heißt die Hauptstadt von Deutschland?',['Berlin','München','Hamburg','Köln'],0,'Berlin ist die Hauptstadt von Deutschland.'],
   ['In welchem Land steht der Eiffelturm?',['Italien','Frankreich','Spanien','Deutschland'],1,'Der Eiffelturm steht in Paris.'],
   ['Welcher ist der größte Ozean?',['Atlantik','Indischer Ozean','Pazifik','Arktischer Ozean'],2,'Der Pazifik ist der größte Ozean.'] ]},
  {key:/dinosaur|dino/,name:'Dinosaurier',questions:[
   ['Wie heißt der berühmte Dinosaurier mit den kleinen Armen?',['T-Rex','Triceratops','Stegosaurus','Brachiosaurus'],0,'Der Tyrannosaurus Rex hatte kurze Arme.'],
   ['Was bedeutet „Dinosaurier“ ungefähr?',['Riesenechse','Schneller Vogel','Meeresfisch','Fliegender Hund'],0,'Das Wort kommt aus dem Griechischen und bedeutet schreckliche Echse.'],
   ['Wann lebten Dinosaurier?',['Vor langer Zeit','Im Mittelalter','Vor 100 Jahren','Heute überall'],0,'Dinosaurier lebten vor Millionen Jahren.'] ]}
 ];
 return banks.find(x=>x.key.test(t))||null;
}
function creatorUseIdea(){
 const idea=$('creatorIdeaInput').value.trim();if(!idea){showToast('Schreibe kurz, worum es in deinem Spiel gehen soll.');return;}
 const t=idea.toLocaleLowerCase('de');let type='quiz',reason='Quiz';
 if(/memory|gedächtnis|paare finden|karten aufdecken/.test(t)){type='memory';reason='Memory'}
 else if(/zuordnen|verbinden|matching|paar|zusammengehören/.test(t)){type='matching';reason='Paare finden'}
 else if(/wortsalat|buchstaben|wort erraten|wortspiel|word/.test(t)){type='word';reason='Wortspiel'}
 else if(/reihenfolge|sortier|ablauf|sortieren/.test(t)){type='sorting';reason='Reihenfolge-Puzzle'}
 else if(/geschichte|story|entscheidung|abenteuer/.test(t)){type='story';reason='Geschichte mit Entscheidungen'}
 else if(/tippen|reaktion|schnell|reflex|arcade|klick/.test(t)){type='reaction';reason='Reaktionsspiel'}
 else if(/mehrere richtige|alle richtigen|mehrfach/.test(t)){type='multi';reason='Mehrfachauswahl'}
 else if(/richtig oder falsch|wahr oder falsch|true.?false/.test(t)){type='truefalse';reason='Richtig oder falsch'}
 else if(/tippe|schreib|texteingabe|antwort eintippen|freie antwort/.test(t)){type='short';reason='Antwort eintippen'}
 const topic=creatorIdeaTopic(idea);creatorStartNew(type);
 const cleanTitle=(topic?topic.name+'-Quiz':idea.replace(/^(ich möchte|ich will|erstelle|mach(e)? mir|ein(e)?s? )/i,'').trim()).slice(0,70);
 creatorDraft.title=cleanTitle||'Mein Spiel';creatorDraft.description=idea.slice(0,500);
 if(topic&&type==='quiz')creatorDraft.questions=topic.questions.map((q)=>({prompt:q[0],image:'',options:[...q[1]],correct:q[2],explanation:q[3]}));
 if(topic&&(type==='memory'||type==='matching'))creatorDraft.pairs=topic.questions.map(q=>({left:q[0].replace(/[?]/g,''),right:q[1][q[2]]}));
 if(topic&&type==='truefalse')creatorDraft.questions=topic.questions.map(q=>({prompt:q[0]+' '+q[1][q[2]]+'.',image:'',correct:true,explanation:q[3]}));
 creatorBindDraftToInputs();
 const extra=topic&&type==='quiz'?' Wir haben drei passende Beispiel-Fragen vorbereitet.':' Du bekommst eine passende Vorlage mit Beispiel-Inhalten.';
 $('creatorIdeaStatus').textContent=`Dein Startspiel ist bereit: ${reason}.${extra} Du kannst alles ändern.`;
 creatorUpdateLivePreview();
 creatorAutoSaveNow();
}
function creatorBindDraftToInputs(){if(!creatorDraft)return;$('creatorSharePanel')?.classList.add('hidden');const usesQuestionAttempts=!['matching','memory','story','reaction'].includes(creatorDraft.type);$('creatorLivesCard')?.classList.toggle('hidden',!usesQuestionAttempts);$('creatorFeedbackCard')?.classList.toggle('hidden',['matching','memory','story','reaction'].includes(creatorDraft.type));$('creatorTitleInput').value=creatorDraft.title;$('creatorDescriptionInput').value=creatorDraft.description;$('creatorThemeInput').value=creatorDraft.theme;$('creatorSecondsInput').value=creatorDraft.settings.seconds;$('creatorPointsInput').value=creatorDraft.settings.points;$('creatorLivesInput').value=String(creatorDraft.settings.lives);$('creatorFeedbackInput').value=creatorDraft.settings.feedback;$('creatorShuffleInput').value=creatorDraft.settings.shuffle?'yes':'no';$('creatorVisibilityInput').value=creatorDraft.settings.visibility;creatorRenderContentEditor();creatorUpdateLivePreview();}
function creatorUpdateBasics(){if(!creatorDraft)return;creatorDraft.title=$('creatorTitleInput').value.trim().slice(0,70)||'Mein Spiel';creatorDraft.description=$('creatorDescriptionInput').value.slice(0,500);creatorDraft.theme=$('creatorThemeInput').value;creatorDraft.updatedAt=new Date().toISOString();$('creatorEditorTitle').textContent=creatorDraft.title;creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorUpdateSettings(){if(!creatorDraft)return;creatorDraft.settings.seconds=Math.max(5,Math.min(180,Number($('creatorSecondsInput').value)||20));creatorDraft.settings.points=Math.max(0,Math.min(10000,Number($('creatorPointsInput').value)||0));creatorDraft.settings.lives=Number($('creatorLivesInput').value)||3;creatorDraft.settings.feedback=$('creatorFeedbackInput').value;creatorDraft.settings.shuffle=$('creatorShuffleInput').value==='yes';creatorDraft.settings.visibility=$('creatorVisibilityInput').value;if(creatorDraft.settings.visibility==='private')$('creatorSharePanel')?.classList.add('hidden');creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorQuestionCard(q,i){
 const type=creatorDraft.type;let fields='';
 if(type==='quiz')fields=`<div class="field"><label>Antworten · markiere die richtige</label><div class="creator-options-grid">${q.options.map((v,j)=>`<div class="creator-option-field"><input aria-label="Antwort ${j+1} als richtig markieren" type="radio" name="cqcorrect${i}" ${Number(q.correct)===j?'checked':''} onchange="creatorSetQuestion(${i},'correct',${j})"><input aria-label="Antwort ${j+1}" type="text" maxlength="180" value="${esc(v)}" oninput="creatorSetQuestion(${i},'option${j}',this.value)" placeholder="Antwort ${j+1}"></div>`).join('')}</div></div><div class="field"><label>Erklärung nach der Antwort (optional)</label><textarea maxlength="500" oninput="creatorSetQuestion(${i},'explanation',this.value)" placeholder="Warum ist das richtig?">${esc(q.explanation||'')}</textarea></div>`;
 if(type==='truefalse')fields=`<div class="field"><label>Ist die Aussage richtig?</label><select onchange="creatorSetQuestion(${i},'correct',this.value==='true')"><option value="true" ${q.correct?'selected':''}>Ja, richtig</option><option value="false" ${!q.correct?'selected':''}>Nein, falsch</option></select></div><div class="field"><label>Erklärung (optional)</label><textarea maxlength="500" oninput="creatorSetQuestion(${i},'explanation',this.value)">${esc(q.explanation||'')}</textarea></div>`;
 if(type==='short')fields=`<div class="field"><label>Gültige Antwort(en) · mit | trennen</label><input maxlength="600" value="${esc((q.answers||[]).join('|'))}" oninput="creatorSetQuestion(${i},'answers',this.value)" placeholder="Antwort eins|Alternative"></div><div class="field"><label>Hinweis (optional)</label><input maxlength="250" value="${esc(q.hint||'')}" oninput="creatorSetQuestion(${i},'hint',this.value)" placeholder="Ein kleiner Hinweis"></div>`;
 if(type==='multi')fields=`<div class="field"><label>Optionen · alle richtigen markieren</label><div class="creator-options-grid">${q.options.map((v,j)=>`<div class="creator-option-field"><input aria-label="Option ${j+1} ist richtig" type="checkbox" ${q.correct.includes(j)?'checked':''} onchange="creatorSetMultiCorrect(${i},${j},this.checked)"><input aria-label="Option ${j+1}" type="text" maxlength="180" value="${esc(v)}" oninput="creatorSetQuestion(${i},'option${j}',this.value)" placeholder="Option ${j+1}"></div>`).join('')}</div><div class="creator-field-note">Spieler müssen alle richtigen Antworten auswählen.</div></div><div class="field"><label>Erklärung (optional)</label><textarea maxlength="500" oninput="creatorSetQuestion(${i},'explanation',this.value)">${esc(q.explanation||'')}</textarea></div>`;
 if(type==='word')fields=`<div class="field"><label>Gesuchtes Wort</label><input maxlength="80" value="${esc(q.word||'')}" oninput="creatorSetQuestion(${i},'word',this.value)" placeholder="PLANET"></div><div class="field"><label>Hinweis (optional)</label><input maxlength="250" value="${esc(q.hint||'')}" oninput="creatorSetQuestion(${i},'hint',this.value)" placeholder="Ein Objekt im Weltraum"></div>`;
 if(type==='story')fields=`<div class="field"><label>Auswahlmöglichkeiten und Folgen</label>${q.options.map((o,j)=>`<div style="border:1px solid var(--line);border-radius:12px;padding:9px;margin-top:8px"><label>Möglichkeit ${j+1}</label><input maxlength="180" value="${esc(o.text)}" oninput="creatorSetStoryOption(${i},${j},'text',this.value)" placeholder="Was kann man wählen?"><label style="display:block;margin-top:7px">Was passiert danach?</label><textarea maxlength="350" oninput="creatorSetStoryOption(${i},${j},'outcome',this.value)" placeholder="Die Folge der Entscheidung">${esc(o.outcome)}</textarea></div>`).join('')}</div>`;
 if(type==='sorting')fields=`<div class="field"><label>Richtige Reihenfolge · ein Eintrag pro Zeile</label><textarea maxlength="2000" oninput="creatorSetQuestion(${i},'items',this.value)" placeholder="Zuerst ...&#10;Danach ...">${esc((q.items||[]).join('\n'))}</textarea><div class="creator-field-note">Im Test werden die Einträge gemischt, und der Spieler sortiert sie wieder.</div></div>`;
 return `<article class="creator-question-card"><div class="q-head"><strong>${CREATOR_META[type].icon} ${type==='story'?'Szene':type==='word'?'Wort':type==='sorting'?'Puzzle':'Aufgabe'} ${i+1}</strong><button type="button" class="btn secondary" ${creatorDraft.questions.length<=1?'disabled':''} onclick="creatorDeleteContent(${i})">Entfernen</button></div><div class="field"><label>${type==='story'?'Beschreibung der Szene':type==='word'?'Aufgabenhinweis':type==='sorting'?'Aufgabenstellung':'Frage oder Aufgabe'}</label><textarea maxlength="500" oninput="creatorSetQuestion(${i},'prompt',this.value)" placeholder="Schreibe hier deine Aufgabe...">${esc(q.prompt||'')}</textarea></div><div class="field"><label>Bild-URL (optional, https://...)</label><input type="url" maxlength="500" value="${esc(q.image||'')}" oninput="creatorSetQuestion(${i},'image',this.value)" placeholder="https://example.com/bild.jpg"></div>${fields}</article>`;
}
function creatorRenderContentEditor(){if(!creatorDraft)return;const root=$('creatorContentEditor');const type=creatorDraft.type;$('creatorContentHelp').textContent=CREATOR_META[type].help;
 if(type==='reaction'){root.innerHTML=`<article class="creator-question-card"><h4>⚡ Ziel und Aufgabe</h4><div class="field"><label>Text der Herausforderung</label><input maxlength="160" value="${esc(creatorDraft.challenge||'Tippe so oft du kannst!')}" oninput="creatorDraft.challenge=this.value;creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave()"></div><p class="creator-field-note">Der Spieler bekommt eine große Zielschaltfläche. Jeder gültige Klick zählt als Treffer. Die Runde endet nach der Zeit aus den Regeln.</p></article>`;return;}
 if(type==='matching'||type==='memory'){root.innerHTML=`<div class="creator-question-list">${creatorDraft.pairs.map((p,i)=>`<article class="creator-question-card"><div class="q-head"><strong>${type==='memory'?'🃏 Kartenpaar':'🔗 Paar'} ${i+1}</strong><button type="button" class="btn secondary" ${creatorDraft.pairs.length<=2?'disabled':''} onclick="creatorDeleteContent(${i})">Entfernen</button></div><div class="creator-pair-row"><input maxlength="180" aria-label="Linker Begriff" value="${esc(p.left)}" oninput="creatorSetPair(${i},'left',this.value)" placeholder="Linke Seite"><input maxlength="180" aria-label="Rechter Begriff" value="${esc(p.right)}" oninput="creatorSetPair(${i},'right',this.value)" placeholder="Passende rechte Seite"><button type="button" class="btn secondary" onclick="creatorSwapPair(${i})" title="Seiten tauschen">↔</button></div></article>`).join('')}</div><div class="creator-rule-note">${type==='memory'?'Im Memory erscheinen beide Seiten als verdeckte Karten.':'Links und rechts werden getrennt angezeigt; der Spieler verbindet passende Begriffe.'} Füge eigene Texte, Emojis oder kurze Beschreibungen ein.</div>`;return;}
 root.innerHTML=`<div class="creator-question-list">${creatorDraft.questions.map((q,i)=>creatorQuestionCard(q,i)).join('')}</div>`;
}
function creatorSetQuestion(i,key,value){if(!creatorDraft||!creatorDraft.questions[i])return;const q=creatorDraft.questions[i];if(key.startsWith('option')){q.options[Number(key.slice(6))]=value;}else if(key==='answers'){q.answers=value.split('|').map(x=>x.trim()).filter(Boolean).slice(0,10);}else if(key==='items'){q.items=value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,12);}else q[key]=value;creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorSetMultiCorrect(i,j,on){const q=creatorDraft?.questions[i];if(!q)return;const set=new Set(Array.isArray(q.correct)?q.correct:[]);on?set.add(j):set.delete(j);q.correct=[...set].sort((a,b)=>a-b);creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorSetStoryOption(i,j,key,value){const o=creatorDraft?.questions[i]?.options?.[j];if(o){o[key]=value;creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave();}}
function creatorSetPair(i,key,value){if(creatorDraft?.pairs[i]){creatorDraft.pairs[i][key]=value;creatorDraft.updatedAt=new Date().toISOString();creatorUpdateLivePreview();creatorQueueAutoSave();}}
function creatorSwapPair(i){if(!creatorDraft?.pairs[i])return;const p=creatorDraft.pairs[i];[p.left,p.right]=[p.right,p.left];creatorRenderContentEditor();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorAddContent(){if(!creatorDraft)return;const type=creatorDraft.type;if(type==='reaction'){showToast('Für diesen Spieltyp brauchst du keine weitere Aufgabe.');return;}if(type==='matching'||type==='memory'){if(creatorDraft.pairs.length>=60){showToast('Maximal 60 Paare pro Spiel.');return;}creatorDraft.pairs.push({left:'Neuer Begriff',right:'Passender Begriff'});}else{if(creatorDraft.questions.length>=100){showToast('Maximal 100 Aufgaben pro Spiel.');return;}creatorDraft.questions.push(creatorBaseQuestion(type));}creatorRenderContentEditor();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorDeleteContent(i){if(!creatorDraft)return;const type=creatorDraft.type;if(type==='matching'||type==='memory'){if(creatorDraft.pairs.length<=2)return;creatorDraft.pairs.splice(i,1);}else{if(creatorDraft.questions.length<=1)return;creatorDraft.questions.splice(i,1);}creatorRenderContentEditor();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorGoStep(step){if(!creatorDraft)return;step=Math.max(1,Math.min(3,Number(step)||1));creatorCurrentStep=step;creatorUpdateBasics();creatorUpdateSettings();$('creatorBasicsFields').classList.toggle('hidden',step!==1);$('creatorContentFields').classList.toggle('hidden',step!==2);$('creatorRulesFields').classList.toggle('hidden',step!==3);[1,2,3].forEach(n=>$(`creatorStep${n===1?'One':n===2?'Two':'Three'}`).classList.toggle('active',n===step));$('creatorEditorSubtitle').textContent=`Schritt ${step} von 3 · ${step===1?'Name und Stil':step===2?'Inhalte bauen':'Regeln & testen'}`;if(step===2)creatorRenderContentEditor();creatorUpdateLivePreview();creatorQueueAutoSave();}
function creatorUpdateLivePreview(){if(!creatorDraft||!$('creatorLivePreview'))return;creatorDraft.title=($('creatorTitleInput')?.value||creatorDraft.title).trim().slice(0,70)||'Mein Spiel';creatorDraft.description=$('creatorDescriptionInput')?.value??creatorDraft.description;creatorDraft.theme=$('creatorThemeInput')?.value||creatorDraft.theme;const type=creatorDraft.type;let example='Deine eigenen Inhalte';let answers=[];
 if(type==='matching'||type==='memory'){example=creatorDraft.pairs[0]?.left||'Ein Paar finden';answers=[creatorDraft.pairs[0]?.right||'Passendes Element','Weitere Karte'];}
 else if(type==='reaction'){example=creatorDraft.challenge||'Bereit?';answers=['ZIEL ANKLICKEN'];}
 else {const q=creatorDraft.questions[0]||{};example=q.prompt||'Deine Frage erscheint hier';if(type==='quiz'||type==='multi')answers=(q.options||[]).slice(0,2);else if(type==='truefalse')answers=['Richtig','Falsch'];else if(type==='story')answers=(q.options||[]).slice(0,2).map(o=>o.text);else if(type==='word')answers=[(q.word||'').split('').sort().join(''),'Dein Wort'];else if(type==='sorting')answers=(q.items||[]).slice(0,2);else answers=['Deine Antwort hier'];}
 const themeMap={neon:['#48e4ef','#a866ff'],ocean:['#58c7ff','#42dfb7'],sunset:['#ff964f','#ff579b'],forest:['#39dfa0','#c2d86a'],candy:['#ff7ad9','#8e86ff']};const colors=themeMap[creatorDraft.theme]||themeMap.neon;
 $('creatorLivePreview').style.borderColor=colors[0]+'77';$('creatorLivePreview').innerHTML=`<div class="mini-top"><span>${esc(CREATOR_META[type].title.toUpperCase())}</span><span>${creatorDraft.settings.seconds||20} SEK.</span></div><div style="font-size:28px">${CREATOR_META[type].icon}</div><div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(creatorDraft.title)}</div><div class="mini-question">${esc(example).slice(0,170)}</div>${answers.map(a=>`<div class="creator-mini-answer">${esc(a||'Antwort')}</div>`).join('')}<div class="creator-progress-line"><span style="background:linear-gradient(90deg,${colors[0]},${colors[1]})"></span></div>`;
 $('creatorEditorTitle').textContent=creatorDraft.title;$('creatorPreviewStatus').textContent=`${CREATOR_META[type].title} · ${type==='matching'||type==='memory'?creatorDraft.pairs.length+' Paare':type==='reaction'?'Reaktionsmodus':creatorDraft.questions.length+' Aufgaben'} · ${creatorDraft.settings.points} Punkte pro Erfolg`;
}
function creatorBuildConfig(){if(!creatorDraft)throw new Error('Wähle zuerst einen Spieltyp.');creatorUpdateBasics();creatorUpdateSettings();const c=creatorSanitizeConfig(creatorDraft);if(['matching','memory'].includes(c.type)){if(c.pairs.some(p=>!p.left||!p.right))throw new Error('Fülle alle Felder eines Paares aus.');}if(c.type==='story'&&c.questions.some(q=>!q.options?.some(o=>o.text.trim())))throw new Error('Jede Szene braucht mindestens eine Auswahl.');if(c.type==='sorting'&&c.questions.some(q=>new Set(q.items).size!==q.items.length))throw new Error('Entferne doppelte Elemente aus einer Sortieraufgabe.');return c;}
function creatorSaveDraft(showMessage=false){try{const c=creatorBuildConfig();const all=creatorGetDrafts();const index=all.findIndex(d=>d.id===c.id);if(index>=0)all[index]=c;else all.unshift(c);creatorStoreDrafts(all);creatorDraft=c;localStorage.setItem(CREATOR_CURRENT_KEY,JSON.stringify({draft:c,step:creatorCurrentStep}));creatorRenderLibrary();creatorRenderResumeCard();if(showMessage)showToast('Entwurf sicher auf diesem Gerät gespeichert.');return c;}catch(e){showToast(e.message||'Entwurf konnte nicht gespeichert werden.');return null;}}
function creatorOpenDraft(id){const c=creatorGetDrafts().find(d=>d.id===id);if(!c)return;creatorDraft=JSON.parse(JSON.stringify(c));creatorCurrentStep=1;creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(1);creatorAutoSaveNow();}
function creatorPlayDraft(id){const c=creatorGetDrafts().find(d=>d.id===id);if(!c)return;creatorDraft=JSON.parse(JSON.stringify(c));creatorCurrentStep=3;creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(3);creatorStartPreview();}
function creatorDeleteDraft(id){const all=creatorGetDrafts().filter(d=>d.id!==id);creatorStoreDrafts(all);if(creatorDraft?.id===id)creatorDraft=null;const current=creatorReadCurrent();if(current?.draft?.id===id){localStorage.removeItem(CREATOR_CURRENT_KEY);localStorage.removeItem(CREATOR_STEP_KEY);}creatorRenderLibrary();creatorRenderResumeCard();showToast('Entwurf wurde von diesem Gerät entfernt.');}
function creatorSwitchToEditor(){$('creatorHomePanel').classList.add('hidden');$('creatorEditorPanel').classList.remove('hidden');$('creatorPlayPanel').classList.add('hidden');}
function creatorBackToHome(){creatorAutoSaveNow();creatorStopRunTimer();creatorDraft=null;$('creatorHomePanel').classList.remove('hidden');$('creatorEditorPanel').classList.add('hidden');$('creatorPlayPanel').classList.add('hidden');creatorRenderLibrary();}
function creatorShareDraft(id){const c=creatorGetDrafts().find(d=>d.id===id);if(!c)return;creatorDraft=JSON.parse(JSON.stringify(c));creatorCurrentStep=3;creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(3);creatorMakeShareLink();creatorAutoSaveNow();}
function creatorBaseUrl(){const url=new URL(window.location.href);url.search='';url.hash='';return url;}
function creatorEncode(c){return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function creatorDecode(text){const b64=String(text).replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(b64+'='.repeat((4-b64.length%4)%4)))));}
function creatorMakeShareLink(){try{const c=creatorSaveDraft(false);if(!c)return;if(c.settings.visibility==='private'){$('creatorSharePanel').classList.add('hidden');showToast('Dieses Spiel ist als privat markiert. Stelle die Sichtbarkeit auf „Über Link teilen“, um einen Link zu erzeugen.');return;}const encoded=creatorEncode(c);if(encoded.length>12000){$('creatorSharePanel').classList.add('hidden');showToast('Der Bauplan ist für einen Link zu groß. Bitte JSON herunterladen und teilen.');return;}const url=creatorBaseUrl();url.hash='mmcreator='+encoded;$('creatorShareUrl').value=url.toString();$('creatorSharePanel').classList.remove('hidden');showToast('Spielbauplan bereit zum Teilen.');}catch(e){showToast(e.message||'Link konnte nicht erstellt werden.');}}
async function creatorCopyShareLink(){const val=$('creatorShareUrl')?.value;if(!val)return;try{await navigator.clipboard.writeText(val);showToast('Spiel-Link kopiert!');}catch(_){$('creatorShareUrl').focus();$('creatorShareUrl').select();showToast('Link markiert – kopiere ihn manuell.');}}
function creatorShareCurrent(){creatorGoStep(3);creatorMakeShareLink();}
function creatorShareFromResult(){creatorStopPreview();creatorGoStep(3);creatorMakeShareLink();$('creatorSharePanel')?.scrollIntoView({behavior:'smooth',block:'center'});}
function creatorExportCurrent(){try{const c=creatorBuildConfig();creatorDownloadJson(c,creatorFileName(c.title));}catch(e){showToast(e.message);}}
function creatorExportAll(){const data=creatorGetDrafts();if(!data.length){showToast('Es gibt noch keine gespeicherten Entwürfe.');return;}creatorDownloadJson({format:'mathemeister-game-drafts',v:1,games:data},'mathemeister-spiele.json');}
function creatorDownloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name||'mathemeister-game.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('JSON-Datei heruntergeladen.');}
function creatorFileName(name){return String(name||'mathemeister-spiel').normalize('NFKD').replace(/[^\w-]+/g,'-').replace(/-+/g,'-').slice(0,45)+'.json';}
function creatorImportFileChanged(event){const file=event.target.files?.[0];if(!file)return;if(file.size>1024*1024){showToast('Die Datei ist größer als 1 MB.');event.target.value='';return;}const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result);const list=raw?.format==='mathemeister-game-drafts'&&Array.isArray(raw.games)?raw.games:[raw];if(!list.length||list.length>30)throw new Error('Die Datei muss 1 bis 30 Spiele enthalten.');const old=creatorGetDrafts();let added=0;for(const item of list){const c=creatorSanitizeConfig(item);c.id=creatorNewId();old.unshift(c);added++;}creatorStoreDrafts(old.slice(0,30));creatorRenderLibrary();showToast(`${added} Spiel(e) importiert.`);}catch(e){showToast('Import fehlgeschlagen: '+(e.message||'Ungültige Datei.'));}event.target.value='';};reader.readAsText(file);}
function creatorUseIdeaLink(c){creatorDraft=c;creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(1);}
function creatorLoadSharedLink(hashOverride){const rawHash=typeof hashOverride==='string'?hashOverride:window.location.hash;const match=rawHash.match(/^#mmcreator=(.+)$/);if(!match)return;try{if(match[1].length>12000)throw new Error('Der Spiel-Link ist zu groß.');const c=creatorSanitizeConfig(creatorDecode(decodeURIComponent(match[1])));c.id=creatorNewId();creatorDraft=c;const all=creatorGetDrafts();all.unshift(c);creatorStoreDrafts(all.slice(0,30));try{history.replaceState(null,'',window.location.pathname+window.location.search);}catch(_){}show('creator');creatorSwitchToEditor();creatorBindDraftToInputs();creatorGoStep(1);showToast('Spielbauplan geladen. Du kannst ihn testen oder ändern.');}catch(e){showToast('Spiel-Link ungültig: '+(e.message||'Bitte JSON importieren.'));}}
function creatorStartPreview(){try{const built=creatorBuildConfig();creatorDraft=built;creatorCurrentStep=3;creatorSaveDraft(false);const runConfig=JSON.parse(JSON.stringify(built));if(runConfig.settings.shuffle){if(runConfig.questions.length)runConfig.questions=creatorShuffle(runConfig.questions);if(runConfig.type==='matching')runConfig.pairs=creatorShuffle(runConfig.pairs);}creatorRun={config:runConfig,index:0,score:0,correct:0,answered:0,selected:[],matched:[],left:-1,right:-1,memCards:[],memFirst:-1,sortItems:[],reactionCount:0,done:false};$('creatorEditorPanel').classList.add('hidden');$('creatorHomePanel').classList.add('hidden');$('creatorPlayPanel').classList.remove('hidden');$('creatorPlayTitle').textContent=creatorRun.config.title;creatorRenderGameStep();}catch(e){showToast(e.message||'Bitte prüfe deine Inhalte.');}}
function creatorShuffle(a){const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;}
function creatorStopRunTimer(){if(creatorRunTimer){clearInterval(creatorRunTimer);creatorRunTimer=null;}if(creatorFlipTimer){clearTimeout(creatorFlipTimer);creatorFlipTimer=null;}}
function creatorStopPreview(){creatorStopRunTimer();creatorRun=null;$('creatorPlayPanel').classList.add('hidden');$('creatorEditorPanel').classList.remove('hidden');$('creatorHomePanel').classList.add('hidden');creatorUpdateLivePreview();creatorAutoSaveNow();}
function creatorEscapeHtml(v){return esc(String(v??''));}
function creatorImageHtml(q){
 const raw=String(q?.image||'').trim();if(!raw||raw.length>500)return '';
 let parsed;try{parsed=new URL(raw);}catch(_){return '';}
 if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)return '';
 const url=parsed.href;
 return `<img src="${creatorEscapeHtml(url)}" alt="Bild zur Aufgabe" loading="lazy" referrerpolicy="no-referrer" style="display:block;max-width:100%;max-height:260px;object-fit:contain;border-radius:14px;margin:12px auto" onerror="this.hidden=true">`;
}
function creatorApplyPlayTheme(){const area=$('creatorPlayArea'),c=creatorRun?.config;if(!area||!c)return;const colors={neon:['#48e4ef','#a866ff'],ocean:['#58c7ff','#42dfb7'],sunset:['#ff964f','#ff579b'],forest:['#39dfa0','#c2d86a'],candy:['#ff7ad9','#8e86ff']}[c.theme]||['#48e4ef','#a866ff'];area.style.borderColor=colors[0]+'77';area.style.background=`radial-gradient(ellipse at 95% 0%,${colors[1]}22,transparent 45%),#0e1528`;area.style.setProperty('--creator-accent',colors[0]);}
function creatorStartQuestionTimer(){const r=creatorRun;if(!r||r.config.type==='reaction')return;const seconds=Math.max(5,Math.min(180,Number(r.config.settings.seconds)||20));r.questionDeadline=Date.now()+seconds*1000;creatorRunTimer=setInterval(()=>{if(!creatorRun||creatorRun!==r){creatorStopRunTimer();return;}const remaining=Math.max(0,Math.ceil((r.questionDeadline-Date.now())/1000));const el=$('creatorQuestionTime');if(el)el.textContent=remaining;if(remaining<=0){creatorStopRunTimer();if(!r.feedbackShown){creatorShowAnswer(false,'Die Zeit ist abgelaufen.',false,'');$('creatorPlayArea').querySelectorAll('.creator-play-choice').forEach(b=>b.disabled=true);$('creatorPlayArea').querySelectorAll('input[type=checkbox]').forEach(b=>b.disabled=true);}}},250);creatorApplyPlayTheme();}
function creatorStartWholeTimer(){const r=creatorRun;if(!r)return;creatorStopRunTimer();r.wholeDeadline=Date.now()+Math.max(5,Math.min(180,Number(r.config.settings.seconds)||20))*1000;creatorRunTimer=setInterval(()=>{if(!creatorRun||creatorRun!==r){creatorStopRunTimer();return;}const remain=Math.max(0,Math.ceil((r.wholeDeadline-Date.now())/1000));const el=$('creatorWholeTime');if(el)el.textContent=remain;if(remain<=0){creatorStopRunTimer();r.done=true;creatorRenderGameEnd();}},250);}
function creatorRenderGameStep(){creatorStopRunTimer();const r=creatorRun;if(!r)return;const c=r.config;
 if(c.type==='reaction'){creatorRenderReaction();return;}
 if(c.type==='matching'){creatorRenderMatching();return;}
 if(c.type==='memory'){creatorRenderMemory();return;}
 if(r.index>=c.questions.length){creatorRenderGameEnd();return;}
 const q=c.questions[r.index];r.answered=0;r.selected=[];r.attemptsThisQuestion=0;r.feedbackShown=false;
 const progress=`<div class="creator-play-header"><span class="pill">${CREATOR_META[c.type].icon} ${esc(CREATOR_META[c.type].title)}</span><span class="pill">${r.index+1} / ${c.questions.length}</span><span class="pill">⏱️ <span id="creatorQuestionTime">${c.settings.seconds}</span>s</span><span class="pill">⭐ ${r.score} Punkte</span></div><div class="creator-progress-line"><span style="width:${Math.round(r.index/Math.max(1,c.questions.length)*100)}%"></span></div>`;
 let body=`${creatorImageHtml(q)}<div class="creator-play-question">${esc(q.prompt||'')}</div>`;
 if(c.type==='quiz')body+=`<div class="creator-play-options">${q.options.map((o,i)=>`<button type="button" class="creator-play-choice" onclick="creatorAnswerSingle(${i})">${['🟥','🟦','🟨','🟩'][i]} ${esc(o)}</button>`).join('')}</div>`;
 if(c.type==='truefalse')body+=`<div class="creator-play-options"><button type="button" class="creator-play-choice" onclick="creatorAnswerSingle(1)">✅ Richtig</button><button type="button" class="creator-play-choice" onclick="creatorAnswerSingle(0)">❌ Falsch</button></div>`;
 if(c.type==='short')body+=`<form onsubmit="creatorSubmitText(event)"><input id="creatorPlayTextAnswer" class="creator-play-input" autocomplete="off" placeholder="Deine Antwort …"><button class="btn primary" style="margin-top:10px;width:100%">Antwort prüfen →</button></form>${q.hint?`<p class="creator-status">💡 Hinweis: ${esc(q.hint)}</p>`:''}`;
 if(c.type==='multi')body+=`<div class="creator-play-options">${q.options.map((o,i)=>`<label class="creator-play-choice" style="display:flex;gap:10px;align-items:center"><input type="checkbox" value="${i}" style="width:auto"> ${esc(o)}</label>`).join('')}</div><button type="button" class="btn primary" style="width:100%;margin-top:12px" onclick="creatorSubmitMulti()">Auswahl prüfen →</button>`;
 if(c.type==='word'){const scrambled=creatorScramble(q.word||'');body+=`<div class="creator-play-question" style="letter-spacing:6px;text-align:center">${esc(scrambled)}</div><form onsubmit="creatorSubmitText(event)"><input id="creatorPlayTextAnswer" class="creator-play-input" autocomplete="off" placeholder="Wort eingeben …"><button class="btn primary" style="margin-top:10px;width:100%">Prüfen →</button></form>${q.hint?`<p class="creator-status">💡 Hinweis: ${esc(q.hint)}</p>`:''}`;q._scrambled=scrambled;}
 if(c.type==='story')body+=`<div class="creator-play-options">${q.options.map((o,i)=>`<button type="button" class="creator-play-choice" onclick="creatorStoryChoice(${i})">${esc(o.text)}</button>`).join('')}</div>`;
 if(c.type==='sorting'){r.sortItems=creatorShuffle(q.items||[]);body+=`<div id="creatorSortItems">${creatorRenderSortItems(r.sortItems)}</div><button class="btn primary" style="width:100%;margin-top:12px" onclick="creatorCheckSorting()">Reihenfolge prüfen →</button>`;}
 $('creatorPlayArea').innerHTML=`${progress}${body}<div id="creatorPlayFeedback" aria-live="polite"></div><div class="creator-actions-row"><button id="creatorNextQuestionBtn" class="btn primary hidden" type="button" onclick="creatorNextStep()">Weiter →</button><button class="btn secondary" type="button" onclick="creatorStopPreview()">Test verlassen</button></div>`;creatorApplyPlayTheme();creatorStartQuestionTimer();
}
function creatorScramble(word){const chars=Array.from(String(word||'WORT'));if(chars.length<2)return chars.join('');for(let k=0;k<4;k++){const x=creatorShuffle(chars).join('');if(x.toLocaleLowerCase()!==String(word).toLocaleLowerCase())return x;}return chars.reverse().join('');}
function creatorNormalize(s){return String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\s+/g,' ');}
function creatorHandleAttempt(correct,message='',solution=''){const r=creatorRun;if(!r||r.feedbackShown)return;const limit=r.config.settings.lives===99?Infinity:Math.max(1,Number(r.config.settings.lives)||1);r.attemptsThisQuestion=(r.attemptsThisQuestion||0)+1;if(correct||r.attemptsThisQuestion>=limit){creatorShowAnswer(correct,message, false, solution);return;}const left=limit===Infinity?'Du kannst es erneut versuchen.':`Noch ${Math.max(0,limit-r.attemptsThisQuestion)} Versuch(e).`;const feedback=$('creatorPlayFeedback');if(feedback){feedback.innerHTML=`<div class="creator-play-feedback bad">${r.config.settings.feedback==='after'?'↩️ Noch nicht richtig.':'↩️ Versuch eingereicht.'} ${creatorEscapeHtml(left)}</div>`;}const form=$('creatorPlayArea').querySelector('form');if(form){const input=form.querySelector('input');if(input){input.value='';input.disabled=false;input.focus();}form.querySelectorAll('button').forEach(b=>b.disabled=false);} $('creatorPlayArea').querySelectorAll('input[type=checkbox]').forEach(x=>{x.checked=false;x.disabled=false;});}
function creatorAnswerSingle(index){const r=creatorRun;if(!r||r.feedbackShown)return;const c=r.config,q=c.questions[r.index];let correct=false,explanation=q.explanation||'',solution='',selectedDomIndex=index;if(c.type==='quiz'){correct=Number(q.correct)===index;solution=q.options[q.correct]||'';}else if(c.type==='truefalse'){correct=(index===1)===Boolean(q.correct);solution=q.correct?'Richtig':'Falsch';selectedDomIndex=index===1?0:1;}else return;creatorHandleAttempt(correct,explanation,solution);if(r.feedbackShown){document.querySelectorAll('#creatorPlayArea .creator-play-choice').forEach((b,i)=>{b.disabled=true;if(c.settings.feedback==='after'){if(c.type==='quiz'&&i===Number(q.correct))b.classList.add('correct');if(c.type==='truefalse'&&i===(q.correct?0:1))b.classList.add('correct');if(i===selectedDomIndex&&!correct)b.classList.add('wrong');}});}else{document.querySelectorAll('#creatorPlayArea .creator-play-choice').forEach(b=>b.disabled=false);const selected=document.querySelectorAll('#creatorPlayArea .creator-play-choice')[selectedDomIndex];if(selected)selected.classList.add('wrong');}}
function creatorShowAnswer(correct,message='',neutral=false,solution=''){const r=creatorRun;if(!r)return;creatorStopRunTimer();r.feedbackShown=true;r.answered++;if(correct){r.correct++;r.score+=r.config.settings.points;}const q=r.config.questions[r.index];(r.review||(r.review=[])).push({question:q?.prompt||'Aufgabe',correct:Boolean(correct),solution:String(solution||message||'').slice(0,500)});const feedback=$('creatorPlayFeedback');if(feedback&&r.config.settings.feedback==='after')feedback.innerHTML=`<div class="creator-play-feedback ${neutral?'':correct?'good':'bad'}">${neutral?'💬':correct?'✅ Richtig!':'↩️ Noch nicht ganz.'} ${creatorEscapeHtml(message|| (correct?'Gut gemacht!':'Versuche es beim nächsten Mal erneut.'))}</div>`;const next=$('creatorNextQuestionBtn');if(next)next.classList.remove('hidden');const form=$('creatorPlayArea').querySelector('form');if(form)form.querySelectorAll('input,button').forEach(x=>x.disabled=true);}
function creatorSubmitText(event){event.preventDefault();const r=creatorRun;if(!r||r.feedbackShown)return;const q=r.config.questions[r.index],value=$('creatorPlayTextAnswer')?.value||'';const accepted=r.config.type==='word'?[q.word]:q.answers||[];const correct=accepted.some(a=>creatorNormalize(a)===creatorNormalize(value));creatorHandleAttempt(correct,q.explanation|| (correct?'Deine Antwort passt.':q.hint?`Hinweis: ${q.hint}`:'Vergleiche deine Antwort mit dem gesuchten Begriff.'),accepted.join(' / '));}
function creatorSubmitMulti(){const r=creatorRun;if(!r||r.feedbackShown)return;const selected=[...$('creatorPlayArea').querySelectorAll('input[type=checkbox]:checked')].map(x=>Number(x.value)).sort();const correct=[...(r.config.questions[r.index].correct||[])].sort();const ok=selected.length===correct.length&&selected.every((x,i)=>x===correct[i]);creatorHandleAttempt(ok,r.config.questions[r.index].explanation||'Prüfe, ob du alle und nur die richtigen Optionen ausgewählt hast.',(r.config.questions[r.index].correct||[]).map(i=>r.config.questions[r.index].options[i]).join(' · '));if(r.feedbackShown)$('creatorPlayArea').querySelectorAll('input[type=checkbox]').forEach(x=>x.disabled=true);}
function creatorStoryChoice(i){const r=creatorRun;if(!r||r.feedbackShown)return;const o=r.config.questions[r.index].options[i];r.feedbackShown=true;r.answered++;r.score+=Math.max(0,Math.floor(r.config.settings.points/2));(r.review||(r.review=[])).push({question:r.config.questions[r.index].prompt,correct:true,solution:o.outcome});$('creatorPlayFeedback').innerHTML=`<div class="creator-play-feedback good">📖 ${creatorEscapeHtml(o?.outcome||'Die Geschichte geht weiter.')}</div>`;$('creatorPlayArea').querySelectorAll('.creator-play-choice').forEach(b=>b.disabled=true);$('creatorNextQuestionBtn').classList.remove('hidden');}
function creatorRenderSortItems(items){return items.map((item,i)=>`<div class="creator-sort-item"><span>${i+1}. ${creatorEscapeHtml(item)}</span><div class="creator-sort-controls"><button type="button" class="btn secondary" aria-label="Nach oben" ${i===0?'disabled':''} onclick="creatorMoveSort(${i},-1)">↑</button><button type="button" class="btn secondary" aria-label="Nach unten" ${i===items.length-1?'disabled':''} onclick="creatorMoveSort(${i},1)">↓</button></div></div>`).join('');}
function creatorMoveSort(i,dir){const r=creatorRun;if(!r||r.feedbackShown)return;const j=i+dir;if(j<0||j>=r.sortItems.length)return;[r.sortItems[i],r.sortItems[j]]=[r.sortItems[j],r.sortItems[i]];$('creatorSortItems').innerHTML=creatorRenderSortItems(r.sortItems);}
function creatorCheckSorting(){const r=creatorRun;if(!r||r.feedbackShown)return;const expected=r.config.questions[r.index].items;const ok=r.sortItems.length===expected.length&&r.sortItems.every((x,i)=>x===expected[i]);creatorHandleAttempt(ok,ok?'Die Reihenfolge stimmt.':'Die Reihenfolge stimmt noch nicht ganz.',expected.join(' → '));}
function creatorNextStep(){const r=creatorRun;if(!r)return;r.index++;if(r.index>=((r.config.type==='matching'||r.config.type==='memory')?1:r.config.questions.length)){creatorRenderGameEnd();return;}creatorRenderGameStep();}
function creatorRenderGameEnd(){creatorStopRunTimer();const r=creatorRun;if(!r)return;r.done=true;const total=r.config.type==='matching'||r.config.type==='memory'?r.config.pairs.length:r.config.type==='reaction'?r.config.settings.seconds:r.config.questions.length;const pct=r.config.type==='reaction'?Math.min(100,Math.round(r.reactionCount/Math.max(1,r.config.settings.seconds*6)*100)):r.config.type==='story'?Math.round(r.answered/Math.max(1,total)*100):Math.round(r.correct/Math.max(1,total)*100);const reviewHtml=r.config.settings.feedback==='end'&&r.review?.length?`<div style="text-align:left;margin-top:22px"><h3>Deine Lösungen</h3>${r.review.map((x,i)=>`<div class="creator-question-card"><b>${i+1}. ${creatorEscapeHtml(x.question)}</b><div class="creator-status">${x.correct?'✅':'❌'} ${creatorEscapeHtml(x.solution||'')}</div></div>`).join('')}</div>`:'';$('creatorPlayArea').innerHTML=`<div style="text-align:center;padding:clamp(15px,5vw,34px)"><div style="font-size:58px">${pct>=80?'🏆':pct>=50?'🎉':'💪'}</div><span class="pill">SPIEL BEENDET</span><h2 style="font-size:clamp(28px,5vw,42px);margin:14px 0 5px">${esc(r.config.title)}</h2><p class="muted">${r.config.type==='reaction'?'Deine Reaktionsrunde ist vorbei.':'Dein Testlauf ist abgeschlossen.'}</p><div class="creator-settings-grid" style="margin-top:20px"><div class="creator-setting-card"><div class="muted">Punkte</div><strong style="font-size:25px">${r.score}</strong></div><div class="creator-setting-card"><div class="muted">Richtig / Paare</div><strong style="font-size:25px">${r.config.type==='reaction'?r.reactionCount:r.config.type==='matching'||r.config.type==='memory'?r.matched.filter(Boolean).length:r.correct}</strong></div><div class="creator-setting-card"><div class="muted">Fortschritt</div><strong style="font-size:25px">${pct}%</strong></div></div><div class="creator-actions-row" style="justify-content:center"><button class="btn primary" onclick="creatorStartPreview()">↻ Noch einmal spielen</button><button class="btn secondary" onclick="creatorStopPreview()">Zurück zum Editor</button><button class="btn secondary" onclick="creatorShareFromResult()">🔗 Spiel teilen</button></div>${reviewHtml}</div>`;}
function creatorRenderMatching(){const r=creatorRun,c=r.config;r.matched=Array(c.pairs.length).fill(false);r.left=-1;r.right=-1;r.selected=[];const rightOrder=creatorShuffle(c.pairs.map((p,i)=>({text:p.right,id:i})));r.matchRightOrder=rightOrder;$('creatorPlayArea').innerHTML=`<div class="creator-play-header"><span class="pill">🔗 PAARE ZUORDNEN</span><span class="pill">${c.pairs.length} Paare</span><span class="pill">⏱️ <span id="creatorWholeTime">${c.settings.seconds}</span>s</span><span class="pill">⭐ ${r.score}</span></div><div class="creator-progress-line"><span style="width:0%"></span></div><div class="creator-play-question">Verbinde die passenden Begriffe.</div><div class="creator-match-grid" id="creatorMatchGrid"><div>${c.pairs.map((p,i)=>`<button class="creator-match-item" type="button" id="creatorLeft${i}" onclick="creatorSelectMatch('left',${i})">${creatorEscapeHtml(p.left)}</button>`).join('')}</div><div>${rightOrder.map((p,i)=>`<button class="creator-match-item" type="button" id="creatorRight${p.id}" onclick="creatorSelectMatch('right',${p.id})">${creatorEscapeHtml(p.text)}</button>`).join('')}</div></div><div id="creatorPlayFeedback" aria-live="polite"></div><div class="creator-actions-row"><button class="btn secondary" onclick="creatorStopPreview()">Test verlassen</button></div>`;creatorStartWholeTimer();creatorApplyPlayTheme();}
function creatorSelectMatch(side,index){const r=creatorRun;if(!r||r.done||r.matched[index])return;if(side==='left'){r.left=index;document.querySelectorAll('[id^=creatorLeft]').forEach(x=>x.classList.remove('selected'));$(`creatorLeft${index}`).classList.add('selected');}else{r.right=index;document.querySelectorAll('[id^=creatorRight]').forEach(x=>x.classList.remove('selected'));$(`creatorRight${index}`).classList.add('selected');}if(r.left>=0&&r.right>=0){if(r.left===r.right){r.matched[r.left]=true;r.correct++;r.score+=r.config.settings.points;$(`creatorLeft${r.left}`).classList.add('matched');$(`creatorRight${r.right}`).classList.add('matched');$(`creatorLeft${r.left}`).disabled=true;$(`creatorRight${r.right}`).disabled=true;$('creatorPlayFeedback').innerHTML=`<div class="creator-play-feedback good">✅ Paar gefunden! +${r.config.settings.points} Punkte</div>`;}else{$('creatorPlayFeedback').innerHTML='<div class="creator-play-feedback bad">Das passt noch nicht – versuche es erneut.</div>';}r.left=-1;r.right=-1;if(r.matched.every(Boolean)){r.done=true;setTimeout(()=>creatorRenderGameEnd(),300);}}}
function creatorRenderMemory(){const r=creatorRun,c=r.config;const cards=[];c.pairs.forEach((p,i)=>{cards.push({id:i,text:p.left,pair:i});cards.push({id:i+c.pairs.length,text:p.right,pair:i});});r.memCards=creatorShuffle(cards).map(x=>({...x,open:false,matched:false}));r.memFirst=-1;r.memLock=false;$('creatorPlayArea').innerHTML=`<div class="creator-play-header"><span class="pill">🃏 MEMORY</span><span class="pill">${c.pairs.length} Paare</span><span class="pill">⏱️ <span id="creatorWholeTime">${c.settings.seconds}</span>s</span><span class="pill">⭐ ${r.score}</span></div><div class="creator-play-question">Finde alle passenden Paare.</div><div class="creator-memory-grid" id="creatorMemoryGrid">${r.memCards.map((x,i)=>`<button class="creator-memory-card" type="button" id="creatorMemory${i}" onclick="creatorMemoryFlip(${i})" aria-label="Karte ${i+1}">?</button>`).join('')}</div><div id="creatorPlayFeedback" aria-live="polite"></div><div class="creator-actions-row"><button class="btn secondary" onclick="creatorStopPreview()">Test verlassen</button></div>`;creatorStartWholeTimer();creatorApplyPlayTheme();}
function creatorMemoryFlip(i){const r=creatorRun;if(!r||r.done||r.memLock)return;const card=r.memCards[i];if(!card||card.matched||card.open)return;card.open=true;const btn=$(`creatorMemory${i}`);btn.textContent=card.text;btn.classList.add('revealed');if(r.memFirst<0){r.memFirst=i;return;}const first=r.memCards[r.memFirst];r.memLock=true;if(first.pair===card.pair){first.matched=card.matched=true;r.correct++;r.score+=r.config.settings.points;$(`creatorMemory${r.memFirst}`).classList.add('matched');btn.classList.add('matched');$('creatorPlayFeedback').innerHTML=`<div class="creator-play-feedback good">✨ Paar gefunden! +${r.config.settings.points} Punkte</div>`;r.memFirst=-1;r.memLock=false;if(r.memCards.every(x=>x.matched)){r.matched=r.config.pairs.map(()=>true);r.done=true;setTimeout(()=>creatorRenderGameEnd(),350);}}else{creatorFlipTimer=setTimeout(()=>{first.open=false;card.open=false;$(`creatorMemory${r.memFirst}`).textContent='?';$(`creatorMemory${r.memFirst}`).classList.remove('revealed');btn.textContent='?';btn.classList.remove('revealed');r.memFirst=-1;r.memLock=false;},700);}}
function creatorRenderReaction(){const r=creatorRun,c=r.config;r.reactionCount=0;r.reactionRemaining=c.settings.seconds;const render=()=>{if(!creatorRun||creatorRun!==r)return;$('creatorPlayArea').innerHTML=`<div class="creator-play-header"><span class="pill">⚡ REAKTIONS-CHALLENGE</span><span class="pill">⏱️ <span id="creatorReactionTime">${r.reactionRemaining}</span> s</span><span class="pill">⭐ <span id="creatorReactionCount">${r.reactionCount}</span></span></div><div class="creator-play-question" style="text-align:center">${creatorEscapeHtml(c.challenge||'Tippe so oft du kannst!')}</div><button type="button" id="creatorReactionTarget" style="width:100%;min-height:220px;border:2px solid #48e4ef80;border-radius:24px;color:#fff;background:radial-gradient(circle at 50% 40%,#a866ff50,#1b2850);font-size:clamp(28px,6vw,46px);font-weight:900" onclick="creatorReactionTap()">⚡ TIPPE!</button><p class="creator-status" style="text-align:center">Jeder Klick zählt. Die Zeit startet beim ersten Tippen.</p><div class="creator-actions-row"><button class="btn secondary" onclick="creatorStopPreview()">Test verlassen</button></div>`;};render();r.reactionStarted=false;creatorApplyPlayTheme();}
function creatorReactionTap(){const r=creatorRun;if(!r||r.done)return;if(!r.reactionStarted){r.reactionStarted=true;r.reactionDeadline=Date.now()+r.config.settings.seconds*1000;creatorRunTimer=setInterval(()=>{if(!creatorRun||creatorRun!==r){creatorStopRunTimer();return;}r.reactionRemaining=Math.max(0,Math.ceil((r.reactionDeadline-Date.now())/1000));const t=$('creatorReactionTime');if(t)t.textContent=r.reactionRemaining;if(r.reactionRemaining<=0){creatorStopRunTimer();r.done=true;r.score=r.reactionCount*r.config.settings.points;$('creatorPlayArea').innerHTML=`<div class="creator-play-question">🏁 Zeit ist um!</div><p>Du hast ${r.reactionCount} Mal getippt.</p><div class="creator-actions-row"><button class="btn primary" onclick="creatorRenderGameEnd()">Ergebnis ansehen</button></div>`;}},200);}r.reactionCount++;r.score=r.reactionCount*r.config.settings.points;const cnt=$('creatorReactionCount');if(cnt)cnt.textContent=r.reactionCount;const b=$('creatorReactionTarget');if(b){b.style.transform=`scale(${r.reactionCount%2?.97:1}) rotate(${r.reactionCount%2?1:-1}deg)`;b.textContent=r.reactionCount%5===0?'🔥 NOCHMAL!':'⚡ TREFFER!';}}
function creatorRenderGameEndReaction(){creatorRenderGameEnd();}
function creatorPreviewInit(){creatorRenderTemplateGrid();creatorRenderLibrary();creatorRenderResumeCard();}
window.addEventListener('pagehide',()=>{if(creatorAutoSaveTimer){clearTimeout(creatorAutoSaveTimer);creatorAutoSaveTimer=null;}creatorAutoSaveNow();persistAppViewState();});



// V10.6.0 – optional user accounts and private admin conversations.
let mmPrivateUser = null;
let mmPrivateConversationId = null;
let mmPrivateAuthExpanded = false;
function privateShowAuth(){
  mmPrivateAuthExpanded=true;
  const gate=$('privateAuthGate'),panel=$('privateAuthPanel');
  gate?.classList.add('hidden');panel?.classList.remove('hidden');
  $('privateEmail')?.focus();
}
let mmAdminPrivateRows = [];
function feedbackChooseMode(mode){
  const anon=$('feedbackAnonymousPanel'),priv=$('feedbackPrivatePanel');
  anon?.classList.toggle('hidden',mode!=='anonymous');
  priv?.classList.toggle('hidden',mode!=='private');
  if(mode!=='private')return;
  mmPrivateAuthExpanded=false;
  $('privateAuthGate')?.classList.remove('hidden');
  $('privateAuthPanel')?.classList.add('hidden');
  privateRefreshSession();
}
async function privateRefreshSession(){
  try{const sb=await getSb();const {data,error}=await sb.auth.getSession();if(error)throw error;mmPrivateUser=data.session?.user||null;privateSetView();if(mmPrivateUser)await privateLoadMessages();}
  catch(e){const st=$('privateAuthStatus');if(st)st.textContent=e.message||'Verbindung fehlgeschlagen.';}
}
function privateSetView(){
  $('privateAuthGate')?.classList.toggle('hidden',!!mmPrivateUser||mmPrivateAuthExpanded);
  $('privateAuthPanel')?.classList.toggle('hidden',!!mmPrivateUser||!mmPrivateAuthExpanded);
  $('privateInboxPanel')?.classList.toggle('hidden',!mmPrivateUser);
  if($('privateSignedInAs'))$('privateSignedInAs').textContent=mmPrivateUser?'Angemeldet als '+(mmPrivateUser.email||'Nutzer'):'';
}
async function privateSignUp(){
  const email=$('privateEmail')?.value.trim()||'',password=$('privatePassword')?.value||'',st=$('privateAuthStatus');
  if(!email||password.length<8){if(st)st.textContent='Bitte gib eine gültige E-Mail und ein Passwort mit mindestens 8 Zeichen ein.';return;}
  try{const sb=await getSb();const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname+'#feedback'}});if(error)throw error;if(st)st.textContent=data.session?'Konto erstellt. Du bist jetzt angemeldet.':'Konto wurde erstellt, aber Supabase hat noch keine Sitzung ausgegeben. Für den Zugang ohne E-Mail-Bestätigung muss „Confirm email“ in Supabase deaktiviert sein.';if(data.session){mmPrivateUser=data.user;privateSetView();await privateLoadMessages();}}
  catch(e){if(st)st.textContent='Registrierung fehlgeschlagen: '+(e.message||'');}
}
async function privateResendConfirmation(){
  const email=$('privateEmail')?.value.trim()||'',st=$('privateAuthStatus');
  if(!email){if(st)st.textContent='Bitte gib zuerst deine E-Mail-Adresse ein.';return;}
  try{
    const sb=await getSb();
    const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:window.location.origin+window.location.pathname+'#feedback'}});
    if(error)throw error;
    if(st)st.textContent='Falls für diese Adresse eine unbestätigte Registrierung besteht, wurde eine neue Bestätigungs-E-Mail angefordert. Bitte prüfe auch den Spam-Ordner.';
  }catch(e){if(st)st.textContent='E-Mail konnte nicht erneut angefordert werden: '+(e.message||'');}
}
async function privateAuthSubmit(event){event.preventDefault();const st=$('privateAuthStatus');try{const sb=await getSb();const {data,error}=await sb.auth.signInWithPassword({email:$('privateEmail').value.trim(),password:$('privatePassword').value});if(error)throw error;mmPrivateUser=data.user;$('privatePassword').value='';privateSetView();await privateLoadMessages();}catch(e){if(st)st.textContent='Anmeldung fehlgeschlagen: '+(e.message||'');}}
async function privateSignOut(){try{const sb=await getSb();await sb.auth.signOut();mmPrivateUser=null;mmPrivateConversationId=null;privateSetView();$('privateMessageList').innerHTML='';}catch(e){showToast(e.message||'Abmeldung fehlgeschlagen.');}}
async function privateLoadMessages(){
  const out=$('privateMessageList');if(!out||!mmPrivateUser)return;out.innerHTML='<article class="info-card">Nachrichten werden geladen …</article>';
  try{const sb=await getSb();const {data,error}=await sb.rpc('mm_private_user_list_messages');if(error)throw error;const rows=Array.isArray(data)?data:[];out.innerHTML=rows.length?rows.map(m=>`<article class="info-card"><div class="row" style="justify-content:space-between;gap:8px"><strong>${m.sender_role==='admin'?'🛡️ MatheMeister-Team':'👤 Du'}</strong><span class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleString('de-DE'))}</span></div><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</p></article>`).join(''):'<article class="info-card">Noch keine Nachrichten. Du kannst oben deine erste Nachricht senden.</article>';}
  catch(e){out.innerHTML=`<article class="info-card">Nachrichten konnten nicht geladen werden: ${esc(e.message||'')}</article>`;}
}
async function privateSendMessage(event){event.preventDefault();const text=$('privateMessageText')?.value.trim()||'',st=$('privateMessageStatus');if(text.length<3){if(st)st.textContent='Bitte schreibe mindestens 3 Zeichen.';return;}try{const sb=await getSb();const {error}=await sb.rpc('mm_private_user_send_message',{p_message:text});if(error)throw error;$('privateMessageText').value='';if(st)st.textContent='Deine Nachricht wurde gesendet.';await privateLoadMessages();}catch(e){if(st)st.textContent='Senden fehlgeschlagen: '+(e.message||'');}}
async function adminLoadPrivateConversations(){
  const out = $('adminPrivateConversations');
  const status = $('adminPrivateStatus');

  if (!out) {
    if (status) status.textContent = 'Der Nachrichtenbereich wurde im Dokument nicht gefunden.';
    return;
  }

  out.innerHTML = '<div class="admin-empty-state">Unterhaltungen werden geladen …</div>';

  try {
    const sb = await getSb();
    const { data, error } = await sb.rpc('mm_private_admin_list_conversations');
    if (error) throw error;

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    mmAdminPrivateRows = rows;

    const fragment = document.createDocumentFragment();

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'admin-empty-state';
      empty.textContent = 'Noch keine privaten Nachrichten.';
      fragment.appendChild(empty);
    } else {
      rows.forEach((row) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-conversation-item';

        const head = document.createElement('span');
        head.className = 'admin-conversation-head';

        const email = document.createElement('strong');
        email.textContent = row.email || 'Nutzer';
        head.appendChild(email);

        const unreadCount = Number(row.unread_count) || 0;
        if (unreadCount > 0) {
          const badge = document.createElement('span');
          badge.className = 'admin-unread-count';
          badge.textContent = String(unreadCount);
          head.appendChild(badge);
        }

        const preview = document.createElement('span');
        preview.className = 'admin-conversation-preview';
        preview.textContent = row.last_message || 'Noch keine Nachricht';

        const time = document.createElement('span');
        time.className = 'admin-conversation-time';
        const parsedDate = row.last_at ? new Date(row.last_at) : null;
        time.textContent = parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toLocaleString('de-DE')
          : '';

        button.append(head, preview, time);
        button.addEventListener('click', () => {
          if (row.conversation_id) adminOpenPrivateConversation(String(row.conversation_id));
        });
        fragment.appendChild(button);
      });
    }

    out.replaceChildren(fragment);
    out.style.display = 'grid';
    out.style.visibility = 'visible';

    const panel = out.closest('.admin-conversations-panel');
    if (panel) {
      panel.style.display = 'block';
      panel.style.visibility = 'visible';
    }

    if (status) status.textContent = `${rows.length} Unterhaltung(en) geladen.`;
    adminRenderOverview();
  } catch (error) {
    const message = error && error.message ? error.message : 'Unbekannter Fehler beim Laden.';
    out.innerHTML = '';
    const errorBox = document.createElement('div');
    errorBox.className = 'admin-empty-state';
    errorBox.textContent = message;
    out.appendChild(errorBox);
    if (status) status.textContent = 'Nachrichten konnten nicht geladen werden: ' + message;
  }
}
async function adminOpenPrivateConversation(id){
 mmPrivateConversationId=id;document.querySelectorAll('.admin-conversation-item').forEach(el=>el.classList.toggle('active',el.getAttribute('onclick')?.includes(String(id))));const out=$('adminPrivateThread');if(!out)return;out.innerHTML='<div class="admin-empty-state">Unterhaltung wird geladen …</div>';
 try{const sb=await getSb();const {data,error}=await sb.rpc('mm_private_admin_get_messages',{p_conversation_id:id});if(error)throw error;const rows=Array.isArray(data)?data:[];out.innerHTML=`<div class="info-grid">${rows.map(m=>`<article class="info-card"><strong>${m.sender_role==='admin'?'🛡️ Admin':'👤 Nutzer'}</strong><p class="muted" style="font-size:12px">${esc(new Date(m.created_at).toLocaleString('de-DE'))}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</p></article>`).join('')}</div><form class="feedback-form" onsubmit="adminSendPrivateReply(event)"><label for="adminPrivateReply">Antwort an Nutzer</label><textarea id="adminPrivateReply" required minlength="1" maxlength="3000" placeholder="Deine Antwort …"></textarea><button class="btn primary" type="submit">Antwort senden →</button><p id="adminPrivateReplyStatus" class="studio-field-note" role="status"></p></form>`;await adminLoadPrivateConversations();}
 catch(e){out.innerHTML=`<p class="muted">${esc(e.message||'Fehler beim Laden')}</p>`;}
}
async function adminSendPrivateReply(event){event.preventDefault();const text=$('adminPrivateReply')?.value.trim()||'',st=$('adminPrivateReplyStatus');if(!mmPrivateConversationId||!text)return;try{const sb=await getSb();const {error}=await sb.rpc('mm_private_admin_reply',{p_conversation_id:mmPrivateConversationId,p_message:text});if(error)throw error;await adminOpenPrivateConversation(mmPrivateConversationId);}catch(e){if(st)st.textContent='Antwort fehlgeschlagen: '+(e.message||'');}}

// Admin panel: the database RPCs are the authorization boundary; frontend visibility is not security.
let mmAdminSession = null;
let mmAdminFeedbackRows = [];
function adminStatusLabel(v){return ({new:'Neu',in_review:'In Bearbeitung',resolved:'Erledigt'})[v]||v;}
function adminCategoryLabel(v){return ({bug:'Fehler',idea:'Idee',game:'Spielmodus',design:'Design',other:'Sonstiges'})[v]||v;}
function adminSetView(isAdmin){$('adminLoginPanel')?.classList.toggle('hidden',isAdmin);$('adminDashboard')?.classList.toggle('hidden',!isAdmin);}
const mmAdminViewTitles={overview:'Admin Dashboard',feedback:'Feedback',messages:'Nachrichten'};
function adminNavigate(view){
 if(!mmAdminViewTitles[view])view='overview';
 document.querySelectorAll('[data-admin-panel]').forEach(el=>el.classList.toggle('hidden',el.dataset.adminPanel!==view));
 document.querySelectorAll('[data-admin-nav]').forEach(el=>el.classList.toggle('active',el.dataset.adminNav===view));
 const title=$('adminHeaderTitle');if(title)title.textContent=mmAdminViewTitles[view];
 adminToggleSidebar(false);
 if(view==='messages')adminLoadPrivateConversations();
 if(view==='overview')adminRenderOverview();
}
function adminToggleSidebar(force){
 const sidebar=$('adminSidebar'),overlay=$('adminDrawerOverlay'),button=document.querySelector('.admin-mobile-toggle');if(!sidebar||!overlay)return;
 const open=typeof force==='boolean'?force:!sidebar.classList.contains('open');
 sidebar.classList.toggle('open',open);overlay.classList.toggle('open',open);if(button)button.setAttribute('aria-expanded',String(open));
}
async function adminRefreshAll(){
 const button=document.querySelector('[data-admin-refresh]');if(button){button.disabled=true;button.style.opacity='.55';}
 try{await Promise.all([adminLoadFeedback(true),adminLoadPrivateConversations()]);adminRenderOverview();}
 finally{if(button){button.disabled=false;button.style.opacity='';}}
}
function adminRenderOverview(){
 const feedback=Array.isArray(mmAdminFeedbackRows)?mmAdminFeedbackRows:[];
 const conversations=Array.isArray(mmAdminPrivateRows)?mmAdminPrivateRows:[];
 const count=status=>feedback.filter(row=>row.status===status).length;
 const unread=conversations.reduce((sum,row)=>sum+(Number(row.unread_count)||0),0);
 const values={adminMetricNewFeedback:count('new'),adminMetricNewMessages:unread};
 Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el)el.textContent=String(value);});
 const feedbackBadge=$('adminNavFeedbackBadge');if(feedbackBadge)feedbackBadge.textContent=String(count('new'));
 const messageBadge=$('adminNavMessagesBadge');if(messageBadge)messageBadge.textContent=String(unread);
 const dot=$('adminTopUnreadDot');if(dot)dot.classList.toggle('hidden',unread===0);
 const recentFeedback=$('adminRecentFeedback');
 if(recentFeedback){
  const rows=[...feedback].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,4);
  recentFeedback.innerHTML=rows.length?rows.map(row=>`<div class="admin-recent-item"><span class="admin-recent-symbol ${row.category==='bug'?'admin-symbol-bug':row.category==='idea'?'admin-symbol-idea':''}">${row.category==='bug'?'!':row.category==='idea'?'✦':'☷'}</span><div class="admin-recent-copy"><strong>${esc(adminCategoryLabel(row.category))} · #${Number(row.id)}</strong><p>${esc(row.message||'')}</p></div><span class="admin-recent-time">${esc(new Date(row.created_at).toLocaleDateString('de-DE'))}</span></div>`).join(''):'<div class="admin-empty-state">Noch keine Rückmeldungen vorhanden.</div>';
 }
 const recentMessages=$('adminRecentMessages');
 if(recentMessages){
  const rows=[...conversations].sort((a,b)=>new Date(b.last_at)-new Date(a.last_at)).slice(0,4);
  recentMessages.innerHTML=rows.length?rows.map(row=>`<div class="admin-recent-item"><span class="admin-recent-symbol admin-symbol-message">✉</span><div class="admin-recent-copy"><strong>${esc(row.email||'Nutzer')}</strong><p>${esc(row.last_message||'Noch keine Nachricht')}</p></div><span class="admin-recent-time">${esc(row.last_at?new Date(row.last_at).toLocaleDateString('de-DE'):'')}</span></div>`).join(''):'<div class="admin-empty-state">Noch keine privaten Nachrichten vorhanden.</div>';
 }
 adminRenderActivityChart(feedback);
}
function adminRenderActivityChart(feedback){
 const out=$('adminActivityChart');if(!out)return;
 const days=[];const today=new Date();today.setHours(0,0,0,0);
 for(let offset=6;offset>=0;offset--){const date=new Date(today);date.setDate(today.getDate()-offset);days.push({date,count:0,label:date.toLocaleDateString('de-DE',{weekday:'short'}).replace('.','')});}
 feedback.forEach(row=>{const date=new Date(row.created_at);if(Number.isNaN(date.getTime()))return;date.setHours(0,0,0,0);const day=days.find(item=>item.date.getTime()===date.getTime());if(day)day.count++;});
 const max=Math.max(1,...days.map(day=>day.count));const chartWidth=620,left=30,right=605,top=17,bottom=145;
 const coords=days.map((day,index)=>({x:left+(right-left)*index/6,y:bottom-(day.count/max)*(bottom-top-12),...day}));
 const line=coords.map((point,index)=>(index?'L':'M')+point.x.toFixed(1)+' '+point.y.toFixed(1)).join(' ');
 const area=line+` L ${right} ${bottom} L ${left} ${bottom} Z`;
 const ticks=max<=3?Array.from({length:max+1},(_,index)=>index):[0,Math.round(max/3),Math.round(max*2/3),max];const grid=ticks.map(val=>{const y=bottom-(val/max)*(bottom-top);return `<line class="grid-line" x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}"/><text x="8" y="${(y+4).toFixed(1)}">${val}</text>`;}).join('');
 const labels=coords.map(point=>`<text x="${point.x.toFixed(1)}" y="169" text-anchor="middle">${esc(point.label)}</text><circle class="activity-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.3"><title>${point.count} Feedback</title></circle>`).join('');
 out.innerHTML=`<svg class="admin-activity-svg" viewBox="0 0 ${chartWidth} 180" role="img" aria-label="Feedback-Eingänge in den letzten sieben Tagen: ${days.map(day=>day.label+' '+day.count).join(', ')}"><defs><linearGradient id="adminActivityFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#9b69f5" stop-opacity=".43"/><stop offset="1" stop-color="#9b69f5" stop-opacity=".02"/></linearGradient></defs>${grid}<path class="activity-area" d="${area}"/><path class="activity-line" d="${line}"/>${labels}</svg>`;
}

function adminRestoreScroll(y){const target=Math.max(0,Number(y)||0);requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scrollTo({top:target,left:0,behavior:'instant'});requestAnimationFrame(()=>window.scrollTo({top:target,left:0,behavior:'instant'}));}));setTimeout(()=>window.scrollTo({top:target,left:0,behavior:'instant'}),120);}
async function adminCopyText(text,successMessage){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);}else{throw new Error('Clipboard API nicht verfügbar');}showToast(successMessage);}catch(_){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();showToast(ok?successMessage:'Kopieren nicht möglich – bitte Text markieren.');}}
async function adminCopyEmailSubject(id){const row=mmAdminFeedbackRows.find(r=>Number(r.id)===Number(id));if(!row?.contact_email){showToast('Keine E-Mail-Adresse vorhanden.');return;}await adminCopyText('Deine Nachricht an MatheMeister','Betreff wurde kopiert.');}
async function adminCopyEmailTemplate(id){const row=mmAdminFeedbackRows.find(r=>Number(r.id)===Number(id));if(!row?.contact_email){showToast('Keine E-Mail-Adresse vorhanden.');return;}await adminCopyText('Hallo,\n\n\n\nViele Grüße\nMatheMeister','E-Mail-Vorlage wurde kopiert.');}
async function adminLogin(event){
 event.preventDefault();const savedScrollY=window.scrollY||window.pageYOffset||0;const adminHistorySnapshot=mmScreenHistory.slice();const status=$('adminLoginStatus');const button=$('adminLoginForm')?.querySelector('button[type="submit"]');if(button)button.disabled=true;if(status)status.textContent='Anmeldung wird geprüft …';
 try{
  const sb=await getSb();const {data,error}=await sb.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});if(error)throw error;
  mmAdminSession=data.session;if(!mmAdminSession)throw new Error('Keine gültige Sitzung erhalten.');try{sessionStorage.setItem('mm-admin-screen-open-v1','1');localStorage.setItem('mm-admin-screen-open-v1','1');}catch(_){}
  $('adminPassword').value='';
  // Do not reveal the dashboard until the protected server-side RPC confirms admin access.
  await adminLoadFeedback(true);
  if(mmAdminSession)await adminLoadPrivateConversations();
  if(!mmAdminSession)throw new Error('Dieses Konto besitzt keine Administratorrechte.');
  $('adminSignedInAs').textContent='Angemeldet als '+(data.user?.email||'Administrator');if(status)status.textContent='';
  // Authentication must not navigate away from the admin screen or discard its return history.
  if((document.querySelector('.screen.active')?.id||'')!=='adminScreen'){mmScreenHistory.splice(0,mmScreenHistory.length,...adminHistorySnapshot);show('adminScreen',{fromBack:true,restoreScrollY:savedScrollY});}
  adminRestoreScroll(savedScrollY);
 }catch(e){const sb=await getSb().catch(()=>null);if(sb)await sb.auth.signOut().catch(()=>{});mmAdminSession=null;adminSetView(false);if(status)status.textContent='Anmeldung fehlgeschlagen: '+(e.message||'Bitte Zugangsdaten prüfen.');if((document.querySelector('.screen.active')?.id||'')!=='adminScreen'){mmScreenHistory.splice(0,mmScreenHistory.length,...adminHistorySnapshot);show('adminScreen',{fromBack:true,restoreScrollY:savedScrollY});adminRestoreScroll(savedScrollY);}}
 finally{if(button)button.disabled=false;}
}
async function adminRestoreSessionAfterRefresh(){
 const root=document.documentElement;
 let requested=false;
 try{requested=sessionStorage.getItem('mm-admin-screen-open-v1')==='1'||localStorage.getItem('mm-admin-screen-open-v1')==='1';}catch(_){requested=false;}
 if(!requested){root.classList.remove('admin-restoring');return;}
 // Reveal the Admin login/dashboard shell immediately so the public Home screen never flashes.
 show('adminScreen',{fromBack:true});
 const status=$('adminLoginStatus');
 try{
  const sb=await getSb();
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  if(!data.session){
   mmAdminSession=null;adminSetView(false);
   try{sessionStorage.removeItem('mm-admin-screen-open-v1');localStorage.removeItem('mm-admin-screen-open-v1');}catch(_){}
   if(status)status.textContent='Deine Admin-Sitzung ist abgelaufen. Bitte melde dich erneut an.';
   return;
  }
  mmAdminSession=data.session;
  $('adminSignedInAs').textContent='Angemeldet als '+(data.session.user?.email||'Administrator');
  if(status)status.textContent='Sitzung wird wiederhergestellt …';
  await adminLoadFeedback(true);
  if(mmAdminSession)await adminLoadPrivateConversations();
  if(status)status.textContent='';
 }catch(e){
  // Keep the auth session and restoration marker; transient network failures must not silently send the user Home.
  adminSetView(Boolean(mmAdminSession));
  if(status)status.textContent='Admin-Bereich geöffnet, aber die Sitzung konnte nicht vollständig geladen werden: '+(e.message||'Bitte Verbindung prüfen.');
 }finally{
  root.classList.remove('admin-restoring');
 }
}

function adminRenderFeedback(){
 const out=$('adminFeedbackList'),status=$('adminFeedbackStatus');if(!out)return;
 const term=($('adminSearch')?.value||'').trim().toLocaleLowerCase('de-DE');
 const rows=mmAdminFeedbackRows.filter(r=>!term||[r.message,r.contact_email,r.device,r.category,String(r.id)].some(v=>String(v||'').toLocaleLowerCase('de-DE').includes(term)));
 if(status)status.textContent=`${rows.length} von ${mmAdminFeedbackRows.length} geladenen Rückmeldungen angezeigt.`;
 if(!rows.length){out.innerHTML='<div class="admin-surface-card admin-empty-state">Keine passenden Rückmeldungen gefunden.</div>';adminRenderOverview();return;}
 out.innerHTML=rows.map(r=>{
  const id=Number(r.id),noteKey='mm-admin-note-'+id;let note='';try{note=localStorage.getItem(noteKey)||'';}catch(_){}
  const created=esc(new Date(r.created_at).toLocaleString('de-DE'));
  const statusClass=['new','in_review','resolved'].includes(r.status)?r.status:'new';
  const contact=r.contact_email?`<p class="admin-feedback-meta">✉ ${esc(r.contact_email)}</p><div class="admin-reply-actions"><a class="btn secondary" href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=${encodeURIComponent(r.contact_email)}&amp;su=${encodeURIComponent('Deine Nachricht an MatheMeister')}&amp;body=${encodeURIComponent('Hallo,\n\n\n\nViele Grüße\nMatheMeister')}" target="_blank" rel="noopener noreferrer">E-Mail beantworten ↗</a><a class="btn secondary" href="mailto:${encodeURIComponent(r.contact_email)}?subject=${encodeURIComponent('Deine Nachricht an MatheMeister')}&amp;body=${encodeURIComponent('Hallo,\n\n\n\nViele Grüße\nMatheMeister')}">E-Mail-App öffnen</a><button class="btn secondary" type="button" onclick="adminCopyEmailSubject(${id})">Betreff kopieren</button><button class="btn secondary" type="button" onclick="adminCopyEmailTemplate(${id})">Vorlage kopieren</button></div><p class="admin-feedback-meta">Hinweis: Feedback ist eine einseitige Rückmeldung. Eine Antwort erfolgt nur per E-Mail, sofern eine Adresse angegeben wurde.</p>`:`<p class="admin-feedback-meta">Keine E-Mail-Adresse angegeben – eine direkte Antwort ist nicht möglich.</p>`;
  return `<article class="admin-feedback-card"><div class="admin-feedback-head"><strong class="admin-feedback-category">#${id} · ${esc(adminCategoryLabel(r.category))}</strong><span class="admin-status-pill ${statusClass}">${esc(adminStatusLabel(r.status))}</span></div><p class="admin-feedback-message">${esc(r.message||'')}</p><p class="admin-feedback-meta">${created}${r.device?' · '+esc(r.device):''}</p>${contact}<label class="admin-note-label" for="adminNote${id}">Private Notiz <span>· nur in diesem Browser gespeichert</span></label><textarea id="adminNote${id}" class="admin-note" maxlength="1000" rows="2" placeholder="Eigene Notiz zu dieser Rückmeldung …" oninput="adminSaveNote(${id},this.value)">${esc(note)}</textarea><div class="admin-feedback-actions"><button class="btn secondary" type="button" onclick="adminUpdateFeedback(${id},'new')">Neu</button><button class="btn secondary" type="button" onclick="adminUpdateFeedback(${id},'in_review')">In Bearbeitung</button><button class="btn secondary" type="button" onclick="adminUpdateFeedback(${id},'resolved')">Erledigt</button><button class="btn secondary" type="button" onclick="adminDeleteFeedback(${id})">Löschen</button></div></article>`;
 }).join('');
 adminRenderOverview();
}
function adminSaveNote(id,value){try{localStorage.setItem('mm-admin-note-'+Number(id),String(value||'').slice(0,1000));}catch(_){showToast('Notiz konnte lokal nicht gespeichert werden.');}}
function adminSaveReply(id,value){try{localStorage.setItem('mm-admin-reply-'+Number(id),String(value||'').slice(0,3000));}catch(_){showToast('Antwortentwurf konnte nicht gespeichert werden.');}}
function adminGetReplyData(id){const row=mmAdminFeedbackRows.find(r=>Number(r.id)===Number(id));const draft=$('adminReply'+Number(id))?.value||'';return {row,draft:draft.trim()};}
function adminOpenReply(id){const {row,draft}=adminGetReplyData(id);if(!row?.contact_email){showToast('Für diese Meldung ist keine E-Mail-Adresse vorhanden.');return;}if(!draft){showToast('Bitte schreibe zuerst deine Antwort.');$('adminReply'+Number(id))?.focus();return;}const subject='Deine Nachricht an MatheMeister';const body='Hallo,\n\n'+draft+'\n\nViele Grüße\nMatheMeister';const href='mailto:'+encodeURIComponent(row.contact_email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);window.location.href=href;}
async function adminCopyReply(id){const {row,draft}=adminGetReplyData(id);if(!row?.contact_email){showToast('Für diese Meldung ist keine E-Mail-Adresse vorhanden.');return;}if(!draft){showToast('Bitte schreibe zuerst deine Antwort.');$('adminReply'+Number(id))?.focus();return;}const text='An: '+row.contact_email+'\nBetreff: Deine Nachricht an MatheMeister\n\nHallo,\n\n'+draft+'\n\nViele Grüße\nMatheMeister';try{await navigator.clipboard.writeText(text);showToast('Antworttext wurde kopiert.');}catch(_){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();showToast(ok?'Antworttext wurde kopiert.':'Kopieren nicht möglich – bitte Text markieren.');}}
async function adminLoadFeedback(keepDashboard=false){
 const savedScrollY=window.scrollY||window.pageYOffset||0;const out=$('adminFeedbackList'),status=$('adminFeedbackStatus');if(!out)return;out.innerHTML='';if(status)status.textContent='Berichte werden geladen …';
 try{
  const sb=await getSb();const {data:sessionData}=await sb.auth.getSession();mmAdminSession=sessionData.session;
  if(!mmAdminSession){adminSetView(false);mmAdminFeedbackRows=[];if(status)status.textContent='Bitte erneut anmelden.';return;}
  const st=$('adminStatusFilter')?.value||null,cat=$('adminCategoryFilter')?.value||null;
  const {data,error}=await sb.rpc('mm_admin_list_feedback',{p_status:st,p_category:cat});if(error)throw error;
  mmAdminFeedbackRows=Array.isArray(data)?data:[];adminSetView(true);adminRenderFeedback();adminRenderOverview();adminRestoreScroll(savedScrollY);
 }catch(e){mmAdminFeedbackRows=[];out.innerHTML='';if(status)status.textContent='Admin-Sitzung vorhanden, aber Daten konnten nicht geladen werden: '+(e.message||'Bitte Verbindung und Admin-Berechtigung prüfen.');if(keepDashboard&&mmAdminSession){adminSetView(true);}else{adminSetView(false);if(!keepDashboard){const sb=await getSb().catch(()=>null);if(sb)await sb.auth.signOut().catch(()=>{});mmAdminSession=null;}}}
}
async function adminUpdateFeedback(id,statusValue){try{const sb=await getSb();const {data,error}=await sb.rpc('mm_admin_update_feedback',{p_id:id,p_status:statusValue});if(error)throw error;if(!data)throw new Error('Meldung nicht gefunden.');showToast('Status aktualisiert.');await adminLoadFeedback();}catch(e){showToast('Änderung fehlgeschlagen: '+(e.message||''));}}
async function adminDeleteFeedback(id){if(!await customConfirm({title:'Meldung löschen?',message:'Diese Meldung wird dauerhaft gelöscht. Möchtest du fortfahren?',confirmText:'Endgültig löschen',cancelText:'Abbrechen',icon:'🗑️',tone:'danger'}))return;try{const sb=await getSb();const {data,error}=await sb.rpc('mm_admin_delete_feedback',{p_id:id});if(error)throw error;if(!data)throw new Error('Meldung nicht gefunden.');showToast('Meldung gelöscht.');await adminLoadFeedback();}catch(e){showToast('Löschen fehlgeschlagen: '+(e.message||''));}}
async function adminSignOut(){try{const sb=await getSb();await sb.auth.signOut();try{sessionStorage.removeItem('mm-admin-screen-open-v1');localStorage.removeItem('mm-admin-screen-open-v1');}catch(_){}mmAdminSession=null;mmAdminFeedbackRows=[];adminSetView(false);$('adminFeedbackList').innerHTML='';$('adminLoginStatus').textContent='Du wurdest abgemeldet.';}catch(e){showToast(e.message||'Abmeldung fehlgeschlagen.');}}

$('joinCode').addEventListener('input',
e=>e.target.value=e.target.value.replace(/\D/g,
'').slice(0,
5));
const joinFromQr = new URLSearchParams(window.location.search).get('join');
if (joinFromQr && /^\d{5}$/.test(joinFromQr)) {
    $('joinCode').value = joinFromQr;
    $('joinName').value = data.name || '';
    show('live');
    checkJoinRoomSettings();
    setTimeout(() => $('joinCode').scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
}
ensureEconomy();
updateLiveOptionsUI();
renderAll();
creatorPreviewInit();
loadStudioFromLink();
creatorLoadSharedLink();
showFeedbackSuccessIfNeeded();
restoreAppViewState();
$('siteFeedbackForm')?.addEventListener('submit',handleFeedbackSubmit);
$('privateAuthForm')?.addEventListener('submit',privateAuthSubmit);
$('privateMessageForm')?.addEventListener('submit',privateSendMessage);
$('adminLoginForm')?.addEventListener('submit',adminLogin);
document.addEventListener('keydown',e=>{if(e.key==='Escape')adminToggleSidebar(false);});
$('adminStatusFilter')?.addEventListener('change',adminLoadFeedback);
$('adminCategoryFilter')?.addEventListener('change',adminLoadFeedback);
$('adminSearch')?.addEventListener('input',adminRenderFeedback);
if (typeof restoreLiveSession === 'function') setTimeout(restoreLiveSession, 100);
setTimeout(adminRestoreSessionAfterRefresh, 0);

// Diagnostic marker: set only after the application initialization completed.
document.documentElement.setAttribute('data-mathemeister-ready', 'true');
