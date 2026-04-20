// =============================================================================
// Semantic HTML Engine — Eliminates unnecessary divs, enforces clean markup
// =============================================================================
// Analyzes the role of each <div> in the template and replaces it with the
// correct semantic HTML5 element based on context, class names, ARIA roles,
// and structural position.
//
// Rules:
//   - No bare <div> unless absolutely necessary (pure layout wrapper)
//   - Navigation → <nav>
//   - Page sections → <section>
//   - Independent content → <article>
//   - Side content → <aside>
//   - Page header → <header>
//   - Page footer → <footer>
//   - Main content → <main>
//   - Lists → <ul>/<ol>/<li>
//   - Figures → <figure>/<figcaption>
//   - Forms → <fieldset>/<legend>
//   - Wrapper-only divs → removed (children promoted)
// =============================================================================

// ---------------------------------------------------------------------------
// Semantic role detection patterns
// ---------------------------------------------------------------------------

interface SemanticRule {
  /** Pattern to match in class, id, or aria-role attributes */
  patterns: RegExp[];
  /** The semantic element to use */
  element: string;
}

const SEMANTIC_RULES: SemanticRule[] = [
  // Navigation
  {
    patterns: [/\b(nav|navbar|navigation|menu|sidebar-nav|breadcrumb|tabs)\b/i],
    element: 'nav',
  },
  // Header
  {
    patterns: [/\b(header|top-bar|app-bar|toolbar|banner)\b/i],
    element: 'header',
  },
  // Footer
  {
    patterns: [/\b(footer|bottom-bar|copyright)\b/i],
    element: 'footer',
  },
  // Main content
  {
    patterns: [/\b(main|main-content|content-area|page-content)\b/i],
    element: 'main',
  },
  // Aside / sidebar
  {
    patterns: [/\b(sidebar|aside|side-panel|drawer|complementary)\b/i],
    element: 'aside',
  },
  // Article / card / independent content
  {
    patterns: [/\b(article|post|card-body|blog-post|news-item|feed-item)\b/i],
    element: 'article',
  },
  // Section
  {
    patterns: [/\b(section|panel|block|segment|region|area|zone)\b/i],
    element: 'section',
  },
  // Figure
  {
    patterns: [/\b(figure|image-container|media|thumbnail|gallery-item)\b/i],
    element: 'figure',
  },
  // Form group
  {
    patterns: [/\b(form-group|field-group|fieldset|input-group)\b/i],
    element: 'fieldset',
  },
];

// ARIA role → semantic element mapping
const ARIA_ROLE_MAP: Record<string, string> = {
  navigation: 'nav',
  banner: 'header',
  contentinfo: 'footer',
  main: 'main',
  complementary: 'aside',
  article: 'article',
  region: 'section',
  figure: 'figure',
  form: 'form',
  search: 'search',
  list: 'ul',
  listitem: 'li',
};

// ---------------------------------------------------------------------------
// Div classification
// ---------------------------------------------------------------------------

type DivRole = 'semantic' | 'layout' | 'wrapper' | 'keep';

interface DivAnalysis {
  role: DivRole;
  semanticElement?: string;
  classes: string;
  hasMultipleChildren: boolean;
}


/**
 * Analyze a div's attributes to determine its semantic role.
 */
function analyzeDivRole(attrs: string, innerContent: string): DivAnalysis {
  const classMatch = attrs.match(/class="([^"]*)"/);
  const classes = classMatch?.[1] ?? '';
  const roleMatch = attrs.match(/role="([^"]*)"/);
  const ariaRole = roleMatch?.[1] ?? '';

  // Count direct children (rough heuristic)
  const childTags = innerContent.match(/<[a-z][^>]*>/g) ?? [];
  const hasMultipleChildren = childTags.length > 1;

  // 1. Check ARIA role
  if (ariaRole && ARIA_ROLE_MAP[ariaRole]) {
    return { role: 'semantic', semanticElement: ARIA_ROLE_MAP[ariaRole], classes, hasMultipleChildren };
  }

  // 2. Check class/id patterns
  const allAttrs = classes + ' ' + (attrs.match(/id="([^"]*)"/)?.[1] ?? '');
  for (const rule of SEMANTIC_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(allAttrs)) {
        return { role: 'semantic', semanticElement: rule.element, classes, hasMultipleChildren };
      }
    }
  }

  // 3. Check if it's a pure wrapper (no classes, no id, single purpose)
  const hasNoClasses = !classes.trim();
  const hasNoId = !attrs.includes('id=');
  const hasNoStyle = !attrs.includes('style=');
  const hasNoEvents = !attrs.includes('(click)') && !attrs.includes('(');

  if (hasNoClasses && hasNoId && hasNoStyle && hasNoEvents) {
    return { role: 'wrapper', classes, hasMultipleChildren };
  }

  // 4. Layout divs (only Tailwind/flex/grid classes) → keep as layout containers
  const isLayoutOnly = /^[\s]*(flex|grid|gap-|space-|items-|justify-|w-|h-|p-|m-|rounded|shadow|bg-|border|overflow|relative|absolute|block|inline)/
    .test(classes);
  if (isLayoutOnly) {
    return { role: 'layout', classes, hasMultipleChildren };
  }

  return { role: 'keep', classes, hasMultipleChildren };
}

