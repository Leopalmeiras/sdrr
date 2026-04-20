import {
  STATUS_OPCOES,
  PRIORIDADES,
  seedData,
  getUsers,
  getLeads,
  getOrigens,
  getSession,
  setSession,
  clearSession,
  getVisibleLeads,
  saveLeads,
  saveOrigens,
  validateLead,
  cnpjMask,
  appendLog,
  uid,
  formatDate,
  escapeHtml,
} from './data.js';

const page = document.body?.dataset?.page;
seedData();
boot();

function boot() {
  if (page !== 'login') {
    const sessao = getSession();
    if (!sessao) return (window.location.href = 'index.html');
    renderSidebar(sessao);
    if (page === 'origens' && sessao.role !== 'chefe') window.location.href = 'dashboard.html';
  }

  ({
    login: setupLoginPage,
    dashboard: setupDashboardPage,
    leads: setupLeadsPage,
    cadastro: setupCadastroPage,
    origens: setupOrigensPage,
  }[page] || (() => {}))();
}

function setupLoginPage() {
  if (getSession()) return (window.location.href = 'dashboard.html');

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const fd = new FormData(form);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '').trim();
    const user = getUsers().find((u) => u.username === username && u.password === password);
    if (!user) return (errorEl.textContent = 'Credenciais inválidas.');
    setSession({ id: user.id, username: user.username, role: user.role, nome: user.nome });
    window.location.href = 'dashboard.html';
  });
}

function renderSidebar(sessao) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const links = [
    ['dashboard.html', 'Dashboard', 'dashboard'],
    ['leads.html', 'Leads', 'leads'],
    ['cadastro.html', 'Cadastrar Lead', 'cadastro'],
  ];
  if (sessao.role === 'chefe') links.push(['origens.html', 'Origens', 'origens']);

  sidebar.innerHTML = `
    <div class="brand">SDR CRM Pro</div>
    <div class="user-info"><strong>${escapeHtml(sessao.nome)}</strong><p>${sessao.role === 'chefe' ? 'Admin' : 'SDR'}</p></div>
    <nav>${links
      .map(([href, label, p]) => `<a class="nav-link ${page === p ? 'active' : ''}" href="${href}">${label}</a>`)
      .join('')}</nav>
    <button id="logoutBtn" class="btn-secondary" type="button">Sair</button>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
}

function setupDashboardPage() {
  const leads = getVisibleLeads(getSession());
  const kpiGrid = document.getElementById('kpiGrid');
  const count = (fn) => leads.filter(fn).length;
  const cards = [
    ['Total de leads', leads.length],
    ['Leads quentes', count((l) => l.status === 'Quente')],
    ['Tarefas pendentes', leads.flatMap((l) => l.tarefas || []).filter((t) => t.status === 'Pendente').length],
    ['Alta prioridade', count((l) => ['Alta', 'Urgente'].includes(l.prioridade))],
  ];
  kpiGrid.innerHTML = cards.map(([l, v]) => `<article class="kpi"><p>${l}</p><strong>${v}</strong></article>`).join('');

  renderBarChart('statusChart', countBy(leads, 'status', STATUS_OPCOES));
  renderBarChart('origemChart', countBy(leads, 'origem'));
  renderNextActions(leads);
}

function renderNextActions(leads) {
  const container = document.getElementById('vendedorList');
  const upcoming = leads
    .filter((l) => l.status === 'Quente' && l.vendedor?.agendamento)
    .sort((a, b) => new Date(a.vendedor.agendamento) - new Date(b.vendedor.agendamento))
    .slice(0, 8);

  if (!upcoming.length) return (container.innerHTML = '<p>Sem agendamentos futuros.</p>');
  container.innerHTML = upcoming
    .map(
      (l) => `<div class="stats-item"><strong>${escapeHtml(l.nome)}</strong><p>${escapeHtml(
        l.vendedor.nome,
      )} • ${formatDate(l.vendedor.agendamento)}</p><small>${escapeHtml(l.vendedor.proximoStatus)}</small></div>`,
    )
    .join('');
}

function renderBarChart(containerId, dataObj) {
  const container = document.getElementById(containerId);
  const entries = Object.entries(dataObj).filter(([, v]) => v > 0);
  if (!entries.length) return (container.innerHTML = '<p>Nenhum dado para exibir.</p>');
  const max = Math.max(...entries.map(([, v]) => v));

  container.innerHTML = entries
    .map(([label, value]) => {
      const pct = Math.max(8, Math.round((value / max) * 100));
      return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><strong>${value}</strong></div>`;
    })
    .join('');
}

