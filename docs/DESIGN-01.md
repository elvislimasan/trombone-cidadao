# The Design System: Civic Editorial

## 1. Overview & Creative North Star: "The Digital Ombudsman"
This design system moves away from the "utility-only" look of government portals and toward a "High-End Editorial" experience. The Creative North Star is **The Digital Ombudsman**: an interface that feels like a prestigious news publication mixed with a responsive modern tool. 

We break the "template" look by utilizing **intentional asymmetry** and **tonal layering**. Instead of boxing information into rigid grids, we use breathing room and sophisticated typography to guide the citizen’s eye. This is not just a tool for complaints; it is a platform for civic discourse, requiring an authoritative yet approachable visual language.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule
Our palette is anchored by a courageous `primary` red, balanced by a sophisticated range of architectural grays.

### Core Palette (Material Design 3 Logic)
*   **Primary (#b61722):** Used for critical actions and brand presence.
*   **Surface (#f7f9fc):** The canvas. A cool, airy neutral that feels cleaner than standard gray.
*   **Surface-Container Tiers:** Use `surface_container_low` (#f2f4f7) through `surface_container_highest` (#e0e3e6) to create depth.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** To separate a sidebar from a main feed, or a header from a body, do not draw a line. Instead:
*   Shift the background color (e.g., a `surface_container_low` card sitting on a `surface` background).
*   Use negative space to imply a boundary.

### Signature Textures & Glassmorphism
*   **The Hero Gradient:** For primary CTAs or high-impact headers, use a subtle linear gradient from `primary` (#b61722) to `primary_container` (#da3437). This prevents the red from looking "flat" or "digital."
*   **Glass Floating Elements:** Floating action buttons or navigation overlays should use a semi-transparent `surface_container_lowest` (White) with a 12px `backdrop-blur`. This makes the UI feel like physical layers of frosted glass.

---

## 3. Typography: The Editorial Scale
We pair **Plus Jakarta Sans** (Display/Headlines) with **Inter** (Body) to create a "Newsroom" hierarchy.

*   **Display & Headlines (Plus Jakarta Sans):** These are your "hooks." Use `headline-lg` (2rem) with tight letter-spacing (-0.02em) for citizen reports.
*   **Body & Titles (Inter):** Optimized for readability. Use `body-lg` (1rem) for the main descriptions of civic issues to ensure clarity for all demographics.
*   **The Protocol Monospace:** Protocol numbers must use a monospace font (or Inter with `tabular-nums` enabled) to emphasize the "official" and "traceable" nature of the data.
*   **Visual Hierarchy:** Large, bold headlines convey urgency; small, all-caps `label-md` tags in `tertiary` (#006765) provide professional categorization.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are often a crutch for poor layout. In this system, hierarchy is achieved through the **Layering Principle**.

*   **Nesting:** Place a `surface_container_lowest` (#ffffff) card on top of a `surface_container_low` (#f2f4f7) background. The 2-unit shift in hex value provides a sophisticated "lift" without visual noise.
*   **Ambient Shadows:** Where floating is required (e.g., the primary "Report" button), use a highly diffused shadow: `box-shadow: 0 12px 32px -4px rgba(25, 28, 30, 0.08)`. Note the low opacity (8%) and use of the `on_surface` color as the shadow base rather than pure black.
*   **The Ghost Border:** If a border is required for accessibility (e.g., in high-contrast mode), use `outline_variant` at 15% opacity. Never use a 100% opaque border.

---

## 5. Components: Refined Interaction

### Cards & Lists
*   **Forbid Dividers:** Do not use lines between list items. Use 16px or 24px of vertical white space or a subtle background toggle between items.
*   **The Civic Card:** Use `rounded-xl` (1.5rem) for main report cards. Use `surface_container_lowest` (White) to make them pop against the `surface` background.

### Buttons
*   **Primary:** `primary` background with `on_primary` (White) text. `rounded-full` for a modern, approachable feel.
*   **Secondary:** `surface_container_high` background. No border. This creates a "soft" button that feels integrated into the page.

### Status Chips (The Semantic Layer)
Status colors must use a "Soft Background / High-Contrast Text" formula:
*   **Pending:** Background `Amber-50`, Text `Amber-700`.
*   **In Progress:** Background `Blue-50`, Text `Blue-700`.
*   **Resolved:** Background `Emerald-50`, Text `Emerald-700`.
*   **Duplicate:** Background `Gray-100`, Text `Gray-500`.

### Civic-Specific Components
*   **Protocol Badge:** A monospace string inside a `surface_container_highest` capsule.
*   **Timeline Tracker:** A vertical track using `outline_variant` (low opacity) connecting Lucide `Circle` icons to show the progress of a report.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Asymmetry:** Let a headline hang over the edge of a container or use staggered card heights in a masonry layout to feel "editorial."
*   **Use Lucide Icons Intentionally:** Icons like `Flag` or `Navigation` should be sized at 20px within a 40px touch target. Use `secondary` (#9f3f3b) for icons to give them a "muted-premium" look.
*   **Prioritize Readability:** Ensure a minimum of 4.5:1 contrast for all "on-surface" text.

### Don't:
*   **Don't use "Pure" Black:** Use `on_surface` (#191c1e) for text. It’s softer on the eyes and feels more expensive.
*   **Don't over-shadow:** If three elements are on the same level, they should not all have shadows. Only shadow the element that is "actively" floating (like a modal or a FAB).
*   **Don't use default spacing:** Avoid "10px" or "15px." Stick strictly to a 4px/8px grid (0.25rem, 0.5rem, 1rem, 1.5rem).

---

## 7. Iconography
Use the following Lucide set for consistency. Icons should always be `stroke-width={1.5}` to maintain the elegant, thin-line editorial aesthetic:
*   **Navigation:** `ArrowLeft`, `ChevronDown`, `Navigation`
*   **Actions:** `Share2`, `ThumbsUp`, `Flag`, `Send`, `Link2`, `Star`
*   **Data/Info:** `Calendar`, `MapPin`, `MessageCircle`, `FileText`, `Image`, `Play`
*   **Status:** `Loader2` (Animate with a slow, smooth rotation).