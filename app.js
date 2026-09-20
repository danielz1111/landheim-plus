const cfg = window.LANDHEIM_PLUS_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("DEINE_") && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.startsWith("DEIN_");
let supabaseClient=null, profile=null, classes=[], archivedClasses=[], currentClassId=null, currentState=null;
let members=[], pointEvents=[], classEvents=[], rewards=[], platinumAwards=[];
let accountStudentId=null, historyMode="all";
const $=id=>document.getElementById(id);
const cats=["Mitarbeit","Zuverlässigkeit","Teamwork","Fokus","Hilfsbereitschaft"];
const catIcons={Mitarbeit:"💬",Zuverlässigkeit:"✓",Teamwork:"🤝",Fokus:"🎯",Hilfsbereitschaft:"♥"};
const milestoneMeta={4:["⚡","Erster Unlock"],8:["🎁","Mystery"],12:["🎵","Team-Bonus"],16:["🗳️","Klassen-Voting"],20:["🏆","Season geschafft"]};

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function sum(arr,key="delta"){return arr.reduce((a,x)=>a+(Number(x[key])||0),0)}
function isTeacher(){return profile?.role==="teacher"}
function weekStart(){const d=new Date(),day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d}
function isThisWeek(ts){return ts&&new Date(ts)>=weekStart()}
function currentSchoolYear(){const d=new Date();let y=d.getFullYear();if(d.getMonth()<7)y--;return `${y}/${String(y+1).slice(-2)}`}
function showMsg(id,msg,ok=false){const el=$(id);if(!el)return;el.textContent=msg||"";el.classList.toggle("ok",!!ok)}
function activeClass(){return classes.find(c=>c.id===currentClassId)}
function classPoints(){return Math.max(0,sum(classEvents))}
function weekClassPoints(){return Math.max(0,sum(classEvents.filter(e=>isThisWeek(e.created_at))))}
function studentEvents(id){return pointEvents.filter(e=>e.recipient_user_id===id)}
function weeklyStudentPoints(id){return Math.max(0,sum(studentEvents(id).filter(e=>isThisWeek(e.created_at))))}
function categoryCounts(events){const out=Object.fromEntries(cats.map(c=>[c,0]));events.forEach(e=>out[e.category]=(out[e.category]||0)+(Number(e.delta)||0));Object.keys(out).forEach(k=>out[k]=Math.max(0,out[k]));return out}
function platinumFor(id){return platinumAwards.some(x=>x.student_user_id===id&&x.school_year===currentSchoolYear())}
function tierFor(events,platinum=false){const points=Math.max(0,sum(events)),counts=categoryCounts(events),breadth=Object.values(counts).filter(v=>v>0).length;if(platinum)return{key:"platinum",name:"Platin",icon:"💎",points,breadth,next:null};if(points>=20&&breadth>=3)return{key:"gold",name:"Gold",icon:"🥇",points,breadth,next:null};if(points>=10)return{key:"silver",name:"Silber",icon:"🥈",points,breadth,next:20};if(points>=4)return{key:"bronze",name:"Bronze",icon:"🥉",points,breadth,next:10};return{key:"start",name:"Start",icon:"○",points,breadth,next:4}}
function tierHint(t){if(t.points>=20&&t.breadth<3)return `20 Punkte erreicht – für Gold noch ${3-t.breadth} weitere Bereiche nötig.`;if(t.next)return `Noch ${Math.max(0,t.next-t.points)} Punkte bis ${t.next===4?"Bronze":t.next===10?"Silber":"Gold"}.`;return t.key==="gold"?"Gold erreicht. Platin bleibt eine besondere Jahresauszeichnung.":"Besondere Jahresauszeichnung."}
function setRoleUI(){document.querySelectorAll(".teacher-only").forEach(el=>el.classList.toggle("hidden",!isTeacher()));document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",isTeacher()));$("roleLabel").textContent=isTeacher()?"Lehrkraft":"Schüler/in"}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$(id)?.classList.remove("hidden");document.querySelectorAll(".nav[data-target]").forEach(b=>b.classList.toggle("active",b.dataset.target===id));if(id==="history")renderHistory();if(id==="archive")renderArchive();if(id==="rewards")renderRewards()}

async function init(){
  if(!configured){$("loginBtn").disabled=true;showMsg("loginMsg","Supabase-Konfiguration fehlt.");return}
  supabaseClient=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
  const displayToken=new URLSearchParams(location.search).get("display");
  if(displayToken){await loadPublicDisplay(displayToken);return}
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(session)await enterApp(session.user);
  supabaseClient.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT")location.reload()});
}

async function loadPublicDisplay(token){
  $("loginView").classList.add("hidden");$("publicDisplayView").classList.remove("hidden");
  const {data,error}=await supabaseClient.rpc("get_public_class_display",{p_token:token});
  if(error||!data){$("publicClassName").textContent="Anzeige nicht verfügbar";return}
  $("publicClassName").textContent=data.class_name||"Klasse";
  const p=Number(data.points||0),goal=Number(data.season_goal||20),wp=Number(data.week_points||0);
  $("publicPoints").textContent=p;$("publicEnergy").style.width=Math.min(100,p/goal*100)+"%";
  renderMilestonesInto($("publicMilestones"),p,true);
  setLessonSlot($("publicLesson1"),wp>=1);setLessonSlot($("publicLesson2"),wp>=2);
  $("publicChallenge").textContent=data.challenge_text||"Noch keine Challenge";$("publicChallengeNow").textContent=data.challenge_current||0;$("publicChallengeGoal").textContent=data.challenge_goal||2;$("publicChallengeBar").style.width=Math.min(100,Number(data.challenge_current||0)/Number(data.challenge_goal||2)*100)+"%";
  $("publicRewards").innerHTML=(data.rewards||[]).map(r=>`<div class="public-reward ${r.unlocked?"open":""}"><b>${escapeHtml(r.emoji||"🎁")}</b><strong>${r.milestone} Punkte</strong><div>${escapeHtml(r.label||"Mystery Unlock")}</div></div>`).join("");
  setInterval(async()=>{const {data:d}=await supabaseClient.rpc("get_public_class_display",{p_token:token});if(d){history.replaceState(null,"",location.href);location.reload()}},60000);
}

$("loginBtn").onclick=async()=>{showMsg("loginMsg","");const raw=$("email").value.trim().toLowerCase(),password=$("password").value,email=raw.includes("@")?raw:`${raw}@students.landheim-plus.invalid`;const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){showMsg("loginMsg",error.message);return}await enterApp(data.user)};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click()});
$("logoutBtn").onclick=()=>supabaseClient.auth.signOut();

