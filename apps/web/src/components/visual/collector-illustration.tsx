import { Icon } from "./icon";
/** Decorative category art, deliberately distinct from a user's real object photo. */
export function CollectorIllustration({
  seed = "",
  compact = false,
}: {
  seed?: string;
  compact?: boolean;
}) {
  const themes = ["jade", "clay", "slate", "sand"];
  const hash = [...seed].reduce((sum, ch) => sum + ch.codePointAt(0)!, 0);
  return (
    <div
      className={`collector-illustration theme-${themes[hash % themes.length]} ${compact ? "is-compact" : ""}`}
      aria-hidden="true"
    >
      <div className="illustration-archive">
        <div className="archive-sheet back" />
        <div className="archive-sheet front">
          <Icon name="layers" />
          <span />
          <span />
        </div>
      </div>
      <i className="illustration-orbit" />
    </div>
  );
}
