interface RetryOptions {
  label: string
  attempts?: number
  initialDelayMs?: number
  multiplier?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const attempts = options.attempts ?? 3
  let delayMs = options.initialDelayMs ?? 250
  const multiplier = options.multiplier ?? 2
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      console.warn(`[retry] ${options.label} failed on attempt ${attempt}. Retrying in ${delayMs}ms.`, error)
      await sleep(delayMs)
      delayMs *= multiplier
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.label} failed`)
}
