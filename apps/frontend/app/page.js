"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatMonth(value) {
  if (!value) return "—";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" })
    .format(new Date(year, month - 1, 1))
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseQuickEntry(text) {
  const amountMatch = text.match(
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );

  if (!amountMatch) return null;

  const rawAmount = amountMatch[1];
  const normalizedAmount = rawAmount.includes(",")
    ? rawAmount.replace(/\./g, "").replace(",", ".")
    : rawAmount;
  const amount = Number(normalizedAmount);
  const isIncome = /recebi|entrou|ganhei|sal[aá]rio|freela|freelance|renda/i.test(text);

  return {
    description: text,
    amount,
    direction: isIncome ? "income" : "expense",
    occurred_on: localDate(),
    status: "completed",
  };
}

async function apiRequest(path, session, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Não foi possível falar com a API.");
  }

  return response.json();
}

function Money({ children, accent = false }) {
  return <strong className={accent ? "money moneyAccent" : "money"}>{children}</strong>;
}

function Progress({ value, label, detail, accent = false }) {
  return (
    <div className="progressBlock">
      <div className="progressTrack" aria-label={`${label}: ${value}%`}>
        <span className={accent ? "progressValue progressAccent" : "progressValue"} style={{ width: `${value}%` }} />
      </div>
      <div className="progressMeta">
        <span>{label}</span>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function Login({ email, password, setEmail, setPassword, onSubmit, error, busy }) {
  return (
    <main className="authShell">
      <section className="authIntro">
        <div className="brand authBrand" aria-label="Cifro">
          <span className="brandMark"><i /><i /></span>
          <span>cifro</span>
        </div>
        <div className="authMessage">
          <p className="eyebrow">SUA VIDA FINANCEIRA</p>
          <h1>Veja o próximo mês antes de gastar neste.</h1>
          <p>Entre para acompanhar o que já aconteceu e o que ainda está por vir.</p>
        </div>
      </section>

      <section className="authPanel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">ACESSO</p>
          <h2 id="login-title">Entrar no Cifro</h2>
          <p className="authHint">Use o e-mail e a senha do usuário criado no Supabase.</p>
        </div>
        <form className="authForm" onSubmit={onSubmit}>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="formError" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ active, accountName, onLogout }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Cifro">
        <span className="brandMark"><i /><i /></span>
        <span>cifro</span>
      </a>

      <nav className="mainNav" aria-label="Navegação principal">
        <a className={active === "dashboard" ? "navItem active" : "navItem"} href="/"><span>01</span> Visão geral</a>
        <a className={active === "register" ? "navItem active" : "navItem"} href="/registrar"><span>02</span> Registrar</a>
        <a className="navItem" href="/#planning"><span>03</span> Planejamento</a>
      </nav>

      <div className="account">
        <div className="avatar">{accountName.charAt(0).toUpperCase()}</div>
        <div>
          <strong>{accountName}</strong>
          <span>Conta pessoal</span>
        </div>
        <button className="moreButton" type="button" onClick={onLogout} aria-label="Sair">sair</button>
      </div>
    </aside>
  );
}

function RegisterView({ session, accountName, onLogout }) {
  const [text, setText] = useState("");
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function loadMovements() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/v1/transactions?limit=12", session);
      setMovements(data);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
  }, [session]);

  async function registerMovement(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    const movement = parseQuickEntry(cleanText);
    if (!movement || !movement.amount) {
      setNotice("Inclua um valor, por exemplo: gastei 28 no almoço");
      return;
    }

    try {
      await apiRequest("/api/v1/transactions", session, {
        method: "POST",
        body: JSON.stringify(movement),
      });
      setText("");
      setNotice("Movimentação registrada");
      await loadMovements();
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <main className="shell">
      <Sidebar active="register" accountName={accountName} onLogout={onLogout} />
      <section className="content registrationContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">NOVA MOVIMENTAÇÃO</p>
            <h1>Registre sem interromper o dia.</h1>
          </div>
          <a className="backLink" href="/">← Visão geral</a>
        </header>

        <section className="registrationIntro" aria-labelledby="registration-title">
          <p className="eyebrow">REGISTRO RÁPIDO</p>
          <h2 id="registration-title">O que aconteceu?</h2>
          <p>Escreva como você falaria. O Cifro identifica o valor e registra a movimentação hoje.</p>
        </section>

        <form className="quickEntry registrationEntry" onSubmit={registerMovement}>
          <span className="entryArrow" aria-hidden="true">›</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex.: gastei 28 no almoço"
            aria-label="Registrar movimentação por texto"
            autoFocus
          />
          <button type="submit">Registrar</button>
        </form>
        <div className="entryExamples" aria-label="Exemplos de registro">
          <span>gastei 28 no almoço</span>
          <span>recebi 480 de freelance</span>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}

        <section className="registerHistory" aria-labelledby="history-title">
          <div className="sectionHeader">
            <div><p className="eyebrow">HISTÓRICO</p><h2 id="history-title">Últimos registros</h2></div>
            <span className="seeAll">{loading ? "Atualizando" : `${movements.length} registros`}</span>
          </div>
          <div className="movementList">
            {!loading && movements.length === 0 ? (
              <p className="emptyState">Seu histórico aparecerá aqui depois do primeiro registro.</p>
            ) : movements.map((movement) => {
              const tone = movement.direction === "income" ? "income" : "expense";
              return (
                <div className="movement" key={movement.id}>
                  <span className={`movementMark ${tone}`}>{movement.description.charAt(0).toUpperCase()}</span>
                  <div className="movementInfo"><strong>{movement.description}</strong><span>{movement.category_name || "Sem categoria"} · {formatDate(movement.occurred_on)}</span></div>
                  <b className={tone}>{tone === "income" ? "+" : "−"} {formatCurrency(movement.amount)}</b>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function Home({ view = "dashboard" }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    let supabase;

    try {
      supabase = getSupabaseBrowserClient();
    } catch (error) {
      setAuthError(error.message);
      setAuthReady(true);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
      if (data.session) loadDashboard(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession) loadDashboard(nextSession);
      else setDashboard(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadDashboard(activeSession = session) {
    if (!activeSession) return;
    setLoadingDashboard(true);
    try {
      const data = await apiRequest("/api/v1/dashboard", activeSession);
      setDashboard(data);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut();
    setDashboard(null);
  }

  if (!authReady) {
    return <main className="authLoading">Abrindo o Cifro...</main>;
  }

  if (!session) {
    return (
      <Login
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        onSubmit={handleLogin}
        error={authError}
        busy={authBusy}
      />
    );
  }

  const accountName = session.user.email?.split("@")[0] || "Conta pessoal";

  if (view === "register") {
    return <RegisterView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  const current = dashboard?.current || { income: 0, expenses: 0, available: 0 };
  const next = dashboard?.next_month_summary || { income: 0, expenses: 0, available: 0 };
  const currentUsed = current.income ? Math.min(100, Math.round((current.expenses / current.income) * 100)) : 0;
  const nextUsed = next.income ? Math.min(100, Math.round((next.expenses / next.income) * 100)) : 0;
  const movements = dashboard?.recent_transactions || [];
  return (
    <main className="shell">
      <Sidebar active="dashboard" accountName={accountName} onLogout={handleLogout} />

      <section className="content" id="overview">
        <header className="topbar">
          <div>
            <p className="eyebrow">SUA VISÃO FINANCEIRA</p>
            <h1>Seu dinheiro, à frente.</h1>
          </div>
          <button className="periodButton" type="button" aria-label="Período atual">
            <span className="periodIcon" /> {formatMonth(dashboard?.month)} <b>—</b> {formatMonth(dashboard?.next_month)}
          </button>
        </header>

        <section className="comparison" aria-labelledby="comparison-title">
          <div className="sectionIntro">
            <span id="comparison-title">Agora e depois</span>
            <span>{loadingDashboard ? "Atualizando" : "Dados reais"}</span>
          </div>

          <div className="comparisonGrid">
            <article className="monthPanel currentPanel">
              <div className="monthHeading"><span>{formatMonth(dashboard?.month)}</span><small>mês atual</small></div>
              <p className="metricLabel">Disponível agora</p>
              <Money>{formatCurrency(current.available)}</Money>
              <div className="miniStats">
                <div><span>Entrou</span><b>{formatCurrency(current.income)}</b></div>
                <div><span>Saiu</span><b>{formatCurrency(current.expenses)}</b></div>
              </div>
              <Progress value={currentUsed} label={`${currentUsed}% utilizado`} detail="movimentações concluídas" />
            </article>

            <div className="comparisonRail" aria-hidden="true"><span>→</span></div>

            <article className="monthPanel nextPanel" id="planning">
              <div className="monthHeading"><span>{formatMonth(dashboard?.next_month)}</span><small>próximo mês</small></div>
              <p className="metricLabel">Livre após compromissos</p>
              <Money accent>{formatCurrency(next.available)}</Money>
              <div className="miniStats">
                <div><span>Previsto</span><b>{formatCurrency(next.income)}</b></div>
                <div><span>Comprometido</span><b>{formatCurrency(next.expenses)}</b></div>
              </div>
              <Progress value={nextUsed} label={`${nextUsed}% comprometido`} detail={`${dashboard?.next_month_commitments?.length || 0} contas previstas`} accent />
            </article>
          </div>
        </section>

        <div className="lowerGrid">
          <section className="flowSection" aria-labelledby="flow-title">
            <div className="sectionHeader">
              <div><p className="eyebrow">EVOLUÇÃO</p><h2 id="flow-title">Seu fluxo</h2></div>
              <div className="trend"><strong>Em breve</strong><span>com histórico suficiente</span></div>
            </div>
            <div className="chart chartEmpty" role="img" aria-label="Gráfico será preenchido conforme novos meses forem registrados">
              <span>Registre algumas movimentações para ver sua evolução.</span>
              <div className="chartLabels"><span>AGORA</span><span>DEPOIS</span></div>
            </div>
          </section>

          <section className="recentSection" id="movements" aria-labelledby="recent-title">
            <div className="sectionHeader">
              <div><p className="eyebrow">MOVIMENTAÇÕES</p><h2 id="recent-title">Recentes</h2></div>
              <span className="seeAll">{movements.length} registradas</span>
            </div>
            <div className="movementList">
              {movements.length === 0 ? (
                <p className="emptyState">Ainda não há movimentações. Registre a primeira acima.</p>
              ) : movements.slice(0, 6).map((movement) => {
                const tone = movement.direction === "income" ? "income" : "expense";
                return (
                  <div className="movement" key={movement.id}>
                    <span className={`movementMark ${tone}`}>{movement.description.charAt(0).toUpperCase()}</span>
                    <div className="movementInfo"><strong>{movement.description}</strong><span>{movement.category_name || "Sem categoria"} · {formatDate(movement.occurred_on)}</span></div>
                    <b className={tone}>{tone === "income" ? "+" : "−"} {formatCurrency(movement.amount)}</b>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
