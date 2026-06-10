"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  MessageSquare,
  Wrench,
  BarChart3,
  ArrowRightLeft,
  FileText,
  ShieldCheck,
} from "lucide-react";

const LINKS = [
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
  { href: "/tools", label: "MCP tools", icon: Wrench },
  { href: "/evals", label: "Evals", icon: BarChart3 },
  { href: "/gateway", label: "Gateway", icon: ArrowRightLeft },
  { href: "/prompts", label: "Prompts", icon: FileText },
  { href: "/admin", label: "Advisor queue", icon: ShieldCheck },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="shrink-0 border-b bg-card">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-md bg-navy text-white"
        >
          <Landmark className="h-4 w-4" strokeWidth={2} />
        </span>
        <h1 className="text-sm font-semibold text-navy">IRAS Tax Assistant</h1>
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors sm:px-3 ${
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
      </div>
    </header>
  );
}
