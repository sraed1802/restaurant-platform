/// <reference path="./stripe.d.ts" />
import Stripe from 'stripe'

export interface StripeCheckoutSessionInput {
  orderId: string
  amount: number
  currency?: string
  customerEmail?: string | null
  customerName?: string | null
  successUrl: string
  cancelUrl: string
  idempotencyKey: string
  metadata?: Record<string, string>
  description?: string
}

export interface StripeCheckoutSessionResponse {
  sessionId: string
  checkoutUrl: string
  paymentIntentId: string | null
  raw: unknown
}

const STRIPE_API_VERSION = '2024-11-20'

type DenoEnv = {
  get(name: string): string | undefined
}

function getEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { Deno?: { env?: DenoEnv } }).Deno?.env?.get(name)
}

function getStripeClient(): Stripe {
  const secretKey = getEnv('STRIPE_SECRET_KEY')

  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  }

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  })
}

function toMinorUnits(amount: number): number {
  return Math.round(Number(amount) * 100)
}

export async function initiateStripeCheckoutSession(
  input: StripeCheckoutSessionInput
): Promise<StripeCheckoutSessionResponse> {
  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail ?? undefined,
    metadata: {
      order_id: input.orderId,
      customer_name: input.customerName ?? '',
      ...input.metadata,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (input.currency ?? 'QAR').toLowerCase(),
          unit_amount: toMinorUnits(input.amount),
          product_data: {
            name: input.description ?? `Order ${input.orderId}`,
          },
        },
      },
    ],
  }, {
    idempotencyKey: input.idempotencyKey,
  })

  if (!session.url) {
    throw new Error('Stripe checkout session did not return a URL')
  }

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    paymentIntentId:
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
    raw: session,
  }
}

export async function constructStripeWebhookEvent(
  rawBody: string,
  signature: string | null
): Promise<Stripe.Event> {
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable')
  }

  if (!signature) {
    throw new Error('Missing Stripe-Signature header')
  }

  const stripe = getStripeClient()
  const cryptoProvider = Stripe.createSubtleCryptoProvider()

  return await stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret,
    undefined,
    cryptoProvider
  )
}

export function mapStripeEventToPaymentStatus(
  eventType: string
): 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'cancelled' {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'payment_intent.succeeded':
      return 'captured'
    case 'payment_intent.amount_capturable_updated':
      return 'authorized'
    case 'charge.refunded':
    case 'charge.refund.updated':
      return 'refunded'
    case 'payment_intent.payment_failed':
    case 'checkout.session.expired':
      return 'failed'
    case 'payment_intent.canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}
