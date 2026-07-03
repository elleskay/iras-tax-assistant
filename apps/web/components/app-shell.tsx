"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Home,
  Boxes,
  MessageSquare,
  Files,
  Scale,
  LayoutDashboard,
  ScrollText,
  Lightbulb,
  Wrench,
  BarChart3,
  ArrowRightLeft,
  FileText,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ThemeToggle } from "./theme-toggle";

const GROUPS = [
  {
    label: "Workspace",
    links: [
      { href: "/documents", label: "Documents", icon: Files },
      { href: "/assistant", label: "Assistant", icon: MessageSquare },
    ],
  },
  {
    label: "Workspace AI settings",
    links: [
      { href: "/tools", label: "AI Tools", icon: Wrench },
      { href: "/prompts", label: "AI Instructions", icon: FileText },
    ],
  },
  {
    label: "Workspace Insights",
    links: [
      { href: "/insights", label: "Usage analytics", icon: Lightbulb },
      { href: "/gateway", label: "AI Gateway", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Platform-wide Governance",
    links: [
      { href: "/governance", label: "AI Dashboard", icon: LayoutDashboard },
      { href: "/governance/policy", label: "AI Policy", icon: Scale },
      { href: "/governance/audit", label: "AI Audit Trail", icon: ScrollText },
      { href: "/evals", label: "AI Evaluation", icon: BarChart3 },
    ],
  },
];

function NavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname !== href && !pathname.startsWith(href + "/")) return false;
    // A parent link (e.g. /governance) must not stay active on a child route
    // that has its own nav entry (e.g. /governance/policy or /governance/audit).
    return !GROUPS.some((group) =>
      group.links.some(
        (l) =>
          l.href !== href &&
          l.href.startsWith(href + "/") &&
          (pathname === l.href || pathname.startsWith(l.href + "/")),
      ),
    );
  };

  const itemClass = (active: boolean) =>
    cn(
      "flex h-9 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors duration-150",
      active
        ? "bg-secondary text-secondary-foreground shadow-[inset_3px_0_0_0_var(--primary)]"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    );

  // Labels stay in the DOM when the rail collapses (so accessible names and
  // the width tween survive); they fade and give up their width instead of
  // popping out.
  const labelClass = cn(
    "min-w-0 truncate transition-[opacity,width] duration-200 ease-out",
    collapsed ? "w-0 opacity-0" : "opacity-100",
  );

  const renderLink = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: typeof Home;
  }) => (
    <Link
      key={href}
      href={href}
      onClick={() => {
        onNavigate?.();
        // Clicking Assistant always opens a fresh chat, not the last one.
        // Already on the page: tell it to start a new chat now (no remount).
        // Arriving from elsewhere: flag it so the page loads a fresh chat.
        if (href === "/assistant") {
          if (window.location.pathname === "/assistant") {
            window.dispatchEvent(new Event("iras:new-chat"));
          } else {
            try {
              sessionStorage.setItem("iras-new-chat", "1");
            } catch {
              // ignore (private mode, etc.)
            }
          }
        }
      }}
      title={collapsed ? label : undefined}
      aria-current={isActive(href) ? "page" : undefined}
      className={itemClass(isActive(href))}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={labelClass}>{label}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6 px-7 py-5">
      {/* Landing page */}
      <nav className="flex flex-col gap-0.5">
        <Link
          href="/"
          onClick={onNavigate}
          title={collapsed ? "Landing page" : undefined}
          aria-current={pathname === "/" ? "page" : undefined}
          className={itemClass(pathname === "/")}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className={labelClass}>Landing page</span>
        </Link>
        {renderLink({ href: "/workspaces", label: "Workspaces", icon: Boxes })}
      </nav>

      {/* Each group is divided off by its caption (a rule when collapsed). The
          Workspace group leads with the workspace selector, below its caption. */}
      {GROUPS.map((group) => (
        <nav key={group.label} className="flex flex-col gap-0.5">
          {/* One fixed-height row: the caption text and the divider rule
              crossfade as the rail collapses, so nothing pops. */}
          <p className="flex h-6 items-center overflow-hidden whitespace-nowrap px-2.5">
            <span
              className={cn(
                "min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 transition-[opacity,width] duration-200 ease-out",
                collapsed ? "w-0 opacity-0" : "opacity-100",
              )}
            >
              {group.label}
            </span>
            <span
              aria-hidden
              className={cn(
                "border-t transition-[opacity,width] duration-200 ease-out",
                collapsed ? "w-full opacity-100" : "w-0 opacity-0",
              )}
            />
          </p>
          {group.label === "Workspace" ? (
            collapsed ? (
              <Link
                href="/workspaces"
                onClick={onNavigate}
                title="Switch workspace"
                aria-label="Switch workspace"
                className="flex h-9 items-center rounded-md border bg-card px-2.5 text-navy transition-colors hover:bg-accent"
              >
                <Building2 className="h-4 w-4 shrink-0" />
              </Link>
            ) : (
              <div className="mb-1">
                <WorkspaceSwitcher />
              </div>
            )
          ) : null}
          {group.links.map(renderLink)}
        </nav>
      ))}
    </div>
  );
}

/**
 * Console-style app shell: a thin top bar (logo + theme toggle) over a left
 * sidebar (workspace selector + grouped nav) and the scrolling content area.
 * The sidebar collapses to an icon rail via the button pinned at its bottom.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop rail
  // The width transition is enabled only after mount, so restoring a saved
  // collapsed state does not play the collapse animation on page load.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  // Escape closes the mobile drawer (the backdrop is click-only otherwise).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleCollapsed() {
    // Persist outside the setter: updaters must stay pure (StrictMode
    // double-invokes them).
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar: glassy, floats over the content scroll */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/75 px-7 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-from to-brand-to text-white shadow-soft ring-1 ring-white/20 ring-inset"
          >
            <Building2 className="h-4 w-4" />
          </span>
          <span
            className="text-sm font-semibold tracking-tight text-navy"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            AI Tax Assistant Platform
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden w-48 md:block lg:w-56">
            <WorkspaceSwitcher />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 self-start overflow-x-hidden border-r border-border/70 bg-[var(--sidebar)] md:flex md:flex-col",
            mounted && "transition-[width] duration-200 ease-out",
            collapsed ? "w-24" : "w-64",
          )}
        >
          <div className="flex-1 overflow-y-auto">
            <NavLinks collapsed={collapsed} />
          </div>
          <div className="border-t border-border/70 px-7 py-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              className="flex h-9 w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              ) : (
                <PanelLeftClose className="h-4 w-4 shrink-0" />
              )}
              <span
                className={cn(
                  "min-w-0 truncate transition-[opacity,width] duration-200 ease-out",
                  collapsed ? "w-0 opacity-0" : "opacity-100",
                )}
              >
                Collapse menu
              </span>
            </button>
          </div>
        </aside>

        {/* Mobile drawer (always full) */}
        {open ? (
          <>
            <div
              aria-hidden="true"
              className="fixed inset-0 top-16 z-30 bg-black/45 backdrop-blur-sm md:hidden"
              onClick={() => setOpen(false)}
            />
            <aside className="fixed bottom-0 left-0 top-16 z-40 w-72 overflow-y-auto border-r bg-[var(--sidebar)] md:hidden">
              <NavLinks onNavigate={() => setOpen(false)} />
            </aside>
          </>
        ) : null}

        {/* Content */}
        <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
