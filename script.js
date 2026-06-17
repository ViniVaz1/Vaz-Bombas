const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC1x-Y1hzhqQwCqs5kPzGfuzts-FgJrZAA",
  authDomain: "vazbombas-8f29d.firebaseapp.com",
  projectId: "vazbombas-8f29d",
  storageBucket: "vazbombas-8f29d.firebasestorage.app",
  messagingSenderId: "1013222369527",
  appId: "1:1013222369527:web:95f13efcf0a371e0e18bf2",
  measurementId: "G-8S7577H7P9"
};

let auth, db, currentUser;
let postos=[], manutencoes=[], financeiros=[];
let pendingDelete=null;
let charts={};
let currentPage='dashboard';

// ── INIT ──
function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    auth.onAuthStateChanged(user => {
      document.getElementById('loading').style.display='none';
      if (user) { currentUser=user; showApp(user); }
      else { showAuth(); }
    });
  } catch(e) {
    document.getElementById('loading').style.display='none';
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app').style.display='none';
}

function showApp(user) {
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('app').style.flexDirection='column';
  document.getElementById('app').style.height='100%';

  const initial = (user.displayName||user.email||'U')[0].toUpperCase();
  document.getElementById('topbar-avatar').textContent = initial;
  document.getElementById('profile-avatar').textContent = initial;
  document.getElementById('profile-name').textContent = user.displayName||'Usuário';
  document.getElementById('profile-email').textContent = user.email;

  const now = new Date();
  document.getElementById('topbar-mes').textContent = now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const m = now.toISOString().slice(0,7);
  document.getElementById('filter-man').value = m;
  document.getElementById('filter-fin').value = m;
  document.getElementById('rel-month').value = m;
  loadAll();
}

async function loadAll() {
  if (!db||!currentUser) return;
  const uid = currentUser.uid;
  try {
    const [ps,ms,fs] = await Promise.all([
      db.collection('postos').where('uid','==',uid).orderBy('nome').get(),
      db.collection('manutencoes').where('uid','==',uid).orderBy('data','desc').get(),
      db.collection('financeiros').where('uid','==',uid).orderBy('data','desc').get()
    ]);
    postos = ps.docs.map(d=>({id:d.id,...d.data()}));
    manutencoes = ms.docs.map(d=>({id:d.id,...d.data()}));
    financeiros = fs.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  } catch(e) {
    if(e.code==='failed-precondition'||e.message.includes('index')){
      showToast('Crie os índices no Firebase Console (link no console do navegador)','error');
      console.warn('Firestore precisa de índices compostos. Abra o Console do Firebase → Firestore → Indexes e crie:\n• postos: uid ASC, nome ASC\n• manutencoes: uid ASC, data DESC\n• financeiros: uid ASC, data DESC\nOu abra o link que aparecer no console do navegador.');
    } else {
      showToast('Erro ao carregar dados: '+e.message,'error');
    }
  }
}

function renderAll() {
  renderDashboard();
  renderPostos();
  renderManutencoes();
  renderFinanceiro();
  renderRelatorio();
  checkNotifications();
}

// ── AUTH ──
function switchTab(t) {
  document.querySelectorAll('.auth-tab').forEach((el,i)=>el.classList.toggle('active',(i===0&&t==='login')||(i===1&&t==='register')));
  document.getElementById('tab-login').style.display=t==='login'?'block':'none';
  document.getElementById('tab-register').style.display=t==='register'?'block':'none';
  document.getElementById('auth-error').style.display='none';
}

async function doLogin() {
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('auth-error');
  err.style.display='none';
  try { await auth.signInWithEmailAndPassword(email,pass); }
  catch(e) { err.style.display='block'; err.textContent=traduzErro(e.code); }
}

async function doRegister() {
  const name=document.getElementById('reg-name').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const err=document.getElementById('auth-error');
  err.style.display='none';
  if(!name){err.style.display='block';err.textContent='Informe seu nome.';return;}
  try {
    const c=await auth.createUserWithEmailAndPassword(email,pass);
    await c.user.updateProfile({displayName:name});
  } catch(e){err.style.display='block';err.textContent=traduzErro(e.code);}
}

function doLogout(){
  if(auth) auth.signOut();
  closeProfile();
}

function traduzErro(code){
  const m={'auth/invalid-email':'E-mail inválido.','auth/user-not-found':'Usuário não encontrado.',
    'auth/wrong-password':'Senha incorreta.','auth/email-already-in-use':'E-mail já cadastrado.',
    'auth/weak-password':'Senha fraca (mín. 6 caracteres).','auth/invalid-credential':'Credenciais inválidas.'};
  return m[code]||'Erro: '+code;
}

// ── NAVEGAÇÃO ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  const nb=document.getElementById('nav-'+id);
  if(nb) nb.classList.add('active');
  document.getElementById('scroll-area').scrollTop=0;
  currentPage=id;

  // FAB
  const fab=document.getElementById('fab-btn');
  const fabPages={postos:true,manutencoes:true};
  if(fabPages[id]){fab.style.display='flex';}else{fab.style.display='none';}

  if(id==='dashboard') renderDashboard();
  if(id==='notificacoes') checkNotifications();
}

function fabAction(){
  if(currentPage==='postos') openPostoModal();
  if(currentPage==='manutencoes') openManModal();
}

// ── DASHBOARD ──
function renderDashboard(){
  const mes=new Date().toISOString().slice(0,7);
  const manMes=manutencoes.filter(m=>m.data&&m.data.startsWith(mes));
  const recMes=financeiros.filter(f=>f.tipo==='receita'&&f.data&&f.data.startsWith(mes));
  const despMes=financeiros.filter(f=>f.tipo==='despesa'&&f.data&&f.data.startsWith(mes));
  const totalR=recMes.reduce((s,f)=>s+Number(f.valor||0),0);
  const totalD=despMes.reduce((s,f)=>s+Number(f.valor||0),0);
  const lucro=totalR-totalD;
  const alertas=getVencidos().length + getAlertasMensalidade().length;

  document.getElementById('dash-stats').innerHTML=`
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-label">Receitas</div><div class="stat-value">R$&nbsp;${fmt(totalR)}</div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-label">Despesas</div><div class="stat-value">R$&nbsp;${fmt(totalD)}</div></div>
    <div class="stat-card"><div class="stat-icon ${lucro>=0?'blue':'red'}"><i class="fas fa-chart-line"></i></div>
      <div class="stat-label">Lucro</div><div class="stat-value ${lucro<0?'valor-neg':'valor-pos'}">R$&nbsp;${fmt(lucro)}</div></div>
    <div class="stat-card"><div class="stat-icon amber"><i class="fas fa-wrench"></i></div>
      <div class="stat-label">Serviços</div><div class="stat-value">${manMes.length}</div><div class="stat-sub">este mês</div></div>
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-map-marker-alt"></i></div>
      <div class="stat-label">Postos</div><div class="stat-value">${postos.length}</div></div>
    <div class="stat-card"><div class="stat-icon ${alertas>0?'red':'green'}"><i class="fas fa-bell"></i></div>
      <div class="stat-label">Alertas</div><div class="stat-value">${alertas}</div><div class="stat-sub">vencidos</div></div>
  `;
  renderCharts();
}

