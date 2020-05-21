import {
  FieldOverrideEnv,
  findNumericFieldMinMax,
  setFieldConfigDefaults,
  setDynamicConfigValue,
  applyFieldOverrides,
} from './fieldOverrides';
import { MutableDataFrame, toDataFrame } from '../dataframe';
import {
  FieldConfig,
  FieldConfigPropertyItem,
  GrafanaTheme,
  FieldType,
  DataFrame,
  FieldConfigSource,
  InterpolateFunction,
} from '../types';
import { Registry } from '../utils';
import { mockStandardProperties } from '../utils/tests/mockStandardProperties';
import { FieldMatcherID } from '../transformations';
import { FieldConfigOptionsRegistry } from './FieldConfigOptionsRegistry';
import { getFieldDisplayName } from './fieldState';

const property1 = {
  id: 'custom.property1', // Match field properties
  path: 'property1', // Match field properties
  isCustom: true,
  process: (value: any) => value,
  shouldApply: () => true,
} as any;

const property2 = {
  id: 'custom.property2', // Match field properties
  path: 'property2', // Match field properties
  isCustom: true,
  process: (value: any) => value,
  shouldApply: () => true,
} as any;

const property3 = {
  id: 'custom.property3.nested', // Match field properties
  path: 'property3.nested', // Match field properties
  isCustom: true,
  process: (value: any) => value,
  shouldApply: () => true,
} as any;

export const customFieldRegistry: FieldConfigOptionsRegistry = new Registry<FieldConfigPropertyItem>(() => {
  return [property1, property2, property3, ...mockStandardProperties()];
});

describe('Global MinMax', () => {
  it('find global min max', () => {
    const f0 = new MutableDataFrame();
    f0.add({ title: 'AAA', value: 100, value2: 1234 }, true);
    f0.add({ title: 'BBB', value: -20 }, true);
    f0.add({ title: 'CCC', value: 200, value2: 1000 }, true);
    expect(f0.length).toEqual(3);

    const minmax = findNumericFieldMinMax([f0]);
    expect(minmax.min).toEqual(-20);
    expect(minmax.max).toEqual(1234);
  });
});

describe('applyFieldOverrides', () => {
  const f0 = new MutableDataFrame();
  f0.add({ title: 'AAA', value: 100, value2: 1234 }, true);
  f0.add({ title: 'BBB', value: -20 }, true);
  f0.add({ title: 'CCC', value: 200, value2: 1000 }, true);
  expect(f0.length).toEqual(3);

  // Hardcode the max value
  f0.fields[1].config.max = 0;
  f0.fields[1].config.decimals = 6;

  const src: FieldConfigSource = {
    defaults: {
      unit: 'xyz',
      decimals: 2,
    },
    overrides: [
      {
        matcher: { id: FieldMatcherID.numeric },
        properties: [
          { id: 'decimals', value: 1 }, // Numeric
          { id: 'displayName', value: 'Kittens' }, // Text
        ],
      },
    ],
  };

  describe('given multiple data frames', () => {
    const f0 = new MutableDataFrame({
      name: 'A',
      fields: [{ name: 'message', type: FieldType.string, values: [10, 20] }],
    });
    const f1 = new MutableDataFrame({
      name: 'B',
      fields: [{ name: 'info', type: FieldType.string, values: [10, 20] }],
    });

    it('should add scopedVars to fields', () => {
      const withOverrides = applyFieldOverrides({
        data: [f0, f1],
        fieldConfig: {
          defaults: {},
          overrides: [],
        },
        replaceVariables: (value: any) => value,
        theme: {} as GrafanaTheme,
        fieldConfigRegistry: new FieldConfigOptionsRegistry(),
      });

      expect(withOverrides[0].fields[0].state!.scopedVars).toMatchInlineSnapshot(`
        Object {
          "__field": Object {
            "text": "Field",
            "value": Object {
              "label": undefined,
              "labels": "",
              "name": "A message",
            },
          },
          "__series": Object {
            "text": "Series",
            "value": Object {
              "name": "A",
            },
          },
        }
      `);

      expect(withOverrides[1].fields[0].state!.scopedVars).toMatchInlineSnapshot(`
        Object {
          "__field": Object {
            "text": "Field",
            "value": Object {
              "label": undefined,
              "labels": "",
              "name": "B info",
            },
          },
          "__series": Object {
            "text": "Series",
            "value": Object {
              "name": "B",
            },
          },
        }
      `);
    });
  });

  it('will merge FieldConfig with default values', () => {
    const field: FieldConfig = {
      min: 0,
      max: 100,
    };

    const f1 = {
      unit: 'ms',
      dateFormat: '', // should be ignored
      max: parseFloat('NOPE'), // should be ignored
      min: null, // should alo be ignored!
      displayName: 'newTitle',
    };

    const f: DataFrame = toDataFrame({
      fields: [{ type: FieldType.number, name: 'x', config: field, values: [] }],
    });

    const processed = applyFieldOverrides({
      data: [f],
      fieldConfig: {
        defaults: f1 as FieldConfig,
        overrides: [],
      },
      fieldConfigRegistry: customFieldRegistry,
      replaceVariables: v => v,
      theme: {} as GrafanaTheme,
    })[0];

    const outField = processed.fields[0];

    expect(outField.config.min).toEqual(0);
    expect(outField.config.max).toEqual(100);
    expect(outField.config.unit).toEqual('ms');
    expect(getFieldDisplayName(outField, f)).toEqual('newTitle');
  });

  it('will apply field overrides', () => {
    const data = applyFieldOverrides({
      data: [f0], // the frame
      fieldConfig: src as FieldConfigSource, // defaults + overrides
      replaceVariables: (undefined as any) as InterpolateFunction,
      theme: (undefined as any) as GrafanaTheme,
      fieldConfigRegistry: customFieldRegistry,
    })[0];
    const valueColumn = data.fields[1];
    const config = valueColumn.config;

    // Keep max from the original setting
    expect(config.max).toEqual(0);

    // Don't Automatically pick the min value
    expect(config.min).toEqual(undefined);

    // The default value applied
    expect(config.unit).toEqual('xyz');

    // The default value applied
    expect(config.displayName).toEqual('Kittens');

    // The override applied
    expect(config.decimals).toEqual(1);
  });

  it('will apply set min/max when asked', () => {
    const data = applyFieldOverrides({
      data: [f0], // the frame
      fieldConfig: src as FieldConfigSource, // defaults + overrides
      replaceVariables: (undefined as any) as InterpolateFunction,
      theme: (undefined as any) as GrafanaTheme,
      autoMinMax: true,
    })[0];
    const valueColumn = data.fields[1];
    const config = valueColumn.config;

    // Keep max from the original setting
    expect(config.max).toEqual(0);

    // Don't Automatically pick the min value
    expect(config.min).toEqual(-20);
  });
});

