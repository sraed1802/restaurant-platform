import { createContext, useContext, type ReactNode } from 'react'

/**
 * When the Admin or Driver app is embedded in the customer shell, routes and
 * links must use this URL prefix (e.g. `/admin`, `/driver`). Empty string when
 * the app runs standalone.
 */
export const SuperAppPathPrefixContext = createContext<string>('')

export function SuperAppPathPrefixProvider({
  value,
  children,
}: {
  value: string
  children: ReactNode
}) {
  return <SuperAppPathPrefixContext.Provider value={value}>{children}</SuperAppPathPrefixContext.Provider>
}

export function useSuperAppPathPrefix(): string {
  return useContext(SuperAppPathPrefixContext)
}
