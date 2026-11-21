"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import styles from "./monitor.module.css";

type Status = { ok: boolean | null; detail: string };
type AccessRow = { number: number; cells: string[]; eligible: boolean };
type CodeLog = { at: string; email: string; status: string };
type MonitorData = {
  checkedAt: string;
  health: { redis: Status; resend: Status; sheet: Status; cache?: Status };
  access: { headers: string[]; rows: AccessRow[] } | null;
  logs: CodeLog[] | null;
};
type Tab = "health" | "access" | "logs";

const statusLabels: Record<string, string> = {
  accepted: "Accepted by Resend",
  not_allowed: "Email has no access",
  resend_failed: "Resend send failed",
  sheet_failed: "Sheet lookup failed",
  store_failed: "Code store failed",
  rate_limited: "Request rate limited",
  suppressed: "Rate limit / cooldown",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

async function api(path: string, method: "GET" | "POST" = "GET", body: object = {}) {
  const result = await fetch(path, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || "Monitor request failed.");
  return data;
}

export default function MonitorClient({ initialAuthorized }: { initialAuthorized: boolean }) {
  const [authorized, setAuthorized] = useState(initialAuthorized);
  const [secretCode, setSecretCode] = useState("");
  const [tab, setTab] = useState<Tab>("health");
  const [data, setData] = useState<MonitorData | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (sync = false) => {
    setBusy(true);
    setError("");
    try {
      setData(await api("/api/monitor/data", sync ? "POST" : "GET"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Monitor request failed.");
      if (reason instanceof Error && reason.message === "Monitor access required.") {
        setAuthorized(false);
        setData(null);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!initialAuthorized) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [initialAuthorized, load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/monitor/login", "POST", { secretCode });
      setSecretCode("");
      setAuthorized(true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/api/monitor/logout", "POST");
      setAuthorized(false);
      setData(null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!data?.access) return [];
    const value = query.trim().toLowerCase();
    if (!value) return data.access.rows;
    const headers = data.access.headers.map((header) => header.trim().toLowerCase());
    const columns = [headers.indexOf("name"), headers.indexOf("email")].filter((index) => index >= 0);
    return data.access.rows.filter((row) => columns.some((index) => row.cells[index]?.toLowerCase().includes(value)));
  }, [data, query]);

  return (
    <main id="main" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Organizer tools</p>
            <h1>Access monitor</h1>
            <p className={styles.intro}>Check the services behind access codes and see who can request one.</p>
          </div>
          {authorized && <button className={styles.subtleButton} onClick={logout} disabled={busy}>Sign out</button>}
        </div>

        {!authorized ? (
          <form className={styles.login} onSubmit={login}>
            <label htmlFor="monitor-code">Monitor secret code</label>
            <input id="monitor-code" type="password" autoComplete="off" value={secretCode} onChange={(event) => setSecretCode(event.target.value)} required />
            <button className={styles.button} type="submit" disabled={busy}>{busy ? "Checking…" : "Open monitor"}</button>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Monitor sections">
              {([ ["health", "Connections"], ["access", "Available access"], ["logs", "Code requests"] ] as const).map(([key, label]) => (
                <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} className={tab === key ? styles.activeTab : styles.tab} onClick={() => setTab(key)}>{label}</button>
              ))}
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {!data ? <p className={styles.note}>Loading monitor…</p> : (
              <>
                <div className={styles.toolbar}>
                  <span>Checked {formatTime(data.checkedAt)} WIB</span>
                  <button className={styles.subtleButton} onClick={() => void load(tab === "access")} disabled={busy}>{busy ? "Refreshing…" : tab === "access" ? "Sync Google Sheet" : "Refresh"}</button>
                </div>
                {data.health.cache && <p className={data.health.cache.ok ? styles.good : styles.bad}>{data.health.cache.detail}</p>}
                <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
                  {tab === "health" && (
                    <>
                      <div className={styles.cards}>
                        {([ ["Redis", data.health.redis], ["Resend", data.health.resend], ["Google Sheet", data.health.sheet] ] as const).map(([label, state]) => (
                          <div className={styles.card} key={label}>
                            <h2>{label}</h2>
                            <p className={state.ok === true ? styles.good : state.ok === null ? styles.neutral : styles.bad}>{state.ok === true ? "Connected" : state.ok === null ? "Read check unavailable" : "Unavailable"}</p>
                            <p className={styles.detail}>{state.detail}</p>
                          </div>
                        ))}
                      </div>
                      <p className={styles.note}>The Resend check reads its API; it does not send a test email or confirm inbox delivery.</p>
                    </>
                  )}
                  {tab === "access" && (
                    <>
                      {data.access ? (
                        <>
                          <div className={styles.accessTools}>
                            <label htmlFor="access-search">Search name or email</label>
                            <input id="access-search" type="search" placeholder="Type a name or email" value={query} onChange={(event) => setQuery(event.target.value)} />
                            <span>{filteredRows.length} of {data.access.rows.length} rows</span>
                          </div>
                          <div className={styles.tableScroll}>
                            <table><thead><tr><th>Row</th>{data.access.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Column ${index + 1}`}</th>)}<th>Access</th></tr></thead>
                              <tbody>{filteredRows.map((row) => <tr key={row.number}><td>{row.number}</td>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}<td><span className={row.eligible ? styles.good : styles.bad}>{row.eligible ? "Available" : "No access"}</span></td></tr>)}</tbody>
                            </table>
                          </div>
                          {filteredRows.length === 0 && <p className={styles.note}>No matching rows.</p>}
                        </>
                      ) : <p className={styles.error}>Could not read the Google Sheet. Check the Connections tab.</p>}
                    </>
                  )}
                  {tab === "logs" && (
                    <>
                      <p className={styles.note}>Recent requests from this deployment onward. The newest 500 entries are kept for 7 days. “Accepted by Resend” means its API accepted the email, not that it reached the inbox.</p>
                      {data.logs ? (
                        <div className={styles.tableScroll}><table><thead><tr><th>Time (WIB)</th><th>Email</th><th>Status</th></tr></thead><tbody>
                          {data.logs.map((entry, index) => <tr key={`${entry.at}-${index}`}><td>{formatTime(entry.at)}</td><td>{entry.email}</td><td><span className={entry.status === "accepted" ? styles.good : styles.bad}>{statusLabels[entry.status] || entry.status}</span></td></tr>)}
                        </tbody></table></div>
                      ) : <p className={styles.error}>Could not read the Redis request log. Check the Connections tab.</p>}
                      {data.logs?.length === 0 && <p className={styles.note}>No requests recorded yet.</p>}
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
