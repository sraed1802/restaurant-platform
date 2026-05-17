declare module 'stripe' {
  export default Stripe

  declare class Stripe {
    constructor(secretKey: string, config: Stripe.StripeConfig)

    static createSubtleCryptoProvider(): Stripe.SubtleCryptoProvider

    checkout: {
      sessions: {
        create(
          params: Stripe.CheckoutSessionCreateParams,
          options?: Stripe.RequestOptions
        ): Promise<Stripe.CheckoutSession>
      }
    }

    webhooks: {
      constructEventAsync(
        payload: string,
        signature: string,
        secret: string,
        tolerance?: number,
        cryptoProvider?: Stripe.SubtleCryptoProvider
      ): Promise<Stripe.Event>
    }
  }

  declare namespace Stripe {
    interface StripeConfig {
      apiVersion: string
    }

    interface RequestOptions {
      idempotencyKey?: string
    }

    interface CheckoutSessionCreateParams {
      mode: 'payment'
      success_url: string
      cancel_url: string
      customer_email?: string
      metadata?: Record<string, string>
      line_items: Array<{
        quantity: number
        price_data: {
          currency: string
          unit_amount: number
          product_data: {
            name: string
          }
        }
      }>
    }

    interface CheckoutSession {
      id: string
      url: string | null
      payment_intent: string | { id: string } | null
    }

    interface Event {
      id: string
      type: string
      livemode: boolean
      data: {
        object: unknown
      }
    }

    interface SubtleCryptoProvider {}
  }
}
