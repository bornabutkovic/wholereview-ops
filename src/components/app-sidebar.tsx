import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Inbox,
  ListChecks,
  Package,
  Tag,
  Users,
  BarChart3,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Requests", url: "/requests", icon: Inbox },
  { title: "Review Queue", url: "/review-queue", icon: ListChecks },
  { title: "Stock", url: "/stock", icon: Package },
  { title: "Prices", url: "/prices", icon: Tag },
  { title: "Partners", url: "/partners", icon: Users },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="flex h-full flex-col bg-slate-900 text-slate-200">
        <SidebarHeader className="px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-xs font-bold text-white">
              N
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">Novo Pharma</span>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => {
                  const active = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        size="sm"
                        className={
                          active
                            ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/20 hover:text-blue-400"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        }
                      >
                        <Link to={item.url} className="flex items-center gap-2.5">
                          <item.icon className="h-4 w-4" />
                          <span className="text-[13px] font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-slate-800 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              onClick={() => signOut()}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
