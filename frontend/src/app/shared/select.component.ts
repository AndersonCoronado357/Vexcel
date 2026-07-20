import { Component, HostListener, computed, input, output, signal } from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
}

/** Select personalizado del diseÃ±o: popup anclado, con curva fuerte y check. */
@Component({
  selector: 'vx-select',
  template: `
    <div class="wrap">
      <button type="button" class="trigger" [class.open]="open()" (click)="toggle($event)">
        <span class="trigger-label">{{ selectedLabel() }}</span>
        <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      @if (open()) {
        <div class="pop" [class.pop-up]="openUp()" (click)="$event.stopPropagation()">
          @for (opt of options(); track opt.value) {
            <button type="button" class="opt" [class.selected]="opt.value === value()"
              (click)="pick(opt.value)">
              <span>{{ opt.label }}</span>
              @if (opt.value === value()) {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .wrap {
      position: relative;
      display: inline-block;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      background: var(--n-50);
      border-radius: 10px;
      font: 600 13px var(--font-sans);
      color: var(--n-700);
      cursor: pointer;
      transition: background 150ms ease, transform 160ms var(--ease-out-strong);
      white-space: nowrap;
    }
    .trigger:hover {
      background: var(--a-soft);
      color: var(--a-600);
    }
    .trigger:active {
      transform: scale(0.97);
    }
    .chev {
      color: var(--n-400);
      transition: transform 200ms var(--ease-out-strong);
    }
    .trigger.open .chev {
      transform: rotate(180deg);
    }
    .pop {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 168px;
      background: var(--surface);
      border-radius: 13px;
      padding: 5px;
      z-index: 60;
      animation: vx-select-in 150ms var(--ease-out-strong);
    }
    .pop-up {
      top: auto;
      bottom: calc(100% + 6px);
      animation: vx-select-up 150ms var(--ease-out-strong);
    }
    @keyframes vx-select-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes vx-select-up {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }
    .opt {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      padding: 9px 12px;
      border-radius: 9px;
      font: 500 13.5px var(--font-sans);
      color: var(--n-700);
      cursor: pointer;
      transition: background 130ms ease, color 130ms ease;
      text-align: left;
    }
    .opt:hover {
      background: var(--a-soft);
      color: var(--a-600);
    }
    .opt.selected {
      color: var(--a-600);
      font-weight: 600;
    }
  `
})
export class SelectComponent {
  readonly options = input.required<SelectOption[]>();
  readonly value = input.required<string>();
  readonly valueChange = output<string>();

  readonly open = signal(false);
  readonly openUp = signal(false);

  readonly selectedLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? ''
  );

  toggle(ev: Event): void {
    ev.stopPropagation();
    if (!this.open()) {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      this.openUp.set(window.innerHeight - rect.bottom < 200);
    }
    this.open.update((v) => !v);
  }

  pick(value: string): void {
    this.open.set(false);
    if (value !== this.value()) this.valueChange.emit(value);
  }

  @HostListener('document:click')
  close(): void {
    if (this.open()) this.open.set(false);
  }
}