async function enterApp(user){
  const {data:p,error}=await supabaseClient.from("profiles").select("*").eq("id",user.id).single();
  if(error||!p){showMsg("loginMsg","Profil konnte nicht geladen werden.");return}
  profile=p;
  if(profile.role==="student"&&profile.must_change_password){$("loginView").classList.add("hidden");$("shell").classList.add("hidden");$("forcePasswordView").classList.remove("hidden");return}
  $("forcePasswordView").classList.add("hidden");$("loginView").classList.add("hidden");$("shell").classList.remove("hidden");$("welcomeName").textContent=`Hallo ${p.display_name||"!"}`;setRoleUI();await loadClasses();showPage("dashboard");
}

async function loadClasses(){
  if(isTeacher()){
    const {data,error}=await supabaseClient.from("classes").select("*").eq("teacher_id",profile.id).order("name");if(error){console.error(error);return}
    classes=(data||[]).filter(c=>!c.archived_at);archivedClasses=(data||[]).filter(c=>!!c.archived_at);
  }else{
    const {data,error}=await supabaseClient.rpc("get_my_classes");if(error){console.error(error);return}classes=data||[];archivedClasses=[];
    const joinNav=document.querySelector('.nav[data-target="join"]');if(joinNav)joinNav.classList.toggle("hidden",classes.length>0);
  }
  $("classSelect").innerHTML=classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if(!classes.some(c=>c.id===currentClassId))currentClassId=classes[0]?.id||null;
  await loadCurrentClass();
}
$("classSelect").onchange=async e=>{currentClassId=e.target.value;await loadCurrentClass()};

