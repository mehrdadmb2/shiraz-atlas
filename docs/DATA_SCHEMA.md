# Shiraz Atlas — Data Schema

The only authoritative data file is `atlas.json` in the private `shiraz-atlas-data` repository. The public Pages repository must not contain personal routes, visit logs, private notes, access credentials, or the real data file.

## Root object

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO-8601 timestamp",
  "settings": {},
  "categories": [],
  "tags": [],
  "places": [],
  "visits": [],
  "routes": [],
  "meta": { "lastTelegramUpdateId": 0 }
}
```

## Place

| Field | Type | Notes |
|---|---|---|
| `id` | string | Worker-generated stable ID |
| `name` | string | Required |
| `lat`, `lng` | number | Decimal degrees; validated geographic range |
| `categoryId` | string | References `categories[].id` |
| `address` | string | Address / district |
| `description` | string | Public description |
| `tags` | string[] | Independent user-defined tags |
| `accessModes` | string[] | Optional travel access: `walking`, `car`, `motorcycle`, `public_transport`, `bicycle` |
| `accessNotes` | string | Parking, access restrictions, walking approach notes |
| `alternateNames` | string[] | Previous names preserved when duplicate place records are merged |
| `mergedPlaceIds` | string[] | IDs of place records consolidated into this canonical place |
| `entryFee` | number or null | Entry fee in IRR / toman as entered by user; UI labels toman |
| `estimatedCost` | number or null | Estimated per-person cost |
| `rating` | number or null | Personal score, 0–5 |
| `bestTime` | string | Best visit time |
| `phone`, `website`, `imageUrl` | string | Optional contact / media links |
| `notes` | string | Private note; only returned in admin state |
| `status` | string | `active`, `planned`, `closed` |
| `visibility` | string | `public` or `private`; private places excluded from public state |
| `source` | string | `website`, `telegram`, `openstreetmap`, etc. |
| `nameSource` | string | `manual`, `openstreetmap-reverse`, or `unresolved`; records how an automatically suggested name was obtained |
| `nameConfidence` | string | `high`, `medium`, or `none`; informational only, not a guarantee |
| `createdAt`, `updatedAt` | string | ISO timestamps |

## Visit

`id`, `placeId`, `visitedAt`, `quality` (`good`, `normal`, `bad`), `note`, `durationMinutes`, `visibility`, `createdAt`.

Visits are private by default and are never included in `/api/state`.

## Route

`id`, `name`, `coordinates`, `distanceMeters`, `quality`, `mode`, `notes`, `visitedAt`, `visibility`, `createdAt`.

`coordinates` is an array of `[latitude, longitude]` pairs. A route needs at least two valid points. `distanceMeters` is computed from the stored track using Haversine distance between adjacent points; it is not a road-routing distance. Road ETA is returned separately by `/api/route`.

Routes are private by default. Only routes explicitly changed to `visibility: "public"` are returned by `/api/state`; their `notes` field is stripped. Private routes are not returned to public visitors.

## Categories and tags

Categories are objects: `{ id, name, icon, color }`. Tags are plain strings and are independent of categories. Default tags are `دوستانه`, `پشتو`, `تاریک`, and `Skybit`.

## Exploration coverage

`settings.explorationBounds` defines a configurable latitude/longitude rectangle and grid step. Recorded route tracks are sampled along their segments; touched cells / total cells is used as a visual estimate. It is not a municipal-area statistic. For an official Shiraz boundary calculation, replace the rectangle with a validated GeoJSON polygon and a polygon-aware grid algorithm.

## Coordinate input formats

Supported in Telegram:

```text
29.722356, 52.470975
29°43'20.5"N 52°28'15.5"E
https://www.google.com/maps/@29.722356,52.470975,17z
https://www.openstreetmap.org/?mlat=29.722356&mlon=52.470975
```

Google short links (for example `maps.app.goo.gl/...`) may not contain coordinates in their visible URL and are not expanded in this version. Open the link and send the actual pin coordinates.

## Mutation API

All writes go through `POST /api/admin/mutate` with a valid admin Bearer token:

```json
{
  "action": "place.create",
  "payload": {
    "name": "نمونه",
    "lat": 29.722356,
    "lng": 52.470975,
    "categoryId": "hidden",
    "visibility": "public"
  }
}
```

Supported actions:

- `place.create`, `place.update`, `place.delete`, `place.merge`
- `visit.create`, `visit.update`, `visit.delete`
- `route.create`, `route.update`, `route.delete`
- `category.create`, `category.update`, `category.delete`
- `tag.create`, `tag.rename`, `tag.delete`
- `settings.update`

The Worker reloads the current GitHub blob SHA before writing and retries SHA conflicts up to three times. This is optimistic concurrency control, not a multi-writer database transaction.


> **Storage ceiling:** نسخه فعلی Worker روی فایل JSON یکپارچه کار می‌کند و سقف امن آن ۸۵۰ KiB است. برای تاریخچه مسیر پرتعداد یا رشد طولانی‌مدت، Cloudflare D1 یا آرشیو ماهانه مسیرها در فایل‌های جداگانه انتخاب مناسب‌تری است.


## Telegram admin delegation (schema 1.1)

`meta.telegramAdmins` is an array of numeric Telegram user IDs delegated by the owner through `/adminadd`. The first ID in the Worker secret `TELEGRAM_ADMIN_IDS` is the owner by default (or use the explicit `TELEGRAM_OWNER_ID` secret). Bootstrap IDs remain in the secret and cannot be removed through bot commands. Delegated IDs are private data and are never included in the public API response.


## Duplicate detection and merge (schema 1.3)

The admin-only `GET /api/admin/duplicates?threshold=35` endpoint scans coordinates for nearby places. The threshold is clamped to 25–50 metres (35m default). A new or moved place is warned/rejected with HTTP 409 and `code: NEARBY_DUPLICATE` unless the admin explicitly repeats the mutation with `confirmNearDuplicate: true`.

`place.merge` keeps one canonical place, transfers missing metadata, unions tags and `accessModes`, redirects visit records to the canonical `placeId`, and removes duplicate place records. The merge endpoint independently verifies that every selected record is within the supplied threshold of the keeper.

Telegram place editing uses `meta.telegramEditSessions` with a 15-minute expiry. Admins tap an edit-field button and send the new value as a normal message; no `/edit` command or place ID is needed.


## Place profiles and reverse-name suggestions (schema 1.4)

The public website place cards open a full profile sheet. Every metadata field is shown even when empty; admins can open the complete edit form from that profile and save through the authenticated Worker API. No GitHub token is exposed to the browser.

`GET /api/admin/name-suggestion?lat=...&lng=...` is an authenticated, on-demand reverse-geocoding helper. It uses OpenStreetMap Nominatim and only suggests a name when a named feature of a relevant POI category is returned within 65 metres. New records with blank/generic names use the same helper automatically. If no sufficiently close named feature exists, the record is saved as `مکان بدون نام`; the Worker does not guess a nearby attraction. Nominatim results are cached and must not be used for bulk geocoding.

The admin duplicate scan examines every record with valid coordinates and reports records without valid coordinates separately. It uses complete-link groups so every proposed duplicate in a group is within the selected threshold of the canonical record and each other; ambiguous chains are not automatically merged. Every merge is confirmed by an admin and the Worker rechecks the distances before writing.
