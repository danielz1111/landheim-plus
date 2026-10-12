const cfg = window.LANDHEIM_PLUS_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("DEINE_") && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.startsWith("DEIN_");
let supabaseClient=null, profile=null, classes=[], archivedClasses=[], currentClassId=null, currentState=null;
let members=[], pointEvents=[], classEvents=[], rewards=[], platinumAwards=[], focusGoals=[], shopState={personal_balance:0,class_balance:0,tier_rank:0,items:[],requests:[]}, shopClassmates=[];
let accountStudentId=null, historyMode="all", goalEditorStudentId=null, shopScope="personal", shopModalItemId=null;
let newsShownThisSession=false, pendingSeenSnapshot=null, previousLiveState=null;
const $=id=>document.getElementById(id);
const cats=["Mitarbeit","Zuverlässigkeit","Teamwork","Fokus","Hilfsbereitschaft"];
const catIcons={Mitarbeit:"💬",Zuverlässigkeit:"✓",Teamwork:"🤝",Fokus:"🎯",Hilfsbereitschaft:"♥",Klasse:"👥"};
const classGoalPresets=[
  ["Klasse","Wir sind innerhalb von zwei Minuten arbeitsbereit."],
  ["Fokus","Wir arbeiten in Arbeitsphasen ruhig und konzentriert."],
  ["Zuverlässigkeit","Wir haben unser benötigtes Material vollständig dabei."],
  ["Teamwork","Wir arbeiten in Gruppen konstruktiv zusammen."],
  ["Hilfsbereitschaft","Wir gehen respektvoll und unterstützend miteinander um."],
  ["Mitarbeit","Wir beteiligen uns aktiv und lassen einander ausreden."],
  ["Klasse","Wir beenden die Stunde gemeinsam ordentlich und vorbereitet."]
];
const studentGoalPresets=[
  ["Mitarbeit","Ich beteilige mich regelmäßig mit passenden Beiträgen."],
  ["Mitarbeit","Ich frage nach, wenn etwas unklar ist."],
  ["Fokus","Ich beginne zügig mit der Arbeit."],
  ["Fokus","Ich bleibe in Arbeitsphasen bei der Aufgabe."],
  ["Fokus","Ich lasse mich weniger ablenken."],
  ["Zuverlässigkeit","Ich habe mein Material vollständig dabei."],
  ["Zuverlässigkeit","Ich erledige Arbeitsaufträge vollständig."],
  ["Zuverlässigkeit","Ich halte Absprachen und Termine ein."],
  ["Teamwork","Ich höre anderen aufmerksam zu."],
  ["Teamwork","Ich arbeite konstruktiv mit anderen zusammen."],
  ["Teamwork","Ich übernehme Verantwortung in der Gruppe."],
  ["Hilfsbereitschaft","Ich unterstütze andere, ohne ihnen die Arbeit abzunehmen."],
  ["Hilfsbereitschaft","Ich gehe respektvoll mit anderen um."],
  ["Hilfsbereitschaft","Ich trage zu einer guten Arbeitsatmosphäre bei."]
];
const milestoneMeta={4:["⚡","Erster Unlock"],8:["🎁","Mystery"],12:["🎵","Team-Bonus"],16:["🗳️","Klassen-Voting"],20:["🏆","Season geschafft"]};
const praiseTexts={
  Mitarbeit:["Stark gemacht – du hast dich aktiv eingebracht.","Guter Beitrag – deine Mitarbeit hat heute geholfen.","Du warst aufmerksam dabei und hast dich eingebracht."],
  Zuverlässigkeit:["Verlässlich – auf dich konnte man sich heute verlassen.","Gut vorbereitet und zuverlässig gearbeitet.","Du hast deine Aufgabe zuverlässig im Blick behalten."],
  Teamwork:["Stark im Team – du hast andere gut mitgenommen.","Gemeinsam klappt es besser – guter Teambeitrag.","Du hast konstruktiv mit anderen zusammengearbeitet."],
  Fokus:["Konzentriert geblieben – das hat sich ausgezahlt.","Du bist bei der Sache geblieben. Stark!","Guter Fokus – ruhig, klar und drangeblieben."],
  Hilfsbereitschaft:["Danke fürs Unterstützen – das stärkt die Gruppe.","Du hast anderen geholfen, ohne ihnen die Arbeit abzunehmen.","Hilfsbereit und fair – genau so funktioniert Gemeinschaft."]
};

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function sum(arr,key="delta"){return arr.reduce((a,x)=>a+(Number(x[key])||0),0)}
function isTeacher(){return profile?.role==="teacher"}
function weekStart(){const d=new Date(),day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d}
function isThisWeek(ts){return ts&&new Date(ts)>=weekStart()}
function currentSchoolYear(){const d=new Date();let y=d.getFullYear();if(d.getMonth()<7)y--;return `${y}/${String(y+1).slice(-2)}`}
function showMsg(id,msg,ok=false){const el=$(id);if(!el)return;el.textContent=msg||"";el.classList.toggle("ok",!!ok)}
function activeClass(){return classes.find(c=>c.id===currentClassId)}
function classFocusGoals(){return focusGoals.filter(g=>g.is_active&&g.student_user_id==null)}
function individualFocusGoals(studentId){return focusGoals.filter(g=>g.is_active&&g.student_user_id===studentId)}
function focusIcon(category){return catIcons[category]||"🎯"}
function tierName(rank){return ["Start","Bronze","Silber","Gold","Platin"][Number(rank)||0]||"Start"}
function renderFocusList(goals,emptyText="Noch kein Fokus festgelegt."){
  if(!goals?.length)return `<div class="focus-empty">${escapeHtml(emptyText)}</div>`;
  return goals.map(g=>`<div class="focus-item"><div class="focus-icon">${focusIcon(g.category)}</div><div><strong>${escapeHtml(g.title)}</strong><small>${escapeHtml(g.category||"Ziel")}</small></div></div>`).join("");
}
function classPoints(){return Math.max(0,sum(classEvents))}
function weekClassPoints(){return Math.max(0,sum(classEvents.filter(e=>isThisWeek(e.created_at))))}
function studentEvents(id){return pointEvents.filter(e=>e.recipient_user_id===id)}
function weeklyStudentPoints(id){return Math.max(0,sum(studentEvents(id).filter(e=>isThisWeek(e.created_at))))}
function categoryCounts(events){const out=Object.fromEntries(cats.map(c=>[c,0]));events.forEach(e=>out[e.category]=(out[e.category]||0)+(Number(e.delta)||0));Object.keys(out).forEach(k=>out[k]=Math.max(0,out[k]));return out}
function platinumFor(id){return platinumAwards.some(x=>x.student_user_id===id&&x.school_year===currentSchoolYear())}
function tierFor(events,platinum=false){const points=Math.max(0,sum(events)),counts=categoryCounts(events),breadth=Object.values(counts).filter(v=>v>0).length;if(platinum)return{key:"platinum",name:"Platin",icon:"💎",points,breadth,next:null};if(points>=20&&breadth>=3)return{key:"gold",name:"Gold",icon:"🥇",points,breadth,next:null};if(points>=10)return{key:"silver",name:"Silber",icon:"🥈",points,breadth,next:20};if(points>=4)return{key:"bronze",name:"Bronze",icon:"🥉",points,breadth,next:10};return{key:"start",name:"Start",icon:"○",points,breadth,next:4}}
function tierHint(t){if(t.points>=20&&t.breadth<3)return `20 Punkte erreicht – für Gold noch ${3-t.breadth} weitere Bereiche nötig.`;if(t.next)return `Noch ${Math.max(0,t.next-t.points)} Punkte bis ${t.next===4?"Bronze":t.next===10?"Silber":"Gold"}.`;return t.key==="gold"?"Gold erreicht. Platin bleibt eine besondere Jahresauszeichnung.":"Besondere Jahresauszeichnung."}
function setRoleUI(){document.querySelectorAll(".teacher-only").forEach(el=>el.classList.toggle("hidden",!isTeacher()));document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",isTeacher()));$("roleLabel").textContent=isTeacher()?"Lehrkraft":"Schüler/in"}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$(id)?.classList.remove("hidden");document.querySelectorAll(".nav[data-target]").forEach(b=>b.classList.toggle("active",b.dataset.target===id));if(id==="history")renderHistory();if(id==="archive")renderArchive();if(id==="rewards")renderRewards();if(id==="goals")renderGoalsPage();if(id==="shop")renderShop()}

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
  $("publicClassFocus").innerHTML=renderFocusList(data.class_focus||[],"Noch kein Klassenfokus festgelegt.");
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
  const [ce,rw,pa,fg,ss,sc]=await Promise.all([
    supabaseClient.from("class_point_events").select("*").eq("class_id",currentClassId).gte("created_at",start).order("created_at",{ascending:false}),
    supabaseClient.rpc("get_class_rewards",{p_class:currentClassId}),
    supabaseClient.from("platinum_awards").select("*").eq("class_id",currentClassId),
    supabaseClient.from("focus_goals").select("id,class_id,student_user_id,category,title,is_active,completed_at,created_at").eq("class_id",currentClassId).eq("is_active",true).order("id"),
    supabaseClient.rpc("get_shop_state",{p_class:currentClassId}),
    supabaseClient.rpc("get_shop_classmates",{p_class:currentClassId})
  ]);
  classEvents=ce.error?[]:(ce.data||[]);rewards=rw.error?[]:(rw.data||[]);platinumAwards=pa.error?[]:(pa.data||[]);focusGoals=fg.error?[]:(fg.data||[]);
  shopState=ss.error?{personal_balance:0,class_balance:0,tier_rank:0,items:[],requests:[]}:(ss.data||{personal_balance:0,class_balance:0,tier_rank:0,items:[],requests:[]});
  shopClassmates=sc.error?[]:(sc.data||[]);
  if(isTeacher()){
    const [m,pe]=await Promise.all([
      supabaseClient.from("class_members").select("student_user_id, profiles!class_members_student_user_id_fkey(display_name, username)").eq("class_id",currentClassId),
      supabaseClient.from("point_events").select("id,recipient_user_id,delta,category,note,reverses_event_id,created_at").eq("class_id",currentClassId).order("created_at",{ascending:false})
    ]);members=m.error?[]:(m.data||[]);pointEvents=pe.error?[]:(pe.data||[]);
  }else{
    const {data:pe,error}=await supabaseClient.from("point_events").select("id,recipient_user_id,delta,category,note,reverses_event_id,created_at").eq("class_id",currentClassId).eq("recipient_user_id",profile.id).order("created_at",{ascending:false});pointEvents=error?[]:(pe||[]);members=[];
  }
  renderDashboard();if(isTeacher()){renderStudents();renderGoalsPage()}renderShop();renderRewards();renderManage();renderHistory();renderArchive();
}

