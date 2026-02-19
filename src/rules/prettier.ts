import {Options, RuleType} from '../rules';
import RuleBuilder, {BooleanOptionBuilder, DropdownOptionBuilder, ExampleBuilder, NumberOptionBuilder, OptionBuilderBase} from './rule-builder';
import dedent from 'ts-dedent';
import pluginBabel from 'prettier/plugins/babel';
import pluginEstree from 'prettier/plugins/estree';
import pluginHtml from 'prettier/plugins/html';
import pluginMarkdown from 'prettier/plugins/markdown';
import pluginPostcss from 'prettier/plugins/postcss';
import pluginTypescript from 'prettier/plugins/typescript';
import pluginYaml from 'prettier/plugins/yaml';
import prettier from 'prettier/standalone';
import type {Options as FormatterOptions} from 'prettier';
import {getYAMLText} from '../utils/yaml';

export enum ProseStyle {
  Wrapped = 'Wrapped', // "always"
  Preserve = 'Preserve', // "preserve"
  Never = 'Never', // "never"
}

function proseStyleToPrettierString(style: ProseStyle): 'preserve' | 'never' | 'always' {
  if (style === ProseStyle.Wrapped) {
    return 'always';
  } else if (style === ProseStyle.Preserve) {
    return 'preserve';
  } else if (style === ProseStyle.Never) {
    return 'never';
  } else {
    // The safest default is to do nothing if something goes wrong in this conversion.
    return 'preserve';
  }
}

class PrettierOptions implements Options {
  proseStyle?: ProseStyle = ProseStyle.Preserve;
  printWidth?: Number = 100;
  indentWidth?: Number = 2;
  useTabs?: boolean = false;
  formatCode?: boolean = false;
  formatYaml?: boolean = false;
}

@RuleBuilder.register
export default class Prettier extends RuleBuilder<PrettierOptions> {
  constructor() {
    super({
      nameKey: 'rules.prettier.name',
      descriptionKey: 'rules.prettier.description',
      type: RuleType.CONTENT,
      // We need to run after every single other rule, but before the YAML timestamp logic and user
      // custom commands.
      hasSpecialExecutionOrder: true,
    });
  }
  get OptionsClass(): new () => PrettierOptions {
    return PrettierOptions;
  }

  getPrettierOptions(options: PrettierOptions): FormatterOptions {
    const parser = 'markdown';
    const plugins = [
      pluginBabel,
      pluginEstree,
      pluginHtml,
      pluginMarkdown,
      pluginPostcss,
      pluginTypescript,
      pluginYaml,
    ];

    // Include common language mappings that Obsidian users may find use for.
    const __languageMappings = new Map([
      ['bpjs', 'js'],
      ['dataviewjs', 'js'],
      ['datacorejs', 'js'],
      ['datacorejsx', 'jsx'],
      ['datacorets', 'ts'],
      ['datacoretsx', 'tsx'],
    ]);

    // We do a bit of a hack here, as we're not running through the usual munging logic for the options.
    return {
      parser,
      plugins,
      __languageMappings,
      // @ts-expect-error
      useTabs: options['use-tabs'],
      // @ts-expect-error
      proseWrap: proseStyleToPrettierString(options['prose-style']),
      // @ts-expect-error
      tabWidth: options['indent-width'] as number,
      // @ts-expect-error
      printWidth: options['print-width'] as number,
      embeddedLanguageFormatting: options.formatCode ? 'auto' : 'off',
    };
  }

  apply(text: string, _options: PrettierOptions): string {
    return text;
  }
  async runPrettier(text: string, options: PrettierOptions): Promise<string> {
    const mungedOptions = this.buildRuleOptions(options as Options);
    const prettierOpts = this.getPrettierOptions(mungedOptions);

    // We grab the YAML as is, in case we don't want prettier to touch it.
    const startingYaml = getYAMLText(text);
    let output = await prettier.format(text, prettierOpts);

    if (!options.formatYaml) {
      const currentYAML = getYAMLText(output);
      output = output.replace(currentYAML, startingYaml);
    }

    return output;
  }
  get exampleBuilders(): ExampleBuilder<PrettierOptions>[] {
    return [
      new ExampleBuilder({
        description: 'Example',
        before: dedent`
          Before
        `,
        after: dedent`
          After
        `,
      }),
    ];
  }
  get optionBuilders(): OptionBuilderBase<PrettierOptions>[] {
    return [
      new DropdownOptionBuilder<PrettierOptions, ProseStyle>({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.prose-style.name',
        descriptionKey: 'rules.prettier.prose-style.description',
        optionsKey: 'proseStyle',
        records: [
          {
            value: ProseStyle.Preserve,
            description: 'Retains the wrapping behavior of each chunk of prose unchanged.',
          },
          {
            value: ProseStyle.Wrapped,
            description: 'Wraps all chunks of prose at the provided print width.',
          },
          {
            value: ProseStyle.Never,
            description: 'Unwraps each chunk of prose onto a single line.',
          },
        ],
      }),
      new NumberOptionBuilder({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.print-width.name',
        descriptionKey: 'rules.prettier.print-width.description',
        optionsKey: 'printWidth',
      }),
      new NumberOptionBuilder({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.indent-width.name',
        descriptionKey: 'rules.prettier.indent-width.description',
        optionsKey: 'indentWidth',
      }),
      new BooleanOptionBuilder({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.use-tabs.name',
        descriptionKey: 'rules.prettier.use-tabs.description',
        optionsKey: 'useTabs',
      }),
      new BooleanOptionBuilder({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.format-code.name',
        descriptionKey: 'rules.prettier.format-code.description',
        optionsKey: 'formatCode',
      }),
      new BooleanOptionBuilder({
        OptionsClass: PrettierOptions,
        nameKey: 'rules.prettier.format-yaml.name',
        descriptionKey: 'rules.prettier.format-yaml.description',
        optionsKey: 'formatYaml',
      }),
    ];
  }
}
