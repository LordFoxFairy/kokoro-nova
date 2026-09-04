"use client";

import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { AccountProfileResponse } from "@/contracts/account";
import { modelsFor, type ModelMedia } from "@/domain/models";
import { client } from "@/api/client";
import { api } from "@/lib/api";
import type { LedgerViewProjection } from "@/server/ledger-view";
import { EmptyState, Toggle } from "../ui/controls";
import {
  IconAgent,
  IconAudio,
  IconCharacter,
  IconChevronRight,
  IconCredit,
  IconGrid,
  IconHelp,
  IconHistory,
  IconImage,
  IconKey,
  IconRefresh,
  IconScript,
  IconSparkle,
  IconUndo,
  IconVideo,
} from "../icons";
import { LibTvLogo } from "../shell/LibTvLogo";
import { LedgerView } from "./LedgerView";
import {
  ACCOUNT_SECTIONS,
  moveAccountSection,
  sectionFromQuery,
} from "./account-navigation";

/** Rows fetched per collection; 加载更多 raises the shared limit by this much. */
const PAGE_SIZE = 20;

export type AccountRequestState =
  | "initial-loading"
  | "refreshing"
  | "ready"
  | "error"
  | "stale-error";

export function getAccountRequestState({
  loading,
  hasData,
  error,
}: {
  loading: boolean;
  hasData: boolean;
  error: string | null;
}): AccountRequestState {
  if (error) return hasData ? "stale-error" : "error";
  if (loading) return hasData ? "refreshing" : "initial-loading";
  return "ready";
}

const DARK_ACCOUNT_VARS = {
  "--color-canvas": "#111111",
  "--color-surface": "#191919",
  "--color-ink-900": "rgba(255,255,255,.94)",
  "--color-ink-800": "rgba(255,255,255,.86)",
  "--color-ink-700": "rgba(255,255,255,.78)",
  "--color-ink-600": "rgba(255,255,255,.58)",
  "--color-ink-500": "rgba(255,255,255,.44)",
  "--color-ink-400": "rgba(255,255,255,.34)",
  "--color-ink-300": "rgba(255,255,255,.24)",
  "--color-ink-200": "rgba(255,255,255,.13)",
  "--color-ink-100": "rgba(255,255,255,.08)",
  "--color-ink-50": "rgba(255,255,255,.045)",
  "--color-accent": "#60c9ef",
  "--color-accent-soft": "rgba(96,201,239,.12)",
  "--color-accent-ink": "#8bdcf5",
  "--color-running": "#ffd05a",
  "--color-danger": "#f16f74",
  "--color-success": "#62d49b",
} as CSSProperties;

const LIGHT_ACCOUNT_VARS = {
  "--color-canvas": "#f4f4f5",
  "--color-surface": "#ffffff",
  "--color-ink-900": "#1c1d20",
  "--color-ink-800": "#2a2c30",
  "--color-ink-700": "#42464d",
  "--color-ink-600": "#656b73",
  "--color-ink-500": "#80868e",
  "--color-ink-400": "#a0a5ab",
  "--color-ink-300": "#c4c8cd",
  "--color-ink-200": "#dde0e4",
  "--color-ink-100": "#eceef1",
  "--color-ink-50": "#f7f8f9",
  "--color-accent": "#3ba4d1",
  "--color-accent-soft": "#e0f4fb",
  "--color-accent-ink": "#18779e",
  "--color-running": "#d99c00",
  "--color-danger": "#d84f5b",
  "--color-success": "#2e9e6b",
} as CSSProperties;

