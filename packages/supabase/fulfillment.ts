import type {
  DeliveryAddress,
  FulfillmentMode,
  HotelRoomDeliveryAddress,
  OrderStatus,
  OutsideDeliveryAddress,
} from './types'

export function coerceFulfillmentMode(value: unknown): FulfillmentMode {
  return value === 'hotel_room_delivery' ? 'hotel_room_delivery' : 'outside_delivery'
}

export function isHotelRoomDeliveryAddress(
  address: DeliveryAddress | Record<string, unknown> | null | undefined
): address is HotelRoomDeliveryAddress {
  if (!address || typeof address !== 'object') return false
  if ((address as { mode?: unknown }).mode === 'hotel_room_delivery') return true
  return typeof (address as { room_number?: unknown }).room_number === 'string'
}

export function isOutsideDeliveryAddress(
  address: DeliveryAddress | Record<string, unknown> | null | undefined
): address is OutsideDeliveryAddress {
  return !isHotelRoomDeliveryAddress(address)
}

export function isHotelFulfillmentOrder(
  order: { fulfillment_mode?: unknown; delivery_address?: DeliveryAddress | Record<string, unknown> | null } | null | undefined
): boolean {
  if (!order) return false
  return coerceFulfillmentMode(order.fulfillment_mode) === 'hotel_room_delivery'
    || isHotelRoomDeliveryAddress(order.delivery_address)
}

export function getOrderNextStatus(
  status: OrderStatus,
  fulfillmentMode: FulfillmentMode = 'outside_delivery'
): OrderStatus | null {
  switch (status) {
    case 'pending':
      return 'confirmed'
    case 'confirmed':
      return 'preparing'
    case 'preparing':
      return 'ready'
    case 'ready':
      return fulfillmentMode === 'hotel_room_delivery' ? 'delivered' : 'dispatched'
    case 'dispatched':
      return 'delivered'
    default:
      return null
  }
}

export function getOrderAdvanceLabel(
  status: OrderStatus,
  fulfillmentMode: FulfillmentMode = 'outside_delivery'
): string | null {
  switch (status) {
    case 'pending':
      return 'Confirm'
    case 'confirmed':
      return 'Start Prep'
    case 'preparing':
      return 'Mark Ready'
    case 'ready':
      return fulfillmentMode === 'hotel_room_delivery' ? 'Complete Room Delivery' : 'Dispatch'
    case 'dispatched':
      return 'Delivered'
    default:
      return null
  }
}

export function formatDeliveryAddressLines(address: DeliveryAddress | null | undefined): string[] {
  if (!address) return []

  if (isHotelRoomDeliveryAddress(address)) {
    const lines = [
      address.guest_name ? `Guest: ${address.guest_name}` : null,
      address.room_number ? `Room: ${address.room_number}` : null,
      address.hotel_name ? address.hotel_name : null,
      address.tower ? `Tower: ${address.tower}` : null,
      address.area ? address.area : null,
      address.instructions ? `Notes: ${address.instructions}` : null,
    ]

    return lines.filter((line): line is string => Boolean(line))
  }

  const outsideAddress = address as OutsideDeliveryAddress
  const secondLineParts = [
    outsideAddress.building ? `Bldg ${outsideAddress.building}` : null,
    outsideAddress.floor ? `Floor ${outsideAddress.floor}` : null,
    outsideAddress.apartment ? `Apt ${outsideAddress.apartment}` : null,
  ].filter((part): part is string => Boolean(part))

  const lines = [
    outsideAddress.street,
    secondLineParts.join(', '),
    [outsideAddress.area, outsideAddress.city].filter(Boolean).join(', '),
    outsideAddress.instructions ? `Notes: ${outsideAddress.instructions}` : null,
  ]

  return lines.filter((line): line is string => Boolean(line && line.trim().length > 0))
}

export function formatDeliveryAddressSummary(address: DeliveryAddress | null | undefined): string {
  return formatDeliveryAddressLines(address)
    .filter((line) => !line.startsWith('Notes: '))
    .join(', ')
}