async function loadCurrentClass(){
  if(!currentClassId){$("noClass").classList.remove("hidden");$("dashboardBody").classList.add("hidden");$("noClassText").textContent=isTeacher()?"Lege unter Verwaltung zuerst eine Klasse an.":"Dein Konto ist noch keiner Klasse zugeordnet.";$("className").textContent="";renderArchive();return}
  $("noClass").classList.add("hidden");$("dashboardBody").classList.remove("hidden");const c=activeClass();$("className").textContent=c?.name||"";$("classSelect").value=currentClassId;
  const {data:state,error:se}=await supabaseClient.from("class_state").select("*").eq("class_id",currentClassId).single();if(se){alert("Bitte zuerst die finale Supabase-Migration ausführen.\n"+se.message);return}currentState=state;
  const start=currentState.season_started_at||"1970-01-01T00:00:00Z";
  const [ce,rw,pa]=await Promise.all([
    supabaseClient.from("class_point_events").select("*").eq("class_id",currentClassId).gte("created_at",start).order("created_at",{ascending:false}),
    supabaseClient.rpc("get_class_rewards",{p_class:currentClassId}),
    supabaseClient.from("platinum_awards").select("*").eq("class_id",currentClassId)
  ]);
  classEvents=ce.error?[]:(ce.data||[]);rewards=rw.error?[]:(rw.data||[]);platinumAwards=pa.error?[]:(pa.data||[]);
  if(isTeacher()){
    const [m,pe]=await Promise.all([
      supabaseClient.from("class_members").select("student_user_id, profiles!class_members_student_user_id_fkey(display_name, username)").eq("class_id",currentClassId),
      supabaseClient.from("point_events").select("id,recipient_user_id,delta,category,note,reverses_event_id,created_at").eq("class_id",currentClassId).order("created_at",{ascending:false})
    ]);members=m.error?[]:(m.data||[]);pointEvents=pe.error?[]:(pe.data||[]);
  }else{
    const {data:pe,error}=await supabaseClient.from("point_events").select("id,recipient_user_id,delta,category,note,reverses_event_id,created_at").eq("class_id",currentClassId).eq("recipient_user_id",profile.id).order("created_at",{ascending:false});pointEvents=error?[]:(pe||[]);members=[];
  }
  renderDashboard();if(isTeacher())renderStudents();renderRewards();renderManage();renderHistory();renderArchive();
}

function renderMilestonesInto(el,p,publicMode=false){el.innerHTML=[4,8,12,16,20].map(at=>{const [icon,label]=milestoneMeta[at],done=p>=at,next=!done&&[4,8,12,16,20].find(x=>p<x)===at;return `<div class="milestone-node ${done?"done":""} ${next?"next":""}"><b>${icon} ${at}</b>${label}</div>`}).join("")}
function setLessonSlot(el,done){el.classList.toggle("done",done);const b=el.querySelector("b");if(b)b.textContent=done?"✓":"○"}

function renderDashboard(){
  const cp=classPoints(),wp=weekClassPoints(),goal=Number(currentState?.season_goal||20);$("seasonNumber").textContent=currentState?.season_number||1;$("classPoints").textContent=cp;$("bigPoints").textContent=cp;$("orbNumber").textContent=cp;$("weekClassPoints").textContent=`${wp}/2`;$("orbFill").style.height=Math.min(100,cp/goal*100)+"%";renderMilestonesInto($("milestoneTrack"),cp);
  setLessonSlot($("lessonSlot1"),wp>=1);setLessonSlot($("lessonSlot2"),wp>=2);$("awardClassPointBtn").disabled=wp>=2||cp>=goal;$("mobileWeekStatus").textContent=`Klasse ${wp}/2`;$("mobileClassPointBtn").disabled=wp>=2||cp>=goal;
  $("challenge").textContent=currentState?.challenge_text||"Noch keine Challenge";$("challengeNow").textContent=currentState?.challenge_current||0;$("challengeGoal").textContent=currentState?.challenge_goal||2;$("challengeBar").style.width=Math.min(100,Number(currentState?.challenge_current||0)/Number(currentState?.challenge_goal||2)*100)+"%";
  $("streak").textContent=currentState?.streak||0;$("streakFlames").textContent="🔥".repeat(Math.min(5,currentState?.streak||0))+"○".repeat(Math.max(0,5-(currentState?.streak||0)));
  const next=rewards.find(r=>!r.unlocked);if(next){$("rewardTitle").textContent=`Bei ${next.milestone} Punkten`;$("rewardIcon").textContent=next.is_mystery?"🔒🎁":(next.emoji||"🎁");$("rewardText").textContent=`${next.label} · noch ${Math.max(0,next.milestone-cp)} Punkt${next.milestone-cp===1?"":"e"}`;}else{$("rewardTitle").textContent="Season geschafft!";$("rewardIcon").textContent="🏆✨";$("rewardText").textContent="Alle Freischaltungen erreicht."}
  if(isTeacher())$("individualTotal").textContent=Math.max(0,sum(pointEvents));else{const mine=Math.max(0,sum(pointEvents));$("myPoints").textContent=mine;renderPersonalDashboard()}
}