function setupCadastroPage() {
  const sessao = getSession();
  const form = document.getElementById('leadForm');
  const errorEl = document.getElementById('formError');
  const leadId = new URLSearchParams(window.location.search).get('id');
  const status = document.getElementById('status');
  const hotBox = document.getElementById('hotBox');
  const cnpj = document.getElementById('cnpj');
  const origemSelect = document.getElementById('origem');

  renderOrigens(origemSelect);
  renderSelect('prioridade', PRIORIDADES);

  cnpj?.addEventListener('input', () => (cnpj.value = cnpjMask(cnpj.value)));
  status?.addEventListener('change', () => hotBox.classList.toggle('hidden', status.value !== 'Quente'));

  const timelineDraft = [];
  const tasksDraft = [];

  document.getElementById('addInteraction')?.addEventListener('click', () => {
    const desc = String(document.getElementById('interacaoTexto').value || '').trim();
    if (!desc) return;
    timelineDraft.push({ id: uid(), descricao: desc, data: new Date().toISOString(), autor: sessao.username });
    document.getElementById('interacaoTexto').value = '';
    renderTimeline('timelineList', timelineDraft);
  });

  document.getElementById('addTask')?.addEventListener('click', () => {
    const titulo = String(document.getElementById('taskTitulo').value || '').trim();
    const data = String(document.getElementById('taskData').value || '').trim();
    const statusTask = String(document.getElementById('taskStatus').value || 'Pendente').trim();
    if (!titulo || !data) return;
    tasksDraft.push({ id: uid(), titulo, data, status: statusTask, criadoEm: new Date().toISOString() });
    document.getElementById('taskTitulo').value = '';
    document.getElementById('taskData').value = '';
    renderTasks('taskList', tasksDraft);
  });

  if (leadId) {
    const lead = getLeads().find((l) => l.id === leadId);
    if (lead) fillLeadForm(form, lead, timelineDraft, tasksDraft);
  }

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const fd = new FormData(form);
    const payload = {
      id: String(fd.get('leadId') || '') || uid(),
      nome: String(fd.get('nome') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      cnpj: cnpjMask(String(fd.get('cnpj') || '').trim()),
      origem: String(fd.get('origem') || '').trim(),
      status: String(fd.get('status') || '').trim(),
      prioridade: String(fd.get('prioridade') || '').trim(),
      tags: String(fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean),
      observacao: String(fd.get('observacao') || '').trim(),
      vendedor:
        String(fd.get('status') || '') === 'Quente'
          ? {
              nome: String(fd.get('vendedorNome') || '').trim(),
              agendamento: String(fd.get('vendedorData') || '').trim(),
              proximoStatus: String(fd.get('proximoStatus') || '').trim(),
            }
          : null,
      timeline: timelineDraft,
      tarefas: tasksDraft,
      responsavelId: sessao.id,
      responsavel: sessao.username,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      logs: [],
    };

    const leads = getLeads();
    const idx = leads.findIndex((l) => l.id === payload.id);
    if (idx >= 0) {
      payload.criadoEm = leads[idx].criadoEm;
      payload.logs = leads[idx].logs || [];
      appendLog(payload, 'Lead atualizado', sessao.username);
      leads[idx] = payload;
    } else {
      appendLog(payload, 'Lead criado', sessao.username);
      leads.push(payload);
    }

    const error = validateLead(payload);
    if (error) return (errorEl.textContent = error);

    saveLeads(leads);
    window.location.href = 'leads.html';
  });
}

