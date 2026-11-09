"use client";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, Globe, Landmark, LogOut, Moon, RotateCcw, Search, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/components/shared/page";
import { UserAvatar } from "@/components/shared/display";
import { AccessDeniedState, LoadingSkeleton } from "@/components/shared/states";
import { NAVIGATION, ROUTE_PERMISSIONS } from "@/config/navigation";
import { useAction } from "@/hooks/use-action";
import { authApi } from "@/lib/api/auth";
import { API_MODE } from "@/lib/api/client";
import { notificationsApi } from "@/lib/api/notifications";
import { orgApi } from "@/lib/api/platform";
import { useAuth, useCan } from "@/lib/auth/store";
import { useLocale, useT } from "@/lib/i18n/store";
import { landingRoute, ROLE_NAMES, ROLES, type RoleCode } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function SidebarNav() {
  const pathname = usePathname();
  const can = useCan();
  const t = useT();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = useMemo(() => NAVIGATION.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perms)) })).filter((g) => g.items.length), [can]);
  const allHrefs = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.href)), [groups]);
  const activeHref = allHrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  const activeGroup = groups.find((g) => g.items.some((i) => i.href === activeHref))?.label;
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label={t("Main navigation")}>
      {groups.map((g) => {
        const open = closed[g.label] === undefined ? g.label === activeGroup || groups.length <= 4 : !closed[g.label];
        return (
          <Collapsible key={g.label} open={open} onOpenChange={(next) => setClosed((c) => ({ ...c, [g.label]: !next }))}>
            <SidebarGroup className="py-1">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="w-full justify-between">
                  {t(g.label)}<ChevronDown className={cn("transition-transform", !open && "-rotate-90")} aria-hidden />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((item) => {
                      const active = item.href === activeHref;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={active}>
                            <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }}>
                              <item.icon aria-hidden /><span>{t(item.label)}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        );
      })}
    </nav>
  );
}

function Brand() {
  const t = useT();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg">
          <Link href="/">
            <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Landmark className="size-4" aria-hidden /></span>
            <span className="truncate font-semibold">{t("Loan Management System")}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  const results = useQuery({ queryKey: ["search", q], queryFn: ({ signal }) => orgApi.search(q, signal), enabled: q.length >= 2 });
  return (
    <>
      <Button variant="outline" size="sm" className="w-9 justify-start px-2 text-muted-foreground sm:w-56" onClick={() => setOpen(true)} aria-label={t("Global search")}>
        <Search className="size-4" aria-hidden /><span className="hidden truncate sm:inline">{t("Search borrowers, loans…")}</span><kbd className="ml-auto hidden rounded border px-1 text-[10px] lg:inline">Ctrl K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="overflow-hidden p-0" showCloseButton={false}><DialogTitle className="sr-only">{t("Global search")}</DialogTitle><DialogDescription className="sr-only">{t("Search borrowers, loans and applications")}</DialogDescription><Command shouldFilter={false}>
        <CommandInput placeholder={t("Type a name, code, phone or account number")} value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{t(q.length < 2 ? "Type at least two characters" : "No records found")}</CommandEmpty>
          {(results.data?.items.length ?? 0) > 0 && <CommandGroup heading={t("Results")}>
            {results.data!.items.map((r) => <CommandItem key={r.href} value={r.href} onSelect={() => { setOpen(false); setQ(""); router.push(r.href); }}><Badge variant="secondary">{t(r.type)}</Badge><span className="font-medium">{r.label}</span><span className="truncate text-xs text-muted-foreground">{r.sublabel}</span></CommandItem>)}
          </CommandGroup>}
        </CommandList>
      </Command></DialogContent></Dialog>
    </>
  );
}

