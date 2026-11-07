"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead } from "@/app/(app)/requests/actions";
import { cn } from "@/lib/utils";

export type BellItem = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <BellIcon />
          {unread > 0 && (
            <span className="bg-highlight text-highlight-foreground absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              disabled={pending}
              className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
              onClick={() => start(() => markNotificationsRead())}
            >
              Mark all as read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">No notifications yet.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn("hover:bg-muted/60 flex w-full gap-3 px-4 py-3 text-left", !n.readAt && "bg-secondary/40")}
                  onClick={() =>
                    start(async () => {
                      if (!n.readAt) await markNotificationsRead([n.id]);
                      if (n.href) router.push(n.href);
                    })
                  }
                >
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-highlight")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="text-muted-foreground line-clamp-2 block text-xs">{n.body}</span>}
                    <span className="text-muted-foreground mt-0.5 block text-[11px]">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
