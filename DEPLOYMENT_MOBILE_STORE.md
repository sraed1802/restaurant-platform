# Mobile store deployment (Google Play + Apple App Store)

Three native shells wrap the same Vite apps as production web. **Bundle IDs are aligned:**

| App | Android package | iOS bundle ID | Display name |
|-----|-----------------|---------------|--------------|
| Customer | `com.maazym.customer` | `com.maazym.customer` | Maazym |
| Admin | `com.maazym.admin` | `com.maazym.admin` | Maazym Admin |
| Driver | `com.maazym.driver` | `com.maazym.driver` | Maazym Driver |

Web production URLs (update if you use different subdomains):

- Customer: `https://maazym.com`
- Admin: `https://admin.maazym.com`
- Driver: `https://driver.maazym.com`

---

## 1. One-time: production environment

Native builds **embed** the web bundle at compile time. They do not read Netlify env at runtime.

For each app, copy the example file and fill secrets:

```bash
# Customer
cp apps/customer/.env.production.example apps/customer/.env.production

# Admin
cp apps/admin/.env.production.example apps/admin/.env.production

# Driver
cp apps/driver/.env.production.example apps/driver/.env.production
```

Set `VITE_SUPABASE_ANON_KEY` and production URLs. Then build from repo root:

```bash
npm run build:customer   # or build:admin / build:driver
```

---

## 2. Android (Google Play)

### 2.1 Release signing

Per app, under `apps/<app>/android/`:

1. Copy `keystore.properties.example` → `keystore.properties` (gitignored).
2. Create or reuse a keystore (keep backups; loss = cannot update the app):

```bash
keytool -genkey -v -keystore release.keystore -alias maazym-customer -keyalg RSA -keysize 2048 -validity 10000
```

3. Point `storeFile`, `keyAlias`, and passwords in `keystore.properties`.

Release builds use signing only when `keystore.properties` exists.

### 2.2 Sync and open Android Studio

```bash
npm run android:sync:customer
npm run android:sync:admin
npm run android:sync:driver
```

Then in each app folder: `npx cap open android` (or Android Studio → open `apps/<app>/android`).

### 2.3 Build AAB for Play Console

**Important:** A **debug APK** (`assembleDebug` or Run in Android Studio) is not the same as a **release AAB** (`bundleRelease`). Play installs the release build (R8/shrink settings differ). If the menu works in a debug APK but not from Play, rebuild the release AAB after `npm run android:sync:<app>` and upload that bundle.

**Test release locally before Play upload:**

```bash
npm run android:sync:customer
cd apps/customer/android
./gradlew.bat assembleRelease
# Install app/build/outputs/apk/release/MCustomer-release-*.apk on a device and verify menu + images
./gradlew.bat bundleRelease
```

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.

Before each upload, bump in `apps/<app>/android/app/build.gradle`:

- `versionCode` — must increase every upload
- `versionName` — user-visible version

### 2.4 Play Console checklist (each app)

- [ ] Developer account ($25 one-time)
- [ ] Create app with matching **package name** (`com.maazym.*`)
- [ ] Upload **AAB** (not APK for new apps)
- [ ] **Privacy policy URL** (e.g. `https://maazym.com/privacy`)
- [ ] **Data safety** form (auth, orders, location for driver)
- [ ] **Content rating**
- [ ] Screenshots + short/long description
- [ ] **Customer + Driver**: public or open testing → production
- [ ] **Admin**: prefer **Internal** or **Closed testing** (staff only)

### 2.5 Driver-specific (Play)

Declared permissions include background location. In Play Console:

- Declare **Location** in Data safety
- Provide in-app disclosure before requesting background location
- Complete **Background location** declaration if you use `ACCESS_BACKGROUND_LOCATION`

Target SDK is **35** (`variables.gradle`).

---

## 3. iOS (Apple App Store)

**Requires macOS + Xcode** (iOS projects are in-repo; builds cannot be completed on Windows alone).

### 3.1 Apple Developer

- [ ] [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- [ ] Create three App IDs: `com.maazym.customer`, `com.maazym.admin`, `com.maazym.driver`

### 3.2 Sync on Mac

```bash
npm install
npm run ios:sync:customer
npm run ios:sync:admin
npm run ios:sync:driver
```

Open Xcode: `cd apps/<app> && npx cap open ios`

### 3.3 Signing in Xcode

1. Select target **App** → **Signing & Capabilities**
2. Team: your Apple Developer team
3. Bundle Identifier: must match `com.maazym.*`
4. For **Driver**: enable **Background Modes → Location updates** (matches `Info.plist`)

### 3.4 App Store Connect

Per app:

- [ ] Create app in [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Upload build via **Archive → Distribute App** (Xcode) or Transporter
- [ ] Privacy policy URL
- [ ] App Privacy questionnaire
- [ ] Screenshots (6.7", 6.5", iPad if supported)
- [ ] Export compliance (typically “No” for HTTPS-only apps)

Location usage strings are in `apps/driver/ios/App/App/Info.plist`.

### 3.5 Admin on iOS

Same as Android: distribute via **TestFlight** internal group or unlisted; not required on public App Store.

---

## 4. Supabase (all native + web)

Ensure **Authentication → URL configuration** includes production origins and `/auth/callback` for the customer app.

Edge secret:

```env
CUSTOMER_APP_URL=https://maazym.com
```

Auth hook secret (`AUTH_HOOK_SECRET`) must match Dashboard → Auth → Hooks.

---

## 5. Version and release workflow

```text
1. Update .env.production
2. npm run build:<app>
3. npx cap sync (android and/or ios)
4. Bump versionCode / CFBundleVersion
5. Signed AAB (Play) or Archive (App Store)
6. Upload → internal test → production
```

Root scripts:

| Script | Action |
|--------|--------|
| `npm run android:sync:customer` | build + Capacitor sync Android |
| `npm run ios:sync:customer` | build + Capacitor sync iOS |
| Same for `admin` and `driver` | |

---

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| App shows old UI | Re-run `build` + `cap sync`; native embeds `dist/` |
| Admin login fails | Supabase auth hook + `AUTH_HOOK_SECRET` |
| Customer cannot open Admin/Driver app | Install both APKs; packages `com.maazym.admin` / `com.maazym.driver` |
| Play rejects background location | Document use case; show disclosure in driver app |
| iOS location denied | Check `Info.plist` strings; Settings → Privacy → Location |

---

## 7. Security

- Never commit `.env.production`, `keystore.properties`, `*.jks`, or `*.keystore`
- Never put `service_role` key in mobile apps (anon key only)
