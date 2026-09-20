
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
  const rawLogin=$("email").value.trim().toLowerCase(), password=$("password").value;
  const email = rawLogin.includes("@") ? rawLogin : `${rawLogin}@students.landheim-plus.invalid`;
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){showLoginMessage(error.message);return}
  await enterApp(data.user);
};
$("logoutBtn").onclick=()=>supabaseClient.auth.signOut();

async function enterApp(user){
  const {data:p,error}=await supabaseClient.from("profiles").select("*").eq("id",user.id).single();
  if(error||!p){showLoginMessage("Profil konnte nicht geladen werden.");return}
  profile=p;
  if(profile.role==="student" && profile.must_change_password){
    $("loginView").classList.add("hidden");
    $("shell").classList.add("hidden");
    $("forcePasswordView").classList.remove("hidden");
    return;
  }
  $("forcePasswordView").classList.add("hidden");
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
    q=await supabaseClient.rpc("get_my_classes");
  }
  if(q.error){console.error(q.error);return}
  classes=isTeacher()?q.data:(q.data||[]);
  $("classSelect").innerHTML=classes.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  // Importierte Schüler sind bereits einer Klasse zugeordnet.
  // "Klasse beitreten" erscheint nur, wenn noch keine Klassenzuordnung existiert.
  if(!isTeacher()){
    const joinNav=document.querySelector('.nav[data-target="join"]');
    if(joinNav) joinNav.classList.toggle("hidden", classes.length>0);
  }

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
      .select("student_user_id, profiles!class_members_student_user_id_fkey(display_name, username)")
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
    const username=m.profiles?.username||"";
    return `<div class="student">
      <div class="student-head">
        <div style="display:flex;gap:9px;align-items:center">
          <div class="avatar">${escapeHtml(name.slice(0,2).toUpperCase())}</div>
          <div>
            <div class="student-name">${escapeHtml(name)}</div>
            <div class="student-meta">${username ? "@" + escapeHtml(username) : "kein Benutzername"}</div>
          </div>
        </div>
      </div>
      <div class="points">${Math.max(0,totals[m.student_user_id]||0)} <small>Pluspunkte</small></div>
      <div class="award"><select>${cats.map(c=>`<option>${c}</option>`).join("")}</select><button data-user="${m.student_user_id}" class="awardBtn">+1</button></div>
      <div class="account-actions">
        <button class="accountBtn" data-user="${m.student_user_id}" data-name="${escapeHtml(name)}" data-username="${escapeHtml(username)}">🔐 Zugang</button>
      </div>
    </div>`;
  }).join("") || `<div class="card">Noch keine Schüler/innen in dieser Klasse. Beitrittscode: <strong>${escapeHtml(classes.find(c=>c.id===currentClassId)?.join_code||"")}</strong></div>`;

  $("studentCards").querySelectorAll(".awardBtn[data-user]").forEach(btn=>btn.onclick=async()=>{
    const card=btn.closest(".student"), category=card.querySelector("select").value;
    btn.disabled=true;
    const {error}=await supabaseClient.from("point_events").insert({
      class_id:currentClassId, recipient_user_id:btn.dataset.user, awarded_by:profile.id, category, delta:1
    });
    btn.disabled=false;
    if(error){alert(error.message);return}
    await loadCurrentClass();
  });

  $("studentCards").querySelectorAll(".accountBtn").forEach(btn=>btn.onclick=()=>{
    openAccountModal(btn.dataset.user,btn.dataset.name,btn.dataset.username);
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


function normalizeUsernamePart(s){
  return String(s||"").trim().toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9-]+/g,".")
    .replace(/^\.+|\.+$/g,"")
    .replace(/\.+/g,".");
}
function passwordFromBirthdate(d){
  const m=String(d||"").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}
function parseBulkStudents(text){
  const used=new Map();
  const out=[];
  const errors=[];
  String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
    const parts=line.split(";").map(x=>x.trim());
    if(parts.length<3){errors.push(`Zeile ${i+1}: Formatfehler`);return}
    const [last,first,birth]=parts;
    const pw=passwordFromBirthdate(birth);
    if(!pw){errors.push(`Zeile ${i+1}: Geburtsdatum ungültig`);return}
    let base=`${normalizeUsernamePart(first)}.${normalizeUsernamePart(last)}`;
    let username=base;
    const n=(used.get(base)||0)+1; used.set(base,n);
    if(n>1) username=`${base}${n}`;
    out.push({display_name:`${first} ${last}`.trim(),username,initial_password:pw});
  });
  return {students:out,errors};
}

