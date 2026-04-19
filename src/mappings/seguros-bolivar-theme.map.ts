/**
 * Design System de Seguros Bolívar para PrimeNG.
 * Tokens de diseño corporativos, paleta de colores, tipografía y componentes.
 */
import type { BolivarThemeToken, LayoutPattern } from '../models/primeng-mapping.model.js';

// ─── Paleta Corporativa Seguros Bolívar ─────────────────────────────────────

export const BOLIVAR_THEME_TOKENS: BolivarThemeToken[] = [
  // Colores primarios
  { token: '--sb-primary', value: '#00205B', category: 'color', description: 'Azul Bolívar principal' },
  { token: '--sb-primary-dark', value: '#001740', category: 'color', description: 'Azul Bolívar oscuro' },
  { token: '--sb-primary-light', value: '#1A3F7A', category: 'color', description: 'Azul Bolívar claro' },
  { token: '--sb-primary-50', value: '#E6EAF0', category: 'color', description: 'Azul Bolívar 50' },
  { token: '--sb-primary-100', value: '#B3BFD4', category: 'color', description: 'Azul Bolívar 100' },

  // Colores secundarios
  { token: '--sb-secondary', value: '#F7941D', category: 'color', description: 'Naranja Bolívar' },
  { token: '--sb-secondary-dark', value: '#D47A0A', category: 'color', description: 'Naranja Bolívar oscuro' },
  { token: '--sb-secondary-light', value: '#FFAD42', category: 'color', description: 'Naranja Bolívar claro' },

  // Colores de acento
  { token: '--sb-accent', value: '#00A651', category: 'color', description: 'Verde Bolívar (éxito/acción positiva)' },
  { token: '--sb-accent-light', value: '#33B873', category: 'color', description: 'Verde Bolívar claro' },

  // Colores semánticos
  { token: '--sb-success', value: '#00A651', category: 'color', description: 'Verde éxito' },
  { token: '--sb-warning', value: '#F7941D', category: 'color', description: 'Naranja advertencia' },
  { token: '--sb-danger', value: '#E4002B', category: 'color', description: 'Rojo error/peligro' },
  { token: '--sb-info', value: '#0072CE', category: 'color', description: 'Azul información' },

  // Fondos
  { token: '--sb-bg-primary', value: '#FFFFFF', category: 'color', description: 'Fondo principal' },
  { token: '--sb-bg-secondary', value: '#F5F7FA', category: 'color', description: 'Fondo secundario (gris claro)' },
  { token: '--sb-bg-tertiary', value: '#EDF0F5', category: 'color', description: 'Fondo terciario' },
  { token: '--sb-bg-dark', value: '#00205B', category: 'color', description: 'Fondo oscuro (header/footer)' },
  { token: '--sb-bg-sidebar', value: '#001740', category: 'color', description: 'Fondo sidebar' },
  { token: '--sb-bg-card', value: '#FFFFFF', category: 'color', description: 'Fondo de tarjetas' },
  { token: '--sb-bg-hover', value: '#E6EAF0', category: 'color', description: 'Fondo hover' },
  { token: '--sb-bg-selected', value: '#D6E4F0', category: 'color', description: 'Fondo seleccionado' },

  // Texto
  { token: '--sb-text-primary', value: '#1A1A2E', category: 'color', description: 'Texto principal' },
  { token: '--sb-text-secondary', value: '#5A6275', category: 'color', description: 'Texto secundario' },
  { token: '--sb-text-disabled', value: '#9CA3AF', category: 'color', description: 'Texto deshabilitado' },
  { token: '--sb-text-inverse', value: '#FFFFFF', category: 'color', description: 'Texto sobre fondo oscuro' },
  { token: '--sb-text-link', value: '#0072CE', category: 'color', description: 'Texto de enlaces' },

  // Bordes
  { token: '--sb-border-color', value: '#D1D5DB', category: 'border', description: 'Color de borde estándar' },
  { token: '--sb-border-light', value: '#E5E7EB', category: 'border', description: 'Borde claro' },
  { token: '--sb-border-focus', value: '#00205B', category: 'border', description: 'Borde en foco' },
  { token: '--sb-border-radius-sm', value: '4px', category: 'border', description: 'Radio pequeño' },
  { token: '--sb-border-radius', value: '8px', category: 'border', description: 'Radio estándar' },
  { token: '--sb-border-radius-lg', value: '12px', category: 'border', description: 'Radio grande' },
  { token: '--sb-border-radius-xl', value: '16px', category: 'border', description: 'Radio extra grande' },
  { token: '--sb-border-radius-full', value: '9999px', category: 'border', description: 'Radio circular' },

  // Spacing
  { token: '--sb-spacing-2xs', value: '2px', category: 'spacing', description: 'Espaciado 2xs' },
  { token: '--sb-spacing-xs', value: '4px', category: 'spacing', description: 'Espaciado xs' },
  { token: '--sb-spacing-sm', value: '8px', category: 'spacing', description: 'Espaciado sm' },
  { token: '--sb-spacing-md', value: '12px', category: 'spacing', description: 'Espaciado md' },
  { token: '--sb-spacing-lg', value: '16px', category: 'spacing', description: 'Espaciado lg' },
  { token: '--sb-spacing-xl', value: '24px', category: 'spacing', description: 'Espaciado xl' },
  { token: '--sb-spacing-2xl', value: '32px', category: 'spacing', description: 'Espaciado 2xl' },
  { token: '--sb-spacing-3xl', value: '48px', category: 'spacing', description: 'Espaciado 3xl' },
  { token: '--sb-spacing-4xl', value: '64px', category: 'spacing', description: 'Espaciado 4xl' },

  // Tipografía
  { token: '--sb-font-family', value: "'Montserrat', 'Segoe UI', system-ui, sans-serif", category: 'typography', description: 'Familia tipográfica principal' },
  { token: '--sb-font-family-mono', value: "'JetBrains Mono', 'Fira Code', monospace", category: 'typography', description: 'Familia monoespaciada' },
  { token: '--sb-font-size-xs', value: '0.75rem', category: 'typography', description: '12px' },
  { token: '--sb-font-size-sm', value: '0.875rem', category: 'typography', description: '14px' },
  { token: '--sb-font-size-base', value: '1rem', category: 'typography', description: '16px' },
  { token: '--sb-font-size-lg', value: '1.125rem', category: 'typography', description: '18px' },
  { token: '--sb-font-size-xl', value: '1.25rem', category: 'typography', description: '20px' },
  { token: '--sb-font-size-2xl', value: '1.5rem', category: 'typography', description: '24px' },
  { token: '--sb-font-size-3xl', value: '1.875rem', category: 'typography', description: '30px' },
  { token: '--sb-font-size-4xl', value: '2.25rem', category: 'typography', description: '36px' },
  { token: '--sb-font-weight-regular', value: '400', category: 'typography', description: 'Peso regular' },
  { token: '--sb-font-weight-medium', value: '500', category: 'typography', description: 'Peso medio' },
  { token: '--sb-font-weight-semibold', value: '600', category: 'typography', description: 'Peso semi-bold' },
  { token: '--sb-font-weight-bold', value: '700', category: 'typography', description: 'Peso bold' },
  { token: '--sb-line-height-tight', value: '1.25', category: 'typography', description: 'Interlineado compacto' },
  { token: '--sb-line-height-base', value: '1.5', category: 'typography', description: 'Interlineado base' },
  { token: '--sb-line-height-relaxed', value: '1.75', category: 'typography', description: 'Interlineado relajado' },

  // Sombras
  { token: '--sb-shadow-sm', value: '0 1px 2px rgba(0, 32, 91, 0.06)', category: 'shadow', description: 'Sombra pequeña' },
  { token: '--sb-shadow', value: '0 2px 4px rgba(0, 32, 91, 0.08)', category: 'shadow', description: 'Sombra estándar' },
  { token: '--sb-shadow-md', value: '0 4px 8px rgba(0, 32, 91, 0.10)', category: 'shadow', description: 'Sombra media' },
  { token: '--sb-shadow-lg', value: '0 8px 16px rgba(0, 32, 91, 0.12)', category: 'shadow', description: 'Sombra grande' },
  { token: '--sb-shadow-xl', value: '0 16px 32px rgba(0, 32, 91, 0.16)', category: 'shadow', description: 'Sombra extra grande' },
  { token: '--sb-shadow-card', value: '0 2px 8px rgba(0, 32, 91, 0.08)', category: 'shadow', description: 'Sombra de tarjeta' },

  // Transiciones
  { token: '--sb-transition-fast', value: '150ms cubic-bezier(0.4, 0, 0.2, 1)', category: 'motion', description: 'Transición rápida' },
  { token: '--sb-transition-base', value: '250ms cubic-bezier(0.4, 0, 0.2, 1)', category: 'motion', description: 'Transición base' },
  { token: '--sb-transition-slow', value: '350ms cubic-bezier(0.4, 0, 0.2, 1)', category: 'motion', description: 'Transición lenta' },
];


