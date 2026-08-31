// Publishes the measured height of each fixed control panel as a CSS custom
// property on the root element.
//
// The bottom-anchored cards (event card, focus card, L2 info card, geometry
// readout) sit above a control panel whose height is not fixed: the view-button
// rows wrap at narrow widths, and media queries drop the event strip and the
// provenance line entirely. Every hard-coded `bottom` offset was therefore a
// guess that was wrong at some viewport, and the panel — which paints on a
// higher z-index — covered the card. Measure instead of guessing.
//
// A hidden panel measures zero. Publishing that would collapse the stack, so
// zero heights are skipped and the previous value stands until the panel is
// shown again; the cards belonging to a hidden panel are hidden too.

const PANELS = [
  ['.controls', '--controls-h'],
  ['.roman-controls', '--roman-controls-h'],
];

function publish(element, property) {
  const height = Math.round(element.getBoundingClientRect().height);
  if (height > 0) document.documentElement.style.setProperty(property, `${height}px`);
}

export function trackPanelHeights() {
  for (const [selector, property] of PANELS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    publish(element, property);
    // Fires when the panel reflows and when it is shown after being hidden,
    // which is what keeps the two modes in step without either renderer
    // knowing about the other.
    new ResizeObserver(() => publish(element, property)).observe(element);
  }
}

trackPanelHeights();