// ---------------------------------------------------------------------------
// Main transformation functions
// ---------------------------------------------------------------------------

/**
 * Replace divs with semantic HTML elements based on their detected role.
 * Processes from innermost to outermost to handle nesting correctly.
 */
export function eliminateDivs(html: string): string {
  let result = html;
  let iterations = 0;
  const MAX_ITERATIONS = 20;

  // Process innermost divs first (no nested divs inside)
  while (iterations < MAX_ITERATIONS) {
    const before = result;

    // Match divs that don't contain other divs (leaf divs)
    result = result.replace(
      /<div(\s[^>]*)?>([^]*?)<\/div>/g,
      (match, attrs: string | undefined, content: string) => {
        // Skip if content contains another div (process inner first)
        if (content.includes('<div')) return match;

        const attrStr = attrs ?? '';
        const analysis = analyzeDivRole(attrStr, content);

        switch (analysis.role) {
          case 'semantic': {
            const el = analysis.semanticElement!;
            // Remove role attribute if we're using the semantic element
            const cleanAttrs = attrStr.replace(/\s*role="[^"]*"/, '');
            return `<${el}${cleanAttrs}>${content}</${el}>`;
          }
          case 'wrapper': {
            // Pure wrapper with no attributes → promote children
            return content;
          }
          case 'layout':
          case 'keep':
          default:
            return match;
        }
      },
    );

    if (result === before) break;
    iterations++;
  }

  return result;
}

/**
 * Convert layout-only divs to appropriate semantic containers.
 * This runs AFTER eliminateDivs to handle remaining layout divs.
 */
export function convertLayoutDivs(html: string): string {
  let result = html;

  // Div with only flex/grid + content that looks like a list → <ul>
  result = result.replace(
    /<div(\s+class="[^"]*(?:flex|grid)\s+(?:flex-col|grid-cols)[^"]*"[^>]*)>([\s\S]*?)<\/div>/g,
    (match, attrs: string, content: string) => {
      // If all children are similar elements (repeated pattern), convert to list
      const childPattern = content.match(/<(p-card|article|section|div)\b/g);
      if (childPattern && childPattern.length >= 3) {
        // Looks like a list of items
        return `<ul${attrs} role="list">${content}</ul>`;
      }
      return match;
    },
  );

  return result;
}

/**
 * Ensure the root template element is semantic.
 * If the component template starts with a bare <div>, replace with <section> or <article>.
 */
export function ensureSemanticRoot(html: string, componentName: string): string {
  const trimmed = html.trim();

  // If root is already semantic, leave it
  if (/^<(main|section|article|nav|aside|header|footer|form)\b/.test(trimmed)) {
    return html;
  }

  // If root is a div with no semantic classes, replace with section
  if (/^<div(\s[^>]*)?>/.test(trimmed)) {
    const isPage = /page|view|screen|layout/i.test(componentName);
    const replacement = isPage ? 'main' : 'section';
    return html
      .replace(/^(\s*)<div/, `$1<${replacement}`)
      .replace(/<\/div>(\s*)$/, `</${replacement}>$1`);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Master function
// ---------------------------------------------------------------------------

/**
 * Apply full semantic HTML transformation pipeline.
 * Order: semantic detection → div elimination → layout conversion → root check
 */
export function applySemanticHtml(html: string, componentName = ''): string {
  let result = html;

  // Step 1: Replace divs with detected semantic roles
  result = eliminateDivs(result);

  // Step 2: Convert remaining layout divs where appropriate
  result = convertLayoutDivs(result);

  // Step 3: Ensure root element is semantic
  result = ensureSemanticRoot(result, componentName);

  // Step 4: Clean up empty wrappers left behind
  result = result.replace(/<(section|article|div)(\s[^>]*)?>\s*<\/(section|article|div)>/g, '');

  // Step 5: Normalize whitespace
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}
