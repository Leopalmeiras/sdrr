export const STORAGE_KEYS = {
  users: 'sdr_users',
  leads: 'sdr_leads',
  origens: 'sdr_origens',
  session: 'sdr_session',
};

export const STATUS_OPCOES = ['Frio', 'Morno', 'Quente', 'Perdido'];
export const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];

const DEFAULT_USERS = [
  { id: 'u1', username: 'admin', password: 'admin@123', role: 'chefe', nome: 'Administrador' },
  { id: 'u2', username: 'sdr', password: 'sdr@123', role: 'funcionario', nome: 'SDR Padrão' },
];

const DEFAULT_ORIGENS = ['LinkedIn', 'Site', 'Indicação', 'Outbound'].map((nome) => ({ id: uid(), nome }));

export function seedData() {
  if (!read(STORAGE_KEYS.users)) write(STORAGE_KEYS.users, DEFAULT_USERS);
  if (!read(STORAGE_KEYS.origens)) write(STORAGE_KEYS.origens, DEFAULT_ORIGENS);
  if (!read(STORAGE_KEYS.leads)) write(STORAGE_KEYS.leads, []);
}

export function getUsers() { return read(STORAGE_KEYS.users) || []; }
export function getLeads() { return read(STORAGE_KEYS.leads) || []; }
export function getOrigens() { return read(STORAGE_KEYS.origens) || []; }
export function getSession() { return read(STORAGE_KEYS.session); }
export function setSession(session) { write(STORAGE_KEYS.session, session); }
export function clearSession() { localStorage.removeItem(STORAGE_KEYS.session); }

export function saveLeads(leads) { write(STORAGE_KEYS.leads, leads); }
export function saveOrigens(origens) { write(STORAGE_KEYS.origens, origens); }

export function getVisibleLeads(sessao) {
  const leads = getLeads();
  if (sessao.role === 'chefe') return leads;
  return leads.filter((lead) => lead.responsavelId === sessao.id);
}

export function validateLead(lead) {
  const required = ['nome', 'email', 'cnpj', 'origem', 'status', 'prioridade'];
  for (const key of required) {
    if (!lead[key]) return 'Preencha todos os campos obrigatórios.';
  }

  if (!STATUS_OPCOES.includes(lead.status)) return 'Status inválido.';
  if (!PRIORIDADES.includes(lead.prioridade)) return 'Prioridade inválida.';
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(lead.cnpj)) return 'CNPJ inválido.';
  if (!/^\S+@\S+\.\S+$/.test(lead.email)) return 'E-mail inválido.';

  if (lead.status === 'Quente') {
    if (!lead.vendedor?.nome || !lead.vendedor?.agendamento || !lead.vendedor?.proximoStatus) {
      return 'Lead quente exige dados completos de vendedor/agendamento.';
    }
  }

  return '';
}

export function cnpjMask(value) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function appendLog(lead, acao, usuario) {
  const logs = lead.logs || [];
  logs.push({ id: uid(), acao, usuario, data: new Date().toISOString() });
  lead.logs = logs;
  return lead;
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDate(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function read(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