function renderMilestonesInto(el,p,publicMode=false){el.innerHTML=[4,8,12,16,20].map(at=>{const [icon,label]=milestoneMeta[at],done=p>=at,next=!done&&[4,8,12,16,20].find(x=>p<x)===at;return `<div class="milestone-node ${done?"done":""} ${next?"next":""}"><b>${icon} ${at}</b>${label}</div>`}).join("")}
function setLessonSlot(el,done){el.classList.toggle("done",done);const b=el.querySelector("b");if(b)b.textContent=done?"✓":"○"}

function renderDashboard(){
  const cp=classPoints(),wp=weekClassPoints(),goal=Number(currentState?.season_goal||20);$("seasonNumber").textContent=currentState?.season_number||1;$("classPoints").textContent=cp;$("bigPoints").textContent=cp;$("orbNumber").textContent=cp;$("weekClassPoints").textContent=`${wp}/2`;$("orbFill").style.height=Math.min(100,cp/goal*100)+"%";renderMilestonesInto($("milestoneTrack"),cp);
  setLessonSlot($("lessonSlot1"),wp>=1);setLessonSlot($("lessonSlot2"),wp>=2);$("awardClassPointBtn").disabled=wp>=2||cp>=goal;$("mobileWeekStatus").textContent=`Klasse ${wp}/2`;$("mobileClassPointBtn").disabled=wp>=2||cp>=goal;
  $("challenge").textContent=currentState?.challenge_text||"Noch keine Challenge";$("challengeNow").textContent=currentState?.challenge_current||0;$("challengeGoal").textContent=currentState?.challenge_goal||2;$("challengeBar").style.width=Math.min(100,Number(currentState?.challenge_current||0)/Number(currentState?.challenge_goal||2)*100)+"%";
  $("streak").textContent=currentState?.streak||0;$("streakFlames").textContent="🔥".repeat(Math.min(5,currentState?.streak||0))+"○".repeat(Math.max(0,5-(currentState?.streak||0)));
  const next=rewards.find(r=>!r.unlocked);if(next){$("rewardTitle").textContent=`Bei ${next.milestone} Punkten`;$("rewardIcon").textContent=next.is_mystery?"🔒🎁":(next.emoji||"🎁");$("rewardText").textContent=`${next.label} · noch ${Math.max(0,next.milestone-cp)} Punkt${next.milestone-cp===1?"":"e"}`;}else{$("rewardTitle").textContent="Season geschafft!";$("rewardIcon").textContent="🏆✨";$("rewardText").textContent="Alle Freischaltungen erreicht."}
  $("classFocusList").innerHTML=renderFocusList(classFocusGoals(),"Noch kein Klassenfokus festgelegt.");
  if(isTeacher())$("individualTotal").textContent=Math.max(0,sum(pointEvents));else{const mine=Math.max(0,sum(pointEvents));$("myPoints").textContent=mine;$("myBonusBalance").textContent=shopState.personal_balance||0;renderPersonalDashboard()}
}

function renderPersonalDashboard(){
  const tier=tierFor(pointEvents,platinumFor(profile.id)),counts=categoryCounts(pointEvents),weekly=Math.max(0,sum(pointEvents.filter(e=>isThisWeek(e.created_at))));$("myTierTitle").textContent=tier.name;$("myTierMedal").textContent=tier.icon;$("myTierMedal").className=`tier-medal ${tier.key}`;$("myTierHint").textContent=tierHint(tier);
  let pct=100;if(tier.key==="start")pct=tier.points/4*100;else if(tier.key==="bronze")pct=(tier.points-4)/6*100;else if(tier.key==="silver")pct=(tier.points-10)/10*100;$("myTierBar").style.width=Math.max(0,Math.min(100,pct))+"%";$("myTierMeta").innerHTML=`<span><strong>${tier.points}</strong> Pluspunkte</span><span><strong>${tier.breadth}/5</strong> Bereiche</span><span>Diese Woche <strong>${weekly}/2</strong></span>`;
  $("myCategories").innerHTML=cats.map(c=>`<div class="category"><span>${catIcons[c]} ${c}</span><b>${counts[c]||0}</b><div class="mini"><i style="width:${Math.min(100,(counts[c]||0)/5*100)}%"></i></div></div>`).join("");
  const badgeDefs=[["Teamplayer","Teamwork"],["Fokus-Profi","Fokus"],["Verlässlich","Zuverlässigkeit"],["Unterstützer","Hilfsbereitschaft"],["Aktiv dabei","Mitarbeit"]];const badges=badgeDefs.map(([n,c])=>`<span class="skill-badge ${(counts[c]||0)>=3?"earned":""}">${(counts[c]||0)>=3?"✓ ":""}${n}</span>`);if(Object.values(counts).every(v=>v>0))badges.push('<span class="skill-badge earned">★ Allrounder</span>');$("myBadges").innerHTML=badges.join("");
  $("myFocusGoals").innerHTML=renderFocusList(individualFocusGoals(profile.id),"Für dich ist aktuell kein individuelles Ziel festgelegt.");
}

function renderStudents(){
  const query=($("studentSearch")?.value||"").trim().toLowerCase();const reversed=new Set(pointEvents.filter(e=>e.reverses_event_id).map(e=>e.reverses_event_id));const anyPlatinumThisYear=platinumAwards.some(a=>a.school_year===currentSchoolYear());
  $("studentCards").innerHTML=members.filter(m=>(m.profiles?.display_name||"").toLowerCase().includes(query)).map(m=>{const ev=studentEvents(m.student_user_id),plat=platinumFor(m.student_user_id),tier=tierFor(ev,plat),name=m.profiles?.display_name||"Schüler/in",username=m.profiles?.username||"",weekly=Math.max(0,sum(ev.filter(e=>isThisWeek(e.created_at)))),eligible=tier.key==="gold"&&!plat&&!anyPlatinumThisYear;return `<div class="student"><div class="student-head"><div style="display:flex;gap:9px;align-items:center"><div class="avatar">${escapeHtml(name.slice(0,2).toUpperCase())}</div><div><div class="student-name">${escapeHtml(name)}</div><div class="student-meta">${username?"@"+escapeHtml(username):"kein Benutzername"}</div></div></div><span class="tier-chip ${tier.key}">${tier.icon} ${tier.name}</span></div><div class="points-row"><div class="points">${tier.points} <small>Pluspunkte</small></div><div class="week-chip">Woche ${weekly}/2</div></div>${individualFocusGoals(m.student_user_id).length?`<div class="student-focus-inline">${individualFocusGoals(m.student_user_id).map(g=>`<span class="student-focus-chip" title="${escapeHtml(g.title)}">${focusIcon(g.category)} ${escapeHtml(g.title)}</span>`).join("")}</div><div class="goal-award-row">${individualFocusGoals(m.student_user_id).map(g=>`<button class="goal-award-btn" data-user="${m.student_user_id}" data-cat="${escapeHtml(g.category)}" data-title="${escapeHtml(g.title)}" ${weekly>=2?"disabled":""}>✓ Ziel: ${escapeHtml(g.title)}</button>`).join("")}</div>`:""}<div class="quick-awards">${cats.map(c=>`<button class="quickBtn" data-user="${m.student_user_id}" data-cat="${c}" ${weekly>=2?"disabled":""} title="${c}">${catIcons[c]}<br>${c}</button>`).join("")}</div><div class="account-actions"><button class="studentGoalBtn" data-goal-user="${m.student_user_id}" data-name="${escapeHtml(name)}">🎯 Ziele</button><button class="accountBtn" data-user="${m.student_user_id}" data-name="${escapeHtml(name)}" data-username="${escapeHtml(username)}">🔐 Zugang</button>${eligible?`<button class="platinumBtn" data-platinum="${m.student_user_id}" data-name="${escapeHtml(name)}">💎 Platin</button>`:""}</div></div>`}).join("")||'<div class="card">Keine passenden Schüler/innen.</div>';
  document.querySelectorAll(".quickBtn").forEach(btn=>btn.onclick=()=>awardIndividual(btn.dataset.user,btn.dataset.cat,null));document.querySelectorAll(".goal-award-btn").forEach(btn=>btn.onclick=()=>awardIndividual(btn.dataset.user,btn.dataset.cat,`Ziel: ${btn.dataset.title}`));document.querySelectorAll(".studentGoalBtn").forEach(btn=>btn.onclick=()=>openGoalModal(btn.dataset.goalUser,btn.dataset.name));document.querySelectorAll(".accountBtn").forEach(btn=>btn.onclick=()=>openAccountModal(btn.dataset.user,btn.dataset.name,btn.dataset.username));document.querySelectorAll(".platinumBtn").forEach(btn=>btn.onclick=()=>awardPlatinum(btn.dataset.platinum,btn.dataset.name));
}
async function awardIndividual(studentId,category,note=null){const {error}=await supabaseClient.rpc("award_individual_point",{p_class:currentClassId,p_student:studentId,p_category:category,p_note:note});if(error)alert(error.message);await loadCurrentClass()}
async function awardPlatinum(studentId,name){if(!confirm(`${name} wirklich die Platin-Auszeichnung ${currentSchoolYear()} verleihen? Pro Klasse ist nur eine Platin-Auszeichnung pro Schuljahr möglich.`))return;const {error}=await supabaseClient.rpc("award_platinum",{p_class:currentClassId,p_student:studentId,p_note:null});if(error)alert(error.message);else await loadCurrentClass()}
$("studentSearch").addEventListener("input",renderStudents);


function renderGoalsPage(){
  if(!isTeacher()||!currentClassId||!$("goalStudentGrid"))return;
  $("classFocusManageList").innerHTML=renderFocusList(classFocusGoals(),"Noch kein Klassenfokus festgelegt.");
  const q=($("goalStudentSearch")?.value||"").trim().toLowerCase();
  $("goalStudentGrid").innerHTML=members
    .filter(m=>(m.profiles?.display_name||"").toLowerCase().includes(q))
    .map(m=>{
      const name=m.profiles?.display_name||"Schüler/in";
      const gs=individualFocusGoals(m.student_user_id);
      return `<article class="goal-student-card">
        <div class="goal-student-head">
          <div><strong>${escapeHtml(name)}</strong><div class="student-meta">${escapeHtml(m.profiles?.username||"")}</div></div>
          <button class="goalEditStudentBtn" data-id="${m.student_user_id}" data-name="${escapeHtml(name)}">Bearbeiten</button>
        </div>
        <div class="focus-list">${gs.length?gs.map(g=>`<div class="focus-item"><div class="focus-icon">${focusIcon(g.category)}</div><div style="flex:1"><strong>${escapeHtml(g.title)}</strong><small>${escapeHtml(g.category)}</small><button class="goal-complete-btn" data-goal-complete="${g.id}">✓ Ziel erreicht · +3 Bonuspunkte</button></div></div>`).join(""):`<div class="focus-empty">Noch kein individuelles Ziel.</div>`}</div>
      </article>`;
    }).join("") || '<div class="card">Keine passenden Schüler/innen.</div>';
  document.querySelectorAll(".goalEditStudentBtn").forEach(b=>b.onclick=()=>openGoalModal(b.dataset.id,b.dataset.name));
  document.querySelectorAll(".goal-complete-btn").forEach(b=>b.onclick=async()=>{if(!confirm("Ziel als erreicht markieren und 3 Bonuspunkte gutschreiben?"))return;const {error}=await supabaseClient.rpc("complete_focus_goal",{p_goal_id:Number(b.dataset.goalComplete)});if(error)alert(error.message);else await loadCurrentClass()});
}

