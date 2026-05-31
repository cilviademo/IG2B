# Indigold — Design Brainstorm

## Deep Space Observatory
The interface is a **personal cosmos you navigate**, not a productivity dashboard
you operate. Knowledge glows against an information darkness.

### Principles
- Near-black canvas (`oklch(0.08 0.02 280)`) — nodes glow against the dark.
- Indigo for **structure**, gold for **significance**.
- Constellation-dot textures; nodes as radial-gradient orbs.
- Observatory metaphor: observe, discover, connect.

### Typography
- Display: **Space Grotesk** · Mono/labels: **JetBrains Mono** (`.label-mono`).

### Motion
- `fadeInUp` 300ms `cubic-bezier(0.23,1,0.32,1)`, 50ms stagger.
- Interactive transitions 200ms ease-out; glow on hover.

## Open ideas (not yet built)
- Swipe-to-triage on Inbox cards.
- Client-side fuzzy search across nodes/edges/timeline.
- Atlas: level-of-detail + clustering by truth layer at high node counts.
- Self-host fonts + local-only images to complete the offline story.
- Charts on Dashboard via Recharts.