// ─── Mapeo de colores genéricos → tokens Bolívar ────────────────────────────

export const COLOR_TO_BOLIVAR_MAP: Record<string, string> = {
  // Azules genéricos → Azul Bolívar
  '#1976d2': 'var(--sb-primary)',
  '#1565c0': 'var(--sb-primary-dark)',
  '#42a5f5': 'var(--sb-primary-light)',
  '#1a73e8': 'var(--sb-primary)',
  '#2196f3': 'var(--sb-info)',
  '#0072ce': 'var(--sb-info)',
  'blue': 'var(--sb-primary)',

  // Naranjas → Naranja Bolívar
  '#ff9800': 'var(--sb-secondary)',
  '#f57c00': 'var(--sb-secondary-dark)',
  '#ffb74d': 'var(--sb-secondary-light)',
  '#f7941d': 'var(--sb-secondary)',
  'orange': 'var(--sb-secondary)',

  // Verdes → Verde Bolívar
  '#4caf50': 'var(--sb-success)',
  '#388e3c': 'var(--sb-accent)',
  '#66bb6a': 'var(--sb-accent-light)',
  '#00a651': 'var(--sb-success)',
  'green': 'var(--sb-success)',

  // Rojos → Rojo Bolívar
  '#f44336': 'var(--sb-danger)',
  '#d32f2f': 'var(--sb-danger)',
  '#e53935': 'var(--sb-danger)',
  '#dc004e': 'var(--sb-danger)',
  '#e4002b': 'var(--sb-danger)',
  'red': 'var(--sb-danger)',

  // Grises → Tokens Bolívar
  '#f5f5f5': 'var(--sb-bg-secondary)',
  '#f8f9fa': 'var(--sb-bg-secondary)',
  '#e0e0e0': 'var(--sb-border-color)',
  '#d1d5db': 'var(--sb-border-color)',
  '#ccc': 'var(--sb-border-color)',
  '#cccccc': 'var(--sb-border-color)',
  '#333': 'var(--sb-text-primary)',
  '#333333': 'var(--sb-text-primary)',
  '#666': 'var(--sb-text-secondary)',
  '#666666': 'var(--sb-text-secondary)',
  '#999': 'var(--sb-text-disabled)',
  '#9ca3af': 'var(--sb-text-disabled)',

  // Blancos/Negros
  '#ffffff': 'var(--sb-bg-primary)',
  '#fff': 'var(--sb-bg-primary)',
  'white': 'var(--sb-bg-primary)',
  '#000000': 'var(--sb-text-primary)',
  '#000': 'var(--sb-text-primary)',

  // Fuentes genéricas
  'Arial': 'var(--sb-font-family)',
  'Helvetica': 'var(--sb-font-family)',
  'sans-serif': 'var(--sb-font-family)',
  'Roboto': 'var(--sb-font-family)',
  'Inter': 'var(--sb-font-family)',
  "'Segoe UI'": 'var(--sb-font-family)',
};

