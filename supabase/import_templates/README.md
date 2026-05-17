# Restaurant Import Templates

These CSV templates are meant to be filled for a new restaurant after:

- `supabase/recreate_database_no_sample_data.sql`

and alongside:

- `supabase/restaurant_business_onboarding_template.sql`

## Purpose

Use these files to collect restaurant-specific business data in spreadsheet-friendly form before converting/importing into SQL.

## Recommended import order

1. `01_restaurant_settings.csv`
1. `02_system_config.csv`
1. `02_feature_flags.csv`
1. `03_order_availability_settings.csv`
1. `04_order_availability_weekly_windows.csv`
1. `05_order_availability_overrides.csv`
1. `06_staff.csv`
1. `07_categories.csv`
1. `08_products.csv`
1. `09_modifier_groups.csv`
1. `10_modifier_options.csv`
1. `11_product_modifier_groups.csv`
1. `12_promotions.csv`
1. `13_promotion_products.csv`
1. `14_combo_promotions.csv`
1. `15_combo_promotion_items.csv`

## General rules

- Replace all placeholder values.
- Keep UUIDs stable and consistent across files.
- For tenant-aware files, keep these three values consistent:
  - `organization_id`
  - `cluster_id`
  - `property_id`
- For global/singleton settings, the current codebase still uses singleton/global reads in some places, especially `restaurant_settings`.
- Do not change column names in the CSV headers.

## System config

`02_system_config.csv` stores `system_config.value` as typed JSONB inputs.

- `value_type` must be one of:
  - `json`
  - `string`
  - `number`
  - `boolean`
  - `null`

## Staff

`staff.id` must match an existing `auth.users.id`.

That means:

1. create/invite the auth user first
1. copy the real auth UUID into `06_staff.csv`
1. then import the `staff` row

## Categories and products

- `categories.id` is referenced by `products.category_id`
- `products.id` is referenced by:
  - `product_modifier_groups.product_id`
  - `promotion_products.product_id`
  - `combo_promotion_items.product_id`

## Modifiers

- `modifier_groups.id` is referenced by `modifier_options.group_id`
- `product_modifier_groups` links products to modifier groups

## Promotions

- Use `type` from:
  - `code`
  - `automatic`
  - `ai_suggested`
- Use `discount_type` from:
  - `fixed`
  - `percentage`
  - `free_delivery`
- Use `condition_type` from:
  - `none`
  - `first_order`
  - `min_order`
  - `specific_products`
  - `specific_categories`

## Combo promotions

- `combo_promotions.id` is referenced by `combo_promotion_items.combo_promotion_id`
- `item_role` must be one of:
  - `main`
  - `side`
  - `drink`
  - `dessert`
  - `optional_drink`

## Order availability

- `03_order_availability_settings.csv` should usually contain one row per property
- `04_order_availability_weekly_windows.csv` should contain up to 7 rows per property
- `05_order_availability_overrides.csv` is optional

## Restaurant settings

`01_restaurant_settings.csv` is intentionally one-row oriented because the current app treats it as a singleton/global settings table.

## Next step

Once these CSVs are filled, generate the import SQL with:

```bash
npm run generate:restaurant-import
```

Default output:

- `supabase/generated/restaurant_import.generated.sql`

Detailed operating steps:

- `supabase/import_templates/USAGE.md`