function renderCharts(){
  const labels6=[],recArr=[],despArr=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const m=d.toISOString().slice(0,7);
    labels6.push(d.toLocaleDateString('pt-BR',{month:'short'}));
    recArr.push(financeiros.filter(f=>f.tipo==='receita'&&f.data&&f.data.startsWith(m)).reduce((s,f)=>s+Number(f.valor||0),0));
    despArr.push(financeiros.filter(f=>f.tipo==='despesa'&&f.data&&f.data.startsWith(m)).reduce((s,f)=>s+Number(f.valor||0),0));
  }
  mkChart('chart-financeiro','bar',{labels:labels6,datasets:[
    {label:'Receita',data:recArr,backgroundColor:'#10b98188'},
    {label:'Despesa',data:despArr,backgroundColor:'#ef444488'}
  ]});

  const labels12=[],manArr=[];
  for(let i=11;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const m=d.toISOString().slice(0,7);
    labels12.push(d.toLocaleDateString('pt-BR',{month:'short'}));
    manArr.push(manutencoes.filter(x=>x.data&&x.data.startsWith(m)).length);
  }
  mkChart('chart-mensal','line',{labels:labels12,datasets:[
    {label:'Manutenções',data:manArr,borderColor:'#f59e0b',backgroundColor:'#f59e0b22',tension:.4,fill:true}
  ]});

  const tipoCount={};
  manutencoes.forEach(m=>{tipoCount[m.tipo||'Outros']=(tipoCount[m.tipo||'Outros']||0)+1;});
  mkChart('chart-tipos','doughnut',{labels:Object.keys(tipoCount),datasets:[
    {data:Object.values(tipoCount),backgroundColor:['#2563a8','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316']}
  ]});

  const pCount={};
  manutencoes.forEach(m=>{pCount[m.postoNome||'—']=(pCount[m.postoNome||'—']||0)+1;});
  mkChart('chart-postos','bar',{labels:Object.keys(pCount),datasets:[
    {label:'Manutenções',data:Object.values(pCount),backgroundColor:'#2563a888'}
  ]});
}

function mkChart(id,type,data){
  if(charts[id]) charts[id].destroy();
  const ctx=document.getElementById(id);
  if(!ctx) return;
  charts[id]=new Chart(ctx,{type,data,options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
    ...(type!=='doughnut'&&{scales:{y:{beginAtZero:true,ticks:{font:{size:10}}},x:{ticks:{font:{size:10}}}}})
  }});
}

// ── POSTOS ──
function getStatusMensalidade(p){
  if(!p.vencimentoDia) return null;
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const dia = Number(p.vencimentoDia);
  // Clamp: usa o último dia do mês se o dia de vencimento não existir nele (ex: dia 31 em fevereiro)
  function clampDia(ano, mes, d){
    const ultimo = new Date(ano, mes+1, 0).getDate();
    return new Date(ano, mes, Math.min(d, ultimo));
  }
  // Próximo vencimento: se já passou do dia neste mês, é no próximo mês
  let venc = clampDia(hoje.getFullYear(), hoje.getMonth(), dia);
  if(hoje > venc) venc = clampDia(hoje.getFullYear(), hoje.getMonth()+1, dia);
  // diff em dias inteiros (positivo = futuro, 0 = hoje, negativo = vencido)
  const diff = Math.round((venc - hoje) / 864e5);
  // Vencimento do mês corrente (pode ser passado)
  const vencMesAtual = clampDia(hoje.getFullYear(), hoje.getMonth(), dia);
  const diffMesAtual = Math.round((vencMesAtual - hoje) / 864e5);
  return { diff, dia, venc, diffMesAtual };
}

