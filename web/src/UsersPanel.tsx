import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "./auth";
import { Translate } from "./i18n";

export type ManagedUser = {
  id: number;
  username: string;
  role: string;
  mfa_enabled: boolean;
  is_active: boolean;
};

const ROLES = ["admin", "operator", "analyst", "viewer"] as const;

const ROLE_PERMISSIONS: Record<(typeof ROLES)[number], string[]> = {
  // Keep in sync with the API permission classes (apps/scans/permissions.py) and docs/security.md.
  admin: [
    "Full access: targets, groups, scans, findings, export, allowlist.",
    "Manage users and roles.",
    "System settings and integrations.",
    "View the audit log.",
  ],
  operator: [
    "Create and change targets, groups, and scans.",
    "Export findings and manage allowlist.",
    "Import targets and scan results.",
    "Edit findings: tags, notes and overrides (kept across rescans).",
    "Cannot manage users or system admin settings.",
  ],
  analyst: [
    "Read targets, groups, scans, and findings.",
    "Export findings (JSON / CSV / DefectDojo).",
    "Edit findings: tags, notes and overrides (kept across rescans).",
    "Import scan results (JSON / CSV).",
    "Cannot start scans or change inventory.",
  ],
  viewer: [
    "Read-only access to targets, groups, scans, and findings.",
    "Cannot export, scan, or change any data.",
  ],
};