export function AccountPage() {
  const searchParams = useSearchParams();
  const [section, setSection] = useState(() =>
    sectionFromQuery(searchParams.get("tab")),
  );
  const [profile, setProfile] = useState<AccountProfileResponse | null>(null);
  const [ledger, setLedger] = useState<LedgerViewProjection | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loadedLimit, setLoadedLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [watermark, setWatermark] = useState(true);
  const [recommendations, setRecommendations] = useState(true);
  const navRefs = useRef<
    Partial<Record<(typeof ACCOUNT_SECTIONS)[number]["id"], HTMLButtonElement>>
  >({});

  useEffect(() => {
    setSection(sectionFromQuery(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("libtv.account.theme");
      if (storedTheme === "light" || storedTheme === "dark")
        setTheme(storedTheme);
      const storedWatermark = window.localStorage.getItem(
        "libtv.account.watermark",
      );
      if (storedWatermark !== null) setWatermark(storedWatermark === "true");
      const storedRecommendations = window.localStorage.getItem(
        "libtv.account.recommendations",
      );
      if (storedRecommendations !== null)
        setRecommendations(storedRecommendations === "true");
    } catch {
      // Local storage is an optional convenience for this deterministic shell.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetching(true);
    setLoadError(null);
    void Promise.all([
      client.account.get(),
      api.get<LedgerViewProjection>(`/api/ledger?limit=${limit}`),
    ])
      .then(([nextProfile, nextLedger]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setLedger(nextLedger);
        setLoadedLimit(limit);
        setLastUpdated(new Date().toISOString());
      })
      // A failed refetch keeps the identity and ledger already on screen.
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "账户数据加载失败，请稍后重试",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setFetching(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, reloadToken]);

  const requestState = getAccountRequestState({
    loading,
    hasData: Boolean(profile && ledger),
    error: loadError,
  });
  const retry = () => setReloadToken((token) => token + 1);
  const accountVars = theme === "dark" ? DARK_ACCOUNT_VARS : LIGHT_ACCOUNT_VARS;
  const selected =
    ACCOUNT_SECTIONS.find((item) => item.id === section) ?? ACCOUNT_SECTIONS[0];

  const selectSection = (
    next: (typeof ACCOUNT_SECTIONS)[number]["id"],
    focus = false,
  ) => {
    setSection(next);
    if (focus)
      window.requestAnimationFrame(() => navRefs.current[next]?.focus());
  };

  return (
    <div
      data-testid="account-page"
      data-account-theme={theme}
      aria-busy={fetching}
      style={accountVars}
      className="min-h-[calc(100vh-64px)] bg-canvas text-ink-900"
    >
      <div className="mx-auto flex w-full max-w-[1240px] gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <aside
          className="hidden w-[220px] shrink-0 flex-col lg:flex"
          aria-label="账户导航"
        >
          <Link
            href="/"
            className="flex items-center gap-2 px-2 py-1.5 text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60c9ef] text-[#0e222a]">
              <LibTvLogo compact className="h-4 w-5" />
            </span>
            <span className="text-[14px] font-semibold tracking-tight">
              LibTV 账户
            </span>
          </Link>

          {profile ? (
            <IdentityMiniCard profile={profile} />
          ) : (
            <IdentityMiniSkeleton />
          )}

          <AccountNavigation
            active={section}
            unreadCount={profile?.unreadCount ?? 0}
            navRefs={navRefs}
            onSelect={selectSection}
          />

          <div className="mt-auto space-y-1 border-t border-ink-100 pt-4">
            <Link
              href="/"
              className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconGrid size={17} />
              返回工作台
            </Link>
            <Link
              href="/account?tab=credentials"
              className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconHelp size={17} />
              帮助与支持
            </Link>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-4 lg:hidden">
            <label
              htmlFor="account-mobile-navigation"
              className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400"
            >
              Account
            </label>
            <select
              id="account-mobile-navigation"
              aria-label="账户设置"
              value={section}
              onChange={(event) =>
                selectSection(
                  event.target.value as (typeof ACCOUNT_SECTIONS)[number]["id"],
                )
              }
              className="h-9 w-full rounded-lg border border-ink-200 bg-surface px-2.5 text-[13px] text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {ACCOUNT_SECTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-[12px] text-ink-500 hover:text-ink-900 lg:hidden"
              >
                LibTV
              </Link>
              <span className="text-ink-300 lg:hidden">/</span>
              <span className="text-[13px] text-ink-600">账户中心</span>
              <IconChevronRight size={14} className="text-ink-400" />
              <span className="text-[13px] font-medium text-ink-900">
                {selected.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-600"
                data-testid="account-balance-pill"
              >
                <IconCredit
                  size={14}
                  className="text-running"
                  aria-hidden="true"
                />
                <span className="tabular-nums">
                  {profile?.wallet.availableCredits ?? 0}
                </span>
              </div>
              <button
                type="button"
                data-testid="account-refresh"
                aria-label="刷新账户与积分"
                aria-busy={fetching}
                onClick={retry}
                disabled={fetching}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-wait disabled:text-ink-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconRefresh
                  size={13}
                  className={fetching ? "animate-spin" : undefined}
                />
                {fetching ? "刷新中" : "刷新"}
              </button>
            </div>
          </header>

          <div className="flex items-start justify-between gap-4 py-5">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
                {selected.label}
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-600">
                管理身份、积分、会员权益和创作偏好。
              </p>
            </div>
            <div
              className="hidden text-right text-[11px] text-ink-500 sm:block"
              data-testid="account-refresh-status"
              role="status"
              aria-live="polite"
            >
              {requestState === "initial-loading"
                ? "正在加载账户…"
                : requestState === "refreshing"
                  ? "正在刷新账户…"
                  : lastUpdated
                    ? `已更新 ${formatUpdatedAt(lastUpdated)}`
                    : ""}
            </div>
          </div>

          {loading && !profile && !ledger ? (
            <AccountSkeleton />
          ) : profile && ledger ? (
            <>
              {loadError && (
                <div
                  className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/10 px-3.5 py-2.5 text-[12px] text-danger"
                  role="alert"
                >
                  <span>刷新失败，仍显示上次成功读取的账户：{loadError}</span>
                  <button
                    type="button"
                    data-testid="account-retry"
                    onClick={retry}
                    disabled={fetching}
                    aria-busy={fetching}
                    className="rounded-lg bg-surface px-3 py-1.5 font-medium text-danger ring-1 ring-danger/20 hover:bg-danger/10 disabled:cursor-wait disabled:text-ink-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                  >
                    重试
                  </button>
                </div>
              )}
              <div
                id={`account-panel-${section}`}
                role="tabpanel"
                aria-labelledby={`account-tab-${section}`}
                tabIndex={-1}
                className="outline-none"
              >
                {section === "overview" && (
                  <Overview
                    profile={profile}
                    ledger={ledger}
                    onOpenWallet={() => selectSection("wallet")}
                  />
                )}
                {section === "wallet" && (
                  <WalletSection
                    profile={profile}
                    ledger={ledger}
                    loadedLimit={loadedLimit}
                    fetching={fetching}
                    onLoadMore={() =>
                      setLimit((current) => current + PAGE_SIZE)
                    }
                  />
                )}
                {section === "membership" && (
                  <MembershipSection profile={profile} />
                )}
                {section === "notifications" && (
                  <NotificationsSection profile={profile} />
                )}
                {section === "preferences" && (
                  <PreferencesSection
                    theme={theme}
                    watermark={watermark}
                    recommendations={recommendations}
                    onThemeChange={(next) => {
                      setTheme(next);
                      try {
                        window.localStorage.setItem(
                          "libtv.account.theme",
                          next,
                        );
                      } catch {
                        /* session-only fallback */
                      }
                    }}
                    onWatermarkChange={(next) => {
                      setWatermark(next);
                      try {
                        window.localStorage.setItem(
                          "libtv.account.watermark",
                          String(next),
                        );
                      } catch {
                        /* session-only fallback */
                      }
                    }}
                    onRecommendationsChange={(next) => {
                      setRecommendations(next);
                      try {
                        window.localStorage.setItem(
                          "libtv.account.recommendations",
                          String(next),
                        );
                      } catch {
                        /* session-only fallback */
                      }
                    }}
                  />
                )}
                {section === "credentials" && (
                  <CredentialsSection profile={profile} />
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<IconCredit size={30} />}
              title="账户数据加载失败"
              description={loadError ?? "暂时没有读到账户数据。"}
              action={
                <button
                  type="button"
                  data-testid="account-retry"
                  onClick={retry}
                  disabled={fetching}
                  aria-busy={fetching}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-wait disabled:bg-ink-200 disabled:text-ink-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconRefresh
                    size={14}
                    className={fetching ? "animate-spin" : undefined}
                  />
                  {fetching ? "重试中…" : "重试"}
                </button>
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function AccountNavigation({
  active,
  unreadCount,
  navRefs,
  onSelect,
}: {
  active: (typeof ACCOUNT_SECTIONS)[number]["id"];
  unreadCount: number;
  navRefs: MutableRefObject<
    Partial<Record<(typeof ACCOUNT_SECTIONS)[number]["id"], HTMLButtonElement>>
  >;
  onSelect: (
    section: (typeof ACCOUNT_SECTIONS)[number]["id"],
    focus?: boolean,
  ) => void;
}) {
  return (
    <nav
      className="mt-6"
      aria-label="账户设置"
      role="tablist"
      aria-orientation="vertical"
    >
      <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
        Account
      </div>
      <div className="space-y-0.5">
        {ACCOUNT_SECTIONS.map((item) => {
          const isActive = active === item.id;
          const Icon = iconForSection(item.id);
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) navRefs.current[item.id] = node;
              }}
              id={`account-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`account-panel-${item.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                const next = moveAccountSection(item.id, event.key);
                if (!next) return;
                event.preventDefault();
                onSelect(next, true);
              }}
              className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isActive ? "bg-ink-100 font-medium text-ink-900" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"}`}
            >
              <Icon size={17} />
              <span className="flex-1">{item.label}</span>
              {item.id === "notifications" && unreadCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ed5470] px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
              {isActive && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function iconForSection(section: (typeof ACCOUNT_SECTIONS)[number]["id"]) {
  if (section === "overview") return IconCharacter;
  if (section === "wallet") return IconCredit;
  if (section === "membership") return IconSparkle;
  if (section === "notifications") return IconHistory;
  if (section === "preferences") return IconGrid;
  return IconKey;
}

function IdentityMiniCard({ profile }: { profile: AccountProfileResponse }) {
  return (
    <div
      className="mt-7 rounded-xl border border-ink-100 bg-ink-50 p-3"
      data-testid="account-identity-mini"
    >
      <div className="flex items-center gap-2.5">
        <Avatar initial={profile.identity.avatarInitial} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-ink-900">
            {profile.identity.displayName}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-ink-500">
            {profile.identity.maskedAccount}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-500">
        <span>UUID 已脱敏</span>
        <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-ink-600">
          {profile.membership.label}
        </span>
      </div>
    </div>
  );
}

function IdentityMiniSkeleton() {
  return (
    <div
      className="mt-7 h-[82px] animate-pulse rounded-xl bg-ink-50"
      aria-label="正在加载账户身份"
    />
  );
}

function Avatar({
  initial,
  size = "md",
}: {
  initial: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "h-12 w-12 text-[19px]"
      : size === "sm"
        ? "h-8 w-8 text-[12px]"
        : "h-10 w-10 text-[15px]";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e6d7ff] to-[#6575f5] font-semibold text-[#1b2148] ${sizeClass}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

function Overview({
  profile,
  ledger,
  onOpenWallet,
}: {
  profile: AccountProfileResponse;
  ledger: LedgerViewProjection;
  onOpenWallet: () => void;
}) {
  const settled = ledger.totals.spent - ledger.totals.held;
  return (
    <div className="space-y-5">
      <section
        className="rounded-2xl border border-ink-100 bg-surface p-5 shadow-[0_16px_40px_rgba(0,0,0,.14)] sm:p-6"
        data-testid="account-identity-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar initial={profile.identity.avatarInitial} size="lg" />
            <div className="min-w-0">
              <div className="text-[17px] font-semibold text-ink-900">
                {profile.identity.maskedAccount}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-500">
                <span>UUID {profile.identity.uuidMasked}</span>
                <span className="text-ink-300">·</span>
                <span>{profile.identity.accessKeyLabel}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 text-[12px] text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconPlusGlyph />
            创建团队
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenWallet}
            className="rounded-xl border border-ink-100 bg-ink-50 p-4 text-left transition-colors hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <div className="flex items-center justify-between text-[12px] text-accent-ink">
              <span className="font-medium">积分余额</span>
              <IconChevronRight size={14} />
            </div>
            <div className="mt-2 flex items-end gap-1.5">
              <IconCredit size={20} className="mb-1 text-running" />
              <span className="text-[28px] font-semibold leading-none tabular-nums text-ink-900">
                {profile.wallet.availableCredits}
              </span>
              <span className="mb-0.5 text-[11px] text-ink-500">点</span>
            </div>
            <div className="mt-2 text-[11px] text-ink-500">
              通用 {profile.wallet.commonCredits} · LibTV{" "}
              {profile.wallet.libTvCredits}
            </div>
          </button>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
            <div className="flex items-center justify-between text-[12px] text-ink-600">
              <span>存储空间</span>
              <span className="text-ink-900">管理资产</span>
            </div>
            <div className="mt-2 text-[24px] font-semibold leading-none tabular-nums text-ink-900">
              {profile.wallet.storageUsedGb}G{" "}
              <span className="text-[13px] font-normal text-ink-500">
                / {profile.wallet.storageTotalGb}G
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200">
              <div className="h-full w-0 rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section
          className="rounded-2xl border border-ink-100 bg-surface p-5"
          data-testid="account-membership-card"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium text-ink-900">
                {profile.membership.label}
              </div>
              <div className="mt-1 text-[12px] text-ink-500">
                活动权益：{profile.membership.benefit}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenWallet}
              className="rounded-full bg-[#201e17] px-3 py-1.5 text-[11px] font-medium text-[#f0c777] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              开通会员
            </button>
          </div>
          <div className="mt-4 rounded-lg bg-[#2a2519] px-3 py-2 text-[11px] text-[#d6c8a7]">
            {profile.membership.benefit} · 有效期{" "}
            {profile.membership.daysRemaining} 天
          </div>
        </section>
        <section
          className="rounded-2xl border border-ink-100 bg-surface p-5"
          data-testid="account-ledger-teaser"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-ink-900">积分动态</h2>
            <button
              type="button"
              onClick={onOpenWallet}
              className="text-[11px] text-accent-ink hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              查看明细
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="获取" value={ledger.totals.earned} />
            <MiniStat label="已结算" value={settled} />
            <MiniStat label="返还" value={ledger.totals.returned} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-500">
            <IconUndo size={13} />
            失败、取消或拦截会全额返还冻结积分
          </div>
        </section>
      </div>
      <section
        className="rounded-2xl border border-ink-100 bg-surface p-5"
        data-testid="account-quick-links"
      >
        <h2 className="text-[13px] font-medium text-ink-900">账户快捷入口</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <QuickLink
            icon={<IconCharacter size={16} />}
            title="个人中心"
            description="发布、点赞与资料"
          />
          <QuickLink
            icon={<IconHistory size={16} />}
            title="通知中心"
            description={`${profile.unreadCount} 条未读通知`}
          />
          <QuickLink
            icon={<IconKey size={16} />}
            title="CLI & Skill"
            description="本地创作工具与凭据"
          />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-3 text-ink-600">
      <span className="text-accent-ink">{icon}</span>
      <span>
        <span className="block text-[12px] font-medium text-ink-900">
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-500">
          {description}
        </span>
      </span>
      <IconChevronRight size={14} className="ml-auto text-ink-400" />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink-50 px-2.5 py-2">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums text-ink-900">
        {value}
      </div>
    </div>
  );
}

function WalletSection({
  profile,
  ledger,
  loadedLimit,
  fetching,
  onLoadMore,
}: {
  profile: AccountProfileResponse;
  ledger: LedgerViewProjection;
  loadedLimit: number;
  fetching: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-8">
      <section
        className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft to-ink-50 p-5 sm:p-6"
        data-testid="account-wallet-summary"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-medium text-accent-ink">
              可用积分
            </div>
            <div className="mt-2 flex items-end gap-2">
              <IconCredit size={25} className="mb-1 text-running" />
              <span className="text-[40px] font-semibold leading-none tabular-nums text-ink-900">
                {profile.wallet.availableCredits}
              </span>
              <span className="mb-1 text-[12px] text-ink-500">点</span>
            </div>
            <div className="mt-2 text-[12px] text-ink-600">
              通用 {profile.wallet.commonCredits} 点{" "}
              <span className="mx-1 text-ink-300">|</span> LibTV{" "}
              {profile.wallet.libTvCredits} 点
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-[#10222b] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              充值
            </button>
            <button
              type="button"
              className="rounded-lg border border-ink-200 px-3 py-2 text-[12px] text-ink-700 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              设置消耗顺序
            </button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="累计获取" value={ledger.totals.earned} />
          <MiniStat
            label="已结算消耗"
            value={ledger.totals.spent - ledger.totals.held}
          />
          <MiniStat label="已返还" value={ledger.totals.returned} />
          <MiniStat label="冻结中" value={ledger.totals.held} />
        </div>
      </section>
      <CostGuide />
      <LedgerView
        earned={ledger.earned}
        spent={ledger.spent}
        returned={ledger.returned}
        counts={ledger.counts}
        jobs={ledger.jobs}
        limit={loadedLimit}
        loadingMore={fetching}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

function MembershipSection({ profile }: { profile: AccountProfileResponse }) {
  return (
    <div className="max-w-3xl space-y-5">
      <section
        className="rounded-2xl border border-ink-100 bg-surface p-6"
        data-testid="account-membership-detail"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <IconSparkle size={18} className="text-[#edbd5b]" />
              <h2 className="text-[17px] font-semibold text-ink-900">
                {profile.membership.label}
              </h2>
            </div>
            <p className="mt-2 text-[13px] text-ink-600">
              当前权益：{profile.membership.benefit}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#e7b758] px-3.5 py-2 text-[12px] font-medium text-[#261d0d] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            开通会员
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Benefit label="视频模型" value="Seedance 2.5" />
          <Benefit label="当前折扣" value="限时 5 折" />
          <Benefit
            label="有效期"
            value={`${profile.membership.daysRemaining} 天`}
          />
        </div>
      </section>
      <section className="rounded-2xl border border-ink-100 bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-ink-900">订阅与开发票</h2>
          <span className="text-[11px] text-ink-500">本地样本状态</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
          购买记录、订阅计划和发票入口会与共享账户保持同一登录态。
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-ink-200 px-3 py-2 text-[12px] text-ink-700 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          查看购买记录
        </button>
      </section>
    </div>
  );
}

function Benefit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-4 py-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className="mt-1 text-[13px] font-medium text-ink-900">{value}</div>
    </div>
  );
}

function NotificationsSection({
  profile,
}: {
  profile: AccountProfileResponse;
}) {
  const [tab, setTab] = useState<"official" | "likes">("official");
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div
          className="flex rounded-lg bg-ink-50 p-1"
          role="tablist"
          aria-label="通知类型"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "official"}
            onClick={() => setTab("official")}
            className={`rounded-md px-3 py-1.5 text-[12px] ${tab === "official" ? "bg-surface font-medium text-ink-900 shadow-sm" : "text-ink-500"}`}
          >
            官方通知{" "}
            {profile.unreadCount > 0 && (
              <span className="ml-1 text-danger">{profile.unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "likes"}
            onClick={() => setTab("likes")}
            className={`rounded-md px-3 py-1.5 text-[12px] ${tab === "likes" ? "bg-surface font-medium text-ink-900 shadow-sm" : "text-ink-500"}`}
          >
            收到的喜欢
          </button>
        </div>
        <button
          type="button"
          className="text-[12px] text-accent-ink hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          一键已读
        </button>
      </div>
      {tab === "official" ? (
        profile.notifications.map((notice) => (
          <article
            key={notice.id}
            className="rounded-xl border border-ink-100 bg-surface p-4"
            data-testid={`account-notice-${notice.id}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                <IconAgent size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[13px] font-medium text-ink-900">
                    {notice.title}
                  </h2>
                  <time className="text-[11px] text-ink-500">
                    {formatDate(notice.createdAt)}
                  </time>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
                  {notice.body}
                </p>
                <button
                  type="button"
                  className="mt-3 text-[11px] text-accent-ink hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  展开详情 <IconChevronRight size={12} className="inline" />
                </button>
              </div>
            </div>
          </article>
        ))
      ) : (
        <EmptyState
          icon={<IconHistory size={28} />}
          title="暂无收到的喜欢"
          description="当有人喜欢你的作品时，会在这里看到通知。"
        />
      )}
    </div>
  );
}

function PreferencesSection({
  theme,
  watermark,
  recommendations,
  onThemeChange,
  onWatermarkChange,
  onRecommendationsChange,
}: {
  theme: "light" | "dark";
  watermark: boolean;
  recommendations: boolean;
  onThemeChange: (theme: "light" | "dark") => void;
  onWatermarkChange: (next: boolean) => void;
  onRecommendationsChange: (next: boolean) => void;
}) {
  return (
    <div className="max-w-3xl space-y-5">
      <section
        className="rounded-2xl border border-ink-100 bg-surface p-5"
        data-testid="account-preferences"
      >
        <div className="border-b border-ink-100 pb-4">
          <h2 className="text-[14px] font-medium text-ink-900">显示偏好</h2>
          <p className="mt-1 text-[12px] text-ink-500">
            主题选择即时生效，并保存在当前浏览器。
          </p>
          <div className="mt-4 flex gap-2">
            <ThemeButton
              active={theme === "light"}
              onClick={() => onThemeChange("light")}
              label="浅色"
              icon="☼"
            />
            <ThemeButton
              active={theme === "dark"}
              onClick={() => onThemeChange("dark")}
              label="深色"
              icon="◐"
            />
          </div>
        </div>
        <div className="divide-y divide-ink-100 pt-3">
          <Toggle
            checked={watermark}
            onChange={onWatermarkChange}
            label="AI 水印"
            description="为生成内容添加 AI 生成明水印"
          />
          <Toggle
            checked={recommendations}
            onChange={onRecommendationsChange}
            label="个性化推荐"
            description="根据创作偏好调整首页与模型推荐"
          />
        </div>
      </section>
      <section className="rounded-2xl border border-ink-100 bg-surface p-5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-900">
          <IconHelp size={16} className="text-accent-ink" />
          AI 内容标识规则
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
          关闭明水印后，发布未带显式水印的 AI
          内容时，仍需依法主动声明并完成标识。
        </p>
        <button
          type="button"
          className="mt-3 text-[11px] text-accent-ink hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          查看完整规则 <IconChevronRight size={12} className="inline" />
        </button>
      </section>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? "border-accent bg-accent-soft text-accent-ink" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

function CredentialsSection({ profile }: { profile: AccountProfileResponse }) {
  return (
    <div className="max-w-3xl space-y-5">
      <section
        className="rounded-2xl border border-ink-100 bg-surface p-5"
        data-testid="account-credentials"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink-900">
              <IconKey size={17} className="text-accent-ink" />
              CLI &amp; Skill
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
              使用 Access Key 将共享账户连接到本地 CLI 与 Skill 工具。
            </p>
          </div>
          <span className="rounded-full bg-ink-50 px-2 py-1 text-[10px] text-ink-500">
            {profile.identity.accessKeyLabel}
          </span>
        </div>
        <div className="mt-5 rounded-xl border border-dashed border-ink-200 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[12px] text-ink-600">
              •••• •••• •••• ••••
            </span>
            <button
              type="button"
              className="rounded-lg border border-ink-200 px-3 py-1.5 text-[11px] text-ink-700 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              创建 Access Key
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            本地样本只展示脱敏入口，不写入真实凭据。
          </p>
        </div>
      </section>
      <section className="rounded-2xl border border-ink-100 bg-surface p-5">
        <h2 className="text-[13px] font-medium text-ink-900">可用作用域</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[11px] text-ink-600">
            读取账户
          </span>
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[11px] text-ink-600">
            创建任务
          </span>
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[11px] text-ink-600">
            读取资产
          </span>
        </div>
      </section>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="正在加载账户">
      <div className="h-[220px] animate-pulse rounded-2xl bg-ink-50" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="h-[150px] animate-pulse rounded-2xl bg-ink-50" />
        <div className="h-[150px] animate-pulse rounded-2xl bg-ink-50" />
      </div>
    </div>
  );
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function IconPlusGlyph() {
  return (
    <span className="text-[16px] leading-none" aria-hidden="true">
      ＋
    </span>
  );
}

const COST_GROUPS: {
  media: ModelMedia;
  label: string;
  icon: ReactNode;
  hint: string;
}[] = [
  {
    media: "image",
    label: "图片生成",
    icon: <IconImage size={15} />,
    hint: "按分辨率、画质与张数叠加",
  },
  {
    media: "video",
    label: "视频生成",
    icon: <IconVideo size={15} />,
    hint: "按时长、分辨率与是否生成音频叠加",
  },
  {
    media: "audio",
    label: "语音与音乐",
    icon: <IconAudio size={15} />,
    hint: "按模型与时长计费",
  },
  {
    media: "text",
    label: "脚本与提示词",
    icon: <IconScript size={15} />,
    hint: "分镜拆解与 Agent 调用",
  },
];

/** Prices come from the same catalog the confirm gate quotes from. */
function CostGuide() {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-ink-900">积分用在哪里</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
        只有生成会花积分：建节点、连边、整理画布和发布作品都不计费。
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COST_GROUPS.map((group) => {
          const models = modelsFor(group.media);
          const cheapest = Math.min(
            ...models.map((model) => model.baseCredits),
          );
          return (
            <div
              key={group.media}
              className="rounded-xl border border-ink-100 bg-surface px-4 py-3.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-ink-600">{group.icon}</span>
                <span className="text-[13px] font-medium text-ink-900">
                  {group.label}
                </span>
                <span className="ml-auto flex items-center gap-0.5 text-[12px] tabular-nums text-ink-600">
                  <IconCredit size={12} className="text-running" />
                  {cheapest} 起
                </span>
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-ink-600">
                {group.hint}
              </div>
              <div className="mt-1 text-[11px] text-ink-500">
                {models.length} 个可选模型
              </div>
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-ink-600">
        <li>
          · 确认生成时冻结的是报价单上的合计值，报价超过 10
          分钟未确认会失效并重新计算。
        </li>
        <li>· 实际产出少于预期时，多冻结的部分会在结算的同时退回。</li>
        <li>· 同一次生成重试或回调重复到达都只记一笔，不会重复扣费。</li>
      </ul>
    </section>
  );
}
