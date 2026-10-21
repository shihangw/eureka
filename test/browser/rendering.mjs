/**
 * Reads the real computed rendering of fixture elements and compares it with
 * the effects defined in app/styles/content.css.
 */
import { expect } from '@playwright/test';

/** Computed properties any of the three highlight effects may change. */
export const EFFECT_PROPERTIES = Object.freeze([
  'backgroundColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textDecorationThickness',
  'textDecorationColor',
  'textUnderlineOffset',
  'borderRadius',
  'boxShadow',
]);

/** Properties that must look the same on highlighted text as before highlighting. */
export const FONT_PROPERTIES = Object.freeze([
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'color',
]);

/** Browser-normalized computed values of each style in content.css. */
export const STYLE_EFFECTS = Object.freeze({
  yellow: { backgroundColor: 'rgb(255, 242, 58)' },
  underline: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
    textDecorationThickness: '2px',
    textDecorationColor: 'rgb(249, 171, 0)',
    textUnderlineOffset: '2px',
  },
  glow: {
    backgroundColor: 'rgba(255, 235, 59, 0.45)',
    borderRadius: '2px',
    boxShadow: 'rgba(255, 235, 59, 0.75) 0px 0px 4px 2px',
  },
});

export const STYLES = Object.freeze(Object.keys(STYLE_EFFECTS));

/**
 * Expected computed effect properties of a highlight span. Properties a style
 * does not set keep their initial values; the decoration color is currentColor.
 */
export function expectedSpanStyle(style, color) {
  return {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
    textDecorationThickness: 'auto',
    textDecorationColor: color,
    textUnderlineOffset: 'auto',
    borderRadius: '0px',
    boxShadow: 'none',
    ...STYLE_EFFECTS[style],
  };
}

/**
 * Snapshots elements by ID: attributes, resolved link destination, markup with
 * highlight spans unwrapped, each non-whitespace text node with its font and
 * whether a highlight span wraps it, the element's own effect properties and
 * the computed style of every highlight span inside it.
 */
export function readElements(page, ids) {
  return page.evaluate(
    ({ ids, effectProperties, fontProperties }) => {
      const pick = (element, properties) => {
        const style = getComputedStyle(element);
        return Object.fromEntries(properties.map((property) => [property, style[property]]));
      };
      const isHighlight = (node) =>
        node instanceof HTMLSpanElement && node.className.startsWith('eureka-highlight-');
      return Object.fromEntries(
        ids.map((id) => {
          const element = document.getElementById(id);
          const texts = [];
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (/^\s*$/.test(node.nodeValue)) continue;
            texts.push({
              text: node.nodeValue,
              highlighted: isHighlight(node.parentElement),
              font: pick(node.parentElement, fontProperties),
            });
          }
          const unwrapped = element.cloneNode(true);
          for (const span of [...unwrapped.querySelectorAll('span')].filter(isHighlight)) {
            span.replaceWith(...span.childNodes);
          }
          const spans = [...element.querySelectorAll('span')].filter(isHighlight);
          return [
            id,
            {
              attributes: Object.fromEntries(
                [...element.attributes].map((attribute) => [attribute.name, attribute.value])
              ),
              destination: element instanceof HTMLAnchorElement ? element.href : null,
              html: unwrapped.innerHTML,
              texts,
              style: pick(element, effectProperties),
              highlights: spans.map((span) => ({
                className: span.className,
                color: getComputedStyle(span).color,
                style: pick(span, effectProperties),
              })),
            },
          ];
        })
      );
    },
    { ids, effectProperties: EFFECT_PROPERTIES, fontProperties: FONT_PROPERTIES }
  );
}

/** Drops the highlight flag so text and fonts can be compared with a baseline. */
const plainTexts = (state) => state.texts.map(({ text, font }) => ({ text, font }));

/**
 * Asserts that `ids` are fully highlighted with the real computed `style`
 * effect and otherwise unchanged from their unhighlighted `baseline` snapshot.
 */
export function expectHighlighted(current, baseline, ids, style) {
  for (const id of ids) {
    const state = current[id];
    expect(state.highlights.length, `${id} highlight spans`).toBeGreaterThan(0);
    expect(
      state.texts.filter((entry) => !entry.highlighted),
      `${id} text outside highlight`
    ).toEqual([]);
    for (const span of state.highlights) {
      expect(span.className, `${id} class`).toBe(`eureka-highlight-${style}`);
      expect(span.style, `${id} computed ${style}`).toEqual(expectedSpanStyle(style, span.color));
    }
    expectUnchanged(current, baseline, [id]);
  }
}

/** Asserts that `ids` carry no highlight and match their `baseline` snapshot exactly. */
export function expectNotHighlighted(current, baseline, ids) {
  for (const id of ids) {
    expect(current[id].highlights, `${id} highlight spans`).toEqual([]);
    expect(current[id], `${id} unchanged`).toEqual(baseline[id]);
  }
}

function expectUnchanged(current, baseline, ids) {
  for (const id of ids) {
    expect(current[id].attributes, `${id} attributes`).toEqual(baseline[id].attributes);
    expect(current[id].destination, `${id} destination`).toBe(baseline[id].destination);
    expect(current[id].html, `${id} content`).toBe(baseline[id].html);
    expect(plainTexts(current[id]), `${id} text and font`).toEqual(plainTexts(baseline[id]));
    expect(current[id].style, `${id} own style`).toEqual(baseline[id].style);
  }
}