type Props = {
  active: boolean;
  currentUsername: string;
  onUserUpdated?: (user: ManagedUser) => void;
  pushToast: (kind: "ok" | "error", title: string, message: string) => void;
  t: Translate;
};

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function UsersPanel({ active, currentUsername, onUserUpdated, pushToast, t }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("viewer");
  const [showRoleHelp, setShowRoleHelp] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const passwordsMatch = password.length === 0 || password === passwordConfirm;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    apiFetch("/api/auth/users/", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseError(response, t("Could not load users.")));
        return response.json() as Promise<{ results: ManagedUser[] }>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setUsers(payload.results);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        pushToast(
          "error",
          t("Users unavailable"),
          error instanceof Error ? error.message : t("Could not load users."),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, refreshKey, pushToast, t]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || busy) return;
    if (password !== passwordConfirm) {
      pushToast("error", t("User not created"), t("Passwords do not match."));
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/api/auth/users/", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          role,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, t("Could not create the user.")));
      }
      const created = (await response.json()) as ManagedUser;
      setUsername("");
      setPassword("");
      setPasswordConfirm("");
      setRole("viewer");
      pushToast("ok", t("User created"), `${created.username} · ${created.role}`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      pushToast(
        "error",
        t("User not created"),
        error instanceof Error ? error.message : t("Could not create the user."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(user: ManagedUser, nextRole: string) {
    if (nextRole === user.role || busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/auth/users/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, t("Could not update the user.")));
      }
      const updated = (await response.json()) as ManagedUser;
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      onUserUpdated?.(updated);
      pushToast("ok", t("Role updated"), `${user.username} → ${updated.role}`);
    } catch (error) {
      pushToast(
        "error",
        t("Role not updated"),
        error instanceof Error ? error.message : t("Could not update the user."),
      );
      setRefreshKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(user: ManagedUser) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/auth/users/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, t("Could not update the user.")));
      }
      pushToast(
        "ok",
        user.is_active ? t("User disabled") : t("User enabled"),
        user.username,
      );
      setRefreshKey((value) => value + 1);
    } catch (error) {
      pushToast(
        "error",
        t("User not updated"),
        error instanceof Error ? error.message : t("Could not update the user."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(user: ManagedUser) {
    if (busy) return;
    const message = t('Delete user "{name}"?').replace("{name}", user.username);
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/auth/users/${user.id}/`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        throw new Error(await parseError(response, t("Could not delete the user.")));
      }
      pushToast("ok", t("User deleted"), user.username);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      pushToast(
        "error",
        t("User not deleted"),
        error instanceof Error ? error.message : t("Could not delete the user."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;

  return (
    <>
      <header className="page-header">
        <h1>{t("Users & roles")}</h1>
        <p>{t("Manage accounts and RBAC roles. Only admins can change users.")}</p>
        <div className="scan-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn--normal"
            aria-expanded={showRoleHelp}
            aria-controls="role-permissions-panel"
            onClick={() => setShowRoleHelp((value) => !value)}
          >
            {showRoleHelp ? t("Hide role permissions") : t("Role permissions")}
          </button>
        </div>
      </header>

      {showRoleHelp && (
        <section className="panel" id="role-permissions-panel">
          <div className="panel__header">
            <h2>{t("Role permissions")}</h2>
          </div>
          <div className="panel__body">
            <p className="field-help" style={{ marginBottom: 12 }}>
              {t("What each RBAC role can do in SurfaceX.")}
            </p>
            <dl className="role-permissions">
              {ROLES.map((item) => (
                <div key={item} className="role-permissions__item">
                  <dt>
                    <span className="status-badge status-badge--completed">{t(item)}</span>
                  </dt>
                  <dd>
                    <ul>
                      {ROLE_PERMISSIONS[item].map((line) => (
                        <li key={line}>{t(line)}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel__header">
          <h2>{t("Create user")}</h2>
        </div>
        <form className="panel__body" onSubmit={onCreate} aria-busy={busy}>
          <div className="form-row">
            <label htmlFor="user-username">{t("Username")}</label>
            <input
              id="user-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
              disabled={busy}
            />
          </div>
          <div className="form-row">
            <label htmlFor="user-password">{t("Password")}</label>
            <input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={busy}
            />
          </div>
          <div className="form-row">
            <label htmlFor="user-password-confirm">{t("Repeat password")}</label>
            <input
              id="user-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={busy}
              aria-invalid={passwordConfirm.length > 0 && !passwordsMatch}
            />
            {passwordConfirm.length > 0 && !passwordsMatch && (
              <p className="field-help" role="alert">
                {t("Passwords do not match.")}
              </p>
            )}
          </div>
          <div className="form-row">
            <label htmlFor="user-role">{t("Role")}</label>
            <select
              id="user-role"
              className="input input--select"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              disabled={busy}
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
            <p className="field-help" id="user-role-help">
              {t(ROLE_PERMISSIONS[role][0])}
            </p>
          </div>
          <div className="scan-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={
                busy ||
                !username.trim() ||
                password.length < 8 ||
                passwordConfirm.length < 8 ||
                !passwordsMatch
              }
            >
              {busy ? t("Creating…") : t("Create user")}
            </button>
            <button
              type="button"
              className="btn btn--normal"
              onClick={() => setShowRoleHelp(true)}
            >
              {t("Role permissions")}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>{t("Accounts")}</h2>
          <span className="field-help">
            {users.length} {t("users")}
          </span>
        </div>
        <div className="table-wrap">
          {loading ? (
            <p className="field-help" role="status">
              {t("Loading…")}
            </p>
          ) : (
            <table className="hosts">
              <caption className="sr-only">{t("Accounts")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Username")}</th>
                  <th scope="col">{t("Role")}</th>
                  <th scope="col">{t("Status")}</th>
                  <th scope="col">{t("MFA")}</th>
                  <th scope="col">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.username === currentUsername;
                  return (
                    <tr key={user.id}>
                      <td className="mono">{user.username}</td>
                      <td>
                        <select
                          className="input input--select"
                          value={user.role}
                          disabled={busy || (isSelf && user.role === "admin")}
                          aria-label={`${t("Role")} ${user.username}`}
                          onChange={(e) => void onRoleChange(user, e.target.value)}
                        >
                          {ROLES.map((item) => (
                            <option key={item} value={item}>
                              {t(item)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            user.is_active ? "status-badge--completed" : "status-badge--cancelled"
                          }`}
                        >
                          {user.is_active ? t("Active") : t("Disabled")}
                        </span>
                      </td>
                      <td className="mono">{user.mfa_enabled ? t("On") : t("Off")}</td>
                      <td className="scan-actions">
                        <button
                          type="button"
                          className="btn btn--normal"
                          disabled={busy || isSelf}
                          onClick={() => void onToggleActive(user)}
                        >
                          {user.is_active ? t("Disable") : t("Enable")}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={busy || isSelf}
                          onClick={() => void onDelete(user)}
                        >
                          {t("Delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
