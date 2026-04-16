// =============================================================================
// Integration tests – full conversion pipeline with realistic React components
// =============================================================================
// Tests complete conversions of realistic React components through the full
// pipeline: parseReactComponent → mapStateToAngular → generateAngularTemplate
// → mapToPrimeNG → emitAngularArtifact
//
// Validates: Requirements 1.1-1.5, 2.1, 2.3, 3.1, 4.1, 5.1, 6.1, 9.1, 11.1, 12.4

import { describe, it, expect } from 'vitest';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';
import { mapStateToAngular } from '../../src/pipeline/state-mapper.js';
import { generateAngularTemplate } from '../../src/pipeline/template-generator.js';
import { mapToPrimeNG } from '../../src/pipeline/primeng-mapper.js';
import { emitAngularArtifact } from '../../src/emitter/code-emitter.js';
import type { AngularArtifact } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run the full pipeline on a React source string and return the artifact. */
function convertFull(source: string): AngularArtifact {
  const ir1 = parseReactComponent(source);
  const ir2 = mapStateToAngular(ir1);
  const ir3 = generateAngularTemplate(ir2);
  const ir4 = mapToPrimeNG(ir3);
  return emitAngularArtifact(ir4);
}

/** Assert the artifact contains the three expected files. */
function expectThreeFiles(artifact: AngularArtifact) {
  expect(artifact.componentFile).toBeDefined();
  expect(artifact.componentFile.length).toBeGreaterThan(0);
  expect(artifact.specFile).toBeDefined();
  expect(artifact.specFile.length).toBeGreaterThan(0);
  expect(artifact.tailwindConfig).toBeDefined();
  expect(artifact.tailwindConfig.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// 1. Component with useState, useEffect, and conditional JSX
// ---------------------------------------------------------------------------

describe('Full conversion: useState + useEffect + conditional JSX', () => {
  const source = `
    import React, { useState, useEffect } from 'react';

    export default function UserStatus() {
      const [isOnline, setIsOnline] = useState<boolean>(false);
      const [name, setName] = useState<string>('Guest');

      useEffect(() => {
        const timer = setTimeout(() => setIsOnline(true), 1000);
        return () => clearTimeout(timer);
      }, []);

      return (
        <div className="flex items-center gap-2">
          {isOnline ? <span>Online</span> : <span>Offline</span>}
          <p>{name}</p>
        </div>
      );
    }
  `;

  it('produces three expected files', () => {
    const artifact = convertFull(source);
    expectThreeFiles(artifact);
  });

  it('component file contains signal() for useState', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('signal');
  });

  it('component file contains effect() for useEffect', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('effect');
  });

  it('template contains @if for conditional rendering', () => {
    const artifact = convertFull(source);
    // The template is either inline or in templateFile
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('@if');
  });
});

// ---------------------------------------------------------------------------
// 2. Component with useContext, useMemo, and iterations
// ---------------------------------------------------------------------------

describe('Full conversion: useContext + useMemo + iterations', () => {
  const source = `
    import React, { useContext, useMemo } from 'react';

    const ThemeContext = React.createContext('light');

    export default function ItemList() {
      const theme = useContext(ThemeContext);
      const items = ['Apple', 'Banana', 'Cherry'];
      const sortedItems = useMemo(() => [...items].sort(), [items]);

      return (
        <ul className="list-disc p-4">
          {sortedItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    }
  `;

  it('produces three expected files', () => {
    const artifact = convertFull(source);
    expectThreeFiles(artifact);
  });

  it('component file contains inject() for useContext', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('inject');
  });

  it('component file contains computed() for useMemo', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('computed');
  });

  it('template contains @for for iterations', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('@for');
  });
});

// ---------------------------------------------------------------------------
// 3. Component with useRef, useCallback, and event handlers
// ---------------------------------------------------------------------------

describe('Full conversion: useRef + useCallback + event handlers', () => {
  const source = `
    import React, { useRef, useCallback } from 'react';

    export default function SearchBox() {
      const inputRef = useRef<HTMLInputElement>(null);
      const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        console.log(inputRef.current?.value);
      }, []);

      return (
        <form onSubmit={handleSearch}>
          <input type="text" ref={inputRef} className="border p-2" />
          <button type="submit">Search</button>
        </form>
      );
    }
  `;

  it('produces three expected files', () => {
    const artifact = convertFull(source);
    expectThreeFiles(artifact);
  });

  it('component file contains viewChild for DOM ref', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('viewChild');
  });

  it('component file contains the callback as a method', () => {
    const artifact = convertFull(source);
    expect(artifact.componentFile).toContain('handleSearch');
  });

  it('template contains event binding for onSubmit', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('(submit)');
  });
});

// ---------------------------------------------------------------------------
// 4. Component with custom hooks
// ---------------------------------------------------------------------------

describe('Full conversion: custom hooks', () => {
  const source = `
    import React, { useState } from 'react';

    function useCounter(initial: number) {
      const [count, setCount] = useState(initial);
      return { count, increment: () => setCount(count + 1) };
    }

    export default function CounterWidget() {
      const { count, increment } = useCounter(0);

      return (
        <div>
          <p>{count}</p>
          <button onClick={increment}>+1</button>
        </div>
      );
    }
  `;

  it('produces three expected files', () => {
    const artifact = convertFull(source);
    expectThreeFiles(artifact);
  });

  it('generates a service for the custom hook', () => {
    const artifact = convertFull(source);
    expect(artifact.services.length).toBeGreaterThanOrEqual(1);
    // The service should be named after the hook
    const serviceNames = artifact.services.map((s) => s.fileName);
    expect(serviceNames.some((n) => n.includes('counter'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Component with HTML elements that map to PrimeNG
// ---------------------------------------------------------------------------

describe('Full conversion: PrimeNG element mapping', () => {
  const source = `
    import React, { useState } from 'react';

    export default function ContactForm() {
      const [name, setName] = useState('');
      const [agree, setAgree] = useState(false);

      return (
        <form>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea placeholder="Message" />
          <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} />
          <select>
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          <button type="submit">Send</button>
        </form>
      );
    }
  `;

  it('produces three expected files', () => {
    const artifact = convertFull(source);
    expectThreeFiles(artifact);
  });

  it('maps button to p-button in the template', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('p-button');
  });

  it('maps select to p-dropdown in the template', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('p-dropdown');
  });

  it('maps input text to pInputText in the template', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('pInputText');
  });

  it('maps checkbox to p-checkbox in the template', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('p-checkbox');
  });

  it('maps textarea to pInputTextarea in the template', () => {
    const artifact = convertFull(source);
    const template = artifact.templateFile ?? artifact.componentFile;
    expect(template).toContain('pInputTextarea');
  });
});
