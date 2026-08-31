"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { useSession } from "./providers";

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

function formatScheduleDate(value) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInputDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function businessDayDateForMonth(year, month, ordinal) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const candidate = new Date(year, month, day);
    if (candidate.getDay() === 0) continue;
    count += 1;
    if (count === ordinal) return candidate;
  }
  return null;
}

function nextBusinessOccurrence(start, ordinal) {
  if (!start || !Number.isInteger(Number(ordinal)) || Number(ordinal) < 1) return "";
  const [year, month, day] = start.split("-").map(Number);
  let cursor = new Date(year, month - 1, day);
  for (let index = 0; index < 24; index += 1) {
    const candidate = businessDayDateForMonth(cursor.getFullYear(), cursor.getMonth(), Number(ordinal));
    if (candidate && candidate >= cursor) return toInputDate(candidate);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return "";
}

function inferDirection(text) {
  const hasIncomeSign = /^\s*\+/.test(text) || /\+\s*$/.test(text);
  const hasExpenseSign = /^\s*-/.test(text) || /-\s*$/.test(text);
  if (hasIncomeSign) return "income";
  if (hasExpenseSign) return "expense";
  if (/recebi|entrou|ganhei|sal[aá]rio|freela|freelance|renda/i.test(text)) return "income";
  if (/gastei|paguei|comprei|pagar|compra|despesa|conta/i.test(text)) return "expense";
  return null;
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2100) return false;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function parseQuickEntry(text) {
  const amountMatch = text.match(
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)/i,
  );

  if (!amountMatch) return null;

  const rawAmount = amountMatch[1];
  const normalizedAmount = rawAmount.includes(",")
    ? rawAmount.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(rawAmount)
      ? rawAmount.replace(/\./g, "")
    : rawAmount;
  const amount = Number(normalizedAmount);
  const directionHint = inferDirection(text);

  return {
    description: text,
    amount,
    direction: directionHint || "expense",
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

  if (response.status === 204) return null;
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
      <Link className="brand" href="/" aria-label="Cifro">
        <span className="brandMark"><i /><i /></span>
        <span>cifro</span>
      </Link>

      <nav className="mainNav" aria-label="Navegação principal">
        <Link className={active === "dashboard" ? "navItem active" : "navItem"} href="/">Visão geral</Link>
        <Link className={active === "register" ? "navItem active" : "navItem"} href="/registrar">Registrar</Link>
        <Link className={active === "planning" ? "navItem active" : "navItem"} href="/planejamento">Planejamento</Link>
        <Link className={active === "budget" ? "navItem active" : "navItem"} href="/distribuicao">Distribuição</Link>
        <Link className={active === "categories" ? "navItem active" : "navItem"} href="/categorias">Categorias</Link>
        <Link className={active === "data" ? "navItem active" : "navItem"} href="/dados">Dados</Link>
        <Link className={active === "settings" ? "navItem active" : "navItem"} href="/configuracoes">Configurações</Link>
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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [pendingMovement, setPendingMovement] = useState(null);
  const [pendingDescription, setPendingDescription] = useState("");
  const [pendingAmount, setPendingAmount] = useState("");
  const [pendingDirection, setPendingDirection] = useState("expense");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [preferredCategoryId, setPreferredCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState("expense");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDirection, setEditDirection] = useState("expense");
  const [editDate, setEditDate] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editBusy, setEditBusy] = useState(false);

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

  async function loadCategories() {
    try {
      const data = await apiRequest("/api/v1/categories", session);
      setCategories(data);
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadMovements();
    loadCategories();
  }, [session]);

  function registerMovement(event) {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    const movement = parseQuickEntry(cleanText);
    if (!movement || !movement.amount) {
      setNotice("Inclua um valor, por exemplo: gastei 28 no almoço");
      return;
    }

    setPendingMovement(movement);
    setPendingDescription(movement.description);
    setPendingAmount(String(movement.amount));
    setPendingDirection(movement.direction);
    const preferredCategory = categories.find((category) => category.id === preferredCategoryId);
    const preferredIsCompatible = preferredCategory && (preferredCategory.kind === "both" || preferredCategory.kind === movement.direction);
    setSelectedCategoryId(preferredIsCompatible ? preferredCategory.id : "");
    setNewCategoryName("");
    setNewCategoryKind(movement.direction);
    setNotice("");
  }

  function changePendingDirection(direction) {
    setPendingDirection(direction);
    setNewCategoryKind(direction);
    const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
    if (selectedCategory && selectedCategory.kind !== "both" && selectedCategory.kind !== direction) {
      setSelectedCategoryId("");
    }
  }

  function selectQuickCategory(category) {
    if (!pendingMovement) {
      setPreferredCategoryId(category.id);
      setNotice(`“${category.name}” será sugerida no próximo registro`);
      return;
    }

    if (category.kind !== "both" && category.kind !== pendingDirection) {
      setNotice(`“${category.name}” é uma categoria de ${category.kind === "income" ? "recebimentos" : "gastos"}.`);
      return;
    }

    setSelectedCategoryId(category.id);
    setPreferredCategoryId(category.id);
    setNotice(`Categoria “${category.name}” selecionada`);
  }

  async function createCategory() {
    const cleanName = newCategoryName.trim();
    if (!cleanName) return;

    setCategoryBusy(true);
    try {
      const category = await apiRequest("/api/v1/categories", session, {
        method: "POST",
        body: JSON.stringify({ name: cleanName, kind: newCategoryKind }),
      });
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      if (category.kind === "both" || category.kind === pendingDirection) {
        setSelectedCategoryId(category.id);
      }
      setNewCategoryName("");
      setNotice(`Categoria “${category.name}” criada`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCategoryBusy(false);
    }
  }

  async function confirmMovement(event) {
    event.preventDefault();
    const amount = Number(String(pendingAmount).replace(",", "."));
    const description = pendingDescription.trim();

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      setNotice("Confira a descrição e informe um valor maior que zero.");
      return;
    }

    setConfirmBusy(true);
    try {
      await apiRequest("/api/v1/transactions", session, {
        method: "POST",
        body: JSON.stringify({
          ...pendingMovement,
          description,
          amount,
          direction: pendingDirection,
          category_id: selectedCategoryId || null,
        }),
      });
      setPendingMovement(null);
      setText("");
      setNotice("Movimentação confirmada");
      await loadMovements();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setConfirmBusy(false);
    }
  }

  function startEditing(movement) {
    setEditingMovement(movement);
    setEditDescription(movement.description);
    setEditAmount(String(movement.amount));
    setEditDirection(movement.direction);
    setEditDate(movement.occurred_on);
    setEditCategoryId(movement.category_id || "");
    setNotice("");
  }

  function cancelEditing() {
    setEditingMovement(null);
    setNotice("");
  }

  async function saveEditedMovement(event) {
    event.preventDefault();
    const description = editDescription.trim();
    const amount = Number(String(editAmount).replace(",", "."));

    if (!description || !Number.isFinite(amount) || amount <= 0 || !isValidDateInput(editDate)) {
      setNotice("Confira a descrição, o valor e a data.");
      return;
    }

    setEditBusy(true);
    try {
      await apiRequest(`/api/v1/transactions/${editingMovement.id}`, session, {
        method: "PATCH",
        body: JSON.stringify({
          description,
          amount,
          direction: editDirection,
          occurred_on: editDate,
          category_id: editCategoryId || null,
        }),
      });
      setEditingMovement(null);
      setNotice("Movimentação atualizada");
      await loadMovements();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setEditBusy(false);
    }
  }

  function changeEditDirection(direction) {
    setEditDirection(direction);
    const selectedCategory = categories.find((category) => category.id === editCategoryId);
    if (selectedCategory && selectedCategory.kind !== "both" && selectedCategory.kind !== direction) {
      setEditCategoryId("");
    }
  }

  async function removeMovement(movement) {
    if (!window.confirm(`Excluir “${movement.description}”?`)) return;

    try {
      await apiRequest(`/api/v1/transactions/${movement.id}`, session, { method: "DELETE" });
      if (editingMovement?.id === movement.id) setEditingMovement(null);
      setNotice("Movimentação excluída");
      await loadMovements();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function confirmPlannedMovement(movement) {
    if (!window.confirm(`Confirmar “${movement.description}” como movimentação concluída?`)) return;

    setConfirmingId(movement.id);
    try {
      await apiRequest(`/api/v1/transactions/${movement.id}`, session, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      setNotice("Movimentação confirmada");
      await loadMovements();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setConfirmingId(null);
    }
  }

  const compatibleCategories = categories.filter(
    (category) => category.kind === "both" || category.kind === pendingDirection,
  );
  const directionHint = pendingMovement ? inferDirection(pendingDescription) : null;
  const directionConflict = directionHint && directionHint !== pendingDirection;
  const editDirectionHint = editingMovement ? inferDirection(editDescription) : null;
  const editDirectionConflict = editDirectionHint && editDirectionHint !== editDirection;

  return (
    <main className="shell">
      <Sidebar active="register" accountName={accountName} onLogout={onLogout} />
      <section className="content registrationContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">NOVA MOVIMENTAÇÃO</p>
            <h1>Registre sem interromper o dia.</h1>
          </div>
          <Link className="backLink" href="/">← Visão geral</Link>
        </header>

        <div className="registrationLayout">
          <div className="registrationMain">

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

        {pendingMovement && (
          <form className="confirmationPanel" onSubmit={confirmMovement}>
            <div className="confirmationHeader">
              <div>
                <p className="eyebrow">CONFIRME ANTES DE SALVAR</p>
                <h3>Está tudo certo?</h3>
              </div>
              <button
                className="cancelButton"
                type="button"
                onClick={() => setPendingMovement(null)}
              >
                Cancelar
              </button>
            </div>

            <div className="confirmationGrid">
              <label className="confirmationField">
                <span>Tipo</span>
                <select value={pendingDirection} onChange={(event) => changePendingDirection(event.target.value)}>
                  <option value="expense">Gasto</option>
                  <option value="income">Recebimento</option>
                </select>
              </label>
              <label className="confirmationField">
                <span>Valor</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={pendingAmount}
                  onChange={(event) => setPendingAmount(event.target.value)}
                />
              </label>
              <label className="confirmationField confirmationWide">
                <span>Descrição</span>
                <input
                  value={pendingDescription}
                  onChange={(event) => setPendingDescription(event.target.value)}
                  maxLength={160}
                />
              </label>
              <label className="confirmationField confirmationWide">
                <span>Categoria <small>opcional</small></span>
                <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                  <option value="">Sem categoria</option>
                  {compatibleCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {directionConflict && (
              <p className="directionWarning" role="alert">
                A descrição parece indicar um {directionHint === "income" ? "recebimento" : "gasto"}, mas o tipo está como {pendingDirection === "income" ? "recebimento" : "gasto"}. Confira antes de confirmar.
              </p>
            )}

            <div className="categoryCreator">
              <span className="categoryCreatorLabel">Criar categoria</span>
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder={pendingDirection === "income" ? "Ex.: Salário" : "Ex.: Alimentação"}
                maxLength={80}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createCategory();
                  }
                }}
              />
              <select value={newCategoryKind} onChange={(event) => setNewCategoryKind(event.target.value)} aria-label="Tipo da nova categoria">
                <option value="expense">Para gastos</option>
                <option value="income">Para recebimentos</option>
                <option value="both">Para os dois</option>
              </select>
              <button className="secondaryButton" type="button" onClick={createCategory} disabled={categoryBusy || !newCategoryName.trim()}>
                {categoryBusy ? "Criando..." : "Criar"}
              </button>
            </div>

            <div className="confirmationActions">
              <span>Hoje · {pendingDirection === "income" ? "recebimento" : "gasto"}</span>
              <button className="confirmButton" type="submit" disabled={confirmBusy}>
                {confirmBusy ? "Salvando..." : "Confirmar registro"}
              </button>
            </div>
          </form>
        )}

        {editingMovement && (
          <form className="editPanel" onSubmit={saveEditedMovement}>
            <div className="confirmationHeader">
              <div>
                <p className="eyebrow">EDITAR MOVIMENTAÇÃO</p>
                <h3>Corrija o que for necessário.</h3>
              </div>
              <button className="cancelButton" type="button" onClick={cancelEditing}>Cancelar</button>
            </div>
            <div className="confirmationGrid">
              <label className="confirmationField">
                <span>Tipo</span>
                <select value={editDirection} onChange={(event) => changeEditDirection(event.target.value)}>
                  <option value="expense">Gasto</option>
                  <option value="income">Recebimento</option>
                </select>
              </label>
              <label className="confirmationField">
                <span>Valor</span>
                <input type="number" min="0.01" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
              </label>
              <label className="confirmationField confirmationWide">
                <span>Descrição</span>
                <input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={160} />
              </label>
              <label className="confirmationField">
                <span>Data</span>
                <input type="date" min="1900-01-01" max="2100-12-31" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
              </label>
              <label className="confirmationField">
                <span>Categoria <small>opcional</small></span>
                <select value={editCategoryId} onChange={(event) => setEditCategoryId(event.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories
                    .filter((category) => category.kind === "both" || category.kind === editDirection)
                    .map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>
            {editDirectionConflict && (
              <p className="directionWarning" role="alert">
                A descrição parece indicar um {editDirectionHint === "income" ? "recebimento" : "gasto"}, mas o tipo está como {editDirection === "income" ? "recebimento" : "gasto"}. Confira antes de salvar.
              </p>
            )}
            <div className="confirmationActions">
              <span>Alteração manual</span>
              <button className="confirmButton" type="submit" disabled={editBusy}>{editBusy ? "Salvando..." : "Salvar alterações"}</button>
            </div>
          </form>
        )}
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
                  <div className="movementInfo"><strong>{movement.description}</strong><span>{movement.category_name || "Sem categoria"} · {formatDate(movement.occurred_on)}{movement.status === "planned" ? " · Pendente" : ""}</span></div>
                  <b className={tone}>{tone === "income" ? "+" : "−"} {formatCurrency(movement.amount)}</b>
                  <div className="movementActions">
                    {movement.status === "planned" && <button type="button" onClick={() => confirmPlannedMovement(movement)} disabled={confirmingId === movement.id}>{confirmingId === movement.id ? "Confirmando..." : "Confirmar"}</button>}
                    <button type="button" onClick={() => startEditing(movement)}>Editar</button>
                    <button type="button" onClick={() => removeMovement(movement)}>Excluir</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

          </div>

          <aside className="quickCategories" aria-labelledby="quick-categories-title">
            <div className="asideHeading">
              <p className="eyebrow">ATALHOS</p>
              <h2 id="quick-categories-title">Categorias</h2>
            </div>
            <p className="asideDescription">Escolha uma categoria na confirmação ou organize as suas aqui.</p>
            <div className="quickCategoryList">
              {categories.length === 0 ? (
                <p className="emptyState">Nenhuma categoria criada.</p>
              ) : categories.slice(0, 6).map((category) => (
                <button
                  className={category.id === (pendingMovement ? selectedCategoryId : preferredCategoryId) ? "quickCategory selected" : "quickCategory"}
                  type="button"
                  onClick={() => selectQuickCategory(category)}
                  aria-pressed={category.id === (pendingMovement ? selectedCategoryId : preferredCategoryId)}
                >
                  <span className="categoryDot" />
                  <strong>{category.name}</strong>
                  <span>{categoryKindLabel(category.kind)}</span>
                </button>
              ))}
            </div>
            <Link className="asideLink" href="/categorias">Gerenciar categorias <span>→</span></Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function categoryKindLabel(kind) {
  if (kind === "income") return "Recebimentos";
  if (kind === "expense") return "Gastos";
  return "Gastos e recebimentos";
}

const emptyCommitment = {
  name: "",
  amount: "",
  direction: "expense",
  commitment_type: "recurring",
  frequency: "monthly",
  due_rule: "fixed_day",
  business_day_number: "",
  starts_on: "",
  next_due_on: "",
  ends_on: "",
  category_id: "",
  total_installments: "",
  current_installment: "1",
};

function SettingsView({ session, accountName, onLogout }) {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({ auto_confirm_income: false, default_due_rule: "fixed_day", default_business_day_number: 5 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiRequest("/api/v1/settings", session)
      .then((data) => {
        setSettings(data);
        setDraft({
          auto_confirm_income: data.auto_confirm_income,
          default_due_rule: data.default_due_rule,
          default_business_day_number: data.default_business_day_number,
        });
      })
      .catch((error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, [session]);

  async function saveSettings(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await apiRequest("/api/v1/settings", session, {
        method: "PATCH",
        body: JSON.stringify({
          auto_confirm_income: draft.auto_confirm_income,
          default_due_rule: draft.default_due_rule,
          default_business_day_number: Number(draft.default_business_day_number),
        }),
      });
      setSettings(data);
      setDraft({
        auto_confirm_income: data.auto_confirm_income,
        default_due_rule: data.default_due_rule,
        default_business_day_number: data.default_business_day_number,
      });
      setNotice("Configurações salvas");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <Sidebar active="settings" accountName={accountName} onLogout={onLogout} />
      <section className="content settingsContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">CONFIGURAÇÕES</p>
            <h1>Defina como o Cifro deve pensar.</h1>
          </div>
          <Link className="backLink" href="/">← Visão geral</Link>
        </header>

        <div className="settingsLayout">
          <form className="settingsMain" onSubmit={saveSettings}>
            <section className="settingsIntro">
              <p className="eyebrow">PREFERÊNCIAS</p>
              <h2>Pequenos parâmetros. Mais clareza.</h2>
              <p>Estas escolhas orientam novos planejamentos e a futura automação do Cifro. Elas não alteram registros que já aconteceram.</p>
            </section>

            <section className="settingsSection" aria-labelledby="automation-title">
              <div className="settingsSectionHeading">
                <div><p className="eyebrow">AUTOMAÇÃO</p><h2 id="automation-title">Recebimentos recorrentes</h2></div>
                <span className="settingsBadge">motor diário</span>
              </div>
              <label className="settingToggle">
                <input type="checkbox" checked={draft.auto_confirm_income} onChange={(event) => setDraft((current) => ({ ...current, auto_confirm_income: event.target.checked }))} />
                <span className="toggleTrack" aria-hidden="true"><i /></span>
                <span className="settingCopy"><strong>Confirmar automaticamente</strong><small>Quando o processamento automático estiver ativo, recebimentos como salário poderão virar concluídos na data prevista.</small></span>
              </label>
              <p className="settingsWarning">Essa opção só funciona quando a rotina diária do Cifro estiver configurada no servidor. Sem ela, o planejamento continua sendo processado manualmente.</p>
            </section>

            <section className="settingsSection" aria-labelledby="defaults-title">
              <div className="settingsSectionHeading">
                <div><p className="eyebrow">NOVOS PLANEJAMENTOS</p><h2 id="defaults-title">Padrão para datas</h2></div>
              </div>
              <div className="settingsFields">
                <label className="settingsField">
                  <span>Regra padrão</span>
                  <select value={draft.default_due_rule} onChange={(event) => setDraft((current) => ({ ...current, default_due_rule: event.target.value }))}>
                    <option value="fixed_day">Dia fixo do mês</option>
                    <option value="business_day">Dia útil do mês</option>
                  </select>
                </label>
                {draft.default_due_rule === "business_day" && (
                  <label className="settingsField">
                    <span>Número do dia útil</span>
                    <input type="number" min="1" max="31" step="1" value={draft.default_business_day_number} onChange={(event) => setDraft((current) => ({ ...current, default_business_day_number: event.target.value }))} />
                  </label>
                )}
              </div>
              <div className="businessDayNote"><strong>Regra atual</strong><span>Segunda a sábado contam como dias úteis. Domingo não conta. Feriados ainda não são considerados.</span></div>
            </section>

            {notice && <p className="notice" role="status">{notice}</p>}
            <div className="settingsActions"><span>{loading ? "Carregando preferências..." : settings ? "Preferências salvas por usuário." : ""}</span><button className="confirmButton" type="submit" disabled={busy || loading}>{busy ? "Salvando..." : "Salvar configurações"}</button></div>
          </form>

          <aside className="settingsSummary" aria-labelledby="settings-summary-title">
            <p className="eyebrow">RESUMO</p>
            <h2 id="settings-summary-title">Seu Cifro, suas regras.</h2>
            <div className="settingsSummaryValue">{draft.auto_confirm_income ? "Automático" : "Manual"}</div>
            <span className="settingsSummaryLabel">confirmação de recebimentos</span>
            <div className="summaryRows">
              <div><span>Datas padrão</span><b>{draft.default_due_rule === "business_day" ? `${draft.default_business_day_number}º útil` : "Dia fixo"}</b></div>
              <div><span>Sábado</span><b>Conta</b></div>
              <div><span>Domingo</span><b>Não conta</b></div>
            </div>
            <Link className="asideLink" href="/planejamento">Abrir planejamento <span>→</span></Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function DataView({ session, accountName, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);

  async function exportTransactions() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/v1/transactions/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Não foi possível exportar os registros.");
      }

      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cifro-movimentacoes.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Exportação concluída");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function analyzeImport() {
    if (!importFile) return;
    setBusy(true);
    setNotice("");
    setPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await fetch(`${API_URL}/api/v1/transactions/import/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Não foi possível analisar a planilha.");
      }
      setPreview(await response.json());
      setNotice("Planilha analisada. Nada foi salvo.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  const importFieldLabels = {
    date: "Data",
    description: "Descrição",
    amount: "Valor",
    direction: "Tipo",
    income: "Entrada",
    expense: "Saída",
    category: "Categoria",
    status: "Status",
    notes: "Observações",
  };

  return (
    <main className="shell">
      <Sidebar active="data" accountName={accountName} onLogout={onLogout} />
      <section className="content dataContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">SEUS DADOS</p>
            <h1>Leve seus dados com você.</h1>
          </div>
          <Link className="backLink" href="/">← Visão geral</Link>
        </header>

        <div className="dataLayout">
          <div className="dataMain">
            <section className="dataIntro">
              <p className="eyebrow">EXPORTAÇÃO</p>
              <h2>Uma cópia clara do que aconteceu.</h2>
              <p>Baixe todas as suas movimentações em um CSV compatível com Excel, Google Sheets e outros editores.</p>
              <button className="confirmButton dataExportButton" type="button" onClick={exportTransactions} disabled={busy}>
                {busy ? "Preparando arquivo..." : "Baixar movimentações"}
              </button>
            </section>

            <section className="dataImportSection" aria-labelledby="import-title">
              <div className="dataSectionHeading">
                <div><p className="eyebrow">IMPORTAÇÃO SEGURA</p><h2 id="import-title">Veja antes de trazer para o Cifro.</h2></div>
              </div>
              <p className="dataImportDescription">Escolha um CSV ou XLSX. Nesta etapa, o Cifro apenas analisa o arquivo e mostra o que entendeu.</p>
              <div className="dataImportControls">
                <label className="filePicker">
                  <span>{importFile ? importFile.name : "Escolher planilha"}</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      setImportFile(event.target.files?.[0] || null);
                      setPreview(null);
                      setNotice("");
                    }}
                  />
                </label>
                <button className="secondaryButton" type="button" onClick={analyzeImport} disabled={busy || !importFile}>
                  {busy ? "Analisando..." : "Analisar planilha"}
                </button>
              </div>
              <p className="dataImportSafety">Limite atual: 10 MB. A análise não cria, edita ou exclui movimentações.</p>
            </section>

            {notice && <p className="notice" role="status">{notice}</p>}

            {preview && (
              <section className="importPreview" aria-labelledby="preview-title">
                <div className="dataSectionHeading">
                  <div><p className="eyebrow">PRÉVIA</p><h2 id="preview-title">{preview.filename}</h2></div>
                  <span className="previewStatus">somente leitura</span>
                </div>
                <div className={`importClassification ${preview.workbook_type || "unknown"}`}>
                  <strong>{preview.workbook_label || "Formato não reconhecido"}</strong>
                  <span>{preview.workbook_message || "Revise a estrutura antes de importar."}</span>
                </div>
                <div className="importTotals">
                  <div><strong>{preview.total_sheets}</strong><span>abas</span></div>
                  <div><strong>{preview.total_rows}</strong><span>linhas importáveis</span></div>
                  <div><strong className="validText">{preview.valid_rows}</strong><span>válidas</span></div>
                  <div><strong className={preview.invalid_rows ? "invalidText" : "validText"}>{preview.invalid_rows}</strong><span>com atenção</span></div>
                  <div><strong>{preview.ignored_rows || 0}</strong><span>fora do fluxo</span></div>
                </div>
                <div className="importSheets">
                  {preview.sheets.map((sheet) => (
                    <article className="importSheet" key={sheet.name}>
                      <div className="importSheetHeader">
                        <div>
                          <strong>{sheet.name}</strong>
                          <span>{sheet.type === "transactions" ? `${sheet.total_rows} linhas · ${sheet.valid_rows} válidas` : sheet.classification?.type === "summary" ? `${sheet.ignored_rows || 0} linhas mantidas fora da importação` : "Revisão necessária"}</span>
                        </div>
                        <b className={sheet.type === "transactions" && sheet.invalid_rows ? "invalidText" : sheet.type === "transactions" ? "validText" : "invalidText"}>
                          {sheet.type === "transactions" ? (sheet.invalid_rows ? `${sheet.invalid_rows} atenção` : "Pronta") : sheet.type === "summary" ? "Resumo" : "Revisar"}
                        </b>
                      </div>
                      {sheet.type !== "transactions" ? (
                        <div className={`importBlocked ${sheet.type}`}>
                          <strong>{sheet.type === "summary" ? "Não importar como movimentação" : "Não foi possível identificar com segurança"}</strong>
                          <span>{sheet.classification?.reason || "A estrutura desta aba precisa de revisão manual."}</span>
                          {sheet.ignored_rows > 0 && <small>{sheet.ignored_rows} linhas foram preservadas fora da prévia para evitar lançamentos incorretos.</small>}
                        </div>
                      ) : sheet.errors.length > 0 ? (
                        <p className="importError">{sheet.errors.join(" · ")}</p>
                      ) : (
                        <>
                          <div className="importMapping">
                            {Object.entries(sheet.mapping).filter(([, column]) => column).map(([field, column]) => (
                              <span key={field}><b>{importFieldLabels[field]}</b>{column}</span>
                            ))}
                          </div>
                          {sheet.rows.length > 0 && (
                            <div className="importRowList">
                              {sheet.rows.slice(0, 8).map((row) => (
                                <div className={row.valid ? "importRow" : "importRow invalidRow"} key={`${sheet.name}-${row.source_row}`}>
                                  <span>{row.source_row}</span>
                                  <strong>{row.description || "Sem descrição"}</strong>
                                  <b>{row.amount ? `R$ ${row.amount.replace(".", ",")}` : "—"}</b>
                                  <em>{row.valid ? (row.direction === "income" ? "Recebimento" : "Gasto") : row.errors.join(" · ")}</em>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="dataSection" aria-labelledby="export-format-title">
              <div className="dataSectionHeading">
                <div><p className="eyebrow">FORMATO</p><h2 id="export-format-title">Feito para abrir sem surpresa.</h2></div>
              </div>
              <div className="dataFields">
                <div><span>Arquivo</span><strong>cifro-movimentacoes.csv</strong></div>
                <div><span>Separador</span><strong>Ponto e vírgula</strong></div>
                <div><span>Valores</span><strong>Decimal brasileiro</strong></div>
                <div><span>Datas</span><strong>AAAA-MM-DD</strong></div>
              </div>
              <p className="dataHint">O valor é exportado sem o símbolo “R$”, para continuar sendo reconhecido como número na planilha.</p>
            </section>
          </div>

          <aside className="dataSummary" aria-labelledby="data-summary-title">
            <p className="eyebrow">PRÓXIMA ETAPA</p>
            <h2 id="data-summary-title">Importar sem perder o controle.</h2>
            <p>Depois da exportação, vamos criar a importação com pré-visualização, validação por linha e confirmação antes de salvar.</p>
            <div className="dataSummaryLine"><span>Agora</span><b>Exportar</b></div>
            <div className="dataSummaryLine"><span>Depois</span><b>Importar</b></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function BudgetView({ session, accountName, onLogout }) {
  const [budget, setBudget] = useState(null);
  const [categories, setCategories] = useState([]);
  const [baseDraft, setBaseDraft] = useState({ base_mode: "total_income", income_category_id: "", manual_amount: "" });
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newPercentage, setNewPercentage] = useState("");
  const [allocationDrafts, setAllocationDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBudget(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [budgetData, categoryData] = await Promise.all([
        apiRequest("/api/v1/budget", session),
        apiRequest("/api/v1/categories", session),
      ]);
      setBudget(budgetData);
      setCategories(categoryData);
      setBaseDraft({
        base_mode: budgetData.settings.base_mode,
        income_category_id: budgetData.settings.income_category_id || "",
        manual_amount: budgetData.settings.manual_amount || "",
      });
      setAllocationDrafts(Object.fromEntries(
        budgetData.allocations.map((allocation) => [allocation.category_id, String(allocation.percentage)]),
      ));
    } catch (error) {
      setNotice(error.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadBudget();
  }, [session]);

  const incomeCategories = categories.filter((category) => category.kind === "income" || category.kind === "both");
  const expenseCategories = categories.filter((category) => category.kind === "expense" || category.kind === "both");
  const allocatedCategoryIds = new Set((budget?.allocations || []).map((allocation) => allocation.category_id));
  const availableCategories = expenseCategories.filter((category) => !allocatedCategoryIds.has(category.id));
  const totalPercentage = Number(budget?.total_percentage || 0);
  const baseAmount = Number(budget?.base_amount || 0);
  const allocatedAmount = baseAmount * totalPercentage / 100;

  async function saveBase(event) {
    event.preventDefault();
    if (baseDraft.base_mode === "category_income" && !baseDraft.income_category_id) {
      setNotice("Escolha a categoria que representa sua renda-base.");
      return;
    }
    if (baseDraft.base_mode === "manual" && Number(baseDraft.manual_amount) <= 0) {
      setNotice("Informe um valor mensal maior que zero.");
      return;
    }

    const payload = { base_mode: baseDraft.base_mode, income_category_id: null, manual_amount: null };
    if (baseDraft.base_mode === "category_income") payload.income_category_id = baseDraft.income_category_id;
    if (baseDraft.base_mode === "manual") payload.manual_amount = baseDraft.manual_amount;

    setBusyAction("base");
    setNotice("");
    try {
      await apiRequest("/api/v1/budget/settings", session, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadBudget(false);
      setNotice("Base da distribuição atualizada.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function addAllocation(event) {
    event.preventDefault();
    const percentage = Number(newPercentage);
    if (!selectedCategoryId || percentage <= 0) {
      setNotice("Escolha uma categoria e informe um percentual maior que zero.");
      return;
    }
    if (totalPercentage + percentage > 100) {
      setNotice(`Restam apenas ${Math.max(0, 100 - totalPercentage).toLocaleString("pt-BR")}% para distribuir.`);
      return;
    }

    setBusyAction("new");
    setNotice("");
    try {
      await apiRequest(`/api/v1/budget/allocations/${selectedCategoryId}`, session, {
        method: "PATCH",
        body: JSON.stringify({ percentage }),
      });
      setSelectedCategoryId("");
      setNewPercentage("");
      await loadBudget(false);
      setNotice("Categoria incluída na distribuição.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function saveAllocation(categoryId) {
    const percentage = Number(allocationDrafts[categoryId]);
    if (percentage <= 0) {
      setNotice("O percentual precisa ser maior que zero.");
      return;
    }

    setBusyAction(categoryId);
    setNotice("");
    try {
      await apiRequest(`/api/v1/budget/allocations/${categoryId}`, session, {
        method: "PATCH",
        body: JSON.stringify({ percentage }),
      });
      await loadBudget(false);
      setNotice("Percentual atualizado.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function removeAllocation(categoryId) {
    setBusyAction(categoryId);
    setNotice("");
    try {
      await apiRequest(`/api/v1/budget/allocations/${categoryId}`, session, { method: "DELETE" });
      await loadBudget(false);
      setNotice("Categoria removida da distribuição.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="shell">
      <Sidebar active="budget" accountName={accountName} onLogout={onLogout} />
      <section className="content budgetContent">
        <header className="topbar">
          <div><p className="eyebrow">DISTRIBUIÇÃO</p><h1>Dê um destino para cada parte.</h1></div>
          <Link className="backLink" href="/">← Visão geral</Link>
        </header>

        <div className="budgetLayout">
          <div className="budgetMain">
            <section className="budgetIntro">
              <p className="eyebrow">BASE DO CÁLCULO</p>
              <h2>Comece pelo dinheiro que sustenta o mês.</h2>
              <p>Use todas as receitas, uma categoria como Salário ou um valor fixo. A distribuição cria referências; ela não movimenta dinheiro nem altera seu saldo.</p>
            </section>

            <form className="budgetBaseForm" onSubmit={saveBase}>
              <label className="budgetField">
                <span>Calcular sobre</span>
                <select value={baseDraft.base_mode} onChange={(event) => setBaseDraft((current) => ({ ...current, base_mode: event.target.value, income_category_id: "", manual_amount: "" }))}>
                  <option value="total_income">Todas as receitas recebidas no mês</option>
                  <option value="category_income">Uma categoria de recebimento</option>
                  <option value="manual">Um valor mensal definido</option>
                </select>
              </label>
              {baseDraft.base_mode === "category_income" && (
                <label className="budgetField">
                  <span>Categoria da renda</span>
                  <select value={baseDraft.income_category_id} onChange={(event) => setBaseDraft((current) => ({ ...current, income_category_id: event.target.value }))}>
                    <option value="">Escolha uma categoria</option>
                    {incomeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              )}
              {baseDraft.base_mode === "manual" && (
                <label className="budgetField">
                  <span>Valor mensal</span>
                  <input type="number" min="0.01" step="0.01" value={baseDraft.manual_amount} onChange={(event) => setBaseDraft((current) => ({ ...current, manual_amount: event.target.value }))} placeholder="0,00" />
                </label>
              )}
              <button className="secondaryButton" type="submit" disabled={busyAction === "base"}>{busyAction === "base" ? "Salvando..." : "Salvar base"}</button>
            </form>

            <section className="allocationSection" aria-labelledby="allocation-title">
              <div className="sectionHeader">
                <div><p className="eyebrow">FRAÇÕES</p><h2 id="allocation-title">Como você quer dividir.</h2></div>
                <span className="seeAll">{loading ? "Carregando" : `${totalPercentage.toLocaleString("pt-BR")}% de 100%`}</span>
              </div>

              <form className="allocationCreate" onSubmit={addAllocation}>
                <label className="budgetField">
                  <span>Categoria</span>
                  <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                    <option value="">Escolha uma categoria de gasto</option>
                    {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="budgetField percentageField">
                  <span>Percentual</span>
                  <div><input type="number" min="0.01" max="100" step="0.01" value={newPercentage} onChange={(event) => setNewPercentage(event.target.value)} placeholder="0" /><b>%</b></div>
                </label>
                <button className="confirmButton" type="submit" disabled={busyAction === "new" || availableCategories.length === 0}>{busyAction === "new" ? "Adicionando..." : "Adicionar fração"}</button>
              </form>

              {notice && <p className="notice" role="status">{notice}</p>}

              <div className="allocationList">
                {!loading && budget?.allocations.length === 0 ? (
                  <p className="emptyState">Nenhuma fração definida. Crie categorias como Investimentos, Assinaturas ou Lazer e escolha quanto cada uma recebe.</p>
                ) : budget?.allocations.map((allocation) => {
                  const used = Number(allocation.target_amount) > 0
                    ? Math.min(100, Math.round(Number(allocation.actual_amount) / Number(allocation.target_amount) * 100))
                    : 0;
                  const exceeded = Number(allocation.remaining_amount) < 0;
                  return (
                    <article className="allocationRow" key={allocation.category_id}>
                      <div className="allocationIdentity">
                        <span className="allocationDot" />
                        <div><strong>{allocation.category_name}</strong><span>{formatCurrency(allocation.actual_amount)} utilizados de {formatCurrency(allocation.target_amount)}</span></div>
                      </div>
                      <label className="allocationPercentage" aria-label={`Percentual para ${allocation.category_name}`}>
                        <input type="number" min="0.01" max="100" step="0.01" value={allocationDrafts[allocation.category_id] ?? ""} onChange={(event) => setAllocationDrafts((current) => ({ ...current, [allocation.category_id]: event.target.value }))} />
                        <span>%</span>
                      </label>
                      <div className="allocationAmounts">
                        <span>{exceeded ? "Acima da meta" : "Ainda disponível"}</span>
                        <b className={exceeded ? "invalidText" : "validText"}>{formatCurrency(Math.abs(Number(allocation.remaining_amount)))}</b>
                      </div>
                      <div className="rowActions allocationActions">
                        <button type="button" onClick={() => saveAllocation(allocation.category_id)} disabled={busyAction === allocation.category_id}>Salvar</button>
                        <button type="button" onClick={() => removeAllocation(allocation.category_id)} disabled={busyAction === allocation.category_id}>Remover</button>
                      </div>
                      <div className="allocationTrack" aria-label={`${used}% da fração utilizada`}><span className={exceeded ? "exceeded" : ""} style={{ width: `${used}%` }} /></div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="budgetSummary" aria-labelledby="budget-summary-title">
            <p className="eyebrow">{formatMonth(budget?.month)}</p>
            <h2 id="budget-summary-title">Seu mapa do mês.</h2>
            <strong className="budgetBaseValue">{formatCurrency(budget?.base_amount)}</strong>
            <span className="budgetBaseLabel">base considerada</span>
            <div className="distributionMeter" aria-label={`${totalPercentage}% distribuído`}><span style={{ width: `${Math.min(100, totalPercentage)}%` }} /></div>
            <div className="summaryRows">
              <div><span>Distribuído</span><b>{formatCurrency(allocatedAmount)}</b></div>
              <div><span>Sem destino</span><b>{formatCurrency(budget?.unallocated_amount)}</b></div>
              <div><span>Percentual livre</span><b>{Number(budget?.unallocated_percentage || 100).toLocaleString("pt-BR")}%</b></div>
            </div>
            <Link className="asideLink" href="/categorias">Gerenciar categorias <span>→</span></Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function PlanningView({ session, accountName, onLogout }) {
  const [commitments, setCommitments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyCommitment);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [notice, setNotice] = useState("");

  async function loadPlanning() {
    setLoading(true);
    try {
      const [commitmentData, categoryData, settingsData] = await Promise.all([
        apiRequest("/api/v1/commitments", session),
        apiRequest("/api/v1/categories", session),
        apiRequest("/api/v1/settings", session),
      ]);
      setCommitments(commitmentData);
      setCategories(categoryData);
      setSettings(settingsData);
      setForm((current) => current.name || current.starts_on ? current : {
        ...emptyCommitment,
        due_rule: settingsData.default_due_rule,
        business_day_number: String(settingsData.default_business_day_number),
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlanning();
  }, [session]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function changeDirection(direction) {
    const selected = categories.find((category) => category.id === form.category_id);
    setForm((current) => ({
      ...current,
      direction,
      category_id: selected && (selected.kind === "both" || selected.kind === direction) ? current.category_id : "",
    }));
  }

  function changeCommitmentType(commitmentType) {
    setForm((current) => ({
      ...current,
      commitment_type: commitmentType,
      due_rule: commitmentType === "installment" ? "fixed_day" : current.due_rule,
      business_day_number: commitmentType === "installment" ? "" : current.business_day_number,
      total_installments: commitmentType === "installment" ? current.total_installments : "",
      current_installment: commitmentType === "installment" ? (current.current_installment || "1") : "",
    }));
  }

  function startEditing(commitment) {
    setEditingId(commitment.id);
    setForm({
      name: commitment.name,
      amount: String(commitment.amount),
      direction: commitment.direction,
      commitment_type: commitment.commitment_type,
      frequency: commitment.frequency,
      due_rule: commitment.due_rule,
      business_day_number: commitment.business_day_number ? String(commitment.business_day_number) : "",
      starts_on: commitment.starts_on,
      next_due_on: commitment.next_due_on,
      ends_on: commitment.ends_on || "",
      category_id: commitment.category_id || "",
      total_installments: commitment.total_installments ? String(commitment.total_installments) : "",
      current_installment: commitment.current_installment ? String(commitment.current_installment) : "1",
    });
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyCommitment);
    setNotice("");
  }

  async function saveCommitment(event) {
    event.preventDefault();
    const amount = Number(String(form.amount).replace(",", "."));
    const installmentTotal = form.commitment_type === "installment" ? Number(form.total_installments) : null;
    const installmentCurrent = form.commitment_type === "installment" ? Number(form.current_installment) : null;
    const businessDayNumber = form.due_rule === "business_day" ? Number(form.business_day_number) : null;

    const automaticNextDue = form.due_rule === "business_day"
      ? nextBusinessOccurrence(form.starts_on, businessDayNumber)
      : form.next_due_on;

    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0 || !isValidDateInput(form.starts_on) || !isValidDateInput(automaticNextDue)) {
      setNotice("Preencha nome, valor e datas válidas para o compromisso.");
      return;
    }
    if (form.ends_on && !isValidDateInput(form.ends_on)) {
      setNotice("Confira a data final.");
      return;
    }
    if (form.commitment_type === "installment" && (!Number.isInteger(installmentTotal) || !Number.isInteger(installmentCurrent) || installmentCurrent > installmentTotal)) {
      setNotice("Informe parcelas válidas: a atual não pode passar do total.");
      return;
    }
    if (form.due_rule === "business_day" && (!Number.isInteger(businessDayNumber) || businessDayNumber < 1 || businessDayNumber > 31)) {
      setNotice("Informe qual dia útil deve ser usado, entre 1 e 31.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount,
        direction: form.direction,
        commitment_type: form.commitment_type,
        frequency: form.frequency,
        due_rule: form.due_rule,
        business_day_number: businessDayNumber,
        starts_on: form.starts_on,
        next_due_on: automaticNextDue || null,
        ends_on: form.ends_on || null,
        category_id: form.category_id || null,
        total_installments: installmentTotal,
        current_installment: installmentCurrent,
      };
      await apiRequest(
        editingId ? `/api/v1/commitments/${editingId}` : "/api/v1/commitments",
        session,
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      if (editingId) {
        setNotice("Compromisso atualizado");
      } else {
        setNotice("Compromisso adicionado ao planejamento");
      }
      await loadPlanning();
      setEditingId(null);
      setForm({
        ...emptyCommitment,
        due_rule: settings?.default_due_rule || "fixed_day",
        business_day_number: String(settings?.default_business_day_number || 5),
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function recordCommitment(commitment) {
    const action = commitment.direction === "income" ? "recebimento" : "pagamento";
    if (!window.confirm(`Registrar este ${action} de ${formatCurrency(commitment.amount)} como uma movimentação real?`)) return;

    setRecordingId(commitment.id);
    try {
      const result = await apiRequest(`/api/v1/commitments/${commitment.id}/record`, session, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCommitments((current) => result.commitment.is_active
        ? current.map((item) => item.id === result.commitment.id ? result.commitment : item)
        : current.filter((item) => item.id !== result.commitment.id));
      setNotice(`${commitment.direction === "income" ? "Recebimento" : "Pagamento"} registrado`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRecordingId(null);
    }
  }

  async function removeCommitment(commitment) {
    if (!window.confirm(`Excluir “${commitment.name}” do planejamento?`)) return;

    try {
      await apiRequest(`/api/v1/commitments/${commitment.id}`, session, { method: "DELETE" });
      setCommitments((current) => current.filter((item) => item.id !== commitment.id));
      if (editingId === commitment.id) cancelEditing();
      setNotice("Compromisso excluído");
    } catch (error) {
      setNotice(error.message);
    }
  }

  const compatibleCategories = categories.filter(
    (category) => category.kind === "both" || category.kind === form.direction,
  );
  const automaticNextDue = form.due_rule === "business_day"
    ? nextBusinessOccurrence(form.starts_on, form.business_day_number)
    : form.next_due_on;

  return (
    <main className="shell">
      <Sidebar active="planning" accountName={accountName} onLogout={onLogout} />
      <section className="content planningContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">PLANEJAMENTO</p>
            <h1>Organize o que ainda vai acontecer.</h1>
          </div>
          <Link className="backLink" href="/">← Visão geral</Link>
        </header>

        <div className="planningLayout">
          <div className="planningMain">
            <section className="planningIntro">
              <p className="eyebrow">PRÓXIMOS COMPROMISSOS</p>
              <h2>Antecipe cobranças, parcelas e recebimentos.</h2>
              <p>Cadastre uma vez o que se repete. O Cifro projeta a ocorrência no próximo mês sem duplicar registros reais.</p>
            </section>

            <form className="planningForm" onSubmit={saveCommitment}>
              <div className="planningFormHeader">
                <div>
                  <p className="eyebrow">{editingId ? "EDITAR" : "NOVO PLANEJAMENTO"}</p>
                  <h3>{editingId ? "Ajuste este compromisso." : "O que deve entrar no futuro?"}</h3>
                </div>
                {editingId && <button className="cancelButton" type="button" onClick={cancelEditing}>Cancelar edição</button>}
              </div>

              <div className="planningFields">
                <label className="planningField planningWide">
                  <span>Nome</span>
                  <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ex.: Salário, Netflix ou parcela do notebook" maxLength={120} required />
                </label>
                <label className="planningField">
                  <span>Valor</span>
                  <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} placeholder="0,00" required />
                </label>
                <label className="planningField">
                  <span>Tipo</span>
                  <select value={form.direction} onChange={(event) => changeDirection(event.target.value)}>
                    <option value="expense">Gasto</option>
                    <option value="income">Recebimento</option>
                  </select>
                </label>
                <label className="planningField">
                  <span>Natureza</span>
                  <select value={form.commitment_type} onChange={(event) => changeCommitmentType(event.target.value)}>
                    <option value="recurring">Recorrente</option>
                    <option value="subscription">Assinatura</option>
                    <option value="installment">Parcela</option>
                  </select>
                </label>
                <label className="planningField">
                  <span>Frequência</span>
                  <select value={form.frequency} onChange={(event) => updateForm("frequency", event.target.value)}>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </label>
                {form.commitment_type !== "installment" && (
                  <label className="planningField">
                    <span>Regra da data</span>
                    <select value={form.due_rule} onChange={(event) => updateForm("due_rule", event.target.value)}>
                      <option value="fixed_day">Dia fixo do mês</option>
                      <option value="business_day">Dia útil do mês</option>
                    </select>
                  </label>
                )}
                {form.commitment_type !== "installment" && form.due_rule === "business_day" && (
                  <label className="planningField">
                    <span>Número do dia útil</span>
                    <input type="number" min="1" max="31" step="1" value={form.business_day_number} onChange={(event) => updateForm("business_day_number", event.target.value)} placeholder="Ex.: 5" required />
                  </label>
                )}
                <label className="planningField">
                  <span>Categoria <small>opcional</small></span>
                  <select value={form.category_id} onChange={(event) => updateForm("category_id", event.target.value)}>
                    <option value="">Sem categoria</option>
                    {compatibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="planningField">
                  <span>Começa em</span>
                  <input type="date" min="1900-01-01" max="2100-12-31" value={form.starts_on} onChange={(event) => updateForm("starts_on", event.target.value)} required />
                </label>
                <label className="planningField">
                  <span>{form.due_rule === "business_day" ? "Primeira ocorrência" : "Próxima ocorrência"}</span>
                  <input type="date" min="1900-01-01" max="2100-12-31" value={automaticNextDue} onChange={(event) => updateForm("next_due_on", event.target.value)} required={form.due_rule !== "business_day"} disabled={form.due_rule === "business_day"} />
                </label>
                <label className="planningField">
                  <span>Termina em <small>opcional</small></span>
                  <input type="date" min="1900-01-01" max="2100-12-31" value={form.ends_on} onChange={(event) => updateForm("ends_on", event.target.value)} />
                </label>
                {form.commitment_type === "installment" && (
                  <>
                    <label className="planningField">
                      <span>Parcela atual</span>
                      <input type="number" min="1" step="1" value={form.current_installment} onChange={(event) => updateForm("current_installment", event.target.value)} required />
                    </label>
                    <label className="planningField">
                      <span>Total de parcelas</span>
                      <input type="number" min="1" step="1" value={form.total_installments} onChange={(event) => updateForm("total_installments", event.target.value)} required />
                    </label>
                  </>
                )}
              </div>
              <p className="planningHint">Use “Dia útil” para regras como 5º dia útil. O Cifro conta segunda a sábado e não conta domingo; feriados ainda não entram nessa primeira versão.</p>
              {notice && <p className="notice" role="status">{notice}</p>}
              <div className="planningActions">
                <span>{editingId ? "As alterações afetam as próximas projeções." : "O compromisso não cria um gasto real agora."}</span>
                <button className="confirmButton" type="submit" disabled={busy}>{busy ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar ao planejamento"}</button>
              </div>
            </form>

            <section className="commitmentListSection" aria-labelledby="commitment-list-title">
              <div className="sectionHeader">
                <div><p className="eyebrow">AGENDA</p><h2 id="commitment-list-title">Cobranças e recebimentos</h2></div>
                <span className="seeAll">{loading ? "Atualizando" : `${commitments.length} ativos`}</span>
              </div>
              <div className="commitmentList">
                {!loading && commitments.length === 0 ? (
                  <p className="emptyState">Cadastre uma assinatura, parcela ou recebimento recorrente para começar a enxergar o próximo mês.</p>
                ) : commitments.map((commitment) => (
                  <div className="commitmentRow" key={commitment.id}>
                    <div className="commitmentDate"><strong>{commitment.next_due_on.slice(8, 10)}</strong><span>{formatMonth(commitment.next_due_on.slice(0, 7)).slice(0, 3)}</span></div>
                    <div className="commitmentInfo">
                      <strong>{commitment.name}</strong>
                      <span>{commitment.commitment_type === "subscription" ? "Assinatura" : commitment.commitment_type === "installment" ? `Parcela ${commitment.current_installment}/${commitment.total_installments}` : "Recorrente"} · {commitment.category_name || "Sem categoria"} · {commitment.due_rule === "business_day" ? `${commitment.business_day_number}º dia útil` : `dia ${commitment.next_due_on.slice(8, 10)}`} · {formatScheduleDate(commitment.next_due_on)}</span>
                    </div>
                    <b className={commitment.direction === "income" ? "income" : "expense"}>{commitment.direction === "income" ? "+" : "−"} {formatCurrency(commitment.amount)}</b>
                    <div className="rowActions"><button type="button" onClick={() => recordCommitment(commitment)} disabled={recordingId === commitment.id}>{recordingId === commitment.id ? "Registrando..." : "Registrar"}</button><button type="button" onClick={() => startEditing(commitment)}>Editar</button><button type="button" onClick={() => removeCommitment(commitment)}>Excluir</button></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="planningSummary" aria-labelledby="planning-summary-title">
            <p className="eyebrow">COMO FUNCIONA</p>
            <h2 id="planning-summary-title">O Cifro olha para frente.</h2>
            <div className="planningRules">
              <div><strong>Recorrentes</strong><span>Salário e contas mensais aparecem no próximo mês pelo dia cadastrado.</span></div>
              <div><strong>Parcelas</strong><span>Entram somente na data da próxima parcela, com o progresso visível.</span></div>
              <div><strong>Registros reais</strong><span>O planejamento não altera o saldo de hoje nem duplica uma movimentação.</span></div>
            </div>
            <Link className="asideLink" href="/">Voltar para a visão geral <span>→</span></Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function CategoriesView({ session, accountName, onLogout }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingKind, setEditingKind] = useState("expense");

  async function loadCategories() {
    setLoading(true);
    try {
      const data = await apiRequest("/api/v1/categories", session);
      setCategories(data);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, [session]);

  async function createCategory(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    setBusy(true);
    try {
      const category = await apiRequest("/api/v1/categories", session, {
        method: "POST",
        body: JSON.stringify({ name: cleanName, kind }),
      });
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setNotice(`Categoria “${category.name}” criada`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditing(category) {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingKind(category.kind);
    setNotice("");
  }

  async function saveCategory(categoryId) {
    const cleanName = editingName.trim();
    if (!cleanName) return;

    setBusy(true);
    try {
      const category = await apiRequest(`/api/v1/categories/${categoryId}`, session, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, kind: editingKind }),
      });
      setCategories((current) => current.map((item) => item.id === category.id ? category : item).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      setNotice(`Categoria “${category.name}” atualizada`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Excluir a categoria “${category.name}”? Os registros continuam salvos, mas ficarão sem categoria.`)) return;

    try {
      await apiRequest(`/api/v1/categories/${category.id}`, session, { method: "DELETE" });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      if (editingId === category.id) setEditingId(null);
      setNotice(`Categoria “${category.name}” excluída`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  const expenseCategoryCount = categories.filter((category) => category.kind === "expense" || category.kind === "both").length;
  const incomeCategoryCount = categories.filter((category) => category.kind === "income" || category.kind === "both").length;
  const sharedCategoryCount = categories.filter((category) => category.kind === "both").length;

  return (
    <main className="shell">
      <Sidebar active="categories" accountName={accountName} onLogout={onLogout} />
      <section className="content categoryContent">
        <header className="topbar">
          <div>
            <p className="eyebrow">ORGANIZAÇÃO</p>
            <h1>Suas categorias.</h1>
          </div>
          <Link className="backLink" href="/registrar">← Registrar</Link>
        </header>

        <div className="categoryLayout">
          <div className="categoryMain">
        <section className="categoryIntro">
          <p className="eyebrow">CATEGORIAS</p>
          <h2>Nomeie o que se repete na sua vida financeira.</h2>
          <p>Use categorias próprias para encontrar sentido nos registros, sem criar uma taxonomia enorme.</p>
        </section>

        <form className="categoryCreate" onSubmit={createCategory}>
          <div>
            <label htmlFor="new-category-name">Nova categoria</label>
            <input id="new-category-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Alimentação" maxLength={80} />
          </div>
          <div>
            <label htmlFor="new-category-kind">Usar para</label>
            <select id="new-category-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="expense">Gastos</option>
              <option value="income">Recebimentos</option>
              <option value="both">Os dois</option>
            </select>
          </div>
          <button className="confirmButton" type="submit" disabled={busy || !name.trim()}>{busy ? "Salvando..." : "Adicionar categoria"}</button>
        </form>

        {notice && <p className="notice" role="status">{notice}</p>}

        <section className="categoryListSection" aria-labelledby="category-list-title">
          <div className="sectionHeader">
            <div><p className="eyebrow">LISTA</p><h2 id="category-list-title">Categorias criadas</h2></div>
            <span className="seeAll">{loading ? "Atualizando" : `${categories.length} categorias`}</span>
          </div>
          <div className="categoryList">
            {!loading && categories.length === 0 ? (
              <p className="emptyState">Crie a primeira categoria para deixar seus registros mais claros.</p>
            ) : categories.map((category) => (
              <div className="categoryRow" key={category.id}>
                {editingId === category.id ? (
                  <>
                    <input className="categoryEditName" value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={80} aria-label={`Nome da categoria ${category.name}`} />
                    <select value={editingKind} onChange={(event) => setEditingKind(event.target.value)} aria-label={`Tipo da categoria ${category.name}`}>
                      <option value="expense">Gastos</option>
                      <option value="income">Recebimentos</option>
                      <option value="both">Os dois</option>
                    </select>
                    <div className="rowActions">
                      <button type="button" onClick={() => saveCategory(category.id)} disabled={busy}>Salvar</button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="categoryName"><span className="categoryDot" /> <strong>{category.name}</strong></div>
                    <span className="categoryKind">{categoryKindLabel(category.kind)}</span>
                    <div className="rowActions">
                      <button type="button" onClick={() => startEditing(category)}>Editar</button>
                      <button type="button" onClick={() => removeCategory(category)}>Excluir</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
          </div>

          <aside className="categorySummary" aria-labelledby="category-summary-title">
            <p className="eyebrow">RESUMO</p>
            <h2 id="category-summary-title">Organização simples.</h2>
            <strong className="categoryTotal">{categories.length}</strong>
            <span className="categoryTotalLabel">categorias criadas</span>
            <div className="summaryRows">
              <div><span>Para gastos</span><b>{expenseCategoryCount}</b></div>
              <div><span>Para recebimentos</span><b>{incomeCategoryCount}</b></div>
              <div><span>Para os dois</span><b>{sharedCategoryCount}</b></div>
            </div>
            <Link className="asideLink" href="/registrar">Registrar movimentação <span>→</span></Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function Home({ view = "dashboard" }) {
  const { session, authReady, authError: providerAuthError } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [notice, setNotice] = useState("");

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

  useEffect(() => {
    if (view !== "dashboard") return;
    if (session) loadDashboard(session);
    else setDashboard(null);
  }, [session, view]);

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
        error={providerAuthError || authError}
        busy={authBusy}
      />
    );
  }

  const accountName = session.user.email?.split("@")[0] || "Conta pessoal";

  if (view === "register") {
    return <RegisterView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  if (view === "categories") {
    return <CategoriesView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  if (view === "planning") {
    return <PlanningView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  if (view === "budget") {
    return <BudgetView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  if (view === "settings") {
    return <SettingsView session={session} accountName={accountName} onLogout={handleLogout} />;
  }

  if (view === "data") {
    return <DataView session={session} accountName={accountName} onLogout={handleLogout} />;
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
          <div className="periodButton" aria-label="Período atual">
            <span className="periodIcon" /> {formatMonth(dashboard?.month)} <b>—</b> {formatMonth(dashboard?.next_month)}
          </div>
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
              {dashboard?.budget ? (
                <div className="budgetDashboardPreview">
                  <div><span>Distribuição</span><Link href="/distribuicao">ajustar</Link></div>
                  <p><strong>{Number(dashboard.budget.total_percentage).toLocaleString("pt-BR")}%</strong> destinado em {dashboard.budget.allocation_count} categorias</p>
                  <small>{formatCurrency(dashboard.budget.unallocated_amount)} ainda sem destino</small>
                </div>
              ) : (
                <p className="commitmentEmpty">Sua renda ainda não foi dividida. <Link href="/distribuicao">Distribuir</Link></p>
              )}
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
              <Progress value={nextUsed} label={`${nextUsed}% comprometido`} detail={`${dashboard?.next_month_commitments?.length || 0} itens previstos`} accent />
              {dashboard?.next_month_commitments?.length ? (
                <div className="commitmentPreview">
                  <div className="commitmentPreviewHeader"><span>Próximas cobranças</span><Link href="/planejamento">ver todas</Link></div>
                  {dashboard.next_month_commitments.slice(0, 3).map((commitment) => (
                    <div className="commitmentPreviewRow" key={commitment.id}>
                      <span>{formatDate(commitment.next_due_on)}</span>
                      <strong>{commitment.name}</strong>
                      <b className={commitment.direction === "income" ? "income" : "expense"}>{commitment.direction === "income" ? "+" : "−"} {formatCurrency(commitment.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="commitmentEmpty">Nenhum compromisso previsto ainda. <Link href="/planejamento">Planejar</Link></p>
              )}
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
                    <div className="movementInfo"><strong>{movement.description}</strong><span>{movement.category_name || "Sem categoria"} · {formatDate(movement.occurred_on)}{movement.status === "planned" ? " · Pendente" : ""}</span></div>
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