function renderPersonalDashboard(){
  const tier=tierFor(pointEvents,platinumFor(profile.id)),counts=categoryCounts(pointEvents),weekly=Math.max(0,sum(pointEvents.filter(e=>isThisWeek(e.created_at))));$("myTierTitle").textContent=tier.name;$("myTierMedal").textContent=tier.icon;$("myTierMedal").className=`tier-medal ${tier.key}`;$("myTierHint").textContent=tierHint(tier);
  let pct=100;if(tier.key==="start")pct=tier.points/4*100;else if(tier.key==="bronze")pct=(tier.points-4)/6*100;else if(tier.key==="silver")pct=(tier.points-10)/10*100;$("myTierBar").style.width=Math.max(0,Math.min(100,pct))+"%";$("myTierMeta").innerHTML=`<span><strong>${tier.points}</strong> Pluspunkte</span><span><strong>${tier.breadth}/5</strong> Bereiche</span><span>Diese Woche <strong>${weekly}/2</strong></span>`;
  $("myCategories").innerHTML=cats.map(c=>`<div class="category"><span>${catIcons[c]} ${c}</span><b>${counts[c]||0}</b><div class="mini"><i style="width:${Math.min(100,(counts[c]||0)/5*100)}%"></i></div></div>`).join("");
  const badgeDefs=[["Teamplayer","Teamwork"],["Fokus-Profi","Fokus"],["Verlässlich","Zuverlässigkeit"],["Unterstützer","Hilfsbereitschaft"],["Aktiv dabei","Mitarbeit"]];const badges=badgeDefs.map(([n,c])=>`<span class="skill-badge ${(counts[c]||0)>=3?"earned":""}">${(counts[c]||0)>=3?"✓ ":""}${n}</span>`);if(Object.values(counts).every(v=>v>0))badges.push('<span class="skill-badge earned">★ Allrounder</span>');$("myBadges").innerHTML=badges.join("");
}

