import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Inbox,
  ListChecks,
  Package,
  Boxes,
  Tag,
  Users,
  BarChart3,
  ShoppingCart,
  MessageSquare,
  Truck,
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
  useSidebar,
} from "@/components/ui/sidebar";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";


const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Requests", url: "/requests", icon: Inbox },
  { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart },
  { title: "Enquiries", url: "/enquiries", icon: MessageSquare },
  { title: "Review Queue", url: "/review-queue", icon: ListChecks },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Partners", url: "/partners", icon: Users },
  { title: "Stock", url: "/stock", icon: Package },
  { title: "Prices", url: "/prices", icon: Tag },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },

];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="flex h-full flex-col bg-[#1B2A4A] text-slate-300">
        <SidebarHeader className="px-4 py-5">
          {collapsed ? (
            <img
              src="/NP_LOGO.png"
              alt="NP"
              className="h-7 w-7 object-contain"
            />
          ) : (
            <img
              src="/NP_LOGO.png"
              alt="Novo Pharma"
              className="h-9 object-contain"
              style={{ maxWidth: "160px" }}
            />
          )}
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
                            ? "bg-[#00B8C8] text-white hover:bg-[#00B8C8] hover:text-white"
                            : "text-slate-400 hover:bg-[rgba(0,184,200,0.12)] hover:text-white"
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

        <SidebarFooter className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:bg-[rgba(0,184,200,0.12)] hover:text-white"
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
