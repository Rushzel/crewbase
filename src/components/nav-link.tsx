"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${active ? "bg-brand/10 font-medium text-brand" : "text-ink hover:bg-canvas"}`}
    >
      {children}
    </Link>
  );
}