function goalOptionsHtml(selected,isClassGoal){
  const opts=isClassGoal?["Klasse",...cats]:cats;
  return opts.map(c=>`<option value="${c}" ${c===selected?"selected":""}>${focusIcon(c)} ${c}</option>`).join("");
}

function openGoalModal(studentId=null,name=""){
  goalEditorStudentId=studentId||null;
  const isClassGoal=!goalEditorStudentId;
  $("goalModalTitle").textContent=isClassGoal?"Klassenfokus festlegen":`Ziele für ${name}`;
  $("goalModalInfo").textContent=isClassGoal
    ?"Diese Ziele sehen alle Mitglieder der Klasse und die Smartboard-Ansicht."
    :"Diese Ziele sieht nur die betreffende Person und die Lehrkraft.";

  const existing=isClassGoal?classFocusGoals():individualFocusGoals(goalEditorStudentId);
  const initial=[...existing];
  while(initial.length<3)initial.push({category:isClassGoal?"Klasse":"Fokus",title:""});

  $("goalEditorRows").innerHTML=initial.slice(0,3).map((g,i)=>`
    <div class="goal-editor-row" data-row="${i}">
      <select class="goalCategory">${goalOptionsHtml(g.category||(isClassGoal?"Klasse":"Fokus"),isClassGoal)}</select>
      <input class="goalTitle" maxlength="180" value="${escapeHtml(g.title||"")}" placeholder="${isClassGoal?"z. B. Wir sind in zwei Minuten arbeitsbereit.":"z. B. Ich beginne zügig mit der Arbeit."}">
      <button class="goal-remove-btn" type="button">Leeren</button>
    </div>`).join("");

  document.querySelectorAll(".goal-remove-btn").forEach(btn=>btn.onclick=()=>{
    btn.closest(".goal-editor-row").querySelector(".goalTitle").value="";
  });

  const presets=isClassGoal?classGoalPresets:studentGoalPresets;
  $("goalSuggestionChips").innerHTML=presets.map(([cat,title])=>
    `<button type="button" class="goal-suggestion-chip" data-cat="${escapeHtml(cat)}" data-title="${escapeHtml(title)}">${focusIcon(cat)} ${escapeHtml(title)}</button>`
  ).join("");
  document.querySelectorAll(".goal-suggestion-chip").forEach(btn=>btn.onclick=()=>{
    const rows=[...document.querySelectorAll(".goal-editor-row")];
    const target=rows.find(r=>!r.querySelector(".goalTitle").value.trim())||rows[rows.length-1];
    target.querySelector(".goalCategory").value=btn.dataset.cat;
    target.querySelector(".goalTitle").value=btn.dataset.title;
  });

  showMsg("goalModalMsg","");
  $("goalModal").classList.remove("hidden");
}

$("closeGoalModalBtn").onclick=()=>{$("goalModal").classList.add("hidden");goalEditorStudentId=null};
$("editClassFocusBtn").onclick=()=>openGoalModal(null,"");
$("editClassFocusPageBtn").onclick=()=>openGoalModal(null,"");
$("goalStudentSearch").addEventListener("input",renderGoalsPage);

$("saveGoalsBtn").onclick=async()=>{
  const goals=[...document.querySelectorAll(".goal-editor-row")].map(row=>({
    category:row.querySelector(".goalCategory").value,
    title:row.querySelector(".goalTitle").value.trim()
  })).filter(g=>g.title);

  $("saveGoalsBtn").disabled=true;
  const {error}=await supabaseClient.rpc("save_focus_goals",{
    p_class:currentClassId,
    p_student:goalEditorStudentId,
    p_goals:goals
  });
  $("saveGoalsBtn").disabled=false;

  if(error){showMsg("goalModalMsg",error.message);return}
  $("goalModal").classList.add("hidden");
  goalEditorStudentId=null;
  await loadCurrentClass();
};



function shopItemEligible(item){
  if(isTeacher())return true;
  if(item.scope==="class")return Number(shopState.class_balance||0)>=Number(item.cost||0);
  const tierOk=Number(shopState.tier_rank||0)>=Number(item.min_tier||0);
  const balanceOk=Number(shopState.personal_balance||0)>=Number(item.cost||0)||Number(item.group_max||1)>1;
  return tierOk&&balanceOk;
}
function shopTierText(rank){return ["ohne Stufe","Bronze","Silber","Gold","Platin"][Number(rank)||0]||"ohne Stufe"}
function renderShop(){
  if(!$("shopItemGrid")||!currentClassId)return;
  $("shopPersonalBalance").textContent=shopState.personal_balance||0;
  $("shopClassBalance").textContent=shopState.class_balance||0;
  $("shopPersonalTab").classList.toggle("active",shopScope==="personal");
  $("shopClassTab").classList.toggle("active",shopScope==="class");

  const items=(shopState.items||[]).filter(i=>i.scope===shopScope);
  $("shopItemGrid").innerHTML=items.map(i=>{
    const eligible=shopItemEligible(i),tags=[];
    if(i.scope==="personal")tags.push(shopTierText(i.min_tier));
    if(Number(i.group_max||1)>1)tags.push(`bis ${i.group_max} gemeinsam`);
    if(i.once_per_school_year)tags.push("1× pro Schuljahr");
    let reason="";
    if(!isTeacher()&&!eligible){
      if(i.scope==="personal"&&Number(shopState.tier_rank||0)<Number(i.min_tier||0))reason=`Erst ab ${shopTierText(i.min_tier)}`;
      else reason="Guthaben reicht noch nicht";
    }
    return `<article class="shop-card ${!eligible&&!isTeacher()?"locked":""}">
      <div class="shop-card-top"><div class="shop-emoji">${escapeHtml(i.emoji||"🎁")}</div><div class="shop-price">${i.cost} ✦</div></div>
      <h3>${escapeHtml(i.title)}</h3><p>${escapeHtml(i.description||"")}</p>
      <div class="shop-tags">${tags.map(t=>`<span class="shop-tag">${escapeHtml(t)}</span>`).join("")}</div>
      ${isTeacher()?`<div class="hint">Für Schüler/innen im Shop sichtbar.</div>`:`<button class="shop-buy" data-shop-item="${i.id}" ${!eligible?"disabled":""}>${eligible?"Beantragen":escapeHtml(reason)}</button>`}
    </article>`;
  }).join("");

  document.querySelectorAll(".shop-buy").forEach(b=>b.onclick=()=>openShopModal(Number(b.dataset.shopItem)));
  $("shopRequestTitle").textContent=isTeacher()?"Shop-Anträge":"Meine Anträge";
  $("shopRequestSubtitle").textContent=isTeacher()?"Erst mit deiner Bestätigung wird Guthaben abgezogen.":"Guthaben wird erst nach Bestätigung durch die Lehrkraft abgezogen.";
  const reqs=shopState.requests||[];
  $("shopRequestList").innerHTML=reqs.length?reqs.map(r=>`<div class="shop-request">
    <div><strong>${escapeHtml(r.item_emoji||"🎁")} ${escapeHtml(r.item_title||"Belohnung")} · ${r.cost} ✦</strong>
      ${isTeacher()?`<small>Beantragt von ${escapeHtml(r.requester_name||"Schüler/in")}</small>`:""}
      <span class="shop-status ${r.status}">${r.status==="pending"?"offen":r.status==="approved"?"✓ bestätigt":"abgelehnt"}</span>
      ${r.teacher_note?`<small>${escapeHtml(r.teacher_note)}</small>`:""}
    </div>
    ${isTeacher()&&r.status==="pending"?`<div class="shop-request-actions"><button class="approve shopResolveBtn" data-id="${r.id}" data-approve="1">Bestätigen</button><button class="reject shopResolveBtn" data-id="${r.id}" data-approve="0">Ablehnen</button></div>`:""}
  </div>`).join(""):'<div class="focus-empty">Noch keine Shop-Anträge.</div>';

  document.querySelectorAll(".shopResolveBtn").forEach(b=>b.onclick=async()=>{
    const approve=b.dataset.approve==="1",note=approve?null:(prompt("Optionaler Hinweis zur Ablehnung:")||null);
    const {error}=await supabaseClient.rpc("resolve_shop_request",{p_request_id:Number(b.dataset.id),p_approve:approve,p_note:note});
    if(error)alert(error.message);else await loadCurrentClass();
  });
}
$("shopPersonalTab").onclick=()=>{shopScope="personal";renderShop()};
$("shopClassTab").onclick=()=>{shopScope="class";renderShop()};

function openShopModal(itemId){
  const item=(shopState.items||[]).find(i=>Number(i.id)===Number(itemId));if(!item)return;
  shopModalItemId=itemId;
  $("shopModalTitle").textContent=`${item.emoji||"🎁"} ${item.title}`;
  $("shopModalInfo").textContent=`Kosten: ${item.cost} Bonuspunkte${item.group_max>1?" · bis zu "+item.group_max+" Gold-Schüler/innen können zusammenlegen":""}`;
  $("shopGroupBlock").classList.toggle("hidden",!(item.scope==="personal"&&Number(item.group_max)>1));
  if(item.scope==="personal"&&Number(item.group_max)>1){
    const others=(shopClassmates||[]).filter(x=>x.user_id!==profile.id);
    $("shopGroupOptions").innerHTML=others.map(x=>`<label class="shop-person"><input type="checkbox" class="shop-person-check" value="${x.user_id}"><span>${escapeHtml(x.display_name||x.username||"Schüler/in")}</span></label>`).join("");
    document.querySelectorAll(".shop-person-check").forEach(ch=>ch.onchange=()=>{
      const checked=[...document.querySelectorAll(".shop-person-check:checked")];
      if(checked.length>Number(item.group_max)-1){ch.checked=false;alert(`Maximal ${item.group_max} Personen insgesamt.`)}
    });
  }else $("shopGroupOptions").innerHTML="";
  showMsg("shopModalMsg","");$("shopModal").classList.remove("hidden");
}
$("closeShopModalBtn").onclick=()=>{$("shopModal").classList.add("hidden");shopModalItemId=null};
$("submitShopRequestBtn").onclick=async()=>{
  const participants=[...document.querySelectorAll(".shop-person-check:checked")].map(x=>x.value);
  $("submitShopRequestBtn").disabled=true;
  const {error}=await supabaseClient.rpc("request_shop_item",{p_class:currentClassId,p_item_id:shopModalItemId,p_participants:participants});
  $("submitShopRequestBtn").disabled=false;
  if(error){showMsg("shopModalMsg",error.message);return}
  $("shopModal").classList.add("hidden");shopModalItemId=null;await loadCurrentClass();
};


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