function renderStudents(){
  const query=($("studentSearch")?.value||"").trim().toLowerCase();const reversed=new Set(pointEvents.filter(e=>e.reverses_event_id).map(e=>e.reverses_event_id));const anyPlatinumThisYear=platinumAwards.some(a=>a.school_year===currentSchoolYear());
  $("studentCards").innerHTML=members.filter(m=>(m.profiles?.display_name||"").toLowerCase().includes(query)).map(m=>{const ev=studentEvents(m.student_user_id),plat=platinumFor(m.student_user_id),tier=tierFor(ev,plat),name=m.profiles?.display_name||"Schüler/in",username=m.profiles?.username||"",weekly=Math.max(0,sum(ev.filter(e=>isThisWeek(e.created_at)))),eligible=tier.key==="gold"&&!plat&&!anyPlatinumThisYear;return `<div class="student"><div class="student-head"><div style="display:flex;gap:9px;align-items:center"><div class="avatar">${escapeHtml(name.slice(0,2).toUpperCase())}</div><div><div class="student-name">${escapeHtml(name)}</div><div class="student-meta">${username?"@"+escapeHtml(username):"kein Benutzername"}</div></div></div><span class="tier-chip ${tier.key}">${tier.icon} ${tier.name}</span></div><div class="points-row"><div class="points">${tier.points} <small>Pluspunkte</small></div><div class="week-chip">Woche ${weekly}/2</div></div><div class="quick-awards">${cats.map(c=>`<button class="quickBtn" data-user="${m.student_user_id}" data-cat="${c}" ${weekly>=2?"disabled":""} title="${c}">${catIcons[c]}<br>${c}</button>`).join("")}</div><div class="account-actions"><button class="accountBtn" data-user="${m.student_user_id}" data-name="${escapeHtml(name)}" data-username="${escapeHtml(username)}">🔐 Zugang</button>${eligible?`<button class="platinumBtn" data-platinum="${m.student_user_id}" data-name="${escapeHtml(name)}">💎 Platin</button>`:""}</div></div>`}).join("")||'<div class="card">Keine passenden Schüler/innen.</div>';
  document.querySelectorAll(".quickBtn").forEach(btn=>btn.onclick=()=>awardIndividual(btn.dataset.user,btn.dataset.cat));document.querySelectorAll(".accountBtn").forEach(btn=>btn.onclick=()=>openAccountModal(btn.dataset.user,btn.dataset.name,btn.dataset.username));document.querySelectorAll(".platinumBtn").forEach(btn=>btn.onclick=()=>awardPlatinum(btn.dataset.platinum,btn.dataset.name));
}
async function awardIndividual(studentId,category){const {error}=await supabaseClient.rpc("award_individual_point",{p_class:currentClassId,p_student:studentId,p_category:category,p_note:null});if(error)alert(error.message);await loadCurrentClass()}
async function awardPlatinum(studentId,name){if(!confirm(`${name} wirklich die Platin-Auszeichnung ${currentSchoolYear()} verleihen? Pro Klasse ist nur eine Platin-Auszeichnung pro Schuljahr möglich.`))return;const {error}=await supabaseClient.rpc("award_platinum",{p_class:currentClassId,p_student:studentId,p_note:null});if(error)alert(error.message);else await loadCurrentClass()}
$("studentSearch").addEventListener("input",renderStudents);

function renderRewards(){
  if(!$("rewardGrid"))return;$("rewardGrid").innerHTML=(rewards||[]).map(r=>`<article class="reward-card ${r.unlocked?"unlocked":"locked"} ${r.claimed?"claimed":""}"><div class="reward-point">${r.milestone} Punkte</div><div class="reward-emoji">${escapeHtml(r.emoji||"🎁")}</div><h3>${escapeHtml(r.label||"Mystery Unlock")}</h3><p>${escapeHtml(r.description||"")}</p><div class="reward-status ${r.unlocked?"open":""}">${r.claimed?"✓ Eingelöst":r.unlocked?"✓ Freigeschaltet":"🔒 Noch gesperrt"}</div>${isTeacher()?`<div class="reward-actions"><button class="editRewardBtn" data-id="${r.id}">Bearbeiten</button>${r.unlocked&&!r.claimed?`<button class="claimRewardBtn" data-id="${r.id}">Als eingelöst markieren</button>`:""}</div>`:""}</article>`).join("");document.querySelectorAll(".editRewardBtn").forEach(b=>b.onclick=()=>openRewardModal(b.dataset.id));document.querySelectorAll(".claimRewardBtn").forEach(b=>b.onclick=()=>claimReward(b.dataset.id));
}
function openRewardModal(id){const r=rewards.find(x=>String(x.id)===String(id));if(!r)return;$("rewardEditId").value=r.id;$("rewardEditEmoji").value=r.emoji||"";$("rewardEditLabel").value=r.raw_label||r.label||"";$("rewardEditDescription").value=r.description||"";$("rewardEditMystery").checked=!!r.is_mystery;showMsg("rewardEditMsg","");$("rewardModal").classList.remove("hidden")}
$("closeRewardModalBtn").onclick=()=>$("rewardModal").classList.add("hidden");
$("saveRewardBtn").onclick=async()=>{const {error}=await supabaseClient.rpc("update_class_reward",{p_reward_id:Number($("rewardEditId").value),p_emoji:$("rewardEditEmoji").value.trim(),p_label:$("rewardEditLabel").value.trim(),p_description:$("rewardEditDescription").value.trim(),p_is_mystery:$("rewardEditMystery").checked});if(error){showMsg("rewardEditMsg",error.message);return}$("rewardModal").classList.add("hidden");await loadCurrentClass()};
async function claimReward(id){const {error}=await supabaseClient.rpc("claim_class_reward",{p_reward_id:Number(id)});if(error)alert(error.message);else await loadCurrentClass()}

