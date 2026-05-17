export function asRows<T>(value: unknown): T[] {
  return (value ?? []) as T[]
}

export function asMaybeRow<T>(value: unknown): T | null {
  return (value ?? null) as T | null
}

export function asMutationArg<T extends object>(value: T): never {
  return value as unknown as never
}

export function asMutationRowsArg<T extends object>(value: T[]): never[] {
  return value as unknown as never[]
}

export function asRpcArgs<T extends object>(value: T): never {
  return value as unknown as never
}
