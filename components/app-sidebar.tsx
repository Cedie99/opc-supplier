"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BuildingIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GaugeIcon,
  LogOutIcon,
  ScaleIcon,
  Settings2Icon,
  TriangleAlertIcon,
  UsersIcon,
  ListIcon,
  MailIcon,
  MessagesSquareIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { can, type Permission } from "@/lib/permissions";
import { signOut } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/brand";

type NavItem = { href: string; label: string; icon: React.ComponentType; permission?: Permission; badgeKey?: keyof Badges };
type Badges = { pendingApprovals: number; overdueActions: number; expiringDocuments: number; unansweredRequests: number };

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: GaugeIcon },
  { href: "/suppliers", label: "Suppliers", icon: BuildingIcon },
  { href: "/canvass", label: "Selection Matrix", icon: ScaleIcon },
  { href: "/evaluations", label: "Quarterly evaluations", icon: ClipboardCheckIcon, badgeKey: "pendingApprovals" },
  { href: "/corrective-actions", label: "Supplier concerns", icon: TriangleAlertIcon, badgeKey: "overdueActions" },
  { href: "/documents", label: "Documents", icon: FileTextIcon, badgeKey: "expiringDocuments" },
  { href: "/requests", label: "Supplier requests", icon: MessagesSquareIcon, badgeKey: "unansweredRequests" },
];

const SETTINGS: NavItem[] = [
  { href: "/outbox", label: "Email outbox", icon: MailIcon, permission: "inviteSuppliers" },
  { href: "/settings/templates", label: "Scoring templates", icon: Settings2Icon, permission: "manageSettings" },
  { href: "/settings/reference", label: "Categories & documents", icon: ListIcon, permission: "manageSettings" },
  { href: "/settings/users", label: "Users", icon: UsersIcon, permission: "manageUsers" },
];

export function AppSidebar({ user, badges }: { user: { fullName: string; email: string; role: Role }; badges: Badges }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const settings = SETTINGS.filter((i) => !i.permission || can(user.role, i.permission));

  const renderItems = (items: NavItem[]) =>
    items.map((item) => {
      const badge = item.badgeKey ? badges[item.badgeKey] : 0;
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.href)}
            tooltip={item.label}
            className="relative data-active:bg-sidebar-accent data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-1 data-active:before:rounded-full data-active:before:bg-highlight data-active:[&_svg]:text-highlight"
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
          {badge > 0 && <SidebarMenuBadge className="bg-highlight text-highlight-foreground!">{badge}</SidebarMenuBadge>}
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <BrandMark />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Supplier Accreditation</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">Oracle Petroleum</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(MAIN)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {settings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(settings)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <div className="bg-sidebar-accent text-highlight flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {user.fullName
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="grid min-w-0 flex-1 text-sm leading-tight">
                <span className="truncate font-medium">{user.fullName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{ROLE_LABELS[user.role]}</span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton type="submit" tooltip="Sign out">
                <LogOutIcon />
                <span>Sign out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
