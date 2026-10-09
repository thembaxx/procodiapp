# Little Less

**A little less at checkout.**

South African grocery deals, in one place.

Little Less helps shoppers see which stores have a fresh promotion, understand the terms and copy a code quickly. The name covers discounts, delivery benefits and promotions that need no code.

## Identity

Use **Little Less** in prose, page metadata and installation prompts. Use **little less** in the wordmark, with a small mint dot. The basket is the app symbol and remains readable at favicon and home-screen sizes. The dot is decorative, not part of the name.

Shared copy lives in [brand.ts](../src/lib/brand.ts). Headers and loading screens use [BrandWordmark](../src/components/brand-wordmark.tsx). The basket favicon is [icon.svg](../public/icon.svg); launcher variants are in [public/icons](../public/icons).

| Colour               | Use                                 |
| -------------------- | ----------------------------------- |
| Mint `#c4f4ca`       | Primary accent on the dark canvas   |
| Charcoal `#0b0e11`   | Default Wallet background           |
| Warm white `#f6f7f4` | Text on dark surfaces               |
| Forest `#235338`     | Accessible accent on light surfaces |

Wallet carries the primary identity. Rewards keeps its blue accent and Orbit its lavender and editorial typography. Retailer colours help people recognise their stores; they do not replace the Little Less wordmark.

Plus Jakarta Sans handles interface text, Bricolage Grotesque gives headings warmth, and Instrument Serif adds occasional emphasis. Keep generous whitespace and clear hierarchy. Avoid cramming the descriptor into small launcher icons.

## Voice

Warm, useful and specific. Say “No code needed”, “Minimum basket R500” or “Ends 12 October” when the source supports it. Explain paid memberships and delivery restrictions beside the benefit. Never imply that a source-listed code is guaranteed or tested at checkout.

Use the tagline in the homepage and sharing card. Use the descriptor near the first impression so a new visitor knows what the app does. The longer footer line is “A little less at checkout. A little more for you.”

## Motion

Small reactions should acknowledge an action: a pressed card, a successful copy, a saved offer or a gentle sparkle. Keep background scenes quiet enough for terms and codes to remain the focus. Honour reduced motion and the user's effects setting; every action must still be clear without animation.

## Naming and continuity

The consumer name is Little Less. The repository and current deployment stay at `thembaxx/procodiapp` and `https://procodiapp.vercel.app`. Keep the manifest ID, saved-preference keys and offline storage identifiers stable so existing installations retain their data.

Domain, social-handle and trademark availability have not been verified. Record those checks before adopting a dedicated brand domain; do not present the name as registered or exclusive.