function memberName(id){if(id===profile?.id)return profile.display_name||"Ich";return members.find(m=>m.student_user_id===id)?.profiles?.display_name||"Schüler/in"}
function renderHistory(){
  if(!$("historyList"))return;const reversedInd=new Set(pointEvents.filter(e=>e.reverses_event_id).map(e=>Number(e.reverses_event_id))),reversedClass=new Set(classEvents.filter(e=>e.reverses_event_id).map(e=>Number(e.reverses_event_id)));let items=[];
  if(historyMode!=="class")items.push(...pointEvents.map(e=>({kind:"individual",id:e.id,when:e.created_at,delta:e.delta,title:isTeacher()?memberName(e.recipient_user_id):"Mein Pluspunkt",sub:`${e.category}${e.note?" · "+e.note:""}`,reversed:reversedInd.has(Number(e.id)),reversal:!!e.reverses_event_id})));
  if(historyMode!=="individual")items.push(...classEvents.map(e=>({kind:"class",id:e.id,when:e.created_at,delta:e.delta,title:"Klassenpunkt",sub:`${e.reason||"Doppelstunde"}${e.note?" · "+e.note:""}`,reversed:reversedClass.has(Number(e.id)),reversal:!!e.reverses_event_id})));
  items.sort((a,b)=>new Date(b.when)-new Date(a.when));$("historySubtitle").textContent=isTeacher()?"Alle Punkte bleiben nachvollziehbar; Fehlvergaben werden als Korrektur dokumentiert.":"Du siehst deine eigenen Pluspunkte und den gemeinsamen Klassenverlauf.";$("historyList").innerHTML=items.slice(0,120).map(i=>`<div class="history-item ${i.delta<0?"negative":""}"><div class="history-icon">${i.kind==="class"?"👥":(i.delta>0?"＋":"↩")}</div><div class="history-main"><strong>${escapeHtml(i.title)} · ${i.delta>0?"+1":"−1"}</strong><small>${escapeHtml(i.sub)}</small></div><div class="history-side">${new Date(i.when).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})}${isTeacher()&&i.delta>0&&!i.reversed?`<button class="undoBtn" data-kind="${i.kind}" data-id="${i.id}">Korrigieren</button>`:""}</div></div>`).join("")||'<div class="card">Noch kein Verlauf vorhanden.</div>';document.querySelectorAll(".undoBtn").forEach(b=>b.onclick=()=>undoEvent(b.dataset.kind,b.dataset.id));
}
$("historyFilter").onchange=e=>{historyMode=e.target.value;renderHistory()};
async function undoEvent(kind,id){if(!confirm("Diesen Punkt als Fehlvergabe korrigieren? Der ursprüngliche Eintrag bleibt im Verlauf sichtbar."))return;const fn=kind==="class"?"reverse_class_point":"reverse_individual_point",args=kind==="class"?{p_event_id:Number(id),p_note:"Korrektur"}:{p_event_id:Number(id),p_note:"Korrektur"};const {error}=await supabaseClient.rpc(fn,args);if(error)alert(error.message);else await loadCurrentClass()}

async function awardClassPoint(){showMsg("classPointMsg","");const {error}=await supabaseClient.rpc("award_class_point",{p_class:currentClassId,p_reason:"Doppelstunde"});if(error)showMsg("classPointMsg",error.message);else await loadCurrentClass()}
$("awardClassPointBtn").onclick=awardClassPoint;$("mobileClassPointBtn").onclick=awardClassPoint;

function renderManage(){if(!isTeacher()||!currentClassId)return;const c=activeClass();$("joinCode").textContent=c?.join_code||"–";$("challengeInput").value=currentState?.challenge_text||"";const link=displayLink();$("displayLinkText").textContent=link}
function displayLink(){const token=activeClass()?.public_display_token;return token?`${location.origin}${location.pathname}?display=${token}`:""}
$("displayBtn").onclick=()=>{const u=displayLink();if(u)window.open(u,"_blank")};$("openDisplayLinkBtn").onclick=()=>{const u=displayLink();if(u)window.open(u,"_blank")};$("copyDisplayLinkBtn").onclick=async()=>{const u=displayLink();if(!u)return;try{await navigator.clipboard.writeText(u);$("displayLinkText").textContent="✓ Link kopiert: "+u}catch{$("displayLinkText").textContent=u}};

