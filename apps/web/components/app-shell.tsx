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
      "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
      active
        ? "bg-secondary text-secondary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5 px-7 py-4">
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
          {collapsed ? null : <span>Landing page</span>}
        </Link>
        {renderLink({ href: "/workspaces", label: "Workspaces", icon: Boxes })}
      </nav>

      {/* Each group is divided off by its caption (a rule when collapsed). The
          Workspace group leads with the workspace selector, below its caption. */}
      {GROUPS.map((group) => (
        <nav key={group.label} className="flex flex-col gap-0.5">
          {collapsed ? (
            <div className="flex h-5 items-center px-2.5">
              <span className="w-full border-t" />
            </div>
          ) : (
            <p className="flex h-5 items-center px-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
          )}
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

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    } catch {
      // ignore
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card px-7">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-from to-brand-to text-white"
          >
            <Building2 className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-navy">
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
            "sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 self-start border-r bg-card md:flex md:flex-col",
            collapsed ? "w-24" : "w-72",
          )}
        >
          <div className="flex-1 overflow-y-auto">
            <NavLinks collapsed={collapsed} />
          </div>
          <div className="border-t px-7 py-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4 shrink-0" /> Collapse menu
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Mobile drawer (always full) */}
        {open ? (
          <>
            <div
              className="fixed inset-0 top-16 z-30 bg-black/30 md:hidden"
              onClick={() => setOpen(false)}
            />
            <aside className="fixed bottom-0 left-0 top-16 z-40 w-72 overflow-y-auto border-r bg-card md:hidden">
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