$("changePasswordBtn").onclick=async()=>{
  $("passwordMsg").textContent="";
  const p1=$("newPassword1").value, p2=$("newPassword2").value;
  if(p1.length<10){$("passwordMsg").textContent="Bitte mindestens 10 Zeichen verwenden.";return}
  if(p1!==p2){$("passwordMsg").textContent="Die Passwörter stimmen nicht überein.";return}
  const {error}=await supabaseClient.auth.updateUser({password:p1});
  if(error){$("passwordMsg").textContent=error.message;return}
  const {error:rpcError}=await supabaseClient.rpc("complete_first_login");
  if(rpcError){$("passwordMsg").textContent=rpcError.message;return}
  $("forcePasswordView").classList.add("hidden");
  const {data:{user}}=await supabaseClient.auth.getUser();
  await enterApp(user);
};

$("bulkImportBtn").onclick=async()=>{
  $("bulkImportMsg").textContent="";
  if(!currentClassId){$("bulkImportMsg").textContent="Bitte zuerst eine Klasse auswählen.";return}
  const parsed=parseBulkStudents($("bulkImportInput").value);
  if(parsed.errors.length){$("bulkImportMsg").textContent=parsed.errors.join(" | ");return}
  if(!parsed.students.length){$("bulkImportMsg").textContent="Keine Importdaten gefunden.";return}
  $("bulkImportBtn").disabled=true;
  $("bulkImportMsg").textContent=`${parsed.students.length} Konten werden angelegt …`;
  const {data,error}=await supabaseClient.functions.invoke("bulk-create-students",{
    body:{class_id:currentClassId,students:parsed.students}
  });
  $("bulkImportBtn").disabled=false;
  if(error){$("bulkImportMsg").textContent=error.message;return}
  const failed=(data?.results||[]).filter(x=>!x.ok);
  $("bulkImportMsg").textContent=failed.length
    ? `${data.created} angelegt, ${failed.length} Fehler: `+failed.map(x=>`${x.username}: ${x.error}`).join(" | ")
    : `${data.created} Schülerkonten erfolgreich angelegt.`;
  if(!failed.length)$("bulkImportInput").value="";
  await loadCurrentClass();
};



let accountStudentId=null;

function openAccountModal(studentId,name,username){
  accountStudentId=studentId;
  $("accountModalTitle").textContent=name||"Schülerkonto";
  $("accountModalInfo").textContent=username ? `Benutzername: ${username}` : "Kein Benutzername hinterlegt.";
  $("temporaryPassword").value="";
  $("accountModalMsg").textContent="";
  $("accountModal").classList.remove("hidden");
}

$("closeAccountModalBtn").onclick=()=>{
  $("accountModal").classList.add("hidden");
  accountStudentId=null;
};

$("confirmResetPasswordBtn").onclick=async()=>{
  if(!accountStudentId)return;
  const pw=$("temporaryPassword").value.trim();
  if(pw.length<8){$("accountModalMsg").textContent="Mindestens 8 Zeichen erforderlich.";return}
  $("confirmResetPasswordBtn").disabled=true;
  const {data,error}=await supabaseClient.functions.invoke("manage-student-account",{
    body:{
      action:"reset_password",
      class_id:currentClassId,
      student_user_id:accountStudentId,
      temporary_password:pw
    }
  });
  $("confirmResetPasswordBtn").disabled=false;
  $("accountModalMsg").textContent=error ? error.message : (data?.message||"Passwort zurückgesetzt.");
};

$("removeStudentBtn").onclick=async()=>{
  if(!accountStudentId)return;
  if(!confirm("Schüler/in wirklich aus dieser Klasse entfernen? Das Benutzerkonto bleibt bestehen."))return;
  $("removeStudentBtn").disabled=true;
  const {data,error}=await supabaseClient.functions.invoke("manage-student-account",{
    body:{
      action:"remove_from_class",
      class_id:currentClassId,
      student_user_id:accountStudentId
    }
  });
  $("removeStudentBtn").disabled=false;
  if(error){$("accountModalMsg").textContent=error.message;return}
  $("accountModal").classList.add("hidden");
  accountStudentId=null;
  await loadCurrentClass();
};

$("exportUsernamesBtn").onclick=()=>{
  const c=classes.find(x=>x.id===currentClassId);
  const rows=[["Name","Benutzername","Klasse"]];
  members.forEach(m=>rows.push([
    m.profiles?.display_name||"",
    m.profiles?.username||"",
    c?.name||""
  ]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`${(c?.name||"klasse").replace(/\s+/g,"_")}_Benutzernamen.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

document.querySelectorAll(".nav[data-target]").forEach(btn=>btn.onclick=()=>showPage(btn.dataset.target));
init();