function fillLeadForm(form, lead, timelineDraft, tasksDraft) {
  document.getElementById('formTitle').textContent = 'Editar Lead';
  form.elements.namedItem('leadId').value = lead.id;
  ['nome', 'email', 'cnpj', 'origem', 'status', 'prioridade', 'observacao'].forEach((k) => {
    const el = form.elements.namedItem(k);
    if (el) el.value = lead[k] || '';
  });
  form.elements.namedItem('tags').value = (lead.tags || []).join(', ');

  if (lead.status === 'Quente') {
    document.getElementById('hotBox').classList.remove('hidden');
    form.elements.namedItem('vendedorNome').value = lead.vendedor?.nome || '';
    form.elements.namedItem('vendedorData').value = lead.vendedor?.agendamento || '';
    form.elements.namedItem('proximoStatus').value = lead.vendedor?.proximoStatus || '';
  }

  timelineDraft.push(...(lead.timeline || []));
  tasksDraft.push(...(lead.tarefas || []));
  renderTimeline('timelineList', timelineDraft);
  renderTasks('taskList', tasksDraft);
}

function renderTimeline(id, items) {
  const el = document.getElementById(id);
  if (!items.length) return (el.innerHTML = '<li>Nenhuma interação.</li>');
  el.innerHTML = items
    .slice()
    .reverse()
    .map((it) => `<li><strong>${escapeHtml(it.autor || 'sistema')}</strong> • ${formatDate(it.data)}<br>${escapeHtml(it.descricao)}</li>`)
    .join('');
}

function renderTasks(id, items) {
  const el = document.getElementById(id);
  if (!items.length) return (el.innerHTML = '<li>Nenhuma tarefa agendada.</li>');
  el.innerHTML = items
    .slice()
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .map((it) => `<li><strong>${escapeHtml(it.titulo)}</strong> • ${formatDate(it.data)} • ${escapeHtml(it.status)}</li>`)
    .join('');
}

function setupLeadsPage() {
  const sessao = getSession();
  const tbody = document.getElementById('leadsTbody');
  const search = document.getElementById('searchInput');
  const status = document.getElementById('statusFilter');
  const origem = document.getElementById('origemFilter');
  const prioridade = document.getElementById('prioridadeFilter');

  renderSelect('statusFilter', STATUS_OPCOES, 'Todos os status');
  renderOrigens(origem, 'Todas as origens');
  renderSelect('prioridadeFilter', PRIORIDADES, 'Todas as prioridades');

  const render = () => {
    const term = String(search.value || '').toLowerCase().trim();
    const filtered = getVisibleLeads(sessao)
      .filter((l) => (!status.value ? true : l.status === status.value))
      .filter((l) => (!origem.value ? true : l.origem === origem.value))
      .filter((l) => (!prioridade.value ? true : l.prioridade === prioridade.value))
      .filter((l) => {
        if (!term) return true;
        const pool = [l.nome, l.email, l.cnpj, l.observacao, l.tags?.join(' '), l.vendedor?.nome].join(' ').toLowerCase();
        return pool.includes(term);
      })
      .sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));

    if (!filtered.length) return (tbody.innerHTML = '<tr><td colspan="11">Nenhum lead encontrado.</td></tr>');

    tbody.innerHTML = filtered
      .map(
        (l) => `<tr>
        <td>${escapeHtml(l.nome)}</td><td>${escapeHtml(l.email)}</td><td>${escapeHtml(l.origem)}</td>
        <td><span class="badge badge-${l.status.toLowerCase()}">${escapeHtml(l.status)}</span></td>
        <td>${escapeHtml(l.prioridade)}</td>
        <td>${escapeHtml((l.tags || []).join(', ') || '-')}</td>
        <td>${escapeHtml(l.vendedor?.nome || '-')}</td>
        <td>${escapeHtml(l.vendedor?.proximoStatus || '-')}</td>
        <td>${formatDate(l.atualizadoEm)}</td>
        <td><a class="btn-secondary icon-btn" href="cadastro.html?id=${l.id}">Editar</a></td>
        <td><button class="icon-btn delete" data-id="${l.id}" type="button">Excluir</button></td>
      </tr>`,
      )
      .join('');
  };

  document.getElementById('exportCsvBtn')?.addEventListener('click', () => exportSpreadsheet(getVisibleLeads(sessao)));
  document.getElementById('exportPdfBtn')?.addEventListener('click', () => exportPdf(getVisibleLeads(sessao)));

  [search, status, origem, prioridade].forEach((el) => el?.addEventListener('input', render));
  tbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    saveLeads(getLeads().filter((l) => l.id !== id));
    render();
  });

  render();
}

