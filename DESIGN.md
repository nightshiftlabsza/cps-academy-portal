# CPS Academy Portal — Design System

## Theme Architecture

The CPS Academy Portal supports three institutional themes:

1. Academic Emerald
2. Clinical Cobalt
3. Editorial Plum

Each theme supports both:
- Light mode
- Dark mode

Do NOT create separate unrelated visual systems for light and dark modes.

The themes should share the same structural layout, spacing, component system, typography hierarchy, and interaction patterns.

Only the intended theme tokens should vary.

---

## Runtime Theme Model

The real application uses:

data-theme="emerald" | "cobalt" | "plum"

and:

data-mode="light" | "dark"

Treat theme and mode as two independent dimensions.

The visual design must therefore work correctly in all six combinations:

- Academic Emerald Light
- Academic Emerald Dark
- Clinical Cobalt Light
- Clinical Cobalt Dark
- Editorial Plum Light
- Editorial Plum Dark

---

## Shared Light Mode Surface Tokens

Canvas:
#F5F6F8

Surface:
#FFFFFF

Raised Surface:
#FFFFFF

Hover Surface:
#E9EDF2

Primary Text:
#18212F

Secondary Text:
#384455

Muted Text:
#414D5E

Subtle Border:
#DCE2E9

Control Border:
#69768A

Calm Background:
#E8EDF3

Calm Foreground:
#354255

Warning Background:
#FFF0CC

Warning Foreground:
#704400

Urgent Background:
#FFE5DE

Urgent Foreground:
#8B281E

---

## Shared Dark Mode Surface Tokens

Canvas:
#11151C

Surface:
#191F28

Raised Surface:
#232B36

Hover Surface:
#2B3542

Primary Text:
#F2F4F7

Secondary Text:
#CED5DF

Muted Text:
#BFCBDA

Subtle Border:
#3B4655

Control Border:
#8593A6

Calm Background:
#293440

Calm Foreground:
#DCE5F0

Warning Background:
#3E3019

Warning Foreground:
#FFD88A

Urgent Background:
#432622

Urgent Foreground:
#FFC8B9

---

# THEME 1 — Academic Emerald

Internal key:
emerald

This is the default CPS theme.

## Light

Brand:
#07543F

Brand Hover:
#034632

Brand Soft:
#E1EEE7

On Brand:
#FFFFFF

Display typography:
Editorial serif / Georgia-style

Visual tone:
- scholarly
- calm
- traditional academic
- prestigious
- restrained
- highly legible

Avoid:
- overly clinical blue tones
- trendy startup styling
- excessive rounded cards
- overly decorative green surfaces

## Dark

Brand:
#91D8B5

Brand Hover:
#B0E6CA

Brand Soft:
#183B30

On Brand:
#11151C

The dark version must feel like the same Academic Emerald theme,
not a separate dark product.

---

# THEME 2 — Clinical Cobalt

Internal key:
cobalt

## Light

Brand:
#2042A0

Brand Hover:
#183580

Brand Soft:
#E6ECFC

On Brand:
#FFFFFF

Display typography:
Sans-serif / system UI

Visual tone:
- clinical
- modern
- structured
- precise
- crisp
- slightly more utilitarian than Academic Emerald

Avoid:
- looking like Microsoft admin software
- bright electric blue everywhere
- hospital dashboard cliché

## Dark

Brand:
#B0C6FF

Brand Hover:
#CFDCFF

Brand Soft:
#263555

On Brand:
#11151C

---

# THEME 3 — Editorial Plum

Internal key:
plum

## Light

Brand:
#623D69

Brand Hover:
#4E2D54

Brand Soft:
#F1E8EF

On Brand:
#FFFFFF

Display typography:
Editorial serif / Georgia-style

Visual tone:
- editorial
- thoughtful
- sophisticated
- warm
- publication-like
- academic but less formal than Emerald

Avoid:
- pink UI
- decorative luxury branding
- fashion-magazine styling

## Dark

Brand:
#E1BCE2

Brand Hover:
#EFDAF0

Brand Soft:
#3D2C40

On Brand:
#11151C

---

# Typography

The application uses a shared UI sans-serif for general interface content.

Display typography is theme-dependent:

Academic Emerald:
serif / editorial

Clinical Cobalt:
sans-serif

Editorial Plum:
serif / editorial

Use the display font primarily for:
- major page titles
- important section headings
- selected editorial accents

Use the UI sans-serif for:
- navigation
- tables
- labels
- buttons
- controls
- names
- metadata

Do not overuse serif typography in dense operational UI.

---

# Layout and Density

The CPS Academy Portal is an operational hub, not a marketing website.

Prefer:
- compact professional density
- strong alignment
- shallow rows
- structured grids
- efficient use of desktop width
- meaningful information above the fold

Avoid:
- giant cards
- excessive whitespace
- nested cards
- oversized toolbars
- excessive vertical padding
- large decorative empty regions

---

# Cards and Surfaces

Use cards only when grouping genuinely benefits comprehension.

Cards should use:
- subtle borders
- restrained radii
- minimal shadow
- compact internal spacing

Do not turn every data group into a large floating card.

---

# Tables

Desktop tables are a first-class pattern.

They should use:
- clear column alignment
- subtle borders
- compact rows
- strong headers
- obvious hover state
- theme-aware background tokens
- clear vacancy and status styling

Do not convert structured operational data into giant cards unnecessarily.

---

# Status Styling

Use the existing semantic families:

Calm:
for neutral/open states

Warning:
for upcoming attention states

Urgent:
for genuine urgency

Do not use urgent/red styling decoratively.

---

# Morning Report / Matrix System

Morning Report has dedicated schedule/matrix styling.

Use the following conceptual surfaces:

Light:
Matrix header background: #edf2ef
Matrix cell background: #ffffff
Matrix row hover: #f9fbfa
Matrix gap background: #fffcfc
Matrix week background: #f3f7f5

Dark:
Matrix header background: #1c364c
Matrix cell background: #132330
Matrix row hover: #1c3346
Matrix gap background: #2a1b1b
Matrix week background: #172d3f

These values are part of the existing design language.

However, do NOT preserve poor layout patterns simply because they exist in the current Morning Report implementation.

The redesign may change structure, density, hierarchy and composition while remaining faithful to the theme system.

---

# Sidebar and Global Navigation

Preserve the existing CPS product identity.

Do not redesign the portal into a generic SaaS shell.

Sidebar/navigation should remain visually subordinate to page content.

Navigation must work across all themes and both modes.

---

# Interaction Philosophy

The primary task on each page should dominate.

Rare actions should use progressive disclosure.

Do not expose:
- every filter
- every toggle
- every administrative action
- every metadata field

by default.

---

# Theme Fidelity Test

Before finalising any design, verify it visually in all six states:

1. Emerald Light
2. Emerald Dark
3. Cobalt Light
4. Cobalt Dark
5. Plum Light
6. Plum Dark

The layout and information hierarchy should remain consistent.

Only theme character, display typography and brand coloration should change.