function renderPostos(){
  const list=document.getElementById('postos-list');
  const empty=document.getElementById('postos-empty');
  if(!postos.length){list.innerHTML='';empty.style.display='block';return;}
  const termo=(document.getElementById('search-postos')?.value||'').toLowerCase().trim();
  const filtrados=!termo?postos:postos.filter(p=>
    (p.nome||'').toLowerCase().includes(termo)||
    (p.cidade||'').toLowerCase().includes(termo)||
    (p.cnpj||'').toLowerCase().includes(termo)||
    (p.contato||'').toLowerCase().includes(termo)||
    (p.endereco||'').toLowerCase().includes(termo)
  );
  if(!filtrados.length){
    list.innerHTML='<div class="empty-state"><i class="fas fa-search"></i><p>Nenhum posto encontrado para <strong>"'+esc(termo)+'"</strong></p></div>';
    empty.style.display='none';
    return;
  }
  empty.style.display='none';
  list.innerHTML=filtrados.map(p=>{
    const mans=manutencoes.filter(m=>m.postoId===p.id).sort((a,b)=>b.data.localeCompare(a.data));
    const dias=mans.length?diasDesde(mans[0].data):null;
    const stMan=dias===null?'<span class="badge badge-gray">Sem registro</span>'
      :dias<=15?'<span class="badge badge-green">Manut. OK &middot; '+dias+'d</span>'
      :'<span class="badge badge-red">Manut. vencida &middot; '+dias+'d</span>';

    // Badge mensalidade
    let stMens='';
    const sm=getStatusMensalidade(p);
    const mesPago=p.ultimoPagamento?p.ultimoPagamento.slice(0,7):'';
    const mesAtual=new Date().toISOString().slice(0,7);
    const pagouMes=mesPago===mesAtual;
    if(sm){
      if(pagouMes) stMens='<span class="badge badge-green">\u2705 Pago em '+fmtDate(p.ultimoPagamento)+'</span>';
      else if(sm.diffMesAtual<=0) stMens='<span class="badge badge-red">Mensalidade vencida (dia '+sm.dia+')</span>';
      else if(sm.diff<=5) stMens='<span class="badge badge-amber">Vence em '+sm.diff+'d (dia '+sm.dia+')</span>';
      else stMens='<span class="badge badge-blue">Vence dia '+sm.dia+' ('+sm.diff+'d)</span>';
    }

    // Info financeira
    const infoFin=(p.bicos||p.mensalidade)?
      '<div class="item-meta" style="margin-top:4px">'
      +(p.bicos?p.bicos+' bico(s)':'')
      +(p.valorBico?' &middot; R$ '+fmt(p.valorBico)+'/bico':'')
      +(p.mensalidade?' &middot; Mensalidade: R$ '+fmt(p.mensalidade):'')
      +'</div>':'';

    return '<div class="item-card">'
      +'<div class="item-icon" style="background:'+(dias===null?'#fef3c7':dias<=15?'#d1fae5':'#fee2e2')+'">'
      +'<i class="fas fa-gas-pump" style="color:'+(dias===null?'#d97706':dias<=15?'#059669':'#dc2626')+'"></i></div>'
      +'<div class="item-body">'
      +'<div class="item-title">'+esc(p.nome)+'</div>'
      +'<div class="item-sub">'+esc(p.endereco||'—')+'</div>'
      +'<div class="item-meta">'+esc(p.contato||'')+(p.tel?' &middot; '+esc(p.tel):'')+'</div>'
      +infoFin
      +'<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">'+stMan+(stMens?' '+stMens:'')+'</div>'
      +'<div class="item-actions">'
      +'<button class="btn btn-outline btn-sm" onclick="editPosto(\''+p.id+'\')"><i class="fas fa-edit"></i> Editar</button>'
      +(p.mensalidade&&!pagouMes?'<button class="btn btn-green btn-sm" onclick="abrirModalPagamento(\''+p.id+'\')"><i class="fas fa-check-circle"></i> Registrar Pago</button>':'')
      +(p.mensalidade&&pagouMes?'<button class="btn btn-danger btn-sm" onclick="abrirModalCancelPagamento(\''+p.id+'\')"><i class="fas fa-times-circle"></i> Cancelar Pago</button>':'')
      +'<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'postos\',\''+p.id+'\',\'o posto '+esc(p.nome).replace(/'/g,'&#39;')+'\')"><i class="fas fa-trash"></i></button>'
      +'</div>'
      +'</div></div>';
  }).join('');
}

function openPostoModal(){
  ['p-nome','p-cnpj','p-endereco','p-cidade','p-estado','p-contato','p-tel','p-obs','p-bicos','p-valor-bico','p-mensalidade','p-vencimento-dia'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('posto-id').value='';
  document.getElementById('modal-posto-title').textContent='Novo Posto';
  openModal('modal-posto');
}

function calcMensalidade(){
  const bicos=Number(document.getElementById('p-bicos').value)||0;
  const vb=Number(document.getElementById('p-valor-bico').value)||0;
  if(bicos>0&&vb>0) document.getElementById('p-mensalidade').value=(bicos*vb).toFixed(2);
}

function editPosto(id){
  const p=postos.find(x=>x.id===id); if(!p) return;
  document.getElementById('posto-id').value=id;
  document.getElementById('p-nome').value=p.nome||'';
  document.getElementById('p-cnpj').value=p.cnpj||'';
  document.getElementById('p-endereco').value=p.endereco||'';
  document.getElementById('p-cidade').value=p.cidade||'';
  document.getElementById('p-estado').value=p.estado||'';
  document.getElementById('p-contato').value=p.contato||'';
  document.getElementById('p-tel').value=p.tel||'';
  document.getElementById('p-obs').value=p.obs||'';
  document.getElementById('p-bicos').value=p.bicos||'';
  document.getElementById('p-valor-bico').value=p.valorBico||'';
  document.getElementById('p-mensalidade').value=p.mensalidade||'';
  document.getElementById('p-vencimento-dia').value=p.vencimentoDia||'';
  document.getElementById('modal-posto-title').textContent='Editar Posto';
  openModal('modal-posto');
}

async function savePosto(){
  const nome=v('p-nome'), endereco=v('p-endereco');
  if(!nome||!endereco){showToast('Preencha nome e endereço!','error');return;}
  const id=v('posto-id');
  const now=new Date().toISOString();
  const bicos=Number(document.getElementById('p-bicos').value)||0;
  const valorBico=Number(document.getElementById('p-valor-bico').value)||0;
  const mensalidade=Number(document.getElementById('p-mensalidade').value)||0;
  const vencimentoDia=Number(document.getElementById('p-vencimento-dia').value)||0;
  const data={
    uid:currentUser.uid,nome,cnpj:v('p-cnpj'),endereco,cidade:v('p-cidade'),
    estado:v('p-estado'),contato:v('p-contato'),tel:v('p-tel'),obs:v('p-obs'),
    bicos,valorBico,mensalidade,vencimentoDia,updatedAt:now
  };
  if(!id){data.createdAt=now;}
  try{
    if(id) await db.collection('postos').doc(id).update(data);
    else await db.collection('postos').add(data);
    closeModal('modal-posto'); showToast('Posto salvo!','success'); await loadAll();
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// ── MANUTENÇÕES ──
function renderManutencoes(){
  const mes=document.getElementById('filter-man').value;
  const filtered=mes?manutencoes.filter(m=>m.data&&m.data.startsWith(mes)):manutencoes;
  const list=document.getElementById('man-list');
  const empty=document.getElementById('man-empty');
  if(!filtered.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=filtered.map(m=>{
    const stCls=m.status==='Concluída'?'badge-green':m.status==='Em andamento'?'badge-amber':'badge-blue';
    const mid=esc(m.id), pnome=esc(m.postoNome||'');
    return '<div class="item-card">'
      +'<div class="item-icon" style="background:#dbeafe"><i class="fas fa-wrench" style="color:#2563eb"></i></div>'
      +'<div class="item-body">'
      +'<div class="item-title">'+esc(m.postoNome||'—')+'</div>'
      +'<div class="item-sub">'+esc(m.tipo||'—')+'</div>'
      +'<div class="item-meta">'+fmtDate(m.data)+' · '+esc(m.tec||'—')+'</div>'
      +'<div style="margin-top:6px;display:flex;gap:8px;align-items:center">'
      +'<span class="badge '+stCls+'">'+esc(m.status||'—')+'</span>'
      +'<span style="font-weight:700;color:var(--success)">R$ '+fmt(m.valor)+'</span>'
      +'</div>'
      +'<div class="item-actions">'
      +'<button class="btn btn-outline btn-sm" onclick="editMan(\''+mid+'\')"><i class="fas fa-edit"></i> Editar</button>'
      +'<button class="btn btn-danger btn-sm" onclick="confirmDelete(\'manutencoes\',\''+mid+'\',\'a manutenção em '+pnome+'\')"><i class="fas fa-trash"></i></button>'
      +'</div>'
      +'</div></div>';
  }).join('');
}

function openManModal(){
  ['m-tec','m-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('man-id').value='';
  document.getElementById('m-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('m-valor').value='';
  document.getElementById('m-status').value='Concluída';
  document.getElementById('modal-man-title').textContent='Registrar Manutenção';
  fillPostoSelect();
  openModal('modal-man');
}

function editMan(id){
  const m=manutencoes.find(x=>x.id===id); if(!m) return;
  document.getElementById('man-id').value=id;
  document.getElementById('m-data').value=m.data||'';
  document.getElementById('m-tec').value=m.tec||'';
  document.getElementById('m-valor').value=m.valor||'';
  document.getElementById('m-status').value=m.status||'Concluída';
  document.getElementById('m-obs').value=m.obs||'';
  document.getElementById('modal-man-title').textContent='Editar Manutenção';
  fillPostoSelect(m.postoId);
  setTimeout(()=>{document.getElementById('m-tipo').value=m.tipo||'';},50);
  openModal('modal-man');
}

function fillPostoSelect(sel=''){
  const el=document.getElementById('m-posto');
  el.innerHTML='<option value="">Selecione...</option>';
  postos.forEach(p=>{
    const o=document.createElement('option');
    o.value=p.id; o.textContent=p.nome;
    if(p.id===sel) o.selected=true;
    el.appendChild(o);
  });
}

async function saveManutencao(){
  const data=v('m-data'),postoId=document.getElementById('m-posto').value,tipo=document.getElementById('m-tipo').value;
  if(!data||!postoId||!tipo){showToast('Preencha data, posto e tipo!','error');return;}
  const posto=postos.find(p=>p.id===postoId);
  const id=v('man-id');
  const nowM=new Date().toISOString();
  const obj={uid:currentUser.uid,data,postoId,postoNome:posto?.nome||'',tipo,
    tec:v('m-tec'),valor:Number(v('m-valor'))||0,
    status:document.getElementById('m-status').value,obs:v('m-obs'),updatedAt:nowM};
  if(!id){obj.createdAt=nowM;}
  try{
    if(id) await db.collection('manutencoes').doc(id).update(obj);
    else await db.collection('manutencoes').add(obj);
    closeModal('modal-man'); showToast('Manutenção salva!','success'); await loadAll();
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// ── FINANCEIRO ──
function renderFinanceiro(){
  const mes=document.getElementById('filter-fin').value;
  const filtered=mes?financeiros.filter(f=>f.data&&f.data.startsWith(mes)):financeiros;
  const totalR=filtered.filter(f=>f.tipo==='receita').reduce((s,f)=>s+Number(f.valor||0),0);
  const totalD=filtered.filter(f=>f.tipo==='despesa').reduce((s,f)=>s+Number(f.valor||0),0);
  const lucro=totalR-totalD;
  document.getElementById('fin-stats').innerHTML=`
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-label">Receitas</div><div class="stat-value valor-pos">R$&nbsp;${fmt(totalR)}</div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-label">Despesas</div><div class="stat-value valor-neg">R$&nbsp;${fmt(totalD)}</div></div>
    <div class="stat-card" style="grid-column:1/-1"><div class="stat-icon ${lucro>=0?'blue':'red'}" style="display:inline-flex"><i class="fas fa-balance-scale"></i></div>
      <div class="stat-label">Lucro / Prejuízo</div><div class="stat-value ${lucro>=0?'valor-pos':'valor-neg'}">R$&nbsp;${fmt(lucro)}</div></div>
  `;
  const list=document.getElementById('fin-list');
  const empty=document.getElementById('fin-empty');
  if(!filtered.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=filtered.map(f=>`<div class="item-card">
    <div class="item-icon" style="background:${f.tipo==='receita'?'#d1fae5':'#fee2e2'}">
      <i class="fas fa-${f.tipo==='receita'?'arrow-up':'arrow-down'}" style="color:${f.tipo==='receita'?'#059669':'#dc2626'}"></i>
    </div>
    <div class="item-body">
      <div class="item-title">${esc(f.desc||'—')}</div>
      <div class="item-sub">${esc(f.cat||'—')} · ${fmtDate(f.data)}</div>
    </div>
    <div class="item-right">
      <span style="font-size:16px;font-weight:800;color:${f.tipo==='receita'?'var(--success)':'var(--danger)'}">R$&nbsp;${fmt(f.valor)}</span>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete('financeiros','${f.id}','o lançamento ${esc(f.desc||'')}')"><i class="fas fa-trash"></i></button>
    </div>
  </div>`).join('');
}

function openFinModal(tipo){
  ['f-desc','f-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-valor').value='';
  document.getElementById('fin-tipo-val').value=tipo;
  document.getElementById('f-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('modal-fin-title').textContent=tipo==='receita'?'💰 Nova Receita':'💸 Nova Despesa';
  document.getElementById('btn-save-fin').className='btn '+(tipo==='receita'?'btn-green':'btn-danger');
  openModal('modal-fin');
}

async function saveFinanceiro(){
  const data=v('f-data'),valor=Number(document.getElementById('f-valor').value),desc=v('f-desc');
  if(!data||!valor||!desc){showToast('Preencha data, valor e descrição!','error');return;}
  const obj={uid:currentUser.uid,data,valor,desc,tipo:document.getElementById('fin-tipo-val').value,
    cat:document.getElementById('f-cat').value,obs:v('f-obs'),createdAt:new Date().toISOString()};
  try{
    await db.collection('financeiros').add(obj);
    closeModal('modal-fin'); showToast('Lançamento salvo!','success'); await loadAll();
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// ── NOTIFICAÇÕES ──
function getVencidos(){
  return postos.map(p=>{
    const mans=manutencoes.filter(m=>m.postoId===p.id).sort((a,b)=>b.data.localeCompare(a.data));
    const dias=mans.length?diasDesde(mans[0].data):9999;
    return{...p,dias,ultMan:mans[0]};
  }).filter(p=>p.dias>15);
}

function getAlertasMensalidade(){
  const mesAtual = new Date().toISOString().slice(0,7);
  return postos
    .filter(p => p.vencimentoDia && p.mensalidade)
    .filter(p => {
      // Se já pagou este mês, sem alerta
      const pagouMes = p.ultimoPagamento && p.ultimoPagamento.slice(0,7) === mesAtual;
      if(pagouMes) return false;
      // Alerta se: vence em até 5 dias (contando do próximo venc) OU mês corrente já venceu
      const sm = getStatusMensalidade(p);
      return sm && (sm.diff <= 5 || sm.diffMesAtual < 0);
    })
    .map(p => ({...p, sm: getStatusMensalidade(p)}));
}

function checkNotifications(){
  const vencidos=getVencidos();
  const alertaMens=getAlertasMensalidade();
  const total=vencidos.length+alertaMens.length;
  const badge=document.getElementById('notif-badge');
  if(total>0){badge.style.display='block';badge.textContent=total;}
  else{badge.style.display='none';}

  const list=document.getElementById('notif-list');
  let html='';

  // ── Alertas de mensalidade ──
  if(alertaMens.length){
    html+='<div class="section-label" style="margin-top:0">Mensalidades</div>';
    alertaMens.forEach(p=>{
      const venceu=p.sm.diff<=0;
      const cls=venceu?'danger':'warning';
      const titulo=venceu
        ?'Mensalidade VENCIDA — '+esc(p.nome)
        :'Mensalidade vence em '+p.sm.diff+' dia(s) — '+esc(p.nome);
      const corpo=venceu
        ?'A mensalidade de R$ '+fmt(p.mensalidade)+' venceu no dia '+p.vencimentoDia+'. Verifique o recebimento.'
        :'A mensalidade de R$ '+fmt(p.mensalidade)+' vence no dia '+p.vencimentoDia+'. Acompanhe o pagamento.';
      const msgCob='Olá '+esc(p.contato||p.nome)+'! 👋\n\nPassando para lembrar que a mensalidade de manutenção do '+esc(p.nome)+' no valor de R$ '+fmt(p.mensalidade)+' vence no dia '+p.vencimentoDia+'.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\nEquipe FuelTech Manutenção';
      const tel=p.tel?p.tel.replace(/\D/g,''):'';
      const wa=tel?'https://wa.me/55'+tel+'?text='+encodeURIComponent(msgCob):null;
      html+='<div class="notif-item '+cls+'">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        +'<i class="fas fa-'+(venceu?'exclamation-triangle':'file-invoice-dollar')+'" style="color:'+(venceu?'var(--danger)':'var(--warning)')+'"></i>'
        +'<span class="notif-title">'+titulo+'</span></div>'
        +'<div class="notif-body">'+corpo+'</div>'
        +'<div class="msg-preview">'+esc(msgCob)+'</div>'
        +'<div style="margin-top:10px">'
        +(wa?'<a href="'+wa+'" target="_blank" style="text-decoration:none"><button class="btn btn-green btn-full"><i class="fab fa-whatsapp"></i> Enviar Cobrança WhatsApp</button></a>'
          :'<p style="font-size:12px;color:var(--text-muted)">Cadastre o WhatsApp do posto para envio.</p>')
        +'</div></div>';
    });
  }

  // ── Alertas de manutenção ──
  if(vencidos.length){
    html+='<div class="section-label">Manutenção</div>';
    vencidos.forEach(p=>{
      const msgMan='Olá '+(p.contato||p.nome)+'! \u{1F44B}\n\n'+(p.dias>=9999?'Ainda não temos manutenção registrada no '+p.nome+'.':'Faz '+p.dias+' dia(s) desde nossa última manutenção no '+p.nome+'.')+'\n\nGostaríamos de saber se está tudo certo com as bombas. Está ocorrendo algum problema ou algo que possamos verificar?\n\nEstamos à disposição!\n\nAtenciosamente,\nEquipe FuelTech Manutenção';
      const cls=p.dias>30?'danger':'warning';
      const tel=p.tel?p.tel.replace(/\D/g,''):'';
      const wa=tel?'https://wa.me/55'+tel+'?text='+encodeURIComponent(msgMan):null;
      html+='<div class="notif-item '+cls+'">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        +'<i class="fas fa-'+(cls==='danger'?'exclamation-triangle':'clock')+'" style="color:'+(cls==='danger'?'var(--danger)':'var(--warning)')+'"></i>'
        +'<span class="notif-title">'+esc(p.nome)+'</span></div>'
        +'<div class="notif-body">'+( p.dias>=9999 ? '<strong>Sem manutenção registrada</strong>' : ('Última manutenção há <strong>'+p.dias+' dias</strong>'+(p.ultMan ? ' ('+fmtDate(p.ultMan.data)+')' : '')) )+'</div>'
        +'<div class="msg-preview">'+esc(msgMan)+'</div>'
        +'<div style="margin-top:10px">'
        +(wa?'<a href="'+wa+'" target="_blank" style="text-decoration:none"><button class="btn btn-green btn-full"><i class="fab fa-whatsapp"></i> Enviar via WhatsApp</button></a>'
          :'<p style="font-size:12px;color:var(--text-muted)">Cadastre o WhatsApp do posto para envio.</p>')
        +'</div></div>';
    });
  }

  if(!total){
    html='<div class="notif-item info">'
      +'<div style="display:flex;align-items:center;gap:10px">'
      +'<i class="fas fa-check-circle" style="font-size:22px;color:#3b82f6"></i>'
      +'<div><div class="notif-title">Tudo em dia!</div>'
      +'<div class="notif-body">Sem alertas de manutenção ou mensalidade no momento.</div></div>'
      +'</div></div>';
  }
  list.innerHTML=html;
}

// ── RELATÓRIO PDF ──
function renderRelatorio(){
  const mes=document.getElementById('rel-month').value; if(!mes) return;
  const manMes=manutencoes.filter(m=>m.data&&m.data.startsWith(mes));
  const finMes=financeiros.filter(f=>f.data&&f.data.startsWith(mes));
  const totalR=finMes.filter(f=>f.tipo==='receita').reduce((s,f)=>s+Number(f.valor||0),0);
  const totalD=finMes.filter(f=>f.tipo==='despesa').reduce((s,f)=>s+Number(f.valor||0),0);
  document.getElementById('rel-stats').innerHTML=`
    <div class="stat-card"><div class="stat-icon amber"><i class="fas fa-wrench"></i></div>
      <div class="stat-label">Manutenções</div><div class="stat-value">${manMes.length}</div></div>
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-label">Receitas</div><div class="stat-value">R$&nbsp;${fmt(totalR)}</div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-label">Despesas</div><div class="stat-value">R$&nbsp;${fmt(totalD)}</div></div>
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-chart-line"></i></div>
      <div class="stat-label">Lucro</div><div class="stat-value ${(totalR-totalD)>=0?'valor-pos':'valor-neg'}">R$&nbsp;${fmt(totalR-totalD)}</div></div>
  `;
  const list=document.getElementById('rel-list');
  const empty=document.getElementById('rel-empty');
  if(!manMes.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=manMes.map(m=>`<div class="item-card">
    <div class="item-icon" style="background:#dbeafe"><i class="fas fa-wrench" style="color:#2563eb"></i></div>
    <div class="item-body">
      <div class="item-title">${esc(m.postoNome||'—')}</div>
      <div class="item-sub">${esc(m.tipo||'—')} · ${fmtDate(m.data)}</div>
    </div>
    <div class="item-right">
      <span style="font-weight:800;color:var(--success)">R$&nbsp;${fmt(m.valor)}</span>
    </div>
  </div>`).join('');
}

async function gerarPDF(){
  const mes=document.getElementById('rel-month').value;
  if(!mes){showToast('Selecione um mês!','error');return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const [ano,m]=mes.split('-');
  const nomeMes=new Date(Number(ano),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const manMes=manutencoes.filter(x=>x.data&&x.data.startsWith(mes));
  const finMes=financeiros.filter(f=>f.data&&f.data.startsWith(mes));
  const totalR=finMes.filter(f=>f.tipo==='receita').reduce((s,f)=>s+Number(f.valor||0),0);
  const totalD=finMes.filter(f=>f.tipo==='despesa').reduce((s,f)=>s+Number(f.valor||0),0);
  const alertas=getVencidos();

  doc.setFillColor(26,58,92); doc.rect(0,0,210,32,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont(undefined,'bold');
  doc.text('FuelTech Pro — Relatório Mensal',15,14);
  doc.setFontSize(10); doc.setFont(undefined,'normal');
  doc.text(`Período: ${nomeMes}`,15,23);
  doc.text(`Gerado: ${new Date().toLocaleDateString('pt-BR')}`,135,23);

  let y=42;
  doc.setTextColor(26,58,92); doc.setFontSize(13); doc.setFont(undefined,'bold');
  doc.text('Resumo Financeiro',15,y); y+=7;
  doc.setFillColor(240,244,248); doc.rect(15,y,180,28,'F');
  doc.setFontSize(11); doc.setTextColor(30,41,59); doc.setFont(undefined,'normal');
  doc.text(`Receitas:   R$ ${fmt(totalR)}`,22,y+8);
  doc.text(`Despesas:  R$ ${fmt(totalD)}`,22,y+16);
  doc.setFont(undefined,'bold');
  doc.text(`Lucro:  R$ ${fmt(totalR-totalD)}`,110,y+12);
  y+=36;

  doc.setTextColor(26,58,92); doc.setFontSize(13); doc.setFont(undefined,'bold');
  doc.text(`Manutenções Realizadas (${manMes.length})`,15,y); y+=7;
  if(manMes.length){
    doc.setFontSize(9); doc.setTextColor(100,116,139); doc.setFont(undefined,'bold');
    doc.text('DATA',15,y); doc.text('POSTO',40,y); doc.text('SERVIÇO',90,y); doc.text('TÉCNICO',145,y); doc.text('VALOR',182,y);
    y+=5; doc.setDrawColor(220,220,220); doc.line(15,y,195,y); y+=4;
    doc.setFont(undefined,'normal'); doc.setTextColor(30,41,59);
    manMes.forEach(m=>{
      if(y>265){doc.addPage();y=20;}
      doc.text(fmtDate(m.data),15,y);
      doc.text(String(m.postoNome||'—').substring(0,20),40,y);
      doc.text(String(m.tipo||'—').substring(0,22),90,y);
      doc.text(String(m.tec||'—').substring(0,15),145,y);
      doc.text('R$ '+fmt(m.valor),180,y);
      y+=6;
    });
  }else{doc.setFontSize(10);doc.setTextColor(150,150,150);doc.text('Nenhuma manutenção neste período.',15,y);y+=8;}
  y+=6;

  if(alertas.length){
    if(y>240){doc.addPage();y=20;}
    doc.setTextColor(185,28,28); doc.setFontSize(13); doc.setFont(undefined,'bold');
    doc.text(`Postos Vencidos (${alertas.length})`,15,y); y+=7;
    doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(30,41,59);
    alertas.forEach(a=>{if(y>270){doc.addPage();y=20;}doc.text(`• ${a.nome} — ${a.dias} dia(s) sem manutenção`,20,y);y+=6;});
    y+=4;
  }

  if(finMes.length){
    if(y>220){doc.addPage();y=20;}
    doc.setTextColor(26,58,92); doc.setFontSize(13); doc.setFont(undefined,'bold');
    doc.text('Lançamentos Financeiros',15,y); y+=7;
    doc.setFontSize(9); doc.setTextColor(100,116,139); doc.setFont(undefined,'bold');
    doc.text('DATA',15,y); doc.text('TIPO',38,y); doc.text('DESCRIÇÃO',65,y); doc.text('CATEGORIA',130,y); doc.text('VALOR',175,y);
    y+=5; doc.setDrawColor(220,220,220); doc.line(15,y,195,y); y+=4;
    doc.setFont(undefined,'normal');
    finMes.forEach(f=>{
      if(y>270){doc.addPage();y=20;}
      f.tipo==='receita'?doc.setTextColor(5,150,105):doc.setTextColor(185,28,28);
      doc.text(fmtDate(f.data),15,y); doc.text(f.tipo==='receita'?'Receita':'Despesa',38,y);
      doc.setTextColor(30,41,59);
      doc.text(String(f.desc||'').substring(0,30),65,y);
      doc.text(String(f.cat||'').substring(0,18),130,y);
      f.tipo==='receita'?doc.setTextColor(5,150,105):doc.setTextColor(185,28,28);
      doc.text('R$ '+fmt(f.valor),173,y); y+=6;
    });
  }

  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text(`FuelTech Pro — ${nomeMes} — Pág. ${i}/${pages}`,15,290);
    doc.text('Documento confidencial',155,290);
  }
  doc.save(`relatorio_${mes}.pdf`);
  showToast('PDF gerado!','success');
}

// ── PAGAMENTO DE MENSALIDADE ──
let pagamentoPostoId = null;
let cancelPagamentoPostoId = null;

function abrirModalPagamento(postoId){
  const p = postos.find(x => x.id === postoId);
  if(!p) return;
  pagamentoPostoId = postoId;
  const hoje = new Date().toISOString().slice(0,10);
  const mesAtual = hoje.slice(0,7);
  const pagouMes = p.ultimoPagamento && p.ultimoPagamento.slice(0,7) === mesAtual;
  document.getElementById('modal-pag-title').textContent = 'Registrar Pagamento — ' + p.nome;
  document.getElementById('modal-pag-desc').textContent =
    'Mensalidade de R$ ' + fmt(p.mensalidade) + '. Confirme a data do recebimento.';
  document.getElementById('pag-data').value = hoje;
  document.getElementById('pag-aviso').style.display = pagouMes ? 'block' : 'none';
  openModal('modal-pagamento');
}

async function confirmarPagamento(){
  const postoId = pagamentoPostoId;
  if(!postoId) return;
  const p = postos.find(x => x.id === postoId);
  if(!p) return;
  const dataPag = document.getElementById('pag-data').value;
  if(!dataPag){ showToast('Informe a data do pagamento!','error'); return; }
  const mesAtual = new Date().toISOString().slice(0,7);
  const mesPagamento = dataPag.slice(0,7);
  try {
    // Atualiza posto
    await db.collection('postos').doc(postoId).update({
      ultimoPagamento: dataPag,
      updatedAt: new Date().toISOString()
    });
    // Remove lançamento anterior de mensalidade deste mês (se existir) para não duplicar
    const anterior = financeiros.find(f =>
      f.postoId === postoId && f.tipo === 'receita' &&
      f.origem === 'mensalidade' && f.data && f.data.slice(0,7) === mesPagamento
    );
    if(anterior){
      await db.collection('financeiros').doc(anterior.id).delete();
    }
    // Cria novo lançamento financeiro
    await db.collection('financeiros').add({
      uid: currentUser.uid,
      tipo: 'receita',
      desc: 'Mensalidade — ' + p.nome,
      cat: 'Mensalidade',
      valor: Number(p.mensalidade) || 0,
      data: dataPag,
      postoId: postoId,
      origem: 'mensalidade',
      createdAt: new Date().toISOString()
    });
    closeModal('modal-pagamento');
    pagamentoPostoId = null;
    showToast('Pagamento registrado e receita lançada!', 'success');
    await loadAll();
  } catch(e) {
    showToast('Erro ao registrar: ' + e.message, 'error');
  }
}

function abrirModalCancelPagamento(postoId){
  const p = postos.find(x => x.id === postoId);
  if(!p) return;
  cancelPagamentoPostoId = postoId;
  document.getElementById('modal-cancel-desc').textContent =
    'O pagamento de ' + fmtDate(p.ultimoPagamento) + ' do posto "' + p.nome +
    '" será cancelado e o lançamento de R$ ' + fmt(p.mensalidade) + ' será removido do financeiro.';
  openModal('modal-cancelpag');
}

async function confirmarCancelPagamento(){
  const postoId = cancelPagamentoPostoId;
  if(!postoId) return;
  const p = postos.find(x => x.id === postoId);
  if(!p) return;
  try {
    // Remove ultimoPagamento do posto
    await db.collection('postos').doc(postoId).update({
      ultimoPagamento: firebase.firestore.FieldValue.delete(),
      updatedAt: new Date().toISOString()
    });
    // Remove lançamento financeiro de mensalidade deste posto (qualquer mês recente)
    const lancs = financeiros.filter(f =>
      f.postoId === postoId && f.tipo === 'receita' && f.origem === 'mensalidade'
    );
    // Remove o mais recente (correspondente ao pagamento cancelado)
    if(lancs.length){
      const maisRecente = lancs.sort((a,b) => b.data.localeCompare(a.data))[0];
      await db.collection('financeiros').doc(maisRecente.id).delete();
    }
    closeModal('modal-cancelpag');
    cancelPagamentoPostoId = null;
    showToast('Pagamento cancelado e receita removida.', 'success');
    await loadAll();
  } catch(e) {
    showToast('Erro ao cancelar: ' + e.message, 'error');
  }
}

// ── PDF DE POSTOS ──
async function gerarPDFPostos(){
  if(!postos.length){ showToast('Nenhum posto cadastrado!','error'); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
  const hoje = new Date().toLocaleDateString('pt-BR');
  const mesAtual = new Date().toISOString().slice(0,7);

  // Cabecalho
  doc.setFillColor(26,58,92); doc.rect(0,0,210,32,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont(undefined,'bold');
  doc.text('FuelTech Pro — Relatorio de Postos', 15, 14);
  doc.setFontSize(10); doc.setFont(undefined,'normal');
  doc.text('Data: ' + hoje, 15, 23);
  doc.text('Total de postos: ' + postos.length, 135, 23);

  let y = 42;

  // Resumo mensalidades
  const totalMens = postos.reduce((s,p) => s + Number(p.mensalidade||0), 0);
  const pagosMes = postos.filter(p => p.ultimoPagamento && p.ultimoPagamento.slice(0,7) === mesAtual);
  const totalPago = pagosMes.reduce((s,p) => s + Number(p.mensalidade||0), 0);
  const totalPendente = totalMens - totalPago;

  doc.setFillColor(240,244,248); doc.rect(15,y,180,32,'F');
  doc.setFontSize(10); doc.setTextColor(26,58,92); doc.setFont(undefined,'bold');
  doc.text('Resumo de Mensalidades — ' + new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'}), 20, y+7);
  doc.setFont(undefined,'normal'); doc.setTextColor(30,41,59);
  doc.text('Receita total potencial:  R$ ' + fmt(totalMens), 20, y+15);
  doc.text('Ja recebido:  R$ ' + fmt(totalPago), 20, y+22);
  doc.setTextColor(totalPendente>0?185:5, totalPendente>0?28:150, totalPendente>0?28:105);
  doc.text('Pendente:  R$ ' + fmt(totalPendente), 110, y+22);
  y += 40;

  // Tabela de postos
  doc.setTextColor(26,58,92); doc.setFontSize(12); doc.setFont(undefined,'bold');
  doc.text('Detalhes dos Postos', 15, y); y += 8;

  postos.forEach((p, idx) => {
    if(y > 240){ doc.addPage(); y = 20; }

    const mans = manutencoes.filter(m => m.postoId === p.id).sort((a,b) => b.data.localeCompare(a.data));
    const dias = mans.length ? diasDesde(mans[0].data) : null;
    const sm = getStatusMensalidade(p);
    const pagouMes = p.ultimoPagamento && p.ultimoPagamento.slice(0,7) === mesAtual;

    // Fundo do card
    const bgColor = idx % 2 === 0 ? [248,250,252] : [255,255,255];
    doc.setFillColor(...bgColor); doc.rect(15, y-4, 180, 52, 'F');
    doc.setDrawColor(226,232,240); doc.rect(15, y-4, 180, 52, 'S');

    // Nome e endereco
    doc.setFontSize(11); doc.setTextColor(30,41,59); doc.setFont(undefined,'bold');
    doc.text((idx+1) + '. ' + String(p.nome||'').substring(0,35), 19, y+2);
    doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(100,116,139);
    doc.text(String(p.endereco||'—').substring(0,50), 19, y+8);
    doc.text((p.cidade||'') + (p.estado?' - '+p.estado:''), 19, y+14);

    // Contato
    doc.text('Contato: ' + String(p.contato||'—').substring(0,20) + (p.tel?' | WhatsApp: '+p.tel:''), 19, y+20);

    // Financeiro
    doc.setTextColor(30,41,59);
    const finInfo = (p.bicos?p.bicos+' bico(s)':'') + (p.valorBico?' | R$ '+fmt(p.valorBico)+'/bico':'') + (p.mensalidade?' | Mensalidade: R$ '+fmt(p.mensalidade):'');
    if(finInfo.trim()) doc.text(finInfo.substring(0,60), 19, y+26);

    // Status manutencao
    if(dias !== null){
      dias <= 15 ? doc.setTextColor(5,150,105) : doc.setTextColor(185,28,28);
      doc.text('Ultima manutencao: ' + (mans[0]?fmtDate(mans[0].data):'—') + ' (' + dias + ' dias)', 19, y+32);
    } else {
      doc.setTextColor(100,116,139);
      doc.text('Manutencao: sem registro', 19, y+32);
    }

    // Status mensalidade
    if(p.vencimentoDia){
      if(pagouMes){
        doc.setTextColor(5,150,105);
        doc.text('Mensalidade: PAGA em ' + fmtDate(p.ultimoPagamento), 19, y+39);
      } else if(sm && sm.diffMesAtual < 0){
        doc.setTextColor(185,28,28);
        doc.text('Mensalidade: VENCIDA (dia ' + p.vencimentoDia + ')', 19, y+39);
      } else if(sm && sm.diff <= 5){
        doc.setTextColor(217,119,6);
        doc.text('Mensalidade: vence em ' + sm.diff + ' dia(s) (dia ' + p.vencimentoDia + ')', 19, y+39);
      } else {
        doc.setTextColor(37,99,168);
        doc.text('Mensalidade: vence dia ' + p.vencimentoDia + (sm?' ('+sm.diff+'d)':''), 19, y+39);
      }
    }

    if(p.obs){
      doc.setTextColor(100,116,139); doc.setFontSize(8);
      doc.text('Obs: ' + String(p.obs).substring(0,60), 19, y+45);
    }

    y += 58;
  });

  // Rodape
  const pages = doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text('FuelTech Pro — Relatorio de Postos — ' + hoje + ' — Pag. '+i+'/'+pages, 15, 290);
    doc.text('Documento confidencial', 155, 290);
  }

  doc.save('postos_' + new Date().toISOString().slice(0,10) + '.pdf');
  showToast('PDF de postos gerado!', 'success');
}

// ── DELETE ──
function confirmDelete(col,id,label){
  pendingDelete={col,id};
  document.getElementById('delete-desc').textContent=`Você vai excluir ${label}. Não tem volta.`;
  document.getElementById('delete-input').value='';
  document.getElementById('btn-del').disabled=true;
  openModal('modal-delete');
}
function checkDelete(){
  // Remove qualquer caractere que não seja letra (evita colagem de unicode/invisível)
  const raw = document.getElementById('delete-input').value;
  const sanitized = raw.replace(/[^a-zA-ZÀ-ÿ]/g,'').toLowerCase();
  document.getElementById('btn-del').disabled = sanitized !== 'remover';
}
async function executeDelete(){
  if(!pendingDelete) return;
  const{col,id}=pendingDelete;
  try{
    await db.collection(col).doc(id).delete();
    closeModal('modal-delete'); showToast('Excluído!','success');
    pendingDelete=null; await loadAll();
  }catch(e){showToast('Erro: '+e.message,'error');}
}

// ── PERFIL ──
function openProfile(){document.getElementById('profile-overlay').classList.add('open');}
function closeProfile(e){if(!e||e.target===document.getElementById('profile-overlay'))document.getElementById('profile-overlay').classList.remove('open');}

// ── HELPERS ──
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function v(id){return (document.getElementById(id)||{}).value?.trim()||'';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmt(n){return Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtDate(s){if(!s) return '—';const[a,m,d]=s.slice(0,10).split('-');return`${d}/${m}/${a}`;}
function diasDesde(ds){if(!ds) return 9999;const d=new Date(ds+'T12:00:00'),n=new Date();return Math.floor((n-d)/(864e5));}
function showToast(msg,type='success'){
  const el=document.getElementById('toast');
  const icon=document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent=msg;
  icon.className='fas fa-'+(type==='success'?'check-circle':'exclamation-circle');
  el.className='show '+type;
  setTimeout(()=>el.className='',3000);
}

// Fechar modais pelo overlay
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o) o.classList.remove('open');});
});

// Inicializar
window.addEventListener('DOMContentLoaded',()=>initFirebase());