$("createClassBtn").onclick=async()=>{const name=$("newClassName").value.trim();if(!name)return;const {error}=await supabaseClient.from("classes").insert({name,teacher_id:profile.id,school_year:currentSchoolYear()});showMsg("createMsg",error?error.message:"Klasse angelegt.",!error);if(!error){$("newClassName").value="";await loadClasses();showPage("manage")}};
$("challengePlusBtn").onclick=async()=>{const {error}=await supabaseClient.rpc("increment_challenge",{p_class:currentClassId});if(error)showMsg("challengeMsg",error.message);else await loadCurrentClass()};
$("challengeResetBtn").onclick=async()=>{const {error}=await supabaseClient.rpc("reset_challenge",{p_class:currentClassId});if(error)showMsg("challengeMsg",error.message);else await loadCurrentClass()};
$("saveChallengeBtn").onclick=async()=>{const {error}=await supabaseClient.from("class_state").update({challenge_text:$("challengeInput").value.trim(),challenge_goal:2}).eq("class_id",currentClassId);showMsg("challengeMsg",error?error.message:"Gespeichert.",!error);if(!error)await loadCurrentClass()};
$("startSeasonBtn").onclick=async()=>{const cp=classPoints();if(cp<20&&!confirm(`Die aktuelle Season hat erst ${cp}/20 Punkte. Trotzdem neu starten?`))return;const {error}=await supabaseClient.rpc("start_new_season",{p_class:currentClassId});showMsg("seasonMsg",error?error.message:"Neue Season gestartet.",!error);if(!error)await loadCurrentClass()};
$("rolloverBtn").onclick=async()=>{const name=$("rolloverName").value.trim();if(!name){showMsg("rolloverMsg","Bitte einen neuen Klassennamen eingeben.");return}if(!confirm("Aktuelle Klasse archivieren und neue Klasse anlegen?"))return;const {data,error}=await supabaseClient.rpc("rollover_class",{p_class:currentClassId,p_new_name:name,p_copy_students:$("copyStudents").checked});showMsg("rolloverMsg",error?error.message:"Schuljahreswechsel abgeschlossen.",!error);if(!error){currentClassId=data;$("rolloverName").value="";await loadClasses();showPage("dashboard")}};

function renderArchive(){$("archiveList").innerHTML=archivedClasses.map(c=>`<article class="archive-card"><h3>${escapeHtml(c.name)}</h3><div class="archive-meta">Schuljahr ${escapeHtml(c.school_year||"–")} · archiviert ${c.archived_at?new Date(c.archived_at).toLocaleDateString("de-DE"):""}</div><div class="buttonrow" style="margin-top:12px"><button class="restoreBtn" data-id="${c.id}">Wiederherstellen</button></div></article>`).join("")||'<div class="card">Noch keine archivierten Klassen.</div>';document.querySelectorAll(".restoreBtn").forEach(b=>b.onclick=async()=>{const {error}=await supabaseClient.rpc("restore_archived_class",{p_class:b.dataset.id});if(error)alert(error.message);else await loadClasses()})}

$("joinBtn").onclick=async()=>{const code=$("joinInput").value.trim().toUpperCase();const {error}=await supabaseClient.rpc("join_class_by_code",{p_code:code});showMsg("joinMsg",error?error.message:"Klasse erfolgreich hinzugefügt.",!error);if(!error){$("joinInput").value="";await loadClasses();showPage("dashboard")}};

