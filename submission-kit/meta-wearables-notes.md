# Meta Wearables Notes - NIAR Assistant

Prepared: 2026-06-17

## Current Official Path

Meta now has an official Wearables developer path for AI glasses:

- Meta Wearables Device Access Toolkit
- Meta Wearables Developer Center
- Web Apps for display glasses

The Device Access Toolkit supports extending iOS and Android apps to AI glasses. Official Meta docs also mention display support for Meta Ray-Ban Display, plus web app support for display glasses.

## Practical Implication For NIAR

NIAR Assistant can be adapted to Meta, but it is not the same package as Even Hub.

Even G2:
The current app is already packaged as an Even Hub `.ehpk`.

Meta:
We need a separate implementation path:

- Mobile SDK route: Swift or Kotlin companion app extension using Meta's Device Access Toolkit.
- Web app route: HTML/CSS/JS app for display-capable Meta glasses, if developer access is approved for the account.

## Recommended Order

1. Submit NIAR Assistant to Even Hub first, because the package already exists.
2. Sign up for Meta Wearables Developer Center.
3. Request access for Futurize IA / NIAR Assistant.
4. After access, port the interaction model:
   - voice prompt capture
   - NIAR backend call
   - short lens response
   - privacy and data handling copy

## Positioning

Suggested Meta pitch:
NIAR Assistant is a hands-free AI-agent interface for business owners. It lets users ask short operational questions and receive concise answers on AI glasses, reducing phone dependence during work.

## Risk / Unknowns

- Meta access may require approval or waitlist.
- Display capabilities depend on supported glasses and SDK access.
- Camera/audio permissions and review requirements may be stricter than Even Hub.
- No paid action should be taken without Rodolfo's explicit authorization.