describe('setFieldConfigDefaults', () => {
  it('applies field config defaults', () => {
    const dsFieldConfig: FieldConfig = {
      decimals: 2,
      min: 0,
      max: 100,
    };

    const panelFieldConfig: FieldConfig = {
      decimals: 1,
      min: 10,
      max: 50,
      unit: 'km',
    };

    const context: FieldOverrideEnv = {
      data: [] as any,
      field: { type: FieldType.number } as any,
      dataFrameIndex: 0,
      fieldConfigRegistry: customFieldRegistry,
    };

    // we mutate dsFieldConfig
    setFieldConfigDefaults(dsFieldConfig, panelFieldConfig, context);

    expect(dsFieldConfig).toMatchInlineSnapshot(`
      Object {
        "custom": Object {},
        "decimals": 2,
        "max": 100,
        "min": 0,
        "unit": "km",
      }
    `);
  });

  it('applies field config defaults for custom properties', () => {
    const dsFieldConfig: FieldConfig = {
      custom: {
        property1: 10,
      },
    };

    const panelFieldConfig: FieldConfig = {
      custom: {
        property1: 20,
        property2: 10,
      },
    };

    const context: FieldOverrideEnv = {
      data: [] as any,
      field: { type: FieldType.number } as any,
      dataFrameIndex: 0,
      fieldConfigRegistry: customFieldRegistry,
    };

    // we mutate dsFieldConfig
    setFieldConfigDefaults(dsFieldConfig, panelFieldConfig, context);

    expect(dsFieldConfig).toMatchInlineSnapshot(`
      Object {
        "custom": Object {
          "property1": 10,
          "property2": 10,
        },
      }
    `);
  });
});

describe('setDynamicConfigValue', () => {
  it('applies dynamic config values', () => {
    const config = {
      displayName: 'test',
    };

    setDynamicConfigValue(
      config,
      {
        id: 'displayName',
        value: 'applied',
      },
      {
        fieldConfigRegistry: customFieldRegistry,
        data: [] as any,
        field: { type: FieldType.number } as any,
        dataFrameIndex: 0,
      }
    );

    expect(config.displayName).toEqual('applied');
  });

  it('applies custom dynamic config values', () => {
    const config = {
      custom: {
        property1: 1,
      },
    };
    setDynamicConfigValue(
      config,
      {
        id: 'custom.property1',
        value: 'applied',
      },
      {
        fieldConfigRegistry: customFieldRegistry,
        data: [] as any,
        field: { type: FieldType.number } as any,
        dataFrameIndex: 0,
      }
    );

    expect(config.custom.property1).toEqual('applied');
  });

  it('applies nested custom dynamic config values', () => {
    const config = {
      custom: {
        property3: {
          nested: 1,
        },
      },
    };
    setDynamicConfigValue(
      config,
      {
        id: 'custom.property3.nested',
        value: 'applied',
      },
      {
        fieldConfigRegistry: customFieldRegistry,
        data: [] as any,
        field: { type: FieldType.number } as any,
        dataFrameIndex: 0,
      }
    );

    expect(config.custom.property3.nested).toEqual('applied');
  });

  it('removes properties', () => {
    const config = {
      displayName: 'title',
      custom: {
        property3: {
          nested: 1,
        },
      },
    };
    setDynamicConfigValue(
      config,
      {
        id: 'custom.property3.nested',
        value: undefined,
      },
      {
        fieldConfigRegistry: customFieldRegistry,
        data: [] as any,
        field: { type: FieldType.number } as any,
        dataFrameIndex: 0,
      }
    );

    setDynamicConfigValue(
      config,
      {
        id: 'displayName',
        value: undefined,
      },
      {
        fieldConfigRegistry: customFieldRegistry,
        data: [] as any,
        field: { type: FieldType.number } as any,
        dataFrameIndex: 0,
      }
    );

    expect(config.custom.property3).toEqual({});
    expect(config.displayName).toBeUndefined();
  });
});