function renderManage(){if(!isTeacher()||!currentClassId)return;const c=activeClass();$("joinCode").textContent=c?.join_code||"–";$("challengeInput").value=currentState?.challenge_text||"";const link=displayLink();$("displayLinkText").textContent=link;if($("classFocusManageList"))$("classFocusManageList").innerHTML=renderFocusList(classFocusGoals(),"Noch kein Klassenfokus festgelegt.")}
function displayLink(){const token=activeClass()?.public_display_token;return token?`${location.origin}${location.pathname}?display=${token}`:""}
$("displayBtn").onclick=()=>{const u=displayLink();if(u)window.open(u,"_blank")};$("openDisplayLinkBtn").onclick=()=>{const u=displayLink();if(u)window.open(u,"_blank")};$("copyDisplayLinkBtn").onclick=async()=>{const u=displayLink();if(!u)return;try{await navigator.clipboard.writeText(u);$("displayLinkText").textContent="✓ Link kopiert: "+u}catch{$("displayLinkText").textContent=u}};

$("createClassBtn").onclick=async()=>{const name=$("newClassName").value.trim();if(!name)return;const {error}=await supabaseClient.from("classes").insert({name,teacher_id:profile.id,school_year:currentSchoolYear()});showMsg("createMsg",error?error.message:"Klasse angelegt.",!error);if(!error){$("newClassName").value="";await loadClasses();showPage("manage")}};
$("challengePlusBtn").onclick=async()=>{const {data,error}=await supabaseClient.rpc("increment_challenge",{p_class:currentClassId});if(error){showMsg("challengeMsg",error.message);return}if(data?.bonus_awarded)alert("Wochenchallenge geschafft! +3 Bonuspunkte für jede/n Schüler/in und +3 Gemeinschaftsguthaben.");await loadCurrentClass()};
$("challengeResetBtn").onclick=async()=>{const {error}=await supabaseClient.rpc("reset_challenge",{p_class:currentClassId});if(error)showMsg("challengeMsg",error.message);else await loadCurrentClass()};
$("saveChallengeBtn").onclick=async()=>{const {error}=await supabaseClient.rpc("set_class_challenge",{p_class:currentClassId,p_text:$("challengeInput").value.trim(),p_goal:2});showMsg("challengeMsg",error?error.message:"Neue Wochenchallenge gespeichert.",!error);if(!error)await loadCurrentClass()};
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

/* ===== Experience Upgrade 2026 ===== */
function xpSafeGet(key,fallback=null){try{const v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v)}catch{return fallback}}
function xpSafeSet(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function xpKey(name){return profile?.id&&currentClassId?`lhp:${name}:${profile.id}:${currentClassId}`:null}
function xpSeedPick(arr,seed){if(!arr?.length)return"";const n=String(seed??"").split("").reduce((a,c)=>a+c.charCodeAt(0),0);return arr[n%arr.length]}
function xpPraise(e){if(e?.note&&String(e.note).trim())return String(e.note).replace(/^Ziel:\s*/,"");return xpSeedPick(praiseTexts[e?.category]||["Stark gemacht – bleib dran."],e?.id||e?.created_at)}
function xpDate(ts){if(!ts)return"";const d=new Date(ts),t=new Date();if(d.toDateString()===t.toDateString())return"Heute";const y=new Date();y.setDate(y.getDate()-1);if(d.toDateString()===y.toDateString())return"Gestern";return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})}
function xpStatus(s){return s==="pending"?"Beantragt":s==="approved"?"Bestätigt":s==="rejected"?"Nicht bestätigt":s==="redeemed"?"Eingelöst":s||""}
function xpInitials(name){return String(name||"L+").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"L+"}
function xpRequestFor(item){const reqs=shopState.requests||[];return reqs.find(r=>String(r.item_id||"")===String(item.id))||reqs.find(r=>r.item_title===item.title)}
function xpBalance(item){return Number(item.scope==="class"?shopState.class_balance:shopState.personal_balance)||0}
function xpProgress(item){return Math.max(0,Math.min(100,xpBalance(item)/Math.max(1,Number(item.cost||1))*100))}
function xpSnapshot(){return{at:new Date().toISOString(),unlocked:(rewards||[]).filter(r=>r.unlocked).map(r=>String(r.id)),requests:Object.fromEntries((shopState.requests||[]).map(r=>[String(r.id),r.status])),season:Number(currentState?.season_number||1),classPoints:classPoints()}}
function xpToast(message,kind="success"){const layer=$("toastLayer");if(!layer)return;const el=document.createElement("div");el.className=`app-toast ${kind}`;el.textContent=message;layer.appendChild(el);requestAnimationFrame(()=>el.classList.add("show"));setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),260)},2800)}
function xpCelebrate(level="small"){const layer=$("confettiLayer");if(!layer)return;const count=level==="big"?34:level==="medium"?20:10;for(let i=0;i<count;i++){const p=document.createElement("i");p.style.left=(10+Math.random()*80)+"%";p.style.setProperty("--x",((Math.random()-.5)*180)+"px");p.style.setProperty("--r",(Math.random()*540-270)+"deg");p.style.animationDelay=(Math.random()*.18)+"s";layer.appendChild(p);setTimeout(()=>p.remove(),1500)}}

function xpRenderProfile(){
  if(!$("profileAvatar"))return;
  $("profileAvatar").textContent=xpInitials(profile?.display_name);
  $("profileName").textContent=profile?.display_name||"Schüler/in";
  $("profileClass").textContent=activeClass()?.name||"Noch keine Klasse";
}

function xpRenderHero(){
  if(isTeacher()||!currentClassId||!$("studentWeekSummary"))return;
  const weekly=Math.max(0,sum(pointEvents.filter(e=>isThisWeek(e.created_at))));
  const chNow=Number(currentState?.challenge_current||0),chGoal=Number(currentState?.challenge_goal||2);
  $("studentWeekSummary").innerHTML=`
    <div class="mini-progress-row"><span>⭐ Individualpunkte</span><strong>${weekly}/2</strong></div>
    <div class="mini-progress"><i style="width:${Math.min(100,weekly/2*100)}%"></i></div>
    <div class="mini-progress-row"><span>🔥 Wochenchallenge</span><strong>${chNow}/${chGoal}</strong></div>
    <div class="mini-progress"><i style="width:${Math.min(100,chNow/Math.max(1,chGoal)*100)}%"></i></div>
    <p class="student-summary-copy">${weekly>=2?"Deine zwei möglichen Individualpunkte für diese Woche sind geschafft.":`Diese Woche kannst du noch ${2-weekly} Individualpunkt${2-weekly===1?"":"e"} erreichen.`}</p>`;

  const personal=(shopState.items||[]).filter(i=>i.scope==="personal"&&Number(shopState.tier_rank||0)>=Number(i.min_tier||0));
  const candidates=personal.map(i=>({item:i,remaining:Math.max(0,Number(i.cost||0)-Number(shopState.personal_balance||0)),req:xpRequestFor(i)}))
    .filter(x=>!x.req||!["pending","approved","redeemed"].includes(x.req.status))
    .sort((a,b)=>a.remaining-b.remaining||Number(a.item.cost)-Number(b.item.cost));
  const next=candidates[0];
  if(next){
    const available=next.remaining===0;
    $("studentNextStep").innerHTML=`<div class="next-step-main"><span class="next-step-emoji">${escapeHtml(next.item.emoji||"🎁")}</span><div><strong>${available?"Jetzt verfügbar":`Noch ${next.remaining} Bonuspunkt${next.remaining===1?"":"e"}`}</strong><h3>${escapeHtml(next.item.title)}</h3><p>${available?"Du kannst die Belohnung jetzt beantragen.":"Du bist schon ziemlich nah dran."}</p></div></div><button class="next-step-button" data-open-shop>Zum Shop →</button>`;
    $("studentNextStep").querySelector("[data-open-shop]").onclick=()=>showPage("shop");
  }else{
    const nextReward=(rewards||[]).find(r=>!r.unlocked);
    $("studentNextStep").innerHTML=nextReward?`<div class="next-step-main"><span class="next-step-emoji">🎁</span><div><strong>Noch ${Math.max(0,nextReward.milestone-classPoints())} Klassenpunkte</strong><h3>${escapeHtml(nextReward.label||"Nächste Freischaltung")}</h3><p>Gemeinsam kommt ihr der nächsten Klassenbelohnung näher.</p></div></div>`:'<div class="next-step-main"><span class="next-step-emoji">🏆</span><div><strong>Alles erreicht</strong><h3>Season komplett</h3><p>Stark – alle Klassenfreischaltungen sind geschafft.</p></div></div>';
  }
}

function xpActivityItems(){
  const items=[];
  pointEvents.filter(e=>Number(e.delta)>0).forEach(e=>items.push({when:e.created_at,icon:"⭐",tone:"green",title:`+${e.delta} Individualpunkt`,sub:`${e.category} · ${xpPraise(e)}`}));
  classEvents.filter(e=>Number(e.delta)>0).forEach(e=>items.push({when:e.created_at,icon:"👥",tone:"blue",title:"+1 Klassenpunkt",sub:"Gemeinsam einen Schritt weiter."}));
  (shopState.requests||[]).forEach(r=>{if(r.created_at||r.updated_at)items.push({when:r.updated_at||r.created_at,icon:r.status==="approved"?"✅":r.status==="rejected"?"↩":"🎁",tone:r.status==="approved"?"green":r.status==="rejected"?"red":"gold",title:`${xpStatus(r.status)}: ${r.item_title||"Belohnung"}`,sub:r.status==="approved"?"Von deiner Lehrkraft bestätigt.":r.status==="rejected"?(r.teacher_note||"Diesmal hat es leider nicht geklappt."):"Dein Antrag wartet auf Bestätigung."})});
  return items.sort((a,b)=>new Date(b.when||0)-new Date(a.when||0));
}

function xpRenderActivity(){
  if(isTeacher()||!$("studentActivityFeed"))return;
  const items=xpActivityItems().slice(0,6);
  $("studentActivityFeed").innerHTML=items.length?items.map(i=>`<div class="activity-item"><span class="activity-icon ${i.tone}">${i.icon}</span><div><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.sub)}</small></div><time>${xpDate(i.when)}</time></div>`).join(""):'<div class="focus-empty">Noch keine Aktivitäten – deine nächsten Erfolge erscheinen hier.</div>';
}

function xpRenderToday(){
  if(isTeacher()||!$("todayStrip"))return;
  const today=new Date().toDateString(),mine=pointEvents.filter(e=>Number(e.delta)>0&&new Date(e.created_at).toDateString()===today),cls=classEvents.filter(e=>Number(e.delta)>0&&new Date(e.created_at).toDateString()===today);
  const bits=[];if(mine.length)bits.push(`⭐ +${sum(mine)} Individualpunkt${sum(mine)===1?"":"e"}`);if(cls.length)bits.push(`👥 +${sum(cls)} Klassenpunkt${sum(cls)===1?"":"e"}`);
  const req=(shopState.requests||[]).find(r=>r.status==="approved"&&(r.updated_at||r.created_at)&&new Date(r.updated_at||r.created_at).toDateString()===today);if(req)bits.push(`✅ ${req.item_title||"Belohnung"} bestätigt`);
  $("todayStrip").classList.toggle("hidden",bits.length===0);
  $("todayStrip").innerHTML=bits.length?`<strong>Heute neu:</strong> ${bits.map(x=>`<span>${escapeHtml(x)}</span>`).join("")}`:"";
}

