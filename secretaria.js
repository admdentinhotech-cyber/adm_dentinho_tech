const app = document.getElementById("app");
const supabaseClient = window.secretariaSupabaseClient;

let currentUserName = "";
let pendingAccounts = [];

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showToast(message) {
  const toast = document.getElementById("secretariaToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function initIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-brand">
        <div class="brand-art">
          <div class="logo-lockup">
            <div class="tooth-logo"><img src="logo.png" alt="Dentinho Tech"></div>
            <p class="brand-slogan">Portal da Secretaria</p>
          </div>
        </div>
      </section>
      <section class="login-panel">
        <form class="login-card" id="secretariaLoginForm">
          <h1>Acesso da secretaria</h1>
          <p class="subtitle">Entre para aprovar os cadastros do sistema</p>
          <div class="field">
            <label for="secretariaEmail">E-mail</label>
            <div class="input-wrap">${icon("mail")}<input id="secretariaEmail" type="email" placeholder="seu@email.com" required></div>
          </div>
          <div class="field">
            <label for="secretariaPassword">Senha</label>
            <div class="input-wrap">${icon("lock-keyhole")}<input id="secretariaPassword" type="password" placeholder="Digite sua senha" required></div>
          </div>
          <div class="login-actions">
            <span></span>
            <button type="button" class="text-button" id="secretariaForgotPassword">Esqueceu a senha?</button>
          </div>
          <button class="btn btn-primary btn-full" type="submit">Entrar ${icon("arrow-right")}</button>
        </form>
      </section>
    </main>
    <div class="toast" id="secretariaToast" role="status" aria-live="polite"></div>`;

  document.getElementById("secretariaLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabaseClient) {
      showToast("A configuração compartilhada do Supabase não foi carregada.");
      return;
    }

    const email = document.getElementById("secretariaEmail").value.trim();
    const password = document.getElementById("secretariaPassword").value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showToast(`Não foi possível entrar: ${error.message}`);
      return;
    }
    await activateSecretarySession(data.user);
  });

  document.getElementById("secretariaForgotPassword").addEventListener("click", async () => {
    const email = document.getElementById("secretariaEmail").value.trim();
    if (!supabaseClient) {
      showToast("A configuração compartilhada do Supabase não foi carregada.");
      return;
    }
    if (!email) {
      showToast("Informe seu e-mail para solicitar a recuperação.");
      return;
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    showToast(error
      ? `Erro ao solicitar recuperação: ${error.message}`
      : "Solicitação de recuperação enviada. Verifique seu e-mail.");
  });

  initIcons();
}

async function loadPendingAccounts() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, account_status, created_at")
    .eq("account_status", "Pendente")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message };
  }

  pendingAccounts = data || [];
  return { ok: true };
}

function renderPendingAccounts() {
  const rows = pendingAccounts.map(profile => {
    const createdAt = profile.created_at
      ? new Date(profile.created_at).toLocaleDateString("pt-BR")
      : "—";
    return `
      <tr>
        <td>${escapeHtml(profile.full_name || "Sem nome")}</td>
        <td class="secretaria-account-id">${escapeHtml(profile.id)}</td>
        <td>${createdAt}</td>
        <td>
          <select class="form-control" data-account-role="${escapeHtml(profile.id)}" aria-label="Papel para ${escapeHtml(profile.full_name || "conta")}">
            <option value="Aluno" ${profile.role === "Aluno" ? "selected" : ""}>Aluno</option>
            <option value="Professor" ${profile.role === "Professor" ? "selected" : ""}>Professor</option>
            <option value="Secretario" ${profile.role === "Secretario" ? "selected" : ""}>Secretario</option>
          </select>
        </td>
        <td class="secretaria-actions">
          <button class="btn btn-primary" type="button" data-approve-account="${escapeHtml(profile.id)}">${icon("badge-check")} Aprovar</button>
          <button class="btn btn-outline" type="button" data-reject-account="${escapeHtml(profile.id)}">${icon("circle-x")} Rejeitar</button>
        </td>
      </tr>`;
  }).join("");

  app.innerHTML = `
    <div class="secretaria-shell">
      <header class="secretaria-header">
        <div class="side-brand">
          <div class="side-mark"><img src="logo.png" alt=""></div>
          <div class="side-name">DENTINHO TECH<small>Portal da Secretaria</small></div>
        </div>
        <div class="secretaria-session">
          <strong>${escapeHtml(currentUserName || "Secretaria")}</strong>
          <button class="btn btn-outline" type="button" id="secretariaLogout">${icon("log-out")} Sair</button>
        </div>
      </header>
      <main class="secretaria-content">
        <div class="page-heading">
          <div><h1>Aprovação de cadastros</h1><p>Contas aguardando autorização da secretaria</p></div>
          <button class="btn btn-outline" type="button" id="refreshAccounts">${icon("refresh-cw")} Atualizar</button>
        </div>
        <section class="card">
          <div class="card-header"><h2>Cadastros pendentes</h2><strong>${pendingAccounts.length}</strong></div>
          <div class="secretaria-table-wrap">
            <table class="patient-table">
              <thead><tr><th>Nome</th><th>ID da conta</th><th>Cadastro</th><th>Papel</th><th>Ações</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="5">Nenhum cadastro pendente</td></tr>`}</tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
    <div class="toast" id="secretariaToast" role="status" aria-live="polite"></div>`;

  document.getElementById("secretariaLogout").addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      showToast(`Erro ao sair: ${error.message}`);
      return;
    }
    clearSecretarySession();
    renderLogin();
  });

  document.getElementById("refreshAccounts").addEventListener("click", refreshPendingAccounts);

  document.querySelectorAll("[data-approve-account]").forEach(button => {
    button.addEventListener("click", () => reviewAccount(button, true));
  });
  document.querySelectorAll("[data-reject-account]").forEach(button => {
    button.addEventListener("click", () => reviewAccount(button, false));
  });

  initIcons();
}

