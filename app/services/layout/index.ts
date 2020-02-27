import isEqual from 'lodash/isEqual';
import { Inject, ViewHandler } from 'services/core';
import { PersistentStatefulService } from 'services/core/persistent-stateful-service';
import { mutation } from 'services/core/stateful-service';
import { CustomizationService } from 'services/customization';
import { $t } from 'services/i18n';
import uuid from 'uuid';
import { LAYOUT_DATA, ELEMENT_DATA, ELayout, ELayoutElement } from './layout-data';

export { ELayout, ELayoutElement };

export interface IVec2Array extends Array<IVec2Array | IVec2> {}

export type LayoutSlot = '1' | '2' | '3' | '4' | '5' | '6';

interface ILayoutState {
  name: string;
  icon: string;
  currentLayout: ELayout;
  slottedElements: { [Element in ELayoutElement]?: LayoutSlot };
  resizes: { bar1: number; bar2?: number };
}

interface ILayoutServiceState {
  currentTab: string;
  tabs: {
    [key: string]: ILayoutState;
  };
}

class LayoutViews extends ViewHandler<ILayoutServiceState> {
  get currentTab() {
    return this.state.tabs[this.state.currentTab];
  }

  get component() {
    return LAYOUT_DATA[this.currentTab.currentLayout].component;
  }

  get isColumnLayout() {
    return LAYOUT_DATA[this.currentTab.currentLayout].isColumns;
  }

  elementTitle(element: ELayoutElement) {
    if (!element) return;
    return ELEMENT_DATA()[element].title;
  }

  elementComponent(element: ELayoutElement) {
    if (!element) return;
    return ELEMENT_DATA()[element].component;
  }
}

export class LayoutService extends PersistentStatefulService<ILayoutServiceState> {
  static defaultState: ILayoutServiceState = {
    currentTab: 'default',
    tabs: {
      default: {
        name: null,
        icon: 'icon-studio',
        currentLayout: ELayout.Default,
        slottedElements: {
          [ELayoutElement.Display]: '1',
          [ELayoutElement.Minifeed]: '2',
          [ELayoutElement.Scenes]: '3',
          [ELayoutElement.Sources]: '4',
          [ELayoutElement.Mixer]: '5',
        },
        resizes: {
          bar1: 156,
          bar2: 240,
        },
      },
    },
  };

  @Inject() private customizationService: CustomizationService;

  init() {
    super.init();

    // Hack since defaultState can't take a translated string
    if (!this.state.tabs.default.name) {
      this.SET_TAB_NAME('default', $t('Editor'));
    }
    if (
      this.customizationService.state.legacyEvents &&
      isEqual(this.state, LayoutService.defaultState)
    ) {
      this.setSlots({
        [ELayoutElement.Display]: '1',
        [ELayoutElement.LegacyEvents]: '2',
        [ELayoutElement.Scenes]: '3',
        [ELayoutElement.Sources]: '4',
        [ELayoutElement.Mixer]: '5',
      });
      this.customizationService.setSettings({ legacyEvents: false });
    }
  }

  get views() {
    return new LayoutViews(this.state);
  }

  setCurrentTab(id: string) {
    this.SET_CURRENT_TAB(id);
  }

  setBarResize(bar: 'bar1' | 'bar2', size: number) {
    this.SET_RESIZE(bar, size);
  }

  changeLayout(layout: ELayout) {
    this.CHANGE_LAYOUT(layout);
  }

  setSlots(slottedElements: { [key in ELayoutElement]?: LayoutSlot }) {
    this.SET_SLOTS(slottedElements);
  }

  addTab(name: string, icon: string) {
    this.ADD_TAB(name, icon);
  }

  className(layout: ELayout) {
    return LAYOUT_DATA[layout].className;
  }

  calculateColumnTotal(slots: IVec2Array) {
    let totalWidth = 0;
    slots.forEach(slot => {
      if (Array.isArray(slot)) {
        totalWidth += this.calculateMinimum('x', slot);
      } else if (slot) {
        totalWidth += slot.x;
      }
    });

    return totalWidth;
  }

  calculateMinimum(orientation: 'x' | 'y', slots: IVec2Array) {
    const aggregateMins: number[] = [];
    const minimums = [];
    slots.forEach(slot => {
      if (Array.isArray(slot)) {
        aggregateMins.push(this.aggregateMinimum(orientation, slot));
      } else {
        minimums.push(slot[orientation]);
      }
    });
    if (!minimums.length) minimums.push(10);
    return Math.max(...minimums, ...aggregateMins);
  }

  aggregateMinimum(orientation: 'x' | 'y', slots: IVec2Array) {
    const minimums = slots.map(mins => {
      if (mins) return mins[orientation];
      return 10;
    });
    if (!minimums.length) minimums.push(10);
    return minimums.reduce((a: number, b: number) => a + b);
  }

  @mutation()
  CHANGE_LAYOUT(layout: ELayout) {
    this.state.tabs[this.state.currentTab].currentLayout = layout;
    this.state.tabs[this.state.currentTab].slottedElements = {};
    this.state.tabs[this.state.currentTab].resizes = LAYOUT_DATA[layout].resizeDefaults;
  }

  @mutation()
  SET_SLOTS(slottedElements: { [key in ELayoutElement]?: LayoutSlot }) {
    this.state.tabs[this.state.currentTab].slottedElements = slottedElements;
  }

  @mutation()
  SET_RESIZE(bar: 'bar1' | 'bar2', size: number) {
    this.state.tabs[this.state.currentTab].resizes[bar] = size;
  }

  @mutation()
  SET_TAB_NAME(id: string, name: string) {
    this.state.tabs[id].name = name;
  }

  @mutation()
  SET_CURRENT_TAB(id: string) {
    this.state.currentTab = id;
  }

  @mutation()
  ADD_TAB(name: string, icon: string) {
    this.state.tabs[uuid()] = {
      name,
      icon,
      currentLayout: ELayout.Default,

      slottedElements: {
        [ELayoutElement.Display]: '1',
        [ELayoutElement.Minifeed]: '2',
        [ELayoutElement.Scenes]: '3',
        [ELayoutElement.Sources]: '4',
        [ELayoutElement.Mixer]: '5',
      },
      resizes: {
        bar1: 156,
        bar2: 240,
      },
    };
  }
}