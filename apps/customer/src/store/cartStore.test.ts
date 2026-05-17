import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from './cartStore'

describe('Cart Store', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      appliedPromotion: null,
      appliedCombos: [],
      comboPromotions: [],
      deliveryFeeValue: 5.0,
      systemConfig: { freeDeliveryEnabled: false, freeDeliveryMinOrder: 0 },
      promoError: null,
    })
  })

  it('should add item to cart', () => {
    const { addItem } = useCartStore.getState()
    const mockProduct = {
      id: '1',
      name_en: 'Test Product',
      name_ar: 'منتج تجريبي',
      base_price: 10.0,
      is_available: true,
      category_id: 'cat-1',
    } as any

    addItem(mockProduct, 1, {}, '')
    
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].product.id).toBe('1')
  })

  it('should calculate subtotal correctly', () => {
    const { addItem, subtotal } = useCartStore.getState()
    const mockProduct = {
      id: '1',
      name_en: 'Test Product',
      name_ar: 'منتج تجريبي',
      base_price: 10.0,
      is_available: true,
      category_id: 'cat-1',
    } as any

    addItem(mockProduct, 2, {}, '')
    
    expect(subtotal()).toBe(20.0)
  })

  it('should remove item from cart', () => {
    const { addItem, removeItem } = useCartStore.getState()
    const mockProduct = {
      id: '1',
      name_en: 'Test Product',
      name_ar: 'منتج تجريبي',
      base_price: 10.0,
      is_available: true,
      category_id: 'cat-1',
    } as any

    addItem(mockProduct, 1, {}, '')
    const itemId = useCartStore.getState().items[0]?.cartItemId
    expect(itemId).toBeTruthy()
    removeItem(itemId as string)
    
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(0)
  })

  it('should update item quantity', () => {
    const { addItem, updateQuantity } = useCartStore.getState()
    const mockProduct = {
      id: '1',
      name_en: 'Test Product',
      name_ar: 'منتج تجريبي',
      base_price: 10.0,
      is_available: true,
      category_id: 'cat-1',
    } as any

    addItem(mockProduct, 1, {}, '')
    const itemId = useCartStore.getState().items[0]?.cartItemId
    expect(itemId).toBeTruthy()
    updateQuantity(itemId as string, 3)
    
    const { items } = useCartStore.getState()
    expect(items[0].quantity).toBe(3)
  })

  it('should keep the same product separate when modifiers differ', () => {
    const { addItem } = useCartStore.getState()
    const mockProduct = {
      id: '1',
      name_en: 'Test Product',
      name_ar: 'منتج تجريبي',
      base_price: 10.0,
      is_available: true,
      category_id: 'cat-1',
      modifier_groups: [
        {
          id: 'group-1',
          name_en: 'Size',
          name_ar: 'الحجم',
          options: [
            { id: 'small', name_en: 'Small', name_ar: 'صغير', price_delta: 0 },
            { id: 'large', name_en: 'Large', name_ar: 'كبير', price_delta: 2 },
          ],
        },
      ],
    } as any

    addItem(mockProduct, 1, { 'group-1': ['small'] }, '')
    addItem(mockProduct, 1, { 'group-1': ['large'] }, '')

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
    expect(items[0].cartItemId).not.toBe(items[1].cartItemId)
  })

  it('should apply fixed combo bundle savings', () => {
    const productA = {
      id: 'prod-a',
      name_en: 'Main',
      name_ar: 'رئيسي',
      base_price: 12,
      is_available: true,
      category_id: 'cat-1',
    } as any

    const productB = {
      id: 'prod-b',
      name_en: 'Drink',
      name_ar: 'مشروب',
      base_price: 8,
      is_available: true,
      category_id: 'cat-1',
    } as any

    const { addItem, setComboPromotions, comboDiscountAmount, discountAmount } = useCartStore.getState()

    addItem(productA, 1, {}, '')
    addItem(productB, 1, {}, '')

    setComboPromotions([
      {
        id: 'combo-1',
        name_en: 'Lunch combo',
        name_ar: 'كومبو الغداء',
        headline_en: null,
        headline_ar: null,
        description_en: null,
        description_ar: null,
        promo_price: 15,
        original_price: 20,
        image_url: null,
        model_asset_url: null,
        badge_text_en: null,
        badge_text_ar: null,
        accent_color: null,
        secondary_color: null,
        starts_at: null,
        ends_at: null,
        is_active: true,
        is_featured: true,
        display_order: 0,
        organization_id: null,
        cluster_id: null,
        property_id: null,
        created_at: '',
        updated_at: '',
        items: [
          {
            id: 'item-a',
            combo_promotion_id: 'combo-1',
            product_id: 'prod-a',
            item_role: 'main',
            quantity: 1,
            display_order: 0,
            organization_id: null,
            cluster_id: null,
            property_id: null,
            created_at: '',
          },
          {
            id: 'item-b',
            combo_promotion_id: 'combo-1',
            product_id: 'prod-b',
            item_role: 'drink',
            quantity: 1,
            display_order: 1,
            organization_id: null,
            cluster_id: null,
            property_id: null,
            created_at: '',
          },
        ],
      },
    ])

    expect(comboDiscountAmount()).toBe(5)
    expect(discountAmount()).toBe(5)
  })
})
