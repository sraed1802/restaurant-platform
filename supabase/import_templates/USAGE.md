# How To Use The Restaurant Import Templates

This guide explains how to go from blank CSV templates to a runnable SQL import for a new restaurant.

## What these files do

The files in `supabase/import_templates` let you collect business data in spreadsheet form, then turn that data into one SQL file using:

```bash
npm run generate:restaurant-import
```

That command produces:

- `supabase/generated/restaurant_import.generated.sql`

## When to use this flow

Use this after:

1. creating the new Supabase project
1. applying `supabase/recreate_database_no_sample_data.sql`
1. deploying the required Edge Functions and completing the non-SQL setup from `SUPABASE_PROJECT_CLONE_CHECKLIST.md`

## Step-by-step

### 1. Copy or keep the CSV template pack

Work inside:

- `supabase/import_templates`

You can either:

- edit the CSV files in place, or
- duplicate the folder for each restaurant and point the generator to that copied folder with `--input`

### 2. Fill the restaurant settings

Edit:

- `01_restaurant_settings.csv`

This should contain exactly one data row.

Fill branding, contact details, colors, service flags, hero text, and metadata.

### 3. Fill runtime config

Edit:

- `02_system_config.csv`

Use `value_type` to control how the value is stored:

- `number` for numeric JSONB values like delivery fees
- `boolean` for true/false flags
- `json` for objects or arrays
- `string` for plain text
- `null` when the config value should be JSON null

The delivery-fee rows in this file apply to `outside_delivery` only. Hotel room delivery mode is seeded separately in:

- `16_fulfillment_settings.csv`

### 4. Fill feature flags

Edit:

- `02_feature_flags.csv`

Set the tenant scope values consistently:

- `organization_id`
- `cluster_id`
- `property_id`

Those should match the app env values you plan to use for that restaurant/property.

### 5. Fill fulfillment mode

Edit:

- `16_fulfillment_settings.csv`

Use this to seed the property-level delivery mode into `fulfillment_settings`.

Phase 1 supported values:

- `outside_delivery`
- `hotel_room_delivery`

### 6. Fill order availability

Edit:

- `03_order_availability_settings.csv`
- `04_order_availability_weekly_windows.csv`
- `05_order_availability_overrides.csv`

Typical setup:

- one row in settings
- seven weekly rows
- zero or more override rows

If you do not need special closures, leave `05_order_availability_overrides.csv` with just the header row.

### 7. Optionally seed the hotel guest roster

Edit:

- `17_hotel_guest_roster.csv`

This file is optional. Leave it with only the header row if the property does not use hotel room delivery yet or if you prefer to upload the roster later from the admin app.

If you do use it:

- keep the tenant scope values aligned with the fulfillment settings row
- include `room_number` and `guest_name` for each guest
- use ISO dates like `2026-05-12` for `check_in_date` / `check_out_date`

### 8. Create Auth users before staff import

Before editing `06_staff.csv`, create the users in Supabase Auth.

Then put the real `auth.users.id` values into:

- `06_staff.csv`

Important:

- `staff.id` must equal the real auth user UUID
- `created_by` can be blank for the first admin row

### 9. Fill menu data

Edit these files in order:

- `07_categories.csv`
- `08_products.csv`
- `09_modifier_groups.csv`
- `10_modifier_options.csv`
- `11_product_modifier_groups.csv`

Keep references valid:

- `products.category_id` must exist in `07_categories.csv`
- `10_modifier_options.csv.group_id` must exist in `09_modifier_groups.csv`
- `11_product_modifier_groups.csv.product_id` must exist in `08_products.csv`
- `11_product_modifier_groups.csv.group_id` must exist in `09_modifier_groups.csv`

For JSON columns:

- `08_products.csv.tags_json` must be valid JSON, for example `["vegetarian","spicy"]`

### 10. Fill promotions if needed

Edit:

- `12_promotions.csv`
- `13_promotion_products.csv`

If you do not need promotions yet, keep only the header rows or remove the example rows before generating SQL.

For JSON columns:

- `12_promotions.csv.conditions_json` must be valid JSON

### 11. Fill combo promotions if needed

Edit:

- `14_combo_promotions.csv`
- `15_combo_promotion_items.csv`

Keep references valid:

- `15_combo_promotion_items.csv.combo_promotion_id` must exist in `14_combo_promotions.csv`
- `15_combo_promotion_items.csv.product_id` must exist in `08_products.csv`

### 12. Generate the SQL file

From the repo root, run:

```bash
npm run generate:restaurant-import
```

This will read:

- `supabase/import_templates/*.csv`

and write:

- `supabase/generated/restaurant_import.generated.sql`

### Optional custom paths

If you duplicated the CSV folder for a specific restaurant, you can run:

```bash
node scripts/generate-restaurant-import-sql.mjs --input "C:\path\to\restaurant-csvs" --output "C:\path\to\restaurant-import.sql"
```

### 13. Review the generated SQL

Open:

- `supabase/generated/restaurant_import.generated.sql`

Check that:

- placeholders are gone
- UUID references line up correctly
- pricing and names look correct
- no example/demo rows remain if you do not want them

The latest generator also seeds:

- `fulfillment_settings`
- optional `hotel_guest_roster`

### 14. Run the generated SQL in Supabase

Open the SQL Editor for the target project and run:

- `supabase/generated/restaurant_import.generated.sql`

This imports/upserts:

- restaurant settings
- system config
- feature flags
- order availability
- staff
- categories
- products
- modifiers
- promotions
- combo promotions

### 15. Smoke test the app

After the SQL runs successfully:

1. open the customer app
1. confirm restaurant branding and settings are visible
1. verify categories/products render correctly
1. test modifier selection
1. test order availability open/closed behavior
1. verify the intended fulfillment mode is seeded for the property
1. if hotel delivery is enabled, verify roster rows imported as expected
1. verify admin staff accounts can sign in
1. test promotions and combo offers if enabled

## Recommended workflow for each new restaurant

1. bootstrap the Supabase project
1. complete non-SQL setup from `SUPABASE_PROJECT_CLONE_CHECKLIST.md`
1. fill the CSV pack
1. run `npm run generate:restaurant-import`
1. execute the generated SQL
1. smoke test the restaurant