function xpRenderJourney(){
  if(!$("rewardJourney"))return;
  const cp=classPoints();
  $("rewardJourney").innerHTML=`<div class="journey-line"><i style="width:${Math.min(100,cp/Math.max(1,Number(currentState?.season_goal||20))*100)}%"></i></div>`+(rewards||[]).map(r=>`<div class="journey-stop ${r.claimed?"claimed":r.unlocked?"unlocked":""}"><div class="journey-dot">${r.claimed?"✓":r.unlocked?(r.emoji||"🎁"):"🔒"}</div><strong>${r.milestone}</strong><span>${escapeHtml(r.unlocked?(r.label||"Freigeschaltet"):"Noch gesperrt")}</span></div>`).join("");
}

function xpRenderShopAlmost(){
  if(isTeacher()||!$("shopAlmost"))return;
  const items=(shopState.items||[]).filter(i=>i.scope===shopScope&&(!xpRequestFor(i)||!["pending","approved","redeemed"].includes(xpRequestFor(i).status)))
    .map(i=>({item:i,remaining:Math.max(0,Number(i.cost||0)-xpBalance(i)),tierOk:i.scope==="class"||Number(shopState.tier_rank||0)>=Number(i.min_tier||0)}))
    .filter(x=>x.tierOk&&x.remaining>0).sort((a,b)=>a.remaining-b.remaining).slice(0,3);
  $("shopAlmost").innerHTML=items.length?`<div class="shop-almost-title"><span>⭐</span><div><strong>Fast erreichbar für dich</strong><small>Nur noch wenige Punkte bis zu diesen Belohnungen.</small></div></div><div class="shop-almost-items">${items.map(x=>`<button class="shop-almost-item" data-shop-item="${x.item.id}"><span>${escapeHtml(x.item.emoji||"🎁")}</span><div><strong>${escapeHtml(x.item.title)}</strong><small>Noch ${x.remaining} Punkt${x.remaining===1?"":"e"}</small><div class="mini-progress"><i style="width:${xpProgress(x.item)}%"></i></div></div></button>`).join("")}</div>`:"";
  $("shopAlmost").classList.toggle("hidden",!items.length);
  $("shopAlmost").querySelectorAll("[data-shop-item]").forEach(b=>b.onclick=()=>openShopModal(Number(b.dataset.shopItem)));
}

function xpEnhanceShopCards(){
  if(isTeacher())return;
  const items=(shopState.items||[]).filter(i=>i.scope===shopScope);
  [...document.querySelectorAll("#shopItemGrid .shop-card")].forEach((card,idx)=>{
    const item=items[idx];if(!item||card.dataset.xpEnhanced)return;card.dataset.xpEnhanced="1";
    const req=xpRequestFor(item),eligible=shopItemEligible(item),remaining=Math.max(0,Number(item.cost||0)-xpBalance(item));
    const active=req&&["pending","approved","redeemed"].includes(req.status);
    const status=active?xpStatus(req.status):(eligible?"Verfügbar":remaining<=3?"Fast erreicht":"Gesperrt");
    const statusClass=active?req.status:(eligible?"available":remaining<=3?"near":"locked");
    card.insertAdjacentHTML("afterbegin",`<div class="shop-card-status ${statusClass}">${escapeHtml(status)}</div>`);
    const tags=card.querySelector(".shop-tags");
    if(tags)tags.insertAdjacentHTML("beforebegin",`<div class="shop-progress-row"><span>${Math.min(xpBalance(item),Number(item.cost||0))} / ${item.cost}</span><span>${remaining>0?`noch ${remaining}`:"bereit"}</span></div><div class="mini-progress shop-card-progress"><i style="width:${xpProgress(item)}%"></i></div>`);
    const buy=card.querySelector(".shop-buy");
    if(buy){
      buy.textContent=active?xpStatus(req.status):(eligible?"Einlösen":buy.textContent);
      if(active)buy.disabled=true;
      const wrap=document.createElement("div");wrap.className="shop-card-actions";buy.parentNode.insertBefore(wrap,buy);wrap.appendChild(buy);
      const detail=document.createElement("button");detail.className="shop-details";detail.textContent="Ansehen";detail.onclick=()=>openShopModal(Number(item.id));wrap.insertBefore(detail,buy);
    }
  });
  if($("shopRequestTitle"))$("shopRequestTitle").textContent="Meine Belohnungen";
  if($("shopRequestSubtitle"))$("shopRequestSubtitle").textContent="Hier siehst du, was beantragt, bestätigt oder abgelehnt wurde.";
}

function xpBuildNews(){
  if(isTeacher()||newsShownThisSession)return null;
  const key=xpKey("seen");if(!key)return null;
  const prev=xpSafeGet(key,null),now=xpSnapshot();
  if(!prev){xpSafeSet(key,now);newsShownThisSession=true;return null}
  const since=new Date(prev.at||0),items=[];
  pointEvents.filter(e=>Number(e.delta)>0&&new Date(e.created_at)>since).slice().reverse().forEach(e=>items.push({icon:"⭐",tone:"green",title:`+${e.delta} Individualpunkt · ${e.category}`,text:xpPraise(e),when:e.created_at}));
  classEvents.filter(e=>Number(e.delta)>0&&new Date(e.created_at)>since).slice().reverse().forEach(e=>items.push({icon:"👥",tone:"blue",title:"+1 Klassenpunkt",text:"Eure Klasse ist wieder einen Schritt näher an der nächsten Freischaltung.",when:e.created_at}));
  const oldUnlock=new Set(prev.unlocked||[]);(rewards||[]).filter(r=>r.unlocked&&!oldUnlock.has(String(r.id))).forEach(r=>items.push({icon:r.emoji||"🎁",tone:"gold",title:"Neue Klassenfreischaltung",text:r.label||"Eine neue Belohnung wurde freigeschaltet.",when:new Date().toISOString()}));
  const oldReq=prev.requests||{};(shopState.requests||[]).forEach(r=>{const before=oldReq[String(r.id)];if(before&&before!==r.status)items.push({icon:r.status==="approved"?"✅":"↩",tone:r.status==="approved"?"green":"red",title:`${r.item_title||"Belohnung"}: ${xpStatus(r.status)}`,text:r.status==="approved"?"Herzlichen Glückwunsch – deine Belohnung wurde bestätigt.":(r.teacher_note||"Diesmal hat es leider nicht geklappt. Versuch es gerne wieder."),when:r.updated_at||new Date().toISOString()})});
  pendingSeenSnapshot=now;newsShownThisSession=true;return items.slice(-6);
}

function xpMaybeNews(){
  const items=xpBuildNews();
  if(!items?.length){if(pendingSeenSnapshot){const key=xpKey("seen");if(key)xpSafeSet(key,pendingSeenSnapshot);pendingSeenSnapshot=null}return}
  $("newsSubtitle").textContent=items.length===1?"Eine Sache ist neu für dich.":`${items.length} Dinge sind neu für dich.`;
  $("newsList").innerHTML=items.map(i=>`<div class="news-item ${i.tone}"><span class="news-icon">${i.icon}</span><div><strong>${escapeHtml(i.title)}</strong><p>${escapeHtml(i.text)}</p></div><time>${xpDate(i.when)}</time></div>`).join("");
  $("newsModal").classList.remove("hidden");xpCelebrate(items.some(i=>i.title.includes("Freischaltung"))?"big":"medium");
}

function xpCloseNews(){
  if(pendingSeenSnapshot){const key=xpKey("seen");if(key)xpSafeSet(key,pendingSeenSnapshot);pendingSeenSnapshot=null}
  $("newsModal").classList.add("hidden");
}

function xpMaybeSeason(){
  if(isTeacher()||classPoints()<Number(currentState?.season_goal||20))return;
  const key=xpKey("seasonCelebrated"),season=Number(currentState?.season_number||1);if(Number(xpSafeGet(key,0))===season)return;
  xpSafeSet(key,season);$("seasonModalTitle").textContent=`Season ${season} abgeschlossen!`;$("seasonModalText").textContent=`Ihr habt gemeinsam ${currentState?.season_goal||20} Klassenpunkte erreicht. Jede Etappe zählt – stark als Klasse!`;$("seasonModal").classList.remove("hidden");xpCelebrate("big");
}

function xpLiveChanges(){
  if(isTeacher())return;
  const reqs=Object.fromEntries((shopState.requests||[]).map(r=>[String(r.id),r.status]));
  const now={points:Math.max(0,sum(pointEvents)),classPoints:classPoints(),unlocked:(rewards||[]).filter(r=>r.unlocked).length,requests:reqs};
  if(previousLiveState){
    if(now.points>previousLiveState.points){xpToast("+1 Individualpunkt – stark gemacht!");xpCelebrate("small")}
    if(now.classPoints>previousLiveState.classPoints)xpToast("+1 Klassenpunkt – gemeinsam weiter!","info");
    if(now.unlocked>previousLiveState.unlocked){xpToast("Neue Klassenfreischaltung! 🎁");xpCelebrate("medium")}
    const oldIds=new Set(Object.keys(previousLiveState.requests||{}));
    if(Object.entries(reqs).some(([id,status])=>!oldIds.has(id)&&status==="pending")){xpToast("🎁 Antrag gesendet – deine Lehrkraft prüft ihn.");xpCelebrate("small")}
  }
  previousLiveState=now;
}

function xpRenderStudentExperience(){
  xpRenderProfile();
  if(isTeacher()||!currentClassId)return;
  if($("dashboardTitle"))$("dashboardTitle").textContent=`Schön, dass du wieder da bist, ${String(profile?.display_name||"").split(" ")[0]||"!"} 👋`;
  if($("dashboardSubtitle"))$("dashboardSubtitle").textContent="Bleib dran – kleine Schritte, große Wirkung.";
  const streak=Number(currentState?.streak||0);if($("streakHint"))$("streakHint").textContent=streak>=5?"Starke Serie – fünf gute Doppelstunden oder mehr!":streak>=3?"Du bist im Lauf – bleib dran!":"Bleib dran – kleine Schritte zählen.";
  xpRenderHero();xpRenderActivity();xpRenderToday();xpLiveChanges();xpMaybeNews();xpMaybeSeason();
}

const xpOriginalRenderDashboard=renderDashboard;
renderDashboard=function(){xpOriginalRenderDashboard();xpRenderStudentExperience()};

const xpOriginalRenderShop=renderShop;
renderShop=function(){xpOriginalRenderShop();xpRenderShopAlmost();xpEnhanceShopCards()};

const xpOriginalRenderRewards=renderRewards;
renderRewards=function(){xpOriginalRenderRewards();xpRenderJourney()};

