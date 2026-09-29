# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Authority and scope

The current product plan is [docs/piano-di-lavoro.md](../../docs/piano-di-lavoro.md).
This surface implements card WEB-1 only. It is an interface preview, not a working
route planner. CON-1 and the MOT/DIA cards supply the future integration.

## Users and purpose

Blind and low-vision people preparing a walking journey at home or on a phone,
using a keyboard and their own screen reader. The full product will help them
understand an area, choose and rehearse a route, and take a summary with them
(jobs J1–J4). Sighted companions are secondary users.

## Constraints

- React and Vite, as specified by WEB-1; no new server.
- Screen-reader output comes first. Voice is a later, optional feature.
- English is the reference language, with equivalent Italian interface text.
- No inferred geographic facts or competing engine/dialogue contracts.
- The preview makes no external service calls and keeps the draft only in memory.
- Real screen-reader testing is required before WEB-1 can be closed.

## Brand commitments

Keep Milo's name and existing mark from the hackathon, with clear, concise copy.
The established visual identity is recorded in DESIGN.md; this card is not a rebrand.