function normalizeUsernamePart(s){return String(s||"").trim().toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9-]+/g,".").replace(/^\.+|\.+$/g,"").replace(/\.+/g,".")}
function passwordFromBirthdate(d){const m=String(d||"").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?`${m[1]}${m[2]}${m[3]}`:null}
function parseBulkStudents(text){const used=new Map(),out=[],errors=[];String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{const p=line.split(";").map(x=>x.trim());if(p.length<3){errors.push(`Zeile ${i+1}: Formatfehler`);return}const[last,first,birth]=p,pw=passwordFromBirthdate(birth);if(!pw){errors.push(`Zeile ${i+1}: Geburtsdatum ungültig`);return}let base=`${normalizeUsernamePart(first)}.${normalizeUsernamePart(last)}`,username=base,n=(used.get(base)||0)+1;used.set(base,n);if(n>1)username=`${base}${n}`;out.push({display_name:`${first} ${last}`.trim(),username,initial_password:pw})});return{students:out,errors}}
$("bulkImportBtn").onclick=async()=>{showMsg("bulkImportMsg","");const parsed=parseBulkStudents($("bulkImportInput").value);if(parsed.errors.length){showMsg("bulkImportMsg",parsed.errors.join(" | "));return}if(!parsed.students.length){showMsg("bulkImportMsg","Keine Importdaten gefunden.");return}$("bulkImportBtn").disabled=true;showMsg("bulkImportMsg",`${parsed.students.length} Konten werden angelegt …`);const {data,error}=await supabaseClient.functions.invoke("bulk-create-students",{body:{class_id:currentClassId,students:parsed.students}});$("bulkImportBtn").disabled=false;if(error){showMsg("bulkImportMsg",error.message);return}const failed=(data?.results||[]).filter(x=>!x.ok);showMsg("bulkImportMsg",failed.length?`${data.created} angelegt, ${failed.length} Fehler: `+failed.map(x=>`${x.username}: ${x.error}`).join(" | "):`${data.created} Schülerkonten erfolgreich angelegt.`,!failed.length);if(!failed.length)$("bulkImportInput").value="";await loadCurrentClass()};

$("changePasswordBtn").onclick=async()=>{showMsg("passwordMsg","");const a=$("newPassword1").value,b=$("newPassword2").value;if(a.length<10){showMsg("passwordMsg","Bitte mindestens 10 Zeichen verwenden.");return}if(a!==b){showMsg("passwordMsg","Die Passwörter stimmen nicht überein.");return}const {error}=await supabaseClient.auth.updateUser({password:a});if(error){showMsg("passwordMsg",error.message);return}const {error:e2}=await supabaseClient.rpc("complete_first_login");if(e2){showMsg("passwordMsg",e2.message);return}$("forcePasswordView").classList.add("hidden");const {data:{user}}=await supabaseClient.auth.getUser();await enterApp(user)};

function openAccountModal(id,name,username){accountStudentId=id;$("accountModalTitle").textContent=name||"Schülerkonto";$("accountModalInfo").textContent=username?`Benutzername: ${username}`:"Kein Benutzername hinterlegt.";$("temporaryPassword").value="";showMsg("accountModalMsg","");$("accountModal").classList.remove("hidden")}
$("closeAccountModalBtn").onclick=()=>{$("accountModal").classList.add("hidden");accountStudentId=null};
$("confirmResetPasswordBtn").onclick=async()=>{if(!accountStudentId)return;const pw=$("temporaryPassword").value.trim();if(pw.length<8){showMsg("accountModalMsg","Mindestens 8 Zeichen erforderlich.");return}const {data,error}=await supabaseClient.functions.invoke("manage-student-account",{body:{action:"reset_password",class_id:currentClassId,student_user_id:accountStudentId,temporary_password:pw}});showMsg("accountModalMsg",error?error.message:(data?.message||"Passwort zurückgesetzt."),!error)};
$("removeStudentBtn").onclick=async()=>{if(!accountStudentId||!confirm("Schüler/in wirklich aus dieser Klasse entfernen? Das Benutzerkonto bleibt bestehen."))return;const {error}=await supabaseClient.functions.invoke("manage-student-account",{body:{action:"remove_from_class",class_id:currentClassId,student_user_id:accountStudentId}});if(error){showMsg("accountModalMsg",error.message);return}$("accountModal").classList.add("hidden");accountStudentId=null;await loadCurrentClass()};
$("exportUsernamesBtn").onclick=()=>{const c=activeClass(),rows=[["Name","Benutzername","Klasse"]];members.forEach(m=>rows.push([m.profiles?.display_name||"",m.profiles?.username||"",c?.name||""]));const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${(c?.name||"klasse").replace(/\s+/g,"_")}_Benutzernamen.csv`;a.click();URL.revokeObjectURL(a.href)};

document.querySelectorAll(".nav[data-target]").forEach(btn=>btn.onclick=()=>showPage(btn.dataset.target));
init();
