# Delivery Fee Debug Guide

## Problem
Cart shows 5.00 QAR delivery fee despite:
- Admin panel set to 1.000 QAR
- Migration applied successfully
- Browser logs show Supabase requests working

## Debug Steps

### 1. Check Supabase Dashboard
1. Go to your Supabase dashboard
2. Navigate to Table Editor → system_config
3. Run this query to verify current values:
```sql
SELECT key, value FROM system_config WHERE key IN ('delivery_fee', 'free_delivery_enabled', 'free_delivery_min_order');
```

### 2. Check Browser Console
1. Open browser dev tools (F12)
2. Go to Console tab
3. Add items to cart
4. Check console for:
   - "loadDeliveryFee called" messages
   - "Delivery fee loaded" messages
   - Any error messages

### 3. Test Cart Store Directly
1. Open browser console
2. Run this command:
```javascript
// Access cart store directly
const store = window.useCartStore.getState();
console.log('Current store state:', store);
console.log('Delivery fee value:', store.deliveryFeeValue);
```

### 4. Clear Application Cache
1. Stop dev server
2. Clear browser cache (Ctrl+Shift+R)
3. Restart application
4. Test again

## Expected Results

If migration was applied correctly:
- ✅ delivery_fee should show "1.000"
- ✅ free_delivery_enabled should show "false"
- ✅ free_delivery_min_order should show "0.000"

If migration was NOT applied:
- ❌ delivery_fee might show old value
- ❌ Configuration might be inconsistent

## Common Issues

1. **Migration not applied** - SQL not executed in Supabase
2. **Browser caching** - Old values cached locally
3. **State persistence** - Zustand store not updating properly
4. **Multiple instances** - Development server not restarted

## Fix Commands

If issue persists, run these commands in browser console:
```javascript
// Force reload delivery config
localStorage.removeItem('rms-cart');
window.location.reload();

// Check store state
console.log('Delivery fee from store:', window.useCartStore.getState().deliveryFeeValue);

// Manually set delivery fee
window.useCartStore.getState().setDeliveryFeeValue(1.000);
```
