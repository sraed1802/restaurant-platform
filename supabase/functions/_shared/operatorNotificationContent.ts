import type { OperatorNotificationEvent } from './operatorNotificationSettings.ts'

export interface OperatorOrderContext {
  orderId: string
  orderNumber: string
  total: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  cancellationReason: string | null
  createdAt: string
}

export interface OperatorNotificationContent {
  title: string
  message: string
  emailSubject: string
  emailText: string
  emailHtml: string
  telegramText: string
}

function formatTotal(total: number): string {
  return Number.isFinite(total) ? total.toFixed(3) : '0.000'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildOperatorNotificationContent(
  eventType: OperatorNotificationEvent,
  order: OperatorOrderContext
): OperatorNotificationContent {
  const safeCustomerName = order.customerName || 'Guest customer'
  const totalLabel = `${formatTotal(order.total)} QAR`
  const phoneLine = order.customerPhone ? `Customer phone: ${order.customerPhone}` : 'Customer phone: N/A'
  const reasonLine = order.cancellationReason
    ? `Cancellation reason: ${order.cancellationReason}`
    : 'Cancellation reason: Not provided'

  if (eventType === 'order.created') {
    const title = 'New order received'
    const message = `Order #${order.orderNumber} from ${safeCustomerName} for ${totalLabel}.`
    const emailSubject = `New order #${order.orderNumber} received`
    const emailText = [
      title,
      '',
      `Order number: #${order.orderNumber}`,
      `Customer: ${safeCustomerName}`,
      phoneLine,
      `Total: ${totalLabel}`,
      `Created at: ${order.createdAt}`,
    ].join('\n')

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 12px;">${escapeHtml(title)}</h2>
        <p><strong>Order number:</strong> #${escapeHtml(order.orderNumber)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(safeCustomerName)}</p>
        <p><strong>Customer phone:</strong> ${escapeHtml(order.customerPhone ?? 'N/A')}</p>
        <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
        <p><strong>Created at:</strong> ${escapeHtml(order.createdAt)}</p>
      </div>
    `.trim()

    const telegramText = [
      'New order received',
      `Order: #${order.orderNumber}`,
      `Customer: ${safeCustomerName}`,
      `Total: ${totalLabel}`,
      phoneLine,
    ].join('\n')

    return { title, message, emailSubject, emailText, emailHtml, telegramText }
  }

  const title = 'Order cancelled'
  const message = `Order #${order.orderNumber} was cancelled for ${safeCustomerName}.`
  const emailSubject = `Order #${order.orderNumber} cancelled`
  const emailText = [
    title,
    '',
    `Order number: #${order.orderNumber}`,
    `Customer: ${safeCustomerName}`,
    phoneLine,
    `Total: ${totalLabel}`,
    reasonLine,
  ].join('\n')

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">${escapeHtml(title)}</h2>
      <p><strong>Order number:</strong> #${escapeHtml(order.orderNumber)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(safeCustomerName)}</p>
      <p><strong>Customer phone:</strong> ${escapeHtml(order.customerPhone ?? 'N/A')}</p>
      <p><strong>Total:</strong> ${escapeHtml(totalLabel)}</p>
      <p><strong>Cancellation reason:</strong> ${escapeHtml(order.cancellationReason ?? 'Not provided')}</p>
    </div>
  `.trim()

  const telegramText = [
    'Order cancelled',
    `Order: #${order.orderNumber}`,
    `Customer: ${safeCustomerName}`,
    `Total: ${totalLabel}`,
    reasonLine,
  ].join('\n')

  return { title, message, emailSubject, emailText, emailHtml, telegramText }
}
