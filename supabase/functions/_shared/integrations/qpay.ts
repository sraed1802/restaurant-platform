export interface QPayPaymentRequest {
  orderId: string
  amount: number
  currency?: string
  customerPhone: string
  customerName?: string
  callbackUrl: string
  returnUrl: string
  description?: string
}

export interface QPayPaymentResponse {
  transaction_id: string
  reference_id: string
  payment_url: string
  status: string
  expires_at?: string
  raw: unknown
}

interface QPayConfig {
  apiBaseUrl: string
  merchantId: string
  apiKey: string
  secretKey: string
  webhookSecret?: string
}

function getQPayConfig(): QPayConfig {
  const apiBaseUrl = Deno.env.get('QPAY_API_BASE_URL') ?? 'https://api.qpay.com.qa/v1'
  const merchantId = Deno.env.get('QPAY_MERCHANT_ID')
  const apiKey = Deno.env.get('QPAY_API_KEY')
  const secretKey = Deno.env.get('QPAY_SECRET_KEY')
  const webhookSecret = Deno.env.get('QPAY_WEBHOOK_SECRET')

  if (!merchantId) {
    throw new Error('Missing QPAY_MERCHANT_ID environment variable')
  }

  if (!apiKey) {
    throw new Error('Missing QPAY_API_KEY environment variable')
  }

  if (!secretKey) {
    throw new Error('Missing QPAY_SECRET_KEY environment variable')
  }

  return {
    apiBaseUrl,
    merchantId,
    apiKey,
    secretKey,
    webhookSecret,
  }
}

async function fetchJson(input: string, init: RequestInit): Promise<any> {
  const res = await fetch(input, init)
  const payload = await res.text()

  try {
    return {
      ok: res.ok,
      status: res.status,
      body: payload ? JSON.parse(payload) : null,
    }
  } catch {
    return {
      ok: res.ok,
      status: res.status,
      body: payload,
    }
  }
}

export async function initiateQPayPayment(
  request: QPayPaymentRequest
): Promise<QPayPaymentResponse> {
  const cfg = getQPayConfig()
  const url = `${cfg.apiBaseUrl}/payments`

  const body = JSON.stringify({
    merchant_id: cfg.merchantId,
    order_reference: request.orderId,
    amount: Number(request.amount).toFixed(3),
    currency: request.currency ?? 'QAR',
    customer_phone: request.customerPhone,
    customer_name: request.customerName ?? undefined,
    callback_url: request.callbackUrl,
    return_url: request.returnUrl,
    description: request.description ?? `Order ${request.orderId}`,
  })

  const response = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      Authorization: `Bearer ${cfg.secretKey}`,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(
      `QPay payment initiation failed (${response.status}): ${JSON.stringify(response.body)}`
    )
  }

  const responseBody = response.body ?? {}
  const transaction_id =
    responseBody.transaction_id || responseBody.id || responseBody.reference_id || ''
  const payment_url =
    responseBody.payment_url || responseBody.redirect_url || responseBody.checkout_url || ''
  const status = responseBody.status || 'pending'
  const reference_id = responseBody.order_reference || responseBody.reference_id || request.orderId
  const expires_at = responseBody.expires_at || responseBody.expiry_date

  if (!transaction_id || !payment_url) {
    throw new Error(
      `QPay response missing required fields: ${JSON.stringify(responseBody)}`
    )
  }

  return {
    transaction_id,
    reference_id,
    payment_url,
    status,
    expires_at,
    raw: responseBody,
  }
}

export async function verifyQPayWebhookSignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  const cfg = getQPayConfig()

  if (!cfg.webhookSecret) {
    return true
  }

  if (!signature) {
    return false
  }

  const encoder = new TextEncoder()
  const keyData = encoder.encode(cfg.webhookSecret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signed = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(rawBody)
  )

  const expectedSignature = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return expectedSignature === signature.toLowerCase()
}