const xpOriginalOpenShopModal=openShopModal;
openShopModal=function(itemId){
  xpOriginalOpenShopModal(itemId);
  const item=(shopState.items||[]).find(i=>Number(i.id)===Number(itemId));if(!item||!$("shopModalPreview"))return;
  const balance=xpBalance(item),remaining=Math.max(0,Number(item.cost||0)-balance),req=xpRequestFor(item);
  $("shopModalPreview").innerHTML=`<div class="shop-preview-price"><span>Dein Guthaben</span><strong>${balance} ✦</strong></div><div class="shop-preview-price"><span>Kosten</span><strong>${item.cost} ✦</strong></div><div class="shop-preview-wide"><div class="shop-progress-row"><span>Fortschritt</span><span>${remaining?`Noch ${remaining} Punkt${remaining===1?"":"e"}`:"Bereit zum Einlösen"}</span></div><div class="mini-progress"><i style="width:${xpProgress(item)}%"></i></div></div>`;
  const blocked=req&&["pending","approved","redeemed"].includes(req.status);
  if($("submitShopRequestBtn")){
    $("submitShopRequestBtn").disabled=blocked||!shopItemEligible(item);
    $("submitShopRequestBtn").textContent=blocked?xpStatus(req.status):(shopItemEligible(item)?"Belohnung beantragen":"Noch nicht verfügbar");
  }
};

if($("closeNewsModalBtn"))$("closeNewsModalBtn").onclick=xpCloseNews;
if($("newsContinueBtn"))$("newsContinueBtn").onclick=xpCloseNews;
if($("closeSeasonModalBtn"))$("closeSeasonModalBtn").onclick=()=>$("seasonModal").classList.add("hidden");
document.querySelectorAll("[data-jump-history]").forEach(btn=>btn.onclick=()=>showPage("history"));

init();


/* Premium motion: delegated clicks, no changes to account or point logic. */
(() => {
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 document.addEventListener('click',event=>{
  if(reduced.matches)return;
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const box=button.getBoundingClientRect(),size=Math.max(box.width,box.height);
  const ripple=document.createElement('span');ripple.className='motion-ripple';ripple.setAttribute('aria-hidden','true');
  const x=event.detail?event.clientX-box.left:box.width/2,y=event.detail?event.clientY-box.top:box.height/2;
  Object.assign(ripple.style,{width:size+'px',height:size+'px',left:(x-size/2)+'px',top:(y-size/2)+'px'});
  button.appendChild(ripple);ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});setTimeout(()=>ripple.remove(),900);
 });
 const ids=['myPoints','myBonusBalance','classPoints','shopPersonalBalance','shopClassBalance'];
 ids.forEach(id=>{const element=document.getElementById(id);if(!element)return;let previous=element.textContent;
  new MutationObserver(()=>{const current=element.textContent;if(current===previous)return;previous=current;if(reduced.matches)return;element.classList.remove('premium-flash');requestAnimationFrame(()=>element.classList.add('premium-flash'));}).observe(element,{childList:true,characterData:true,subtree:true});
 });
})();

/* Landheim Plus 2.0 vector design and homework bonus action. */
const lpPaths={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 gift:'<path d="M3 8h18v5H3zM5 13v8h14v-8M12 8v13"/><path d="M12 8C3 8 6 0 10 4l2 4c9 0 6-8 2-4z"/>',
 bag:'<path d="M5 7h14l2 14H3zM8 7V5a4 4 0 0 1 8 0v2"/>',
 trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v5m-5 2h10m-8-2h6"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
 medal:'<path d="m5 2 4 8m10-8-4 8M8 2l4 7 4-7"/><circle cx="12" cy="15" r="6"/><path d="m12 11 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>',
 book:'<path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1zm0 0v15"/>',
 message:'<path d="M3 4h18v13H8l-5 4zM7 8h10m-10 4h7"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 heart:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 2 11 8 15 6-4 13-10 8-15z"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 gear:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
 archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8m-10 5h6"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
 screen:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>',
 music:'<path d="M9 18V5l11-3v13M9 8l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
 logout:'<path d="M9 4H3v16h6m4-8h9m-4-4 4 4-4 4"/>',
 flame:'<path d="M12 2c2 6 8 8 7 14-1 7-13 8-14 0-1-4 2-7 4-9 0 4 1 5 3 5 2-2 2-5 0-10z"/>',
 diamond:'<path d="m3 8 4-5h10l4 5-9 14zM3 8h18M7 3l5 19 5-19"/>'
};
function lpIcon(name){return `<svg class="lp-icon" viewBox="0 0 24 24" aria-hidden="true">${lpPaths[name]||lpPaths.star}</svg>`}
const lpEmoji={'🏠':'home','👥':'users','🎯':'target','🎁':'gift','🛍️':'bag','🏆':'trophy','⭐':'star','🌟':'star','✦':'star','🥇':'medal','🥈':'medal','🥉':'medal','💎':'diamond','💬':'message','🤝':'users','♥':'heart','❤️':'heart','🔒':'lock','🔐':'lock','🕘':'clock','⚙️':'gear','🗄️':'archive','⚡':'bolt','📺':'screen','🎵':'music','🗳️':'check','↪':'logout','🔥':'flame','👋':'users','📖':'book','✅':'check','🎉':'star','🪑':'archive','📚':'book','📝':'book','🎮':'target','🍕':'gift','🍿':'gift','🎬':'screen','👤':'users','🎧':'headphones','🎲':'dice','⏱️':'timer','✨':'star','☎️':'message','🃏':'ticket','🥐':'sun','🌊':'wave','🍦':'sun','🏊':'wave'};
const lpPattern=new RegExp(Object.keys(lpEmoji).sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
function lpPolish(root){
 if(!(root instanceof Element)||root.closest('svg,script,style,textarea,input,select,option,[contenteditable]'))return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];
 while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement.closest('svg,script,style,textarea,select,option,[contenteditable]'))continue;lpPattern.lastIndex=0;if(lpPattern.test(n.nodeValue))nodes.push(n)}
 nodes.forEach(n=>{const text=n.nodeValue,fragment=document.createDocumentFragment();let offset=0;lpPattern.lastIndex=0;for(const m of text.matchAll(lpPattern)){fragment.append(text.slice(offset,m.index));const span=document.createElement('span');span.className='lp-icon-wrap';span.innerHTML=lpIcon(lpEmoji[m[0]]);fragment.append(span);offset=m.index+m[0].length}fragment.append(text.slice(offset));n.replaceWith(fragment)});
}
let lpPolishQueued=false;
new MutationObserver(records=>{if(lpPolishQueued||!records.some(r=>r.type==='characterData'||[...r.addedNodes].some(n=>n.nodeType===3||(n.nodeType===1&&!n.matches('.lp-icon-wrap,svg')))))return;lpPolishQueued=true;requestAnimationFrame(()=>{lpPolishQueued=false;lpPolish(document.getElementById('app'))})}).observe(document.getElementById('app'),{subtree:true,childList:true,characterData:true});
lpPolish(document.getElementById('app'));
const lpOriginalStudents=renderStudents;
renderStudents=function(){lpOriginalStudents();document.querySelectorAll('#studentCards .student').forEach(card=>{const user=card.querySelector('.quickBtn')?.dataset.user;if(!user)return;const button=document.createElement('button');button.className='homework-award';button.innerHTML=`<span>${lpIcon('book')} Hausaufgaben / Wayground</span><strong>+1 Bonus</strong>`;button.title='Zusätzlicher Shop-Bonuspunkt; unabhängig vom Wochenlimit';button.onclick=()=>lpAwardHomework(user,button);const actions=card.querySelector('.account-actions');actions.before(button);const caption=document.createElement('p');caption.className='homework-caption';caption.textContent='Shop-Guthaben · zusätzlich zu den Individualpunkten';button.after(caption)});lpPolish(document.getElementById('studentCards'))};
const lpPendingAwards=new Map();
async function lpAwardHomework(user,button){
 if(button.disabled)return;button.disabled=true;
 const key=currentClassId+':'+user;
 if(!lpPendingAwards.has(key))lpPendingAwards.set(key,crypto.randomUUID());
 try{const {error}=await supabaseClient.rpc('award_homework_bonus',{p_class:currentClassId,p_student:user,p_request:lpPendingAwards.get(key)});
 if(error){xpToast(error.code==='PGRST202'?'Bitte zuerst das Wayground-SQL-Update ausführen.':error.message,'info');return}
 lpPendingAwards.delete(key);xpToast('+1 Bonuspunkt für Hausaufgaben / Wayground');xpCelebrate('small');await loadCurrentClass();
 }catch(e){xpToast('Verbindung fehlgeschlagen. Erneut anklicken versucht dieselbe Vergabe.','info')}finally{button.disabled=false}
}

