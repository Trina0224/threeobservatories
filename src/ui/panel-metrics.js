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

// `height` for the bottom panels, `bottom` for the headers: a card between them
// needs to know where the header ends, and the header's own top offset is a
// safe-area expression, so measuring its bottom edge answers both at once.
const TRACKED = [
  ['.controls', '--controls-h', 'height'],
  ['.roman-controls', '--roman-controls-h', 'height'],
  ['.mission-title', '--observatory-head-bottom', 'bottom'],
  ['.roman-head', '--roman-head-bottom', 'bottom'],
];

function publish(element, property, measure) {
  const rect = element.getBoundingClientRect();
  const value = Math.round(measure === 'bottom' ? rect.bottom : rect.height);
  if (value > 0) document.documentElement.style.setProperty(property, `${value}px`);
}

export function trackPanelHeights() {
  for (const [selector, property, measure] of TRACKED) {
    const element = document.querySelector(selector);
    if (!element) continue;
    publish(element, property, measure);
    // Fires when the element reflows and when it is shown after being hidden,
    // which is what keeps the two modes in step without either renderer
    // knowing about the other.
    new ResizeObserver(() => publish(element, property, measure)).observe(element);
  }
  // A header's bottom edge moves when the viewport resizes even if its own box
  // does not change, which a ResizeObserver on it would not see.
  addEventListener('resize', () => {
    for (const [selector, property, measure] of TRACKED) {
      const element = document.querySelector(selector);
      if (element) publish(element, property, measure);
    }
  });
}

trackPanelHeights();
