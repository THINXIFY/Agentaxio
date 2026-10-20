"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/feedback/demo-notice";
import { AccountMenu, NotificationsMenu } from "@/components/layout/dashboard-menus";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { PortalContainerProvider } from "@/components/ui/portal-container";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Dashboard frame. Two calm layers:
 *
 *  - the SIDEBAR is always the darkest surface (in Light and Dark alike), so the navigation looks the same in both themes;
 *  - the WORKSPACE (top bar and page) is a neutral surface (soft off-white in Light, near-black in Dark), with cards one
 *    step above it.
 *
 * `.dashboard-scope` switches on the dashboard's neutral surface tokens (styles/tokens.css) and is also the portal target,
 * so menus, popovers and the drawer inherit them.
 *
 *  - lg+: fixed sidebar with the main destinations.
 *  - <lg: the same menu opens as a drawer from the top bar.
 *
 * There is NO authentication or authorization here. The "Demo Admin" identity is a static placeholder; real sessions,
 * roles and tenant scoping arrive with the backend (docs/ROADMAP.md phase 4).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [scopeRoot, setScopeRoot] = React.useState<HTMLElement | null>(null);

  return (
    <PortalContainerProvider value={scopeRoot}>
      <TooltipProvider>
        <ToastProvider>
          <div
            ref={setScopeRoot}
            className="dashboard-scope min-h-dvh bg-workspace text-foreground"
          >
            <aside
              aria-label="Sidebar"
              className="surface-dark fixed inset-y-0 left-0 z-(--z-sticky) hidden w-(--sidebar-width) bg-shell lg:block"
            >
              <DashboardSidebar />
            </aside>

            <div className="flex min-h-dvh flex-col lg:pl-(--sidebar-width)">
              <DemoBanner />

              <header className="sticky top-0 z-(--z-sticky) bg-workspace/90 backdrop-blur-md">
                <div className="mx-auto flex h-(--topbar-height) w-full max-w-[72rem] items-center justify-between gap-3 px-4 sm:px-8 lg:px-12">
                  <div className="flex items-center gap-1.5">
                    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                      <DrawerTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 lg:hidden"
                          aria-label="Open navigation"
                        >
                          <Menu className="size-5" aria-hidden="true" />
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent
                        side="left"
                        title="Navigation"
                        description="Dashboard pages"
                        className="surface-dark bg-shell"
                      >
                        <DashboardSidebar
                          showLogo={false}
                          onNavigate={() => setDrawerOpen(false)}
                        />
                      </DrawerContent>
                    </Drawer>
                    <Logo href="/dashboard" className="lg:hidden" />
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-2">
                    <NotificationsMenu />
                    <ThemeSwitcher className="hidden sm:inline-flex" />
                    <AccountMenu />
                  </div>
                </div>
              </header>

              <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
                <div className="mx-auto w-full max-w-[72rem] px-4 pt-6 pb-16 sm:px-8 sm:pt-8 lg:px-12 lg:pb-20">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </ToastProvider>
      </TooltipProvider>
    </PortalContainerProvider>
  );
}