async function refreshPendingAccounts() {
  const result = await loadPendingAccounts();
  if (!result.ok) {
    showToast(`Erro ao carregar cadastros: ${result.error}`);
    return;
  }
  renderPendingAccounts();
}

async function reviewAccount(button, approved) {
  const accountId = button.dataset.approveAccount || button.dataset.rejectAccount;
  const roleSelect = document.querySelector(`[data-account-role="${accountId}"]`);
  button.disabled = true;

  const { error } = await supabaseClient.rpc("review_user_account", {
    account_id: accountId,
    approved_role: approved ? roleSelect?.value || "Aluno" : "Aluno",
    approved
  });

  if (error) {
    button.disabled = false;
    showToast(`Erro ao ${approved ? "aprovar" : "rejeitar"} cadastro: ${error.message}`);
    return;
  }

  const result = await loadPendingAccounts();
  if (!result.ok) {
    showToast(`Cadastro atualizado, mas houve um erro ao atualizar a lista: ${result.error}`);
    return;
  }

  renderPendingAccounts();
  showToast(approved ? "Cadastro aprovado." : "Cadastro rejeitado.");
}

function clearSecretarySession() {
  currentUserName = "";
  pendingAccounts = [];
}

async function activateSecretarySession(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("full_name, role, account_status")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    await supabaseClient.auth.signOut();
    clearSecretarySession();
    renderLogin();
    showToast(`Não foi possível validar o perfil: ${error?.message || "Perfil ausente"}`);
    return;
  }

  if (profile.role !== "Secretario" || profile.account_status !== "Aprovado") {
    await supabaseClient.auth.signOut();
    clearSecretarySession();
    renderLogin();
    showToast("Acesso restrito a uma conta aprovada com papel Secretario.");
    return;
  }

  currentUserName = profile.full_name || "Secretaria";
  const result = await loadPendingAccounts();
  if (!result.ok) {
    renderPendingAccounts();
    showToast(`Erro ao carregar cadastros: ${result.error}`);
    return;
  }
  renderPendingAccounts();
}

async function initializeSecretaryPortal() {
  if (!supabaseClient) {
    renderLogin();
    showToast("Confira supabase-config.js e a configuração do portal da Secretaria.");
    return;
  }

  supabaseClient.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      clearSecretarySession();
      renderLogin();
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    renderLogin();
    showToast(`Erro ao verificar a sessão: ${error.message}`);
    return;
  }

  if (data.session) {
    await activateSecretarySession(data.session.user);
  } else {
    renderLogin();
  }
}

initializeSecretaryPortal().catch(error => {
  clearSecretarySession();
  renderLogin();
  showToast(`Erro ao abrir o portal da Secretaria: ${error.message}`);
});