// ─── Mapeo de severidades MUI → PrimeNG ─────────────────────────────────────

export const SEVERITY_MAP: Record<string, string> = {
  'primary': 'primary',
  'secondary': 'secondary',
  'error': 'danger',
  'warning': 'warning',
  'info': 'info',
  'success': 'success',
  'default': 'secondary',
  'inherit': 'secondary',
};

// ─── Mapeo de variantes de botón ────────────────────────────────────────────

export const BUTTON_VARIANT_MAP: Record<string, string> = {
  'contained': '',           // default en PrimeNG
  'outlined': 'outlined',
  'text': 'text',
  'elevated': 'raised',
};

// ─── Patrones de layout Seguros Bolívar ─────────────────────────────────────

export const BOLIVAR_LAYOUT_PATTERNS: LayoutPattern[] = [
  {
    name: 'sb-page-layout',
    description: 'Layout principal de página con header, sidebar y contenido',
    primeNgStructure: `<div class="sb-layout">
  <p-menubar [model]="menuItems" styleClass="sb-header" />
  <div class="sb-layout__body">
    <p-sidebar [(visible)]="sidebarVisible" styleClass="sb-sidebar" [modal]="false">
      <p-panelMenu [model]="sideMenuItems" styleClass="sb-side-menu" />
    </p-sidebar>
    <main class="sb-layout__content">
      <p-breadcrumb [model]="breadcrumbs" [home]="home" styleClass="sb-breadcrumb" />
      <router-outlet />
    </main>
  </div>
</div>`,
    bolivarVariant: 'standard',
  },
  {
    name: 'sb-form-layout',
    description: 'Layout de formulario con validación y secciones',
    primeNgStructure: `<form [formGroup]="form" (ngSubmit)="onSubmit()" class="sb-form">
  <p-card styleClass="sb-card sb-form__section">
    <ng-template pTemplate="header">
      <h3 class="sb-form__title">Título de Sección</h3>
    </ng-template>
    <ng-template pTemplate="content">
      <div class="sb-form__grid">
        <div class="sb-form__field">
          <label class="sb-label">Campo</label>
          <input pInputText formControlName="field" class="sb-input" />
          <small class="sb-error">Mensaje de error</small>
        </div>
      </div>
    </ng-template>
  </p-card>
  <div class="sb-form__actions">
    <p-button label="Cancelar" severity="secondary" [outlined]="true" />
    <p-button label="Guardar" type="submit" />
  </div>
</form>`,
    bolivarVariant: 'standard',
  },
  {
    name: 'sb-crud-layout',
    description: 'Layout CRUD con tabla, filtros y acciones',
    primeNgStructure: `<div class="sb-crud">
  <p-toolbar styleClass="sb-toolbar">
    <div class="p-toolbar-group-start">
      <h2 class="sb-crud__title">Gestión de Recursos</h2>
    </div>
    <div class="p-toolbar-group-end">
      <p-button label="Nuevo" icon="pi pi-plus" (onClick)="openNew()" />
    </div>
  </p-toolbar>

  <p-card styleClass="sb-card">
    <ng-template pTemplate="content">
      <p-table [value]="items" [paginator]="true" [rows]="10"
        [globalFilterFields]="['field1', 'field2']" styleClass="sb-table">
        <ng-template pTemplate="caption">
          <div class="sb-table__search">
            <span class="p-input-icon-left">
              <i class="pi pi-search"></i>
              <input pInputText placeholder="Buscar..." (input)="onGlobalFilter($event)" />
            </span>
          </div>
        </ng-template>
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="field">Campo <p-sortIcon field="field" /></th>
            <th>Acciones</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-item>
          <tr>
            <td>{{ item.field }}</td>
            <td>
              <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" (onClick)="edit(item)" />
              <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="confirmDelete(item)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="2">No se encontraron registros.</td></tr>
        </ng-template>
      </p-table>
    </ng-template>
  </p-card>

  <p-confirmDialog styleClass="sb-confirm-dialog" />
  <p-toast position="bottom-right" styleClass="sb-toast" />
</div>`,
    bolivarVariant: 'standard',
  },
  {
    name: 'sb-dashboard-layout',
    description: 'Layout de dashboard con KPIs y gráficos',
    primeNgStructure: `<div class="sb-dashboard">
  <div class="sb-dashboard__kpis">
    <p-card styleClass="sb-kpi-card" *ngFor="let kpi of kpis">
      <ng-template pTemplate="content">
        <div class="sb-kpi">
          <i [class]="kpi.icon + ' sb-kpi__icon'"></i>
          <div class="sb-kpi__data">
            <span class="sb-kpi__value">{{ kpi.value }}</span>
            <span class="sb-kpi__label">{{ kpi.label }}</span>
          </div>
        </div>
      </ng-template>
    </p-card>
  </div>
  <div class="sb-dashboard__charts">
    <!-- Gráficos con p-chart -->
  </div>
</div>`,
    bolivarVariant: 'standard',
  },
];