function NotificationBell() {
  const t = useT();
  const q = useQuery({ queryKey: ["list", "bell"], queryFn: ({ signal }) => notificationsApi.list({ read: "false", limit: 6 }, signal), refetchInterval: 60_000 });
  const unread = q.data?.total ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t("Notifications")} (${unread})`}>
          <Bell className="size-4" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("Notifications")}</DropdownMenuLabel><DropdownMenuSeparator />
        {(q.data?.items ?? []).map((n) => <DropdownMenuItem key={n.id} asChild><Link href={`/notifications/${n.id}`} className="flex flex-col items-start gap-0.5"><span className="text-sm font-medium">{t(n.title)}</span><span className="line-clamp-2 text-xs text-muted-foreground">{t(n.message)}</span></Link></DropdownMenuItem>)}
        {unread === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("No unread notifications")}</p>}
        <DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/notifications" className="justify-center text-primary">{t("View all")}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t("Language")}><Globe className="size-4" aria-hidden />{locale === "km" ? "ខ្មែរ" : "EN"}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setLocale("en")}>English</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("km")}>ភាសាខ្មែរ</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useT();
  const dark = resolvedTheme === "dark";
  return <Button variant="ghost" size="icon" aria-label={t(dark ? "Switch to light theme" : "Switch to dark theme")} onClick={() => setTheme(dark ? "light" : "dark")}><Sun className="hidden size-4 dark:block" /><Moon className="size-4 dark:hidden" /></Button>;
}

function UserMenu() {
  const t = useT();
  const router = useRouter();
  const { user, logout, applyLogin } = useAuth();
  const can = useCan();
  const execute = useAction();
  if (!user) return null;
  const switchTo = async (role: RoleCode) => {
    const result = await authApi.switchDemoUser(role.toLowerCase());
    applyLogin(result);
    await execute(async () => undefined);
    router.push(landingRoute(role));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5"><UserAvatar name={user.name} /><span className="hidden max-w-32 truncate text-sm md:inline">{user.name}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal"><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{user.roles.map((r) => t(ROLE_NAMES[r])).join(", ")}</p><p className="text-xs text-muted-foreground">{user.branch_label === "All branches" ? t("All branches") : user.branch_label}</p></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/notifications/settings"><UserRound className="size-4" />{t("Notification Settings")}</Link></DropdownMenuItem>
        {API_MODE === "mock" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><RotateCcw className="size-4" />{t("Switch demo role")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
              {ROLES.map((r) => <DropdownMenuItem key={r} onSelect={() => void switchTo(r)}>{t(ROLE_NAMES[r])}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {can("org.manage") && API_MODE === "mock" && <DropdownMenuItem onSelect={() => void execute(() => orgApi.resetDemo(), { success: "Demonstration data reset" })}><RotateCcw className="size-4" />{t("Reset demonstration data")}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout().then(() => router.replace("/login"))}><LogOut className="size-4" />{t("Sign out")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const can = useCan();
  const rule = ROUTE_PERMISSIONS.find(([re]) => re.test(pathname));
  if (rule && !can(...rule[1])) return <AccessDeniedState />;
  return <>{children}</>;
}

const MENU_HIDDEN_KEY = "lms-menu-hidden";

function readMenuOpen() {
  try {
    return localStorage.getItem(MENU_HIDDEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const [menuOpen, setMenuOpen] = useState(readMenuOpen);
  const changeMenu = (open: boolean) => {
    setMenuOpen(open);
    try {
      localStorage.setItem(MENU_HIDDEN_KEY, open ? "0" : "1");
    } catch {
      /* The choice just won't be remembered. */
    }
  };
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { if (status === "anonymous") router.replace("/login"); }, [status, router]);
  if (status !== "authenticated") return <div className="mx-auto max-w-md pt-24"><LoadingSkeleton rows={4} /></div>;
  return (
    <SidebarProvider open={menuOpen} onOpenChange={changeMenu} className="print:bg-white" style={{ "--sidebar-width": "calc(var(--spacing) * 72)" } as CSSProperties}>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader><Brand /></SidebarHeader>
        <SidebarContent><SidebarNav /></SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="h-svh overflow-hidden md:h-[calc(100svh-1rem)] print:h-auto print:overflow-visible md:peer-data-[variant=inset]:print:m-0 md:peer-data-[variant=inset]:print:rounded-none md:peer-data-[variant=inset]:print:shadow-none">
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1" aria-label={t("Toggle menu")} title={t("Toggle menu")} />
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1"><LanguageSwitcher /><ThemeToggle /><NotificationBell /><UserMenu /></div>
        </header>
        {API_MODE === "mock" && <div className="no-print border-b border-warning/30 bg-warning-soft px-4 py-1 text-center text-xs text-warning">{t("Demonstration mode: all data and financial results are simulated by a mock API.")}</div>}
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          <div className="mx-auto max-w-[1500px] space-y-4"><Breadcrumbs /><RouteGuard>{children}</RouteGuard></div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
