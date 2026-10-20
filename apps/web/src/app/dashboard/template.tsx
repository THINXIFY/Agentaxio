/**
 * A template (unlike a layout) re-mounts on every navigation, which replays the short `page-enter` fade so route
 * changes feel continuous. Reduced motion collapses it to the end state (styles/base.css).
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