/* Focused student experience, contextual explanations and Wayground podium. */
lpPaths.headphones='<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>';
lpPaths.dice='<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="7" cy="7" r=".8"/><circle cx="17" cy="7" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="7" cy="17" r=".8"/><circle cx="17" cy="17" r=".8"/>';
lpPaths.timer='<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m6 2 2-2m-8 5v4l3 2"/>';
lpPaths.wave='<path d="M2 9c3-5 6 5 10 0s7 5 10 0M2 15c3-5 6 5 10 0s7 5 10 0"/>';
lpPaths.sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>';
lpPaths.ticket='<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4zm12 0v3m0 3v2m0 3v3"/>';
function l3Art(text=''){const t=String(text).toLowerCase();return lpIcon(/musik|dj|🎧/.test(t)?'headphones':/spiel|🎲/.test(t)?'dice':/zeit|minute|⏱/.test(t)?'timer':/steg|baden|🌊|🏊/.test(t)?'wave':/joker|ticket|🃏/.test(t)?'ticket':/frühstück|🥐|eis|🍦/.test(t)?'sun':/platz|🪑/.test(t)?'archive':/partner/.test(t)?'users':/eltern|☎/.test(t)?'message':/film/.test(t)?'screen':'gift')}
const l3Rules={
 wayground:'Wayground: 1. Platz = 3, 2. Platz = 2, 3. Platz = 1 Bonuspunkt. Ab 80 % Teilnahme volle Punktzahl, darunter weniger. Die Vergabe erfolgt durch die Lehrkraft; es gibt keine automatische Kürzung.',
 individual:'Entwicklungspunkte zeigen deinen persönlichen Fortschritt. Maximal 2 pro Woche. Sie bleiben beim Einlösen einer Belohnung erhalten.',
 bonus:'Bonuspunkte sind dein Shop-Guthaben: Ziel erreicht +3, Wochenchallenge +3, Wayground Platz 1/2/3 +3/+2/+1. Nur eine bestätigte Einlösung verbraucht Guthaben.',
 class:'Für eine gute Unterrichtsstunde gibt es 1 Klassenpunkt, maximal 2 Unterrichtspunkte pro Woche. Neue Entwicklungsstufen bringen zusätzliche Klassenpunkte: Bronze +1, Silber +2, Gold +3, Platin +4. Einmal pro Schüler und Stufe innerhalb der Klasse.',
 tiers:'Bronze ab 4 Entwicklungspunkten: +1 Klassenpunkt. Silber ab 10: +2. Gold ab 20 und Punkten in mindestens 3 Bereichen: +3. Platin wird durch die Lehrkraft verliehen: +4. Bereits erreichte Stufen werden nicht rückwirkend belohnt.'
};
const l3Tip=document.createElement('div');l3Tip.id='contextTip';l3Tip.setAttribute('role','tooltip');l3Tip.hidden=true;document.body.append(l3Tip);let l3Open=null;
function l3ShowTip(button){l3Open=button;l3Tip.textContent=button.dataset.explain;l3Tip.hidden=false;button.setAttribute('aria-expanded','true');const r=button.getBoundingClientRect(),w=Math.min(340,innerWidth-24);l3Tip.style.width=w+'px';l3Tip.style.left=Math.max(12,Math.min(innerWidth-w-12,r.left))+'px';const h=l3Tip.offsetHeight;l3Tip.style.top=(r.bottom+h+20<innerHeight?r.bottom+10:Math.max(12,r.top-h-10))+'px'}
function l3CloseTip(){if(l3Open)l3Open.setAttribute('aria-expanded','false');l3Tip.hidden=true;l3Open=null}
function l3Info(parent,key){if(!parent||parent.querySelector(':scope > .info-trigger'))return;const b=document.createElement('button');b.type='button';b.className='info-trigger';b.textContent='i';b.dataset.explain=l3Rules[key];b.setAttribute('aria-label','Erklärung: '+({wayground:'Wayground',individual:'Entwicklungspunkte',bonus:'Bonuspunkte',class:'Klassenpunkte',tiers:'Entwicklungsstufen'}[key]));b.setAttribute('aria-describedby','contextTip');b.setAttribute('aria-expanded','false');b.onmouseenter=()=>l3ShowTip(b);b.onmouseleave=()=>{if(document.activeElement!==b)l3CloseTip()};b.onfocus=()=>l3ShowTip(b);b.onblur=l3CloseTip;b.onclick=e=>{e.stopPropagation();l3ShowTip(b)};parent.append(b)}
document.addEventListener('click',e=>{if(!e.target.closest('.info-trigger,#contextTip'))l3CloseTip()});document.addEventListener('keydown',e=>{if(e.key==='Escape')l3CloseTip()});addEventListener('scroll',l3CloseTip,true);addEventListener('resize',l3CloseTip);
function l3WishKey(){return 'landheim-wish:'+profile?.id+':'+currentClassId}
function l3Requirements(item){const rank=Number(shopState.tier_rank||0),min=Number(item.min_tier||0),remaining=Math.max(0,Number(item.cost)-xpBalance(item));return [item.scope==='personal'&&rank<min?`Stufe ${shopTierText(min)} erforderlich`:'Stufe erreicht',remaining?`Noch ${remaining} Bonuspunkte`:'Guthaben reicht'].join(' · ')}
function l3RenderWish(){if(isTeacher()||!currentClassId)return;let card=$('wishCard');if(!card){card=document.createElement('article');card.id='wishCard';card.className='card wish-card student-only';$('dashboardBody').prepend(card)}const items=(shopState.items||[]).filter(i=>i.scope==='personal');let selected=null;try{selected=localStorage.getItem(l3WishKey())}catch{}const item=items.find(i=>String(i.id)===selected)||items.slice().sort((a,b)=>Number(a.cost)-Number(b.cost))[0];
card.innerHTML=`<div class="wish-intro"><div class="eyebrow">Deine Wunschbelohnung</div><h2>Darauf spare ich</h2><p>Wähle, was dich motiviert.</p><label for="wishSelect">Meine Belohnung</label><select id="wishSelect">${items.map(i=>`<option value="${i.id}" ${i.id===item?.id?'selected':''}>${escapeHtml(i.title)} · ${i.cost} Bonuspunkte</option>`).join('')}</select><small>Deine Auswahl wird auf diesem Gerät gespeichert.</small></div><div class="wish-detail">${item?`<div class="wish-art">${l3Art(item.title)}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="wish-count"><strong>${xpBalance(item)}</strong><span> / ${item.cost} Bonuspunkte</span></div><div class="mini-progress"><i style="width:${xpProgress(item)}%"></i></div><p class="wish-requirements">${escapeHtml(l3Requirements(item))}</p><button id="wishView" class="primary">Belohnung ansehen →</button>`:'<p>Noch keine Belohnungen vorhanden.</p>'}</div>`;
 $('wishSelect').onchange=e=>{try{localStorage.setItem(l3WishKey(),e.target.value)}catch{}l3RenderWish()};if($('wishView'))$('wishView').onclick=()=>openShopModal(item.id);l3Info(card.querySelector('.wish-count'),'bonus');}
const l3OldDashboard=renderDashboard;
renderDashboard=function(){l3OldDashboard();document.body.classList.toggle('student-mode',!isTeacher());if(isTeacher()){document.querySelectorAll('.student-stat-hidden').forEach(x=>x.classList.remove('student-stat-hidden'));$('wishCard')?.remove();return;}l3RenderWish();const stats=$('dashboardBody')?.querySelector('.stats');if(stats){stats.querySelectorAll('.stat').forEach(s=>{const keep=s.querySelector('#myPoints,#myBonusBalance,#classPoints');s.classList.toggle('student-stat-hidden',!keep);if(keep){l3Info(s,keep.id==='myPoints'?'individual':keep.id==='myBonusBalance'?'bonus':'class');if(keep.id==='myPoints')s.querySelector('span').textContent='Meine Entwicklung';}})}l3Info($('myTierTitle')?.closest('article'),'tiers');l3Info($('bigPoints')?.closest('article'),'class');l3Info($('studentWeekSummary')?.closest('article'),'individual');};
const l3OldShop=renderShop;
renderShop=function(){l3OldShop();const explanations=document.querySelector('#shop .shop-explain');if(explanations&&!explanations.querySelector('.wayground-explain')){const d=document.createElement('div');d.className='wayground-explain';d.innerHTML='<strong>Wayground-Sieg:</strong> Platz 1 / 2 / 3 → +3 / +2 / +1 Bonuspunkte';explanations.append(d);l3Info(d,'wayground')}document.querySelectorAll('#shopItemGrid .shop-card').forEach((card,i)=>{const item=(shopState.items||[]).filter(x=>x.scope===shopScope)[i];if(!item)return;const art=card.querySelector('.shop-emoji');if(art)art.innerHTML=l3Art(item.title);if(!card.querySelector('.shop-requirements')){const p=document.createElement('p');p.className='shop-requirements';p.textContent=l3Requirements(item);card.querySelector('.shop-tags')?.before(p)}l3Info(card,'bonus')});l3Info(document.querySelector('#shop .wallet.student-only'),'bonus')};
const l3OldRewards=renderRewards;
renderRewards=function(){l3OldRewards();document.querySelectorAll('.reward-card').forEach(c=>{const art=c.querySelector('.reward-emoji');if(art)art.innerHTML=l3Art(c.querySelector('h3')?.textContent)});l3Info(document.querySelector('#rewards .headline'),'class')};
const l3OldStudents=renderStudents;
renderStudents=function(){l3OldStudents();document.querySelectorAll('#studentCards .student').forEach(card=>{const old=card.querySelector('.homework-award'),user=card.querySelector('.quickBtn')?.dataset.user;if(!old||!user)return;const group=document.createElement('div');group.className='wayground-podium';[3,2,1].forEach((points,i)=>{const b=document.createElement('button');b.className='podium-btn rank-'+(i+1);b.innerHTML=lpIcon('medal')+`<span>${i+1}. Platz</span><strong>+${points}</strong>`;b.onclick=()=>l3AwardWayground(user,i+1,b);group.append(b)});old.replaceWith(group);const caption=card.querySelector('.homework-caption');if(caption){caption.textContent='Wayground · Shop-Bonus · ab 80 % Teilnahme volle Punkte';l3Info(caption,'wayground')}l3Info(card.querySelector('.tier-chip'),'tiers')})};
const l3Pending=new Map();const l3UserBusy=new Set();
async function l3AwardWayground(user,place,button){if(l3UserBusy.has(user))return;l3UserBusy.add(user);const group=button.closest('.wayground-podium');group.querySelectorAll('button').forEach(b=>b.disabled=true);const key=currentClassId+':'+user+':'+place;if(!l3Pending.has(key))l3Pending.set(key,crypto.randomUUID());try{const{error}=await supabaseClient.rpc('award_wayground_bonus',{p_class:currentClassId,p_student:user,p_place:place,p_request:l3Pending.get(key)});if(error){xpToast(error.code==='PGRST202'?'Bitte das neue SQL-Update ausführen.':error.message,'info');return}l3Pending.delete(key);xpToast(`Wayground: +${4-place} Bonuspunkte`);xpCelebrate('small');await loadCurrentClass()}catch{xpToast('Verbindung fehlgeschlagen. Wiederholung versucht dieselbe Vergabe.','info')}finally{l3UserBusy.delete(user);group.querySelectorAll('button').forEach(b=>b.disabled=false)}}
const l3ShowPage=showPage;showPage=function(id){l3CloseTip();l3ShowPage(id);document.querySelector('main')?.scrollIntoView({block:'start',behavior:'instant'})};
const l3LoginHint=document.querySelector('#loginView .auth-card .hint');if(l3LoginHint)l3LoginHint.textContent='Deine persönlichen Ziele und Entwicklungspunkte sehen nur du und deine Lehrkraft.';
document.querySelector('#loginView .brandline p').textContent='Deine Erfolge. Deine Ziele. Deine Belohnungen.';
const l3Button=$('awardClassPointBtn');if(l3Button){l3Button.textContent='+1 Gute Unterrichtsstunde';l3Info(l3Button.parentElement,'class')}
weekClassPoints=function(){return Math.max(0,sum(classEvents.filter(e=>isThisWeek(e.created_at)&&e.reason!=='Stufenaufstieg')))};

