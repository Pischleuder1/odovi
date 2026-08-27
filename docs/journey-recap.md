# Journey recap

The journey recap is an authenticated, immersive presentation of an existing
journey. It is available at `/journey-recap/[id]` and linked from the regular
journey detail page. The same experience is available for a single calendar day
at `/day-recap/[date]` when that vehicle has at least two drives on the day; the
day view exposes the entry point and preserves the selected vehicle.

## Interaction model

- Every intro, drive, charging stop, and finale is a real full-viewport section
  in the document flow. Scrolling therefore moves content through the viewport
  instead of only swapping text in a fixed stage.
- Section heights are deliberately unequal: the intro, charging stops, and the
  finale get more scroll distance than ordinary drives. The camera eases into a
  short mid-section hold without changing either endpoint, so forward and
  reverse scrolling keep the same continuous route handoff.
- The active chapter is derived from the actual center positions of those DOM
  sections. Play, chapter dots, and arrow controls scroll to the real section
  center; they must not estimate targets from a fixed pixel height or an equal
  percentage of the document.
- Starting Play between two chapters first snaps to the nearest chapter. Manual
  wheel, touch, or navigation-key input pauses autoplay.
- The speed control changes both the delay between chapters and the animated
  transition duration. Reduced Motion disables autoplay and smooth movement.
- Dense journeys use one continuous range rail instead of one equally weighted
  dot per chapter. Charging stops and the final destination remain visible as
  milestones; previous/next buttons and the range input provide keyboard and
  direct navigation for every chapter.

## Route scene

The background scene is a lightweight Canvas projection, not a separate 3D
framework. GPS points use `[latitude, longitude]` coordinates normalized across
the complete journey:

- longitude maps to the horizontal east-west axis;
- increasing latitude maps north and is always projected towards the top of the
  viewport;
- camera yaw stays fixed so zoom, tilt, pointer parallax, and camera travel do
  not rotate the compass orientation;
- the current route point is the camera focus, the completed route is drawn as
  a bright trail, and the remaining route stays visible as a subtle guide;
- chapter transitions interpolate route progress, keep camera direction stable,
  and use restrained zoom changes rather than reversing or orbiting at seams;
- route-derived contour islands and a subdued ground plane add spatial depth
  without replacing the real GPS geometry with generated imagery.

A small north marker makes the stable orientation explicit. Semantic journey
content remains HTML above the decorative `aria-hidden` canvas.

## Mobile navigation

`/journeys` is a first-class item in the mobile bottom navigation. The recap
uses its own full-screen layout but remains session-protected server-side.

## Verification

Run the focused derivation tests and a production build:

```bash
pnpm --filter @odovi/web test -- --run lib/journeyRecap.test.ts
pnpm --filter @odovi/web lint
pnpm --filter @odovi/web build
```

Browser verification should cover desktop and an iPhone-sized viewport. In
particular, pause between two chapters, press Play, and verify that the selected
section is centered exactly before autoplay continues.
