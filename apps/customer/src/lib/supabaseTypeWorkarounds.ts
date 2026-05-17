export function asRows<T>(value: unknown): T[] {
  return (value ?? []) as T[]
}

export function asMutationRowsArg<T extends object>(value: T[]): never[] {
  return value as unknown as never[]
}