/* Student-only simplification: ISO calendar week, clear lesson slots and flame states. */
function l4BerlinDate(date=new Date()){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);const v=type=>Number(p.find(x=>x.type===type).value);return new Date(Date.UTC(v('year'),v('month')-1,v('day')))}
function l4Week(date=new Date()){const d=l4BerlinDate(date),day=d.getUTCDay()||7;const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-day+1);const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);const thursday=new Date(monday);thursday.setUTCDate(monday.getUTCDate()+3);const year=thursday.getUTCFullYear();const first=new Date(Date.UTC(year,0,1));const week=Math.ceil((((thursday-first)/86400000)+1)/7);return{week,year,monday,sunday}}
function l4InWeek(timestamp,week){const d=l4BerlinDate(new Date(timestamp));return d>=week.monday&&d<=week.sunday}
const l4Moved=new Map();
function l4RestoreDetails(){for(const[node,marker]of l4Moved){marker.parentNode?.insertBefore(node,marker);marker.remove()}l4Moved.clear();document.querySelectorAll('.student-detail').forEach(x=>x.remove())}
function l4Details(node,title){if(!node||l4Moved.has(node))return;const marker=document.createComment('original-position');node.before(marker);const details=document.createElement('details');details.className='student-detail student-only';const summary=document.createElement('summary');summary.textContent=title;details.append(summary,node);marker.after(details);l4Moved.set(node,marker)}
function l4Flames(count){return Array.from({length:5},(_,i)=>`<span class="series-flame ${i<count?'lit':'unlit'}" style="--flame-delay:${i*.12}s">${lpIcon('flame')}</span>`).join('')}
function l4StudentWeek(){const w=l4Week(),fmt=d=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit'}).format(d);const classWeek=Math.max(0,sum(classEvents.filter(e=>e.reason!=='Stufenaufstieg'&&l4InWeek(e.created_at,w))));const personalWeek=Math.max(0,sum(pointEvents.filter(e=>l4InWeek(e.created_at,w))));const card=$('studentWeekSummary')?.closest('article');if(!card)return;card.querySelector('.eyebrow').textContent=`Deine Woche · KW ${w.week}`;
 $('studentWeekSummary').innerHTML=`<div class="week-calendar"><strong>Kalenderwoche ${w.week}</strong><span>${fmt(w.monday)}–${fmt(w.sunday)}${w.year}</span></div><div class="student-lesson-pair">${[1,2].map(n=>`<div class="student-lesson ${classWeek>=n?'earned':'waiting'}"><div class="lesson-fire">${lpIcon('flame')}</div><div><strong>Stunde ${n}</strong><span>${classWeek>=n?'+1 Klassenpunkt verdient':'Nächste Chance'}</span></div></div>`).join('')}</div><div class="week-foot"><span>Deine Entwicklung diese Woche</span><strong>${personalWeek}/2 Punkte</strong></div><div class="mini-progress"><i style="width:${Math.min(100,personalWeek/2*100)}%"></i></div><p class="week-short-hint">Eine gute Stunde bringt 1 Klassenpunkt. Stufenaufstiege zählen zusätzlich.</p>`;
 const streak=Math.max(0,Number(currentState?.streak)||0);$('streakFlames').innerHTML=l4Flames(Math.min(5,streak));$('streakFlames').setAttribute('aria-label',`${streak} gute Stunden in der Serie`);$('streakHint').textContent=streak?`Schon ${streak} gute Stunden – gemeinsam weiter!`:'Mit der nächsten guten Stunde startet eure Serie.';
 l3Info(card,'class');
}
const l4Dashboard=renderDashboard;
renderDashboard=function(){if(isTeacher())l4RestoreDetails();l4Dashboard();if(isTeacher())return;l4StudentWeek();const name=String(profile?.display_name||'').split(' ')[0];$('dashboardTitle').textContent=`Dein Überblick${name?', '+name:''}`;$('dashboardSubtitle').textContent='Dein Level. Eure Klasse. Deine Belohnungen.';
 const labels=[['myPoints','Mein Level','Entwicklungspunkte bleiben erhalten'],['myBonusBalance','Meine Shop-Punkte','für deine Belohnungen'],['classPoints','Unsere Klasse','gemeinsam zur nächsten Belohnung']];labels.forEach(([id,label,hint])=>{const stat=$(id)?.closest('.stat');if(stat){stat.querySelector('span').textContent=label;stat.querySelector('small').textContent=hint}});
 const tier=$('myTierTitle')?.closest('article');if(tier){tier.classList.add('level-summary');$('myTierTitle').textContent=`Dein Level: ${tierFor(pointEvents,platinumFor(profile.id)).name}`;const stats=$('dashboardBody').querySelector('.stats');stats.after(tier)}
 l4Details(document.querySelector('.personal-focus-card'),'Meine persönlichen Ziele');l4Details($('myCategories')?.closest('article'),'Meine Stärken und Abzeichen');l4Details(document.querySelector('.class-focus-card'),'Unsere gemeinsamen Ziele');l4Details(document.querySelector('.activity-card'),'Letzte Aktivitäten ansehen');
};
const l4Shop=renderShop;
renderShop=function(){l4Shop();if(isTeacher())return;const grid=$('shopItemGrid');if(!grid)return;const items=(shopState.items||[]).filter(i=>i.scope===shopScope);const entries=[...grid.querySelectorAll('.shop-card')].map((card,i)=>({card,item:items[i]}));const groups=[['Für dich erreichbar',x=>shopItemEligible(x.item)],['Deine nächsten Belohnungen',x=>!shopItemEligible(x.item)&&Number(x.item.min_tier||0)<=Number(shopState.tier_rank||0)+1],['Später entdecken',()=>true]];let remaining=entries;for(const [label,test]of groups){const selected=remaining.filter(test);remaining=remaining.filter(x=>!test(x));if(!selected.length)continue;const group=document.createElement('div');group.className='student-shop-group';const title=document.createElement('h3');title.textContent=shopScope==='class'?label.replace('Für dich','Für euch').replace('Deine','Eure'):label;group.append(title);const cards=document.createElement('div');cards.className='student-shop-cards';selected.sort((a,b)=>Number(a.item.cost)-Number(b.item.cost)).forEach(x=>cards.append(x.card));if(label==='Später entdecken'){const details=document.createElement('details');details.className='student-shop-more';const summary=document.createElement('summary');summary.textContent=label+' · '+selected.length+' Belohnungen';details.append(summary,cards);group.replaceChildren(details)}else group.append(cards);grid.append(group)}
 const noAvailable=!entries.some(x=>shopItemEligible(x.item));if(noAvailable){const p=document.createElement('p');p.className='shop-start-hint';p.textContent='Deine erste Belohnung wartet: Erreiche die nötige Stufe und sammle Shop-Punkte. Die Voraussetzungen stehen auf jeder Karte.';grid.prepend(p)}
};

/* Three clear student sections with visible rules, retaining the original teacher layout. */
const l5Moved=new Map();
function l5Restore(){for(const[node,marker]of l5Moved){marker.parentNode?.insertBefore(node,marker);marker.remove()}l5Moved.clear();$('studentSections')?.remove();document.querySelectorAll('.student-visible-rules').forEach(x=>x.remove())}
function l5Move(node,parent){if(!node)return;if(l5Moved.has(node)){parent.append(node);return;}const marker=document.createComment('student-section-original');node.before(marker);l5Moved.set(node,marker);parent.append(node)}
function l5Rule(parent,text){const p=document.createElement('p');p.className='student-visible-rule';p.textContent=text;parent.append(p)}
function l5Structure(){const body=$('dashboardBody');if(!body)return;let sections=$('studentSections');if(!sections){sections=document.createElement('div');sections.id='studentSections';sections.className='student-sections student-only';body.prepend(sections);const titles=[['level','Mein Level','Hier siehst du deine persönliche Entwicklung.'],['class','Unsere Klasse','Gute Stunden und neue Stufen bringen euch gemeinsam weiter.'],['shop','Meine Shop-Punkte','Sammle Guthaben für deine Wunschbelohnung.']];for(const [key,title,description]of titles){const area=document.createElement('section');area.id='studentArea-'+key;area.className='student-area';area.innerHTML=`<header class="student-area-head"><span class="section-number">${key==='level'?'01':key==='class'?'02':'03'}</span><div><h3>${title}</h3><p>${description}</p></div></header><div class="student-area-content"></div>`;sections.append(area)} }
 const area=key=>$('studentArea-'+key).querySelector('.student-area-content');
 l5Move($('myTierTitle')?.closest('article'),area('level'));
 l5Move($('studentWeekSummary')?.closest('article'),area('class'));
 l5Move($('bigPoints')?.closest('article'),area('class'));
 l5Move($('streakFlames')?.closest('article'),area('class'));
 l5Move($('challenge')?.closest('article'),area('class'));
 l5Move($('wishCard'),area('shop'));
 document.querySelectorAll('#dashboardBody .student-detail').forEach(d=>{const label=d.querySelector('summary')?.textContent||'';const key=label.includes('gemeinsamen')?'class':label.includes('Aktivitäten')?'shop':'level';l5Move(d,area(key))});
 const level=area('level'),classArea=area('class'),shop=area('shop');
 if(!level.querySelector('.student-visible-rule'))l5Rule(level,'Maximal 2 Entwicklungspunkte pro Woche. Deine Entwicklungspunkte bleiben beim Einlösen von Belohnungen erhalten.');
 if(!classArea.querySelector('.student-visible-rule'))l5Rule(classArea,'Gute Unterrichtsstunde: +1 Klassenpunkt, höchstens 2 pro Woche. Neue Stufe eines Schülers: Bronze +1 · Silber +2 · Gold +3 · Platin +4 Klassenpunkte, jeweils einmalig zusätzlich.');
 let wallet=shop.querySelector('.student-shop-wallet');if(!wallet){wallet=document.createElement('div');wallet.className='student-shop-wallet';shop.prepend(wallet)}wallet.innerHTML=`<span>Dein verfügbares Guthaben</span><strong>${Number(shopState.personal_balance)||0}<small> Shop-Punkte</small></strong>`;
 if(!shop.querySelector('.student-visible-rule'))l5Rule(shop,'Ziel erreicht: +3 · Wochenchallenge geschafft: +3 · Wayground Platz 1 / 2 / 3: +3 / +2 / +1 Shop-Punkte. Ab 80 % Teilnahme volle Wayground-Punkte, darunter weniger nach Entscheidung der Lehrkraft.');
 const wishLabel=$('wishCard')?.querySelector('.wish-intro h2');if(wishLabel)wishLabel.textContent='Deine Wunschbelohnung';
 sections.querySelectorAll('.info-trigger').forEach(b=>{if(b.closest('.stat,.wish-count')||b.dataset.explain===l3Rules.class||b.dataset.explain===l3Rules.individual||b.dataset.explain===l3Rules.bonus)b.remove()});
 const next=shop.querySelector('.student-next-action')||document.createElement('button');if(!next.parentNode){next.className='primary student-next-action';next.textContent='Belohnungs-Shop öffnen →';next.onclick=()=>showPage('shop');shop.append(next)}
}
const l5Dashboard=renderDashboard;
renderDashboard=function(){if(isTeacher())l5Restore();l5Dashboard();if(!isTeacher()&&currentClassId)l5Structure()};
const l5Shop=renderShop;
renderShop=function(){l5Shop();if(isTeacher())return;let rules=document.querySelector('#shop .student-visible-rules');if(!rules){rules=document.createElement('div');rules.className='student-visible-rules';document.querySelector('#shop .shop-tabs')?.before(rules)}rules.innerHTML='<strong>So funktioniert der Shop</strong><p>Du brauchst die angegebene Stufe <b>und</b> genügend Shop-Punkte. Deine Entwicklungspunkte bleiben erhalten. Erst nach Bestätigung durch die Lehrkraft wird Shop-Guthaben abgezogen.</p><p><b>Shop-Punkte verdienen:</b> Ziel +3 · Wochenchallenge +3 · Wayground Platz 1/2/3 +3/+2/+1. Ab 80 % Teilnahme volle Wayground-Punkte, darunter weniger nach Entscheidung der Lehrkraft.</p>';document.querySelectorAll('#shop .shop-card>.info-trigger').forEach(x=>x.remove())};
