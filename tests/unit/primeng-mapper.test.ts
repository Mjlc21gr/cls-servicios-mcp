import { describe, it, expect } from 'vitest';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { ComponentIR, JSXNode } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeEmptyJSXNode(): JSXNode {
  return { tag: 'div', attributes: [], children: [], isComponent: false };
}

function makeBaseIR(overrides: Partial<ComponentIR> = {}): ComponentIR {
  return {
    componentName: 'TestComponent',
    fileName: 'test-component',
    props: [],
    state: [],
    effects: [],
    memos: [],
    callbacks: [],
    refs: [],
    contexts: [],
    customHooks: [],
    methods: [],
    childComponents: [],
    jsxTree: makeEmptyJSXNode(),
    typeInterfaces: [],
    angularSignals: [],
    angularEffects: [],
    angularComputed: [],
    angularInjections: [],
    angularServices: [],
    angularViewChildren: [],
    classProperties: [],
    componentMethods: [],
    angularTemplate: '',
    isInlineTemplate: true,
    templateBindings: [],
    primeNgImports: [],
    securityWarnings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrimeNG_Mapper - mapToPrimeNG', () => {
  it('should not mutate the input IR', () => {
    const ir = makeBaseIR({ angularTemplate: '<button>Click</button>' });
    const original = JSON.parse(JSON.stringify(ir));
    mapToPrimeNG(ir);
    expect(ir).toEqual(original);
  });

  // -----------------------------------------------------------------------
  // Individual element mappings
  // -----------------------------------------------------------------------

  describe('<button> → <p-button>', () => {
    it('should replace button opening and closing tags', () => {
      const ir = makeBaseIR({ angularTemplate: '<button (click)="save()">Save</button>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-button');
      expect(result.angularTemplate).toContain('</p-button>');
      expect(result.angularTemplate).not.toContain('<button');
      expect(result.angularTemplate).not.toContain('</button>');
    });

    it('should preserve attributes on button', () => {
      const ir = makeBaseIR({ angularTemplate: '<button class="btn" [disabled]="loading">Go</button>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('class="btn"');
      expect(result.angularTemplate).toContain('[disabled]="loading"');
    });
  });

  describe('<input type="text"> → <input pInputText>', () => {
    it('should add pInputText directive and remove type="text"', () => {
      const ir = makeBaseIR({ angularTemplate: '<input type="text" [value]="name" />' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('pInputText');
      expect(result.angularTemplate).not.toContain('type="text"');
    });
  });

  describe('<select> → <p-dropdown>', () => {
    it('should replace select with p-dropdown', () => {
      const ir = makeBaseIR({ angularTemplate: '<select [ngModel]="val"><option>A</option></select>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-dropdown');
      expect(result.angularTemplate).toContain('</p-dropdown>');
      expect(result.angularTemplate).not.toContain('<select');
    });
  });

  describe('<table> → <p-table>', () => {
    it('should replace table with p-table', () => {
      const ir = makeBaseIR({ angularTemplate: '<table class="data"><tr><td>1</td></tr></table>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-table');
      expect(result.angularTemplate).toContain('</p-table>');
      expect(result.angularTemplate).not.toContain('<table');
    });
  });

  describe('<input type="checkbox"> → <p-checkbox>', () => {
    it('should replace checkbox input with p-checkbox', () => {
      const ir = makeBaseIR({ angularTemplate: '<input type="checkbox" [checked]="done" />' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-checkbox');
      expect(result.angularTemplate).not.toContain('type="checkbox"');
    });
  });

  describe('<textarea> → <textarea pInputTextarea>', () => {
    it('should add pInputTextarea directive', () => {
      const ir = makeBaseIR({ angularTemplate: '<textarea rows="4">text</textarea>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('pInputTextarea');
      expect(result.angularTemplate).toContain('</textarea>');
    });

    it('should not duplicate pInputTextarea if already present', () => {
      const ir = makeBaseIR({ angularTemplate: '<textarea pInputTextarea rows="4">text</textarea>' });
      const result = mapToPrimeNG(ir);
      const count = (result.angularTemplate.match(/pInputTextarea/g) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('<dialog> → <p-dialog>', () => {
    it('should replace dialog with p-dialog', () => {
      const ir = makeBaseIR({ angularTemplate: '<dialog open>Content</dialog>' });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-dialog');
      expect(result.angularTemplate).toContain('</p-dialog>');
      expect(result.angularTemplate).not.toContain('<dialog');
    });
  });

  // -----------------------------------------------------------------------
  // Preservation of non-PrimeNG elements
  // -----------------------------------------------------------------------

  describe('Preservation of elements without PrimeNG equivalent', () => {
    it('should preserve div, span, p, h1, etc. without modification', () => {
      const template = '<div class="container"><span>Hello</span><p>World</p><h1>Title</h1></div>';
      const ir = makeBaseIR({ angularTemplate: template });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toBe(template);
    });

    it('should preserve nav, header, footer, section, article', () => {
      const template = '<nav><header>H</header><footer>F</footer><section>S</section><article>A</article></nav>';
      const ir = makeBaseIR({ angularTemplate: template });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toBe(template);
    });
  });

  // -----------------------------------------------------------------------
  // Automatic PrimeNG imports
  // -----------------------------------------------------------------------

  describe('Automatic PrimeNG imports', () => {
    it('should add ButtonModule when p-button is present', () => {
      const ir = makeBaseIR({ angularTemplate: '<p-button>Click</p-button>' });
      const result = mapToPrimeNG(ir);
      expect(result.primeNgImports).toContainEqual({
        moduleName: 'ButtonModule',
        importPath: 'primeng/button',
      });
    });

    it('should add InputTextModule when pInputText is present', () => {
      const ir = makeBaseIR({ angularTemplate: '<input pInputText />' });
      const result = mapToPrimeNG(ir);
      expect(result.primeNgImports).toContainEqual({
        moduleName: 'InputTextModule',
        importPath: 'primeng/inputtext',
      });
    });

    it('should add multiple imports for templates with multiple PrimeNG components', () => {
      const ir = makeBaseIR({
        angularTemplate: '<div><p-button>Go</p-button><input pInputText /><p-dropdown></p-dropdown></div>',
      });
      const result = mapToPrimeNG(ir);
      expect(result.primeNgImports.length).toBe(3);
      const moduleNames = result.primeNgImports.map(i => i.moduleName);
      expect(moduleNames).toContain('ButtonModule');
      expect(moduleNames).toContain('InputTextModule');
      expect(moduleNames).toContain('DropdownModule');
    });

    it('should return empty imports when no PrimeNG components are present', () => {
      const ir = makeBaseIR({ angularTemplate: '<div><span>Hello</span></div>' });
      const result = mapToPrimeNG(ir);
      expect(result.primeNgImports).toEqual([]);
    });

    it('should add all seven imports when all PrimeNG components are present', () => {
      const ir = makeBaseIR({
        angularTemplate: [
          '<p-button>B</p-button>',
          '<input pInputText />',
          '<p-dropdown></p-dropdown>',
          '<p-table></p-table>',
          '<p-checkbox />',
          '<textarea pInputTextarea></textarea>',
          '<p-dialog>D</p-dialog>',
        ].join('\n'),
      });
      const result = mapToPrimeNG(ir);
      expect(result.primeNgImports.length).toBe(7);
    });
  });

  // -----------------------------------------------------------------------
  // Mixed templates
  // -----------------------------------------------------------------------

  describe('Mixed templates with PrimeNG and non-PrimeNG elements', () => {
    it('should replace PrimeNG-eligible elements and preserve others', () => {
      const ir = makeBaseIR({
        angularTemplate: '<div><button>Save</button><span>Info</span><select></select></div>',
      });
      const result = mapToPrimeNG(ir);
      expect(result.angularTemplate).toContain('<p-button');
      expect(result.angularTemplate).toContain('<p-dropdown');
      expect(result.angularTemplate).toContain('<span>Info</span>');
      expect(result.angularTemplate).toContain('<div>');
    });
  });
});
