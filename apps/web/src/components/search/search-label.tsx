"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
/** Keep option text out of the native label's accessible name, with stable control IDs. */
export function SearchLabel({ children }: { children: ReactNode }) {
  const id = useId();
  const parts = Children.toArray(children);
  const control = parts.find(
    (part) => isValidElement(part) && ["input", "select", "textarea"].includes(String(part.type)),
  ) as ReactElement<{ id?: string }> | undefined;
  return (
    <div className="search-field">
      <label htmlFor={control?.props.id ?? id}>{parts.filter((part) => part !== control)}</label>
      {control && cloneElement(control, { id: control.props.id ?? id })}
    </div>
  );
}
