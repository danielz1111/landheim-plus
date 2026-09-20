
const cfg = window.LANDHEIM_PLUS_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("DEINE_") &&
                   cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.startsWith("DEIN_");
let supabaseClient = null;
let profile = null, classes = [], currentClassId = null, currentState = null, members = [], myPoints = [];

const $ = id => document.getElementById(id);
const cats = ["Mitarbeit","Zuverlässigkeit","Teamwork","Fokus","Hilfsbereitschaft"];
const levels = [
  {min:0,name:"Startklar"},{min:10,name:"Dranbleiber"},
  {min:25,name:"Teamplayer"},{min:40,name:"Gemeinsam stark"},
  {min:50,name:"Level Up!"}
];

function showLoginMessage(msg){ $("loginMsg").textContent = msg || ""; }
function isTeacher(){ return profile?.role === "teacher"; }
function setRoleUI(){
  document.querySelectorAll(".teacher-only").forEach(el=>el.classList.toggle("hidden",!isTeacher()));
  document.querySelectorAll(".student-only").forEach(el=>el.classList.toggle("hidden",isTeacher()));
  $("roleLabel").textContent=isTeacher()?"Lehrkraft":"Schüler/in";
}
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll(".nav[data-target]").forEach(b=>b.classList.toggle("active",b.dataset.target===id));
}
function levelFor(p){let x=levels[0],i=0;levels.forEach((l,n)=>{if(p>=l.min){x=l;i=n}});return {n:i+1,name:x.name}}
function sum(arr, key){return arr.reduce((a,x)=>a+(Number(key?x[key]:x)||0),0)}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

async function init(){
  if(!configured){
    $("loginBtn").disabled=true;
    showLoginMessage("Noch nicht mit Supabase verbunden. Bitte zuerst config.js ausfüllen.");
    return;
  }
  supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
  const {data:{session}} = await supabaseClient.auth.getSession();
  if(session) await enterApp(session.user);
  supabaseClient.auth.onAuthStateChange(async (event,session)=>{
    if(event==="SIGNED_OUT"){location.reload()}
  });
}
$("loginBtn").onclick=async()=>{
  showLoginMessage("");
  const email=$("email").value.trim(), password=$("password").value;
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){showLoginMessage(error.message);return}
  await enterApp(data.user);
};
$("logoutBtn").onclick=()=>supabaseClient.auth.signOut();

async function enterApp(user){
  const {data:p,error}=await supabaseClient.from("profiles").select("*").eq("id",user.id).single();
  if(error||!p){showLoginMessage("Profil konnte nicht geladen werden.");return}
  profile=p;
  $("loginView").classList.add("hidden");$("shell").classList.remove("hidden");
  $("welcomeName").textContent=`Hallo ${p.display_name||"!"}`;
  setRoleUI();
  await loadClasses();
  showPage("dashboard");
}

async function loadClasses(){
  let q;
  if(isTeacher()){
    q=await supabaseClient.from("classes").select("*").eq("teacher_id",profile.id).order("name");
  }else{
    q=await supabaseClient.from("class_members").select("class_id, classes(*)").eq("student_user_id",profile.id);
  }
  if(q.error){console.error(q.error);return}
  classes=isTeacher()?q.data:q.data.map(x=>x.classes).filter(Boolean);
  $("classSelect").innerHTML=classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  currentClassId=classes[0]?.id||null;
  await loadCurrentClass();
}

$("classSelect").onchange=async e=>{currentClassId=e.target.value;await loadCurrentClass()};

async function loadCurrentClass(){
  if(!currentClassId){
    $("noClass").classList.remove("hidden");$("dashboardBody").classList.add("hidden");
    $("noClassText").textContent=isTeacher()?"Lege unter Verwaltung zuerst eine Klasse an.":"Tritt mit einem Beitrittscode einer Klasse bei.";
    $("className").textContent="";
    return;
  }
  $("noClass").classList.add("hidden");$("dashboardBody").classList.remove("hidden");
  const c=classes.find(x=>x.id===currentClassId);
  $("className").textContent=c?.name||"";
  $("classSelect").value=currentClassId;

  const {data:state,error:se}=await supabaseClient.from("class_state").select("*").eq("class_id",currentClassId).single();
  if(se){console.error(se);return}
  currentState=state;

  if(isTeacher()){
    const {data:m,error:me}=await supabaseClient.from("class_members")
      .select("student_user_id, profiles!class_members_student_user_id_fkey(display_name)")
      .eq("class_id",currentClassId);
    if(me){console.error(me);members=[]} else members=m||[];
    await loadTeacherPointTotals();
  }else{
    const {data:p,error:pe}=await supabaseClient.from("point_events").select("delta,category").eq("class_id",currentClassId).eq("recipient_user_id",profile.id);
    myPoints=pe?[]:(p||[]);
  }
  renderDashboard();
  if(isTeacher()) renderStudents();
  renderManage();
}

async function loadTeacherPointTotals(){
  const {data,error}=await supabaseClient.from("point_events").select("recipient_user_id,delta,category").eq("class_id",currentClassId);
  if(error){console.error(error);myPoints=[];return}
  myPoints=data||[];
}

