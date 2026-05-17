import { withRetry } from './retry.ts'

interface SendTelegramMessageInput {
  botToken: string
  chatId: string
  text: string
}

interface TelegramResponse {
  ok?: boolean
  result?: Record<string, unknown>
  description?: string
  [key: string]: unknown
}

export async function sendTelegramMessage(
  input: SendTelegramMessageInput
): Promise<TelegramResponse> {
  const response = await withRetry(
    async () => {
      const result = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          disable_web_page_preview: true,
        }),
      })

      if (!result.ok) {
        const errorText = await result.text()
        throw new Error(`Telegram request failed (${result.status}): ${errorText}`)
      }

      return result
    },
    { label: `send telegram message to ${input.chatId}` }
  )

  const data = await response.json() as TelegramResponse
  if (data.ok !== true) {
    throw new Error(data.description || 'Telegram API returned a non-ok response')
  }

  console.info('[operator-telegram] delivered', JSON.stringify({ chatId: input.chatId }))
  return data
}
