(() => {
  const STORAGE_KEYS = {
    users: 'sdr_users',
    leads: 'sdr_leads',
    origens: 'sdr_origens',
    session: 'sdr_session',
  };

  const STATUS_OPCOES = ['Frio', 'Morno', 'Quente', 'Perdido'];

  const DEFAULT_USERS = [
    { id: 'u1', username: 'admin', password: '123', role: 'chefe', nome: 'Administrador' },
    { id: 'u2', username: 'sdr', password: '123', role: 'funcionario', nome: 'SDR' },
  ];

  const DEFAULT_ORIGENS = ['WhatsApp', 'Email', 'Chat', 'Ligação'];

  const page = document.body?.dataset?.page;

  boot();

  function boot() {
    seedData();

    if (page !== 'login') {
      const sessao = getSession();
      if (!sessao) {
        window.location.href = 'index.html';
        return;
      }

      renderSidebar(sessao);
      enforcePagePermissions(sessao);
    }

    switch (page) {
      case 'login':
        setupLoginPage();
        break;
      case 'dashboard':
        setupDashboardPage();
        break;
      case 'leads':
        setupLeadsPage();
        break;
      case 'cadastro':
        setupCadastroPage();
        break;
      case 'origens':
        setupOrigensPage();
        break;
      default:
        break;
    }
  }

  function seedData() {
    if (!read(STORAGE_KEYS.users)) write(STORAGE_KEYS.users, DEFAULT_USERS);
    const origens = normalizeOrigens(read(STORAGE_KEYS.origens));
    if (!origens.length) {
      write(STORAGE_KEYS.origens, DEFAULT_ORIGENS);
    } else {
      write(STORAGE_KEYS.origens, origens);
    }
    if (!read(STORAGE_KEYS.leads)) write(STORAGE_KEYS.leads, []);
  }

  function setupLoginPage() {
    if (getSession()) {
      window.location.href = 'dashboard.html';
      return;
    }

    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      errorEl.textContent = '';

      const fd = new FormData(form);
      const username = String(fd.get('username') || '').trim();
      const password = String(fd.get('password') || '').trim();

      if (!username || !password) {
        errorEl.textContent = 'Preencha usuário e senha.';
        return;
      }

      const users = getUsers();
      const user = users.find((u) => u.username === username && u.password === password);

      if (!user) {
        errorEl.textContent = 'Credenciais inválidas.';
        return;
      }

      setSession({ id: user.id, username: user.username, role: user.role, nome: user.nome });
      window.location.href = 'dashboard.html';
    });
  }

  function renderSidebar(sessao) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const links = [
      { href: 'dashboard.html', label: 'Dashboard', page: 'dashboard' },
      { href: 'leads.html', label: 'Leads', page: 'leads' },
      { href: 'cadastro.html', label: 'Cadastrar Lead', page: 'cadastro' },
    ];

    if (sessao.role === 'chefe') {
      links.push({ href: 'origens.html', label: 'Origens', page: 'origens' });
    }

    const nav = links
      .map(
        (link) =>
          `<a class="nav-link ${page === link.page ? 'active' : ''}" href="${link.href}">${link.label}</a>`,
      )
      .join('');

    sidebar.innerHTML = `
      <div class="brand">SDR CRM</div>
      <div class="user-info">
        <strong>${escapeHtml(sessao.nome || sessao.username)}</strong>
        <p>${sessao.role === 'chefe' ? 'Chefe' : 'Funcionário'}</p>
      </div>
      <nav>${nav}</nav>
      <button id="logoutBtn" class="btn-secondary" type="button">Sair</button>
    `;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.session);
      window.location.href = 'index.html';
    });
  }

  function enforcePagePermissions(sessao) {
    if (page === 'origens' && sessao.role !== 'chefe') {
      window.location.href = 'dashboard.html';
    }
  }

  function setupDashboardPage() {
    const sessao = getSession();
    const leads = getVisibleLeads(sessao);
    const kpiGrid = document.getElementById('kpiGrid');

    const total = leads.length;
    const quentes = leads.filter((lead) => lead.status === 'Quente').length;
    const porStatus = countBy(leads, 'status', STATUS_OPCOES);
    const porOrigem = countBy(leads, 'origem');

    const cards = [
      { label: 'Total de leads', valor: total },
      { label: 'Leads quentes', valor: quentes },
      { label: 'Origens ativas', valor: Object.keys(porOrigem).length },
      {
        label: sessao.role === 'chefe' ? 'Leads (time)' : 'Leads (meus)',
        valor: total,
      },
    ];

    kpiGrid.innerHTML = cards
      .map((c) => `<article class="kpi"><p>${c.label}</p><strong>${c.valor}</strong></article>`)
      .join('');

    renderBarChart('statusChart', porStatus);
    renderBarChart('origemChart', porOrigem);
    renderVendedorStats(leads);
  }

  function renderBarChart(containerId, dataObj) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;

    if (!entries.length) {
      container.innerHTML = '<p>Nenhum dado para exibir.</p>';
      return;
    }

    container.innerHTML = entries
      .map(([label, value]) => {
        const pct = Math.max(5, Math.round((value / max) * 100));
        return `
          <div class="bar-row">
            <span>${escapeHtml(label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${pct}%"></div></div>
            <strong>${value}</strong>
          </div>
        `;
      })
      .join('');
  }

  function renderVendedorStats(leads) {
    const container = document.getElementById('vendedorList');
    if (!container) return;

    const data = leads
      .filter((lead) => lead.status === 'Quente' && lead.vendedor)
      .reduce((acc, lead) => {
        acc[lead.vendedor] = (acc[lead.vendedor] || 0) + 1;
        return acc;
      }, {});

    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      container.innerHTML = '<p>Nenhum lead quente com vendedor atribuído.</p>';
      return;
    }

    container.innerHTML = entries
      .map(([nome, qtd]) => `<div class="stats-item"><strong>${escapeHtml(nome)}</strong><p>${qtd} lead(s)</p></div>`)
      .join('');
  }

  function setupCadastroPage() {
    const sessao = getSession();
    const leadForm = document.getElementById('leadForm');
    const formError = document.getElementById('formError');
    const origemSelect = document.getElementById('origem');
    const statusSelect = document.getElementById('status');
    const vendedorField = document.getElementById('vendedorField');
    const vendedorInput = document.getElementById('vendedor');
    const leadIdInput = document.getElementById('leadId');
    const formTitle = document.getElementById('formTitle');

    populateOrigensSelect(origemSelect);

    statusSelect?.addEventListener('change', () => {
      toggleVendedorField(statusSelect.value, vendedorField, vendedorInput);
    });

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('id');

    if (editId) {
      const lead = getLeads().find((item) => item.id === editId);
      if (lead) {
        formTitle.textContent = 'Editar Lead';
        leadIdInput.value = lead.id;
        fillForm(leadForm, lead);
        toggleVendedorField(lead.status, vendedorField, vendedorInput);
      }
    }

    leadForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      formError.textContent = '';

      const fd = new FormData(leadForm);
      const payload = {
        id: String(fd.get('leadId') || '') || uid(),
        nome: String(fd.get('nome') || '').trim(),
        empresa: String(fd.get('empresa') || '').trim(),
        cnpj: String(fd.get('cnpj') || '').trim(),
        contato: String(fd.get('contato') || '').trim(),
        origem: String(fd.get('origem') || '').trim(),
        status: String(fd.get('status') || '').trim(),
        vendedor: String(fd.get('vendedor') || '').trim(),
        observacao: String(fd.get('observacao') || '').trim(),
        responsavelId: sessao.id,
        responsavel: sessao.username,
        data: new Date().toISOString(),
      };

      const error = validateLead(payload);
      if (error) {
        formError.textContent = error;
        return;
      }

      const leads = getLeads();
      const idx = leads.findIndex((l) => l.id === payload.id);

      if (idx >= 0) {
        const original = leads[idx];
        if (sessao.role !== 'chefe' && original.responsavelId !== sessao.id) {
          formError.textContent = 'Você não pode editar este lead.';
          return;
        }
        payload.responsavel = original.responsavel;
        payload.responsavelId = original.responsavelId;
        payload.data = original.data;
        leads[idx] = payload;
      } else {
        leads.push(payload);
      }

      write(STORAGE_KEYS.leads, leads);
      window.location.href = 'leads.html';
    });
  }

  function toggleVendedorField(status, field, input) {
    const isQuente = status === 'Quente';
    field.classList.toggle('hidden', !isQuente);
    input.required = isQuente;
    if (!isQuente) input.value = '';
  }

  function validateLead(lead) {
    const required = ['nome', 'empresa', 'cnpj', 'contato', 'origem', 'status'];
    for (const key of required) {
      if (!lead[key]) return 'Preencha todos os campos obrigatórios.';
    }
    if (!STATUS_OPCOES.includes(lead.status)) return 'Status inválido.';
    if (lead.status === 'Quente' && !lead.vendedor) {
      return 'Para leads quentes, o vendedor é obrigatório.';
    }
    return '';
  }

  function setupLeadsPage() {
    const sessao = getSession();
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const origemFilter = document.getElementById('origemFilter');
    const tbody = document.getElementById('leadsTbody');
    const exportBtn = document.getElementById('exportBtn');

    STATUS_OPCOES.forEach((st) => statusFilter.insertAdjacentHTML('beforeend', `<option value="${st}">${st}</option>`));
    getOrigens().forEach((origem) => origemFilter.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(origem)}">${escapeHtml(origem)}</option>`));

    if (sessao.role !== 'chefe') {
      exportBtn.classList.add('hidden');
    }

    const render = () => {
      const term = String(searchInput.value || '').toLowerCase().trim();
      const status = statusFilter.value;
      const origem = origemFilter.value;

      const filtered = getVisibleLeads(sessao)
        .filter((lead) => (status ? lead.status === status : true))
        .filter((lead) => (origem ? lead.origem === origem : true))
        .filter((lead) => {
          if (!term) return true;
          const hay = [lead.nome, lead.empresa, lead.contato, lead.observacao, lead.responsavel]
            .join(' ')
            .toLowerCase();
          return hay.includes(term);
        })
        .sort((a, b) => new Date(b.data) - new Date(a.data));

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9">Nenhum lead encontrado.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered
        .map((lead) => {
          const canEdit = sessao.role === 'chefe' || lead.responsavelId === sessao.id;
          return `
            <tr>
              <td>${escapeHtml(lead.nome)}</td>
              <td>${escapeHtml(lead.empresa)}</td>
              <td>${escapeHtml(lead.origem)}</td>
              <td><span class="badge badge-${lead.status.toLowerCase()}">${escapeHtml(lead.status)}</span></td>
              <td>${escapeHtml(lead.vendedor || '-')}</td>
              <td>${escapeHtml(lead.observacao || '-')}</td>
              <td>${escapeHtml(lead.responsavel || '-')}</td>
              <td>${formatDate(lead.data)}</td>
              <td>
                <div class="actions-row">
                  ${canEdit ? `<a class="btn-secondary icon-btn" href="cadastro.html?id=${lead.id}">Editar</a>` : ''}
                  ${canEdit ? `<button class="icon-btn delete" data-delete-id="${lead.id}">Excluir</button>` : ''}
                </div>
              </td>
            </tr>
          `;
        })
        .join('');
    };

    [searchInput, statusFilter, origemFilter].forEach((el) => el?.addEventListener('input', render));
    [statusFilter, origemFilter].forEach((el) => el?.addEventListener('change', render));

    tbody?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const id = target.dataset.deleteId;
      if (!id) return;

      const leads = getLeads();
      const lead = leads.find((l) => l.id === id);
      if (!lead) return;

      if (sessao.role !== 'chefe' && lead.responsavelId !== sessao.id) {
        alert('Você não pode excluir este lead.');
        return;
      }

      if (!window.confirm('Deseja realmente excluir este lead?')) return;
      write(
        STORAGE_KEYS.leads,
        leads.filter((l) => l.id !== id),
      );
      render();
    });

    exportBtn?.addEventListener('click', () => {
      if (sessao.role !== 'chefe') return;
      const csv = buildCsv(getLeads());
      downloadFile('leads_sdr.csv', 'text/csv;charset=utf-8;', csv);
    });

    render();
  }

  function buildCsv(leads) {
    const headers = [
      'Nome',
      'Empresa',
      'CNPJ',
      'Contato',
      'Origem',
      'Status',
      'Vendedor',
      'Observação',
      'Responsável',
      'Data',
    ];

    const fields = ['nome', 'empresa', 'cnpj', 'contato', 'origem', 'status', 'vendedor', 'observacao', 'responsavel', 'data'];
    const rows = leads.map((lead) =>
      fields.map((field) => sanitizeCsv(field === 'data' ? formatDate(lead[field]) : lead[field] || '')),
    );

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  function setupOrigensPage() {
    const sessao = getSession();
    if (sessao.role !== 'chefe') {
      window.location.href = 'dashboard.html';
      return;
    }

    const form = document.getElementById('origemForm');
    const origemNome = document.getElementById('origemNome');
    const origemId = document.getElementById('origemId');
    const list = document.getElementById('origensList');
    const error = document.getElementById('origemError');
    const cancelEdit = document.getElementById('cancelEditOrigem');

    const resetForm = () => {
      origemId.value = '';
      origemNome.value = '';
      cancelEdit.classList.add('hidden');
      error.textContent = '';
    };

    const render = () => {
      const origens = getOrigens();
      if (!origens.length) {
        list.innerHTML = '<li>Nenhuma origem cadastrada.</li>';
        return;
      }

      list.innerHTML = origens
        .map(
          (origem) => `
            <li>
              <span>${escapeHtml(origem)}</span>
              <div class="actions-row">
                <button class="btn-secondary icon-btn" data-edit-id="${escapeHtml(origem)}" type="button">Editar</button>
                <button class="icon-btn delete" data-del-id="${escapeHtml(origem)}" type="button">Excluir</button>
              </div>
            </li>
          `,
        )
        .join('');
    };

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      error.textContent = '';
      const nome = String(origemNome.value || '').trim();
      const id = String(origemId.value || '').trim();

      if (!nome) {
        error.textContent = 'Informe o nome da origem.';
        return;
      }

      const origens = getOrigens();
      const duplicate = origens.find((o) => o.toLowerCase() === nome.toLowerCase() && o !== id);
      if (duplicate) {
        error.textContent = 'Já existe uma origem com este nome.';
        return;
      }

      if (id) {
        const idx = origens.findIndex((o) => o === id);
        if (idx >= 0) {
          const previousName = origens[idx];
          origens[idx] = nome;
          const leads = getLeads().map((lead) =>
            lead.origem === previousName ? { ...lead, origem: nome } : lead,
          );
          write(STORAGE_KEYS.leads, leads);
        }
      } else {
        origens.push(nome);
      }

      write(STORAGE_KEYS.origens, origens);
      resetForm();
      render();
    });

    cancelEdit?.addEventListener('click', resetForm);

    list?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const editId = target.dataset.editId;
      const delId = target.dataset.delId;
      if (!editId && !delId) return;

      const origens = getOrigens();
      if (editId) {
        const item = origens.find((o) => o === editId);
        if (!item) return;
        origemNome.value = item;
        origemId.value = item;
        cancelEdit.classList.remove('hidden');
        return;
      }

      if (delId) {
        const leadsUsing = getLeads().some((l) => l.origem === delId);
        if (leadsUsing) {
          alert('Não é possível excluir: existe lead vinculado a esta origem.');
          return;
        }
        write(
          STORAGE_KEYS.origens,
          origens.filter((o) => o !== delId),
        );
        render();
      }
    });

    render();
  }

  function fillForm(form, lead) {
    const mappings = ['nome', 'empresa', 'cnpj', 'contato', 'origem', 'status', 'vendedor', 'observacao'];
    mappings.forEach((key) => {
      const el = form.elements.namedItem(key);
      if (el) el.value = lead[key] || '';
    });
  }

  function populateOrigensSelect(selectEl) {
    const origens = getOrigens();
    if (!origens.length) {
      selectEl.innerHTML = '<option value="">Cadastre uma origem antes</option>';
      return;
    }

    selectEl.innerHTML = '<option value="">Selecione...</option>';
    origens.forEach((origem) => {
      selectEl.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(origem)}">${escapeHtml(origem)}</option>`);
    });
  }

  function getVisibleLeads(sessao) {
    const leads = getLeads();
    if (sessao.role === 'chefe') return leads;
    return leads.filter((lead) => lead.responsavelId === sessao.id);
  }

  function countBy(list, key, defaultOrder = []) {
    const counts = {};

    defaultOrder.forEach((item) => {
      counts[item] = 0;
    });

    list.forEach((item) => {
      const value = item[key] || 'Sem valor';
      counts[value] = (counts[value] || 0) + 1;
    });

    return counts;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function sanitizeCsv(value) {
    const escaped = String(value).replaceAll('"', '""');
    return `"${escaped}"`;
  }

  function downloadFile(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function getUsers() {
    return read(STORAGE_KEYS.users) || [];
  }

  function getLeads() {
    return read(STORAGE_KEYS.leads) || [];
  }

  function getOrigens() {
    return normalizeOrigens(read(STORAGE_KEYS.origens));
  }

  function normalizeOrigens(origensRaw) {
    if (!Array.isArray(origensRaw)) return [];
    const normalized = origensRaw
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item.nome === 'string') return item.nome.trim();
        return '';
      })
      .filter(Boolean);

    return [...new Set(normalized)];
  }

  function setSession(session) {
    write(STORAGE_KEYS.session, session);
  }

  function getSession() {
    return read(STORAGE_KEYS.session);
  }

  function read(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();