function classPointTotal(){
  return Math.max(0,Number(currentState?.auto_points||0)+Number(currentState?.bonus_points||0));
}
function renderDashboard(){
  const cp=classPointTotal(), lev=levelFor(cp);
  $("classPoints").textContent=cp;$("bigPoints").textContent=cp;$("streak").textContent=currentState?.streak||0;
  $("level").textContent=lev.n;$("levelName").textContent=lev.name;$("tankFill").style.height=Math.min(100,cp/50*100)+"%";
  $("challenge").textContent=currentState?.challenge_text||"Noch keine Challenge";
  $("challengeNow").textContent=currentState?.challenge_current||0;$("challengeGoal").textContent=currentState?.challenge_goal||5;
  $("challengeBar").style.width=Math.min(100,(currentState?.challenge_current||0)/(currentState?.challenge_goal||5)*100)+"%";
  const unlocked=cp>=40;$("rewardTitle").textContent=unlocked?"Freigeschaltet!":"Bei 40 Punkten";
  $("rewardText").textContent=unlocked?(currentState?.reward_text||"Überraschung"):`Noch ${Math.max(0,40-cp)} Klassenpunkte`;
  document.querySelector(".gift").textContent=unlocked?"🎁✨":"🔒🎁";
  if(isTeacher()){
    $("individualTotal").textContent=Math.max(0,sum(myPoints,"delta"));
  }else{
    const mine=Math.max(0,sum(myPoints,"delta"));$("myPoints").textContent=mine;
    const counts=Object.fromEntries(cats.map(c=>[c,0]));myPoints.forEach(p=>counts[p.category]=(counts[p.category]||0)+Number(p.delta||0));
    $("myCategories").innerHTML=cats.map(c=>`<div class="category"><span>${c}</span><b>${Math.max(0,counts[c]||0)}</b></div>`).join("");
  }
}

function renderStudents(){
  const totals={}; myPoints.forEach(p=>totals[p.recipient_user_id]=(totals[p.recipient_user_id]||0)+Number(p.delta||0));
  $("studentCards").innerHTML=members.map(m=>{
    const name=m.profiles?.display_name||"Schüler/in";
    return `<div class="student">
      <div class="student-head"><div style="display:flex;gap:9px;align-items:center"><div class="avatar">${escapeHtml(name.slice(0,2).toUpperCase())}</div><div class="student-name">${escapeHtml(name)}</div></div></div>
      <div class="points">${Math.max(0,totals[m.student_user_id]||0)} <small>Pluspunkte</small></div>
      <div class="award"><select>${cats.map(c=>`<option>${c}</option>`).join("")}</select><button data-user="${m.student_user_id}">+1</button></div>
    </div>`;
  }).join("") || `<div class="card">Noch keine Schüler/innen in dieser Klasse. Beitrittscode: <strong>${escapeHtml(classes.find(c=>c.id===currentClassId)?.join_code||"")}</strong></div>`;
  $("studentCards").querySelectorAll("button[data-user]").forEach(btn=>btn.onclick=async()=>{
    const card=btn.closest(".student"), category=card.querySelector("select").value;
    btn.disabled=true;
    const {error}=await supabaseClient.from("point_events").insert({
      class_id:currentClassId, recipient_user_id:btn.dataset.user, awarded_by:profile.id, category, delta:1
    });
    btn.disabled=false;
    if(error){alert(error.message);return}
    await loadCurrentClass();
  });
}

function renderManage(){
  if(!isTeacher()||!currentClassId)return;
  const c=classes.find(x=>x.id===currentClassId);
  $("joinCode").textContent=c?.join_code||"–";
  $("challengeInput").value=currentState?.challenge_text||"";
  $("rewardInput").value=currentState?.reward_text||"";
}

$("createClassBtn").onclick=async()=>{
  const name=$("newClassName").value.trim();if(!name)return;
  const {data,error}=await supabaseClient.from("classes").insert({name,teacher_id:profile.id}).select().single();
  $("createMsg").textContent=error?error.message:"Klasse angelegt.";
  if(!error){$("newClassName").value="";await loadClasses();showPage("manage")}
};
$("bonusBtn").onclick=async()=>{
  const v=Number(currentState.bonus_points||0)+1;
  const {error}=await supabaseClient.from("class_state").update({bonus_points:v}).eq("class_id",currentClassId);
  if(error)alert(error.message);else await loadCurrentClass();
};
$("streakBtn").onclick=async()=>{
  const v=Number(currentState.streak||0)+1;
  const {error}=await supabaseClient.from("class_state").update({streak:v}).eq("class_id",currentClassId);
  if(error)alert(error.message);else await loadCurrentClass();
};
$("challengePlusBtn").onclick=async()=>{
  const v=Math.min(Number(currentState.challenge_goal||5),Number(currentState.challenge_current||0)+1);
  const {error}=await supabaseClient.from("class_state").update({challenge_current:v}).eq("class_id",currentClassId);
  if(error)alert(error.message);else await loadCurrentClass();
};
$("saveStateBtn").onclick=async()=>{
  const {error}=await supabaseClient.from("class_state").update({
    challenge_text:$("challengeInput").value.trim(),
    reward_text:$("rewardInput").value.trim()
  }).eq("class_id",currentClassId);
  $("stateMsg").textContent=error?error.message:"Gespeichert.";
  if(!error)await loadCurrentClass();
};

$("joinBtn").onclick=async()=>{
  const code=$("joinInput").value.trim().toUpperCase();
  const {data,error}=await supabaseClient.rpc("join_class_by_code",{p_code:code});
  $("joinMsg").textContent=error?error.message:"Klasse erfolgreich hinzugefügt.";
  if(!error){$("joinInput").value="";await loadClasses();showPage("dashboard")}
};

document.querySelectorAll(".nav[data-target]").forEach(btn=>btn.onclick=()=>showPage(btn.dataset.target));
init();
