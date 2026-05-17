export async function getSupabaseFunctionErrorMessage(
  error: unknown,
  fallback: string
): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: unknown }).context
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as {
          error?: string
          message?: string
          stage?: string
        }
        const baseMessage =
          (typeof payload.error === 'string' && payload.error.trim() && payload.error) ||
          (typeof payload.message === 'string' && payload.message.trim() && payload.message) ||
          ''

        if (baseMessage) {
          return typeof payload.stage === 'string' && payload.stage.trim()
            ? `${baseMessage} [stage: ${payload.stage}]`
            : baseMessage
        }
      } catch {
        // Fall back to the outer error message below.
      }
    }
  }

  if (error instanceof Error && error.message.trim() && error.message !== 'Edge Function returned a non-2xx status code') {
    return error.message
  }

  return fallback
}
