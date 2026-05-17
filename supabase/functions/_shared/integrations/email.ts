import { withRetry } from './retry.ts'

interface SendOperatorEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

interface ResendResponse {
  id?: string
  [key: string]: unknown
}

const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_USER_AGENT = 'restaurant-claude-supabase-functions/1.0'

type DenoEnv = {
  get(name: string): string | undefined
}

function getEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { Deno?: { env?: DenoEnv } }).Deno?.env?.get(name)
}

function parseJsonBody(body: string): Record<string, unknown> {
  if (!body) {
    return {}
  }

  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return { raw: body }
  }
}

export async function sendOperatorEmail(
  input: SendOperatorEmailInput
): Promise<{ provider: 'resend'; providerId: string | null; response: ResendResponse }> {
  const resendApiKey = getEnv('RESEND_API_KEY')
  const resendFromEmail = getEnv('RESEND_FROM_EMAIL')

  if (!resendApiKey || !resendFromEmail) {
    throw new Error('Resend is not configured')
  }

  const idempotencyKey = `operator-email/${crypto.randomUUID()}`

  const response = await withRetry(
    async () => {
      const result = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'User-Agent': RESEND_USER_AGENT,
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      })
      const responseText = await result.text()
      const data = parseJsonBody(responseText)

      if (!result.ok) {
        const errorMessage = typeof data.message === 'string'
          ? data.message
          : responseText || `HTTP ${result.status}`
        throw new Error(`Resend request failed (${result.status}): ${errorMessage}`)
      }

      return data
    },
    { label: `send operator email to ${input.to}` }
  )

  const data = response as ResendResponse
  console.info('[operator-email] delivered', JSON.stringify({ to: input.to, providerId: data.id ?? null }))

  return {
    provider: 'resend',
    providerId: data.id ?? null,
    response: data,
  }
}
