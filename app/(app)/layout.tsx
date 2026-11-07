import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { requireUser } from "@/lib/auth";
import { getSidebarBadges } from "@/lib/queries/badges";
import { ROLE_LABELS } from "@/lib/constants";
import { after } from "next/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { sweepRequests } from "@/lib/requests";
import { NotificationBell } from "@/components/notification-bell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [badges, items, [unread]] = await Promise.all([
    getSidebarBadges(),
    db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(15),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);
  // Reminders and "no response" marking also run from the hourly cron; this keeps them going without one.
  after(() => sweepRequests().catch((e) => console.error("[requests] sweep failed", e)));

  return (
    <SidebarProvider>
      <AppSidebar user={{ fullName: user.fullName, email: user.email, role: user.role }} badges={badges} />
      {/* Same idea as the sign-in card: the workspace is a rounded white sheet on the dark green brand surface. */}
      <SidebarInset className="md:peer-data-[variant=inset]:my-3 md:peer-data-[variant=inset]:mr-3 md:peer-data-[variant=inset]:rounded-[1.75rem] md:peer-data-[variant=inset]:shadow-xl md:peer-data-[variant=inset]:shadow-black/20">
        <header className="bg-background/90 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:rounded-t-[1.75rem] md:px-6">
          <SidebarTrigger className="-ml-1 rounded-full" />
          <span className="bg-highlight h-4 w-1 rounded-full" aria-hidden />
          <span className="text-muted-foreground text-sm">Supplier Accreditation and Evaluation</span>
          <span className="text-muted-foreground ml-auto hidden text-xs sm:block">
            {user.fullName} · {ROLE_LABELS[user.role]}
          </span>
          <NotificationBell
            unread={unread?.n ?? 0}
            items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
          />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
