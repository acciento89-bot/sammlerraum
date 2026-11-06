"use client";
import { createContext, useContext, type ReactNode } from "react";
const MoneyConsumers = createContext(false);
/** Public server rollout information only; actual queries authenticate and gate again. */
export function MoneyConsumerProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <MoneyConsumers.Provider value={enabled === true}>{children}</MoneyConsumers.Provider>;
}
export function useMoneyConsumers() {
  return useContext(MoneyConsumers);
}
