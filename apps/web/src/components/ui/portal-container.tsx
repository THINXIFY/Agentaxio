"use client";

import * as React from "react";

/**
 * Where floating UI (menus, popovers, tooltips, the mobile drawer) renders. By default Radix portals into <body>, which is
 * outside any scoped theme. A themed area (the dashboard) provides its own root here so portalled content inherits the
 * area's design tokens. With no provider the value is null and behaviour is unchanged.
 */
const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export const PortalContainerProvider = PortalContainerContext.Provider;

export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(PortalContainerContext) ?? undefined;
}