function exportSpreadsheet(leads) {
  const headers = ['nome', 'email', 'cnpj', 'origem', 'status', 'prioridade', 'tags', 'vendedor', 'agendamento', 'proximo_status', 'atualizado_em'];
  const rows = leads.map((l) => [
    l.nome,
    l.email,
    l.cnpj,
    l.origem,
    l.status,
    l.prioridade,
    (l.tags || []).join(','),
    l.vendedor?.nome || '',
    l.vendedor?.agendamento || '',
    l.vendedor?.proximoStatus || '',
    formatDate(l.atualizadoEm),
  ]);
  downloadFile('leads_planilha.csv', 'text/csv;charset=utf-8', [headers.join(';'), ...rows.map((r) => r.map(csv).join(';'))].join('\n'));
}

function exportPdf(leads) {
  const html = `<html><head><title>Leads</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;font-size:12px}</style></head><body>
  <h2>Relatório de Leads (${formatDate(new Date().toISOString())})</h2>
  <table><thead><tr><th>Nome</th><th>Status</th><th>Prioridade</th><th>Origem</th><th>Vendedor</th><th>Próximo passo</th></tr></thead>
  <tbody>${leads
    .map(
      (l) => `<tr><td>${escapeHtml(l.nome)}</td><td>${escapeHtml(l.status)}</td><td>${escapeHtml(l.prioridade)}</td><td>${escapeHtml(
        l.origem,
      )}</td><td>${escapeHtml(l.vendedor?.nome || '-')}</td><td>${escapeHtml(l.vendedor?.proximoStatus || '-')}</td></tr>`,
    )
    .join('')}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function setupOrigensPage() {
  const form = document.getElementById('origemForm');
  const input = document.getElementById('origemNome');
  const id = document.getElementById('origemId');
  const list = document.getElementById('origensList');

  const render = () => {
    const origens = getOrigens();
    list.innerHTML = !origens.length
      ? '<li>Nenhuma origem cadastrada.</li>'
      : origens
          .map((o) => `<li><span>${escapeHtml(o.nome)}</span><button class="icon-btn delete" data-id="${o.id}" type="button">Excluir</button></li>`)
          .join('');
  };

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = String(input.value || '').trim();
    if (!nome) return;
    const origens = getOrigens();
    if (id.value) {
      const idx = origens.findIndex((o) => o.id === id.value);
      if (idx >= 0) origens[idx].nome = nome;
    } else {
      origens.push({ id: uid(), nome });
    }
    saveOrigens(origens);
    input.value = '';
    id.value = '';
    render();
  });

  list?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    saveOrigens(getOrigens().filter((o) => o.id !== btn.dataset.id));
    render();
  });

  render();
}

function renderOrigens(select, first = 'Selecione...') {
  select.innerHTML = `<option value="">${first}</option>`;
  getOrigens().forEach((o) => select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(o.nome)}">${escapeHtml(o.nome)}</option>`));
}

function renderSelect(id, values, first = 'Selecione...') {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = `<option value="">${first}</option>${values.map((v) => `<option value="${v}">${v}</option>`).join('')}`;
}

function countBy(list, key, defaultOrder = []) {
  const counts = Object.fromEntries(defaultOrder.map((k) => [k, 0]));
  list.forEach((i) => {
    const value = i[key] || 'Sem valor';
    counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
}

function csv(v) { return `"${String(v || '').replaceAll('"', '""')}"`; }

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
