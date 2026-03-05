"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type AuthPageClientProps = {
  mode: "login" | "register";
};

type AuthResponse = {
  error?: string;
};

function normalizeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/")) {
    return "/";
  }
  return raw;
}

export default function AuthPageClient({ mode }: AuthPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => normalizeNextPath(searchParams.get("next")), [searchParams]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const title = mode === "login" ? "登录" : "注册";
  const submitEndpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
  const switchHref = mode === "login" ? `/register?next=${encodeURIComponent(nextPath)}` : `/login?next=${encodeURIComponent(nextPath)}`;
  const switchLabel = mode === "login" ? "还没有账号？去注册" : "已有账号？去登录";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as AuthResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? `${title}失败`);
      }

      router.replace(nextPath);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `${title}失败`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{title}</h1>
        <p>使用用户名和密码继续。</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="3-32 位，小写字母/数字/_"
            autoComplete="username"
          />

          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 6 位"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          <button type="submit" disabled={loading}>
            {loading ? `${title}中...` : title}
          </button>
        </form>

        {error ? <p className="form-error">{error}</p> : null}

        <p className="auth-switch">
          <Link href={switchHref}>{switchLabel}</Link>
        </p>
      </section>
    </main>
  );
}
