import { describe, it, expect } from 'vitest';
import { parseReactComponent } from '../../src/pipeline/ast-parser.js';

describe('AST_Parser - parseReactComponent', () => {
  describe('Basic component extraction', () => {
    it('should extract component name and fileName from export default function', () => {
      const code = `
        import React from 'react';
        export default function MyComponent() {
          return <div>Hello</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.componentName).toBe('MyComponent');
      expect(ir.fileName).toBe('my-component');
    });

    it('should extract component from named export', () => {
      const code = `
        import React from 'react';
        export function UserProfile() {
          return <div>Profile</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.componentName).toBe('UserProfile');
      expect(ir.fileName).toBe('user-profile');
    });

    it('should extract component from export default arrow function variable', () => {
      const code = `
        import React from 'react';
        const MyWidget = () => {
          return <div>Widget</div>;
        };
        export default MyWidget;
      `;
      const ir = parseReactComponent(code);
      expect(ir.componentName).toBe('MyWidget');
      expect(ir.fileName).toBe('my-widget');
    });

    it('should extract component from exported const arrow function', () => {
      const code = `
        import React from 'react';
        export const Dashboard = () => {
          return <div>Dashboard</div>;
        };
      `;
      const ir = parseReactComponent(code);
      expect(ir.componentName).toBe('Dashboard');
      expect(ir.fileName).toBe('dashboard');
    });
  });

  describe('Props extraction', () => {
    it('should extract destructured props with TypeScript types from interface', () => {
      const code = `
        import React from 'react';
        interface MyProps {
          name: string;
          age: number;
          active?: boolean;
        }
        export default function MyComponent({ name, age, active }: MyProps) {
          return <div>{name} {age}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.props).toHaveLength(3);
      expect(ir.props[0]).toMatchObject({ name: 'name', type: 'string', isRequired: true });
      expect(ir.props[1]).toMatchObject({ name: 'age', type: 'number', isRequired: true });
      expect(ir.props[2]).toMatchObject({ name: 'active', isRequired: false });
    });

    it('should extract props from type alias', () => {
      const code = `
        import React from 'react';
        type CardProps = {
          title: string;
          subtitle?: string;
        };
        export default function Card({ title, subtitle }: CardProps) {
          return <div>{title}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.props).toHaveLength(2);
      expect(ir.props[0]).toMatchObject({ name: 'title', type: 'string', isRequired: true });
      expect(ir.props[1]).toMatchObject({ name: 'subtitle', isRequired: false });
    });

    it('should extract props with default values', () => {
      const code = `
        import React from 'react';
        interface Props {
          color: string;
          size: number;
        }
        export default function Button({ color = 'blue', size = 16 }: Props) {
          return <button style={{ color, fontSize: size }}>Click</button>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.props).toHaveLength(2);
      expect(ir.props[0]).toMatchObject({ name: 'color', defaultValue: "'blue'", isRequired: false });
      expect(ir.props[1]).toMatchObject({ name: 'size', defaultValue: '16', isRequired: false });
    });

    it('should extract props from non-destructured parameter with interface', () => {
      const code = `
        import React from 'react';
        interface ListProps {
          items: string[];
          onSelect: (item: string) => void;
        }
        export default function List(props: ListProps) {
          return <ul>{props.items.map(i => <li key={i}>{i}</li>)}</ul>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.props).toHaveLength(2);
      expect(ir.props[0]).toMatchObject({ name: 'items', type: 'string[]' });
      expect(ir.props[1]).toMatchObject({ name: 'onSelect' });
    });
  });

  describe('useState extraction', () => {
    it('should extract useState with explicit type', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Counter() {
          const [count, setCount] = useState<number>(0);
          return <div>{count}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.state).toHaveLength(1);
      expect(ir.state[0]).toMatchObject({
        variableName: 'count',
        setterName: 'setCount',
        type: 'number',
        initialValue: '0',
      });
    });

    it('should infer type from initial value', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Form() {
          const [name, setName] = useState('');
          const [items, setItems] = useState([]);
          return <div>{name}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.state).toHaveLength(2);
      expect(ir.state[0]).toMatchObject({ variableName: 'name', type: 'string' });
      expect(ir.state[1]).toMatchObject({ variableName: 'items', type: 'any[]' });
    });
  });

  describe('useEffect extraction', () => {
    it('should extract useEffect with dependencies', () => {
      const code = `
        import React, { useState, useEffect } from 'react';
        export default function Timer() {
          const [count, setCount] = useState(0);
          useEffect(() => {
            document.title = String(count);
          }, [count]);
          return <div>{count}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.effects).toHaveLength(1);
      expect(ir.effects[0].dependencies).toEqual(['count']);
      expect(ir.effects[0].body).toContain('document.title');
    });

    it('should extract useEffect with cleanup function', () => {
      const code = `
        import React, { useEffect } from 'react';
        export default function Listener() {
          useEffect(() => {
            window.addEventListener('resize', handler);
            return () => window.removeEventListener('resize', handler);
          }, []);
          return <div>Listener</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.effects).toHaveLength(1);
      expect(ir.effects[0].cleanupFunction).toBeDefined();
      expect(ir.effects[0].dependencies).toEqual([]);
    });
  });

  describe('useMemo extraction', () => {
    it('should extract useMemo with dependencies', () => {
      const code = `
        import React, { useState, useMemo } from 'react';
        export default function Expensive() {
          const [items, setItems] = useState([1, 2, 3]);
          const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);
          return <div>{total}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.memos).toHaveLength(1);
      expect(ir.memos[0].variableName).toBe('total');
      expect(ir.memos[0].dependencies).toEqual(['items']);
    });
  });

  describe('useCallback extraction', () => {
    it('should extract useCallback with parameters and dependencies', () => {
      const code = `
        import React, { useState, useCallback } from 'react';
        export default function Clicker() {
          const [count, setCount] = useState(0);
          const increment = useCallback((amount: number) => {
            setCount(prev => prev + amount);
          }, []);
          return <button onClick={() => increment(1)}>{count}</button>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.callbacks).toHaveLength(1);
      expect(ir.callbacks[0].functionName).toBe('increment');
      expect(ir.callbacks[0].parameters).toHaveLength(1);
      expect(ir.callbacks[0].parameters[0].name).toBe('amount');
    });
  });

  describe('useRef extraction', () => {
    it('should detect DOM ref (HTMLElement type)', () => {
      const code = `
        import React, { useRef } from 'react';
        export default function Input() {
          const inputRef = useRef<HTMLInputElement>(null);
          return <input ref={inputRef} />;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.refs).toHaveLength(1);
      expect(ir.refs[0]).toMatchObject({
        variableName: 'inputRef',
        isDomRef: true,
        type: 'HTMLInputElement',
      });
    });

    it('should detect value ref (non-DOM type)', () => {
      const code = `
        import React, { useRef } from 'react';
        export default function Timer() {
          const intervalRef = useRef<number>(0);
          return <div>Timer</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.refs).toHaveLength(1);
      expect(ir.refs[0]).toMatchObject({
        variableName: 'intervalRef',
        isDomRef: false,
        type: 'number',
      });
    });
  });

  describe('useContext extraction', () => {
    it('should extract useContext', () => {
      const code = `
        import React, { useContext } from 'react';
        import { ThemeContext } from './theme';
        export default function Themed() {
          const theme = useContext(ThemeContext);
          return <div className={theme.className}>Themed</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.contexts).toHaveLength(1);
      expect(ir.contexts[0]).toMatchObject({
        variableName: 'theme',
        contextName: 'ThemeContext',
      });
    });
  });

  describe('Custom hooks extraction', () => {
    it('should detect custom hook calls', () => {
      const code = `
        import React from 'react';
        import { useAuth } from './hooks/useAuth';
        export default function Profile() {
          const auth = useAuth();
          return <div>{auth.user}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.customHooks).toHaveLength(1);
      expect(ir.customHooks[0].hookName).toBe('useAuth');
      expect(ir.customHooks[0].serviceName).toBe('AuthService');
    });
  });

  describe('Methods extraction', () => {
    it('should extract function declarations inside component', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Calculator() {
          const [result, setResult] = useState(0);
          function calculate(a: number, b: number): number {
            return a + b;
          }
          return <div>{result}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.methods).toHaveLength(1);
      expect(ir.methods[0].name).toBe('calculate');
      expect(ir.methods[0].parameters).toHaveLength(2);
    });

    it('should extract arrow function methods', () => {
      const code = `
        import React from 'react';
        export default function Formatter() {
          const formatDate = (date: Date) => {
            return date.toISOString();
          };
          return <div>Formatter</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.methods).toHaveLength(1);
      expect(ir.methods[0].name).toBe('formatDate');
    });
  });

  describe('Child components detection', () => {
    it('should detect imported PascalCase components used in JSX', () => {
      const code = `
        import React from 'react';
        import Header from './Header';
        import Footer from './Footer';
        export default function Page() {
          return (
            <div>
              <Header />
              <main>Content</main>
              <Footer />
            </div>
          );
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.childComponents).toContain('Header');
      expect(ir.childComponents).toContain('Footer');
      expect(ir.childComponents).toHaveLength(2);
    });
  });

  describe('JSX tree extraction', () => {
    it('should build JSX tree with attributes', () => {
      const code = `
        import React from 'react';
        export default function App() {
          return <div className="container" id="main">Hello</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.jsxTree.tag).toBe('div');
      expect(ir.jsxTree.attributes).toHaveLength(2);
      expect(ir.jsxTree.attributes[0]).toMatchObject({ name: 'className', value: 'container', isDynamic: false });
      expect(ir.jsxTree.children).toContain('Hello');
    });

    it('should handle dynamic attributes', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Toggle() {
          const [active, setActive] = useState(false);
          return <button disabled={active} onClick={() => setActive(!active)}>Toggle</button>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.jsxTree.tag).toBe('button');
      const disabledAttr = ir.jsxTree.attributes.find(a => a.name === 'disabled');
      expect(disabledAttr?.isDynamic).toBe(true);
      const onClickAttr = ir.jsxTree.attributes.find(a => a.name === 'onClick');
      expect(onClickAttr?.isEventHandler).toBe(true);
    });

    it('should handle conditional rendering in JSX', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Conditional() {
          const [show, setShow] = useState(true);
          return (
            <div>
              {show && <span>Visible</span>}
            </div>
          );
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.jsxTree.tag).toBe('div');
      const conditionalChild = ir.jsxTree.children.find(
        c => typeof c !== 'string' && 'type' in c && c.type === 'conditional'
      );
      expect(conditionalChild).toBeDefined();
    });

    it('should handle map iterations in JSX', () => {
      const code = `
        import React from 'react';
        export default function ItemList() {
          const items = ['a', 'b', 'c'];
          return (
            <ul>
              {items.map(item => <li key={item}>{item}</li>)}
            </ul>
          );
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.jsxTree.tag).toBe('ul');
      const mapChild = ir.jsxTree.children.find(
        c => typeof c !== 'string' && 'type' in c && c.type === 'map'
      );
      expect(mapChild).toBeDefined();
    });

    it('should handle ternary expressions in JSX', () => {
      const code = `
        import React, { useState } from 'react';
        export default function Ternary() {
          const [loggedIn, setLoggedIn] = useState(false);
          return (
            <div>
              {loggedIn ? <span>Welcome</span> : <span>Please log in</span>}
            </div>
          );
        }
      `;
      const ir = parseReactComponent(code);
      const ternaryChild = ir.jsxTree.children.find(
        c => typeof c !== 'string' && 'type' in c && c.type === 'ternary'
      );
      expect(ternaryChild).toBeDefined();
    });
  });

  describe('TypeScript type interfaces', () => {
    it('should collect interface definitions', () => {
      const code = `
        import React from 'react';
        interface UserProps {
          name: string;
          email: string;
        }
        export default function User({ name, email }: UserProps) {
          return <div>{name} - {email}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.typeInterfaces.length).toBeGreaterThanOrEqual(1);
      const userProps = ir.typeInterfaces.find(ti => ti.name === 'UserProps');
      expect(userProps).toBeDefined();
      expect(userProps!.body).toContain('name: string');
    });
  });

  describe('Security warnings', () => {
    it('should detect dangerouslySetInnerHTML', () => {
      const code = `
        import React from 'react';
        export default function Unsafe() {
          return <div dangerouslySetInnerHTML={{ __html: '<b>bold</b>' }} />;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.securityWarnings.length).toBeGreaterThanOrEqual(1);
      expect(ir.securityWarnings.some(w => w.pattern === 'dangerouslySetInnerHTML')).toBe(true);
    });

    it('should detect eval usage', () => {
      const code = `
        import React from 'react';
        export default function Eval() {
          const result = eval('1 + 1');
          return <div>{result}</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.securityWarnings.some(w => w.pattern === 'eval')).toBe(true);
    });

    it('should detect document.write', () => {
      const code = `
        import React from 'react';
        export default function Writer() {
          document.write('<p>test</p>');
          return <div>Writer</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.securityWarnings.some(w => w.pattern === 'document.write')).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error with line number for invalid JSX syntax', () => {
      const code = `
        import React from 'react';
        export default function Bad() {
          return <div><span></div>;
        }
      `;
      expect(() => parseReactComponent(code)).toThrow(/Syntax error at line/);
    });

    it('should throw error when no React component is found', () => {
      const code = `
        const x = 42;
        export default x;
      `;
      expect(() => parseReactComponent(code)).toThrow(/No valid React component found/);
    });

    it('should throw error for plain TypeScript without JSX', () => {
      const code = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      expect(() => parseReactComponent(code)).toThrow(/No valid React component found/);
    });
  });

  describe('Angular-side fields initialization', () => {
    it('should initialize all Angular-side fields as empty', () => {
      const code = `
        import React from 'react';
        export default function Simple() {
          return <div>Simple</div>;
        }
      `;
      const ir = parseReactComponent(code);
      expect(ir.angularSignals).toEqual([]);
      expect(ir.angularEffects).toEqual([]);
      expect(ir.angularComputed).toEqual([]);
      expect(ir.angularInjections).toEqual([]);
      expect(ir.angularServices).toEqual([]);
      expect(ir.angularViewChildren).toEqual([]);
      expect(ir.classProperties).toEqual([]);
      expect(ir.componentMethods).toEqual([]);
      expect(ir.angularTemplate).toBe('');
      expect(ir.isInlineTemplate).toBe(true);
      expect(ir.templateBindings).toEqual([]);
      expect(ir.primeNgImports).toEqual([]);
    });
  });

  describe('Complex component', () => {
    it('should handle a component with multiple hooks and features', () => {
      const code = `
        import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from 'react';
        import Header from './Header';
        import { ThemeContext } from './theme';

        interface TodoProps {
          initialItems: string[];
        }

        export default function TodoList({ initialItems }: TodoProps) {
          const [items, setItems] = useState<string[]>(initialItems);
          const [filter, setFilter] = useState('');
          const inputRef = useRef<HTMLInputElement>(null);
          const theme = useContext(ThemeContext);

          const filteredItems = useMemo(
            () => items.filter(item => item.includes(filter)),
            [items, filter]
          );

          const addItem = useCallback((text: string) => {
            setItems(prev => [...prev, text]);
          }, []);

          useEffect(() => {
            console.log('Items changed:', items.length);
          }, [items]);

          function handleSubmit(e: React.FormEvent) {
            e.preventDefault();
            if (inputRef.current) {
              addItem(inputRef.current.value);
            }
          }

          return (
            <div className="p-4 flex flex-col">
              <Header />
              <form onSubmit={handleSubmit}>
                <input ref={inputRef} type="text" />
                <button type="submit">Add</button>
              </form>
              <ul>
                {filteredItems.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {items.length === 0 && <p>No items</p>}
            </div>
          );
        }
      `;
      const ir = parseReactComponent(code);

      expect(ir.componentName).toBe('TodoList');
      expect(ir.fileName).toBe('todo-list');
      expect(ir.props).toHaveLength(1);
      expect(ir.state).toHaveLength(2);
      expect(ir.refs).toHaveLength(1);
      expect(ir.refs[0].isDomRef).toBe(true);
      expect(ir.contexts).toHaveLength(1);
      expect(ir.memos).toHaveLength(1);
      expect(ir.callbacks).toHaveLength(1);
      expect(ir.effects).toHaveLength(1);
      expect(ir.methods).toHaveLength(1);
      expect(ir.methods[0].name).toBe('handleSubmit');
      expect(ir.childComponents).toContain('Header');
      expect(ir.jsxTree.tag).toBe('div');
    });
  });
});
