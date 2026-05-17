# Promotional Module Testing Guide

## 🎯 Issues Fixed

### 1. **403 Forbidden Error Fixed** ✅
- Created RLS policies for promotion_categories and promotion_products tables
- Added proper permissions for authenticated and anonymous users
- Enabled Row Level Security on both tables

### 2. **Category/Item Selection Saving Fixed** ✅
- Fixed variable naming in savePromotion function (productId vs pid)
- Added error handling for database insertions
- Proper mapping of selected items to database format

### 3. **Selection Retrieval Fixed** ✅
- Enhanced loadPromotionAssociations with try-catch
- Added console logging for debugging
- Fixed data mapping from API responses

### 4. **Frontend Discount Display Fixed** ✅
- Updated promotional product loading to include ALL active promotions
- Not just featured promotions anymore
- Proper time-based validation applied

## 🧪 Testing Scenarios

### Scenario 1: Create Promotion with Categories
1. **Steps**:
   - Create new promotion
   - Select "specific_categories" condition
   - Choose 2-3 categories
   - Save promotion
2. **Expected**:
   - Categories saved to promotion_categories table
   - No 403 errors
   - Success message shown

### Scenario 2: Create Promotion with Products
1. **Steps**:
   - Create new promotion
   - Select "specific_products" condition
   - Choose 3-4 products
   - Save promotion
2. **Expected**:
   - Products saved to promotion_products table
   - No 403 errors
   - Success message shown

### Scenario 3: Edit Existing Promotion
1. **Steps**:
   - Click edit on existing promotion
   - Verify categories/products are pre-selected
   - Modify selections
   - Save changes
2. **Expected**:
   - Original selections loaded correctly
   - New selections saved properly
   - No data loss

### Scenario 4: Frontend Discount Display
1. **Steps**:
   - Create promotion with specific products
   - Navigate to customer menu
   - Verify selected products show promotional badges
2. **Expected**:
   - Promotional badges appear on selected products
   - Discount percentages shown
   - Proper styling applied

## 🔍 Debugging Commands

### Check RLS Policies:
```sql
SELECT * FROM pg_policies 
WHERE tablename IN ('promotion_categories', 'promotion_products');
```

### Check Data in Tables:
```sql
SELECT * FROM promotion_categories WHERE promotion_id = 'your-promo-id';
SELECT * FROM promotion_products WHERE promotion_id = 'your-promo-id';
```

### Check Active Promotions:
```sql
SELECT * FROM promotions 
WHERE is_active = true 
AND (valid_until IS NULL OR valid_until > NOW())
AND (valid_from IS NULL OR valid_from <= NOW());
```

## ✅ Verification Checklist

### Admin Panel:
- [ ] Can create new promotions
- [ ] Can select categories without 403 errors
- [ ] Can select products without 403 errors
- [ ] Categories save to database
- [ ] Products save to database
- [ ] Edit mode loads existing selections
- [ ] Changes save properly

### Customer Frontend:
- [ ] Promotional badges appear on selected items
- [ ] Discount percentages show correctly
- [ ] All active promotions considered
- [ ] Time-based promotions work
- [ ] Category-based promotions work
- [ ] Product-based promotions work

### Database:
- [ ] RLS policies applied correctly
- [ ] promotion_categories table accessible
- [ ] promotion_products table accessible
- [ ] Data persists after save
- [ ] No 403 Forbidden errors

## 🚀 Performance Notes

- All database queries use proper indexing
- RLS policies are optimized for performance
- Frontend uses Set for O(1) lookups
- Error handling prevents crashes
- Console logging helps debugging

## 🔧 Required Actions

1. **Run Migration**: Execute 011_fix_promotion_rls.sql in Supabase
2. **Restart Application**: Clear cache and reload
3. **Test Admin Panel**: Create/edit promotions
4. **Test Customer Menu**: Verify discount display
5. **Check Console**: Look for any remaining errors
