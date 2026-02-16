import {CustomReplace} from '../ui/linter-components/custom-replace-option';
import {Options, RuleType} from '../rules';
import RuleBuilder, {ExampleBuilder, OptionBuilderBase, RegexReplaceOptionBuilder, TextOptionBuilder} from './rule-builder';
import dedent from 'ts-dedent';
import {escapeRegExp, startsWithListMarkerRegexAtBaseline} from '../utils/regex';
import {logDebug, logWarn} from '../utils/logger';
import {convertStringVersionOfEscapeCharactersToEscapeCharacters} from '../utils/strings';

class SortTaggedUnorderedListsOptions implements Options {
  startSortedListPattern?: string = '<!-- SortedList -->';
  endSortedListPattern?: string = '<!-- /SortedList -->';
  replacers?: CustomReplace[] = [
    {label: 'Bare Wikilink to Name', find: '\\[\\[([^\\|]+?)\\]\\]', replace: '$1', flags: 'gm', enabled: true},
    {label: 'Aliased Wikilink to Name', find: '\\[\\[[^\\|]+?\\|(.+?)\\]\\]\\[\\[([^\\|]+?)\\]\\]', replace: '$1', flags: 'gm', enabled: true},
    {label: 'Markdown Link to Name', find: '\\[(.+?)\\]\\(.+?\\)', replace: '$1', flags: 'gm', enabled: true},
  ];
}

@RuleBuilder.register
export default class SortTaggedUnorderedLists extends RuleBuilder<SortTaggedUnorderedListsOptions> {
  constructor() {
    super({
      nameKey: 'rules.sort-tagged-unordered-lists.name',
      descriptionKey: 'rules.sort-tagged-unordered-lists.description',
      type: RuleType.CONTENT,
      // We need to run before all other rules, but after autocorrection.
      hasSpecialExecutionOrder: true,
    });
  }
  get OptionsClass(): new () => SortTaggedUnorderedListsOptions {
    return SortTaggedUnorderedListsOptions;
  }

  apply(text: string, options: SortTaggedUnorderedListsOptions): string {
    // We build our pattern from the delimiters provided by the user.
    const sortedListBegin = escapeRegExp(options.startSortedListPattern);
    const sortedListEnd = escapeRegExp(options.endSortedListPattern);

    // If either tag is empty we can't run, so we warn the user and continue.
    if (sortedListBegin === '') {
      logWarn('List start tag cannot be empty');
      return text;
    }
    if (sortedListEnd === '') {
      logWarn('List end tag cannot be empty');
      return text;
    }

    const sortedListPattern: RegExp = new RegExp(
        `(?<list>${sortedListBegin}\\s*(?:.+\\s+)*?\\s*${sortedListEnd})`,
        'gm',
    );

    const matches = [...text.matchAll(sortedListPattern)];
    const splits = text.split(sortedListPattern);
    const sortedLists = matches.map((list) => this.processList(list[0], sortedListBegin, sortedListEnd, options)).reverse();

    const newSegments = [];
    for (const split of splits) {
      if (split.match(sortedListPattern)) {
        newSegments.push(sortedLists.pop());
      } else {
        newSegments.push(split);
      }
    }

    const newText = newSegments.join('');

    return newText;
  }

  processList(list: string, startPat: string, endPat: string, options: SortTaggedUnorderedListsOptions): string {
    const listItems = list.replace(startPat, '').replace(endPat, '').trim();
    const lines = listItems.split('\n');

    // Lines might be wrapped manually, so we account for that by joining things.
    const joinedLines: string[] = [];
    for (const line of lines) {
      const isListItemStart = startsWithListMarkerRegexAtBaseline.test(line);

      if (isListItemStart) {
        joinedLines.push(line);
      } else {
        const preceding = joinedLines.pop();

        if (preceding !== undefined) {
          joinedLines.push(`${preceding}\n${line}`);
        } else {
          joinedLines.push(line);
        }
      }
    }

    // We cannot just sort these lines. We have to account for all of the replacements that the user
    // might care about making.
    const linesWithSortKeys = joinedLines.map((value) => {
      return {
        key: this.generateSortKey(value, options),
        value: value,
      };
    });

    // With the keys generated, we can then sort them properly.
    linesWithSortKeys.sort((a, b) => a.key.localeCompare(b.key));

    const listStrings = linesWithSortKeys.map((l) => l.value).join('\n');
    const reconstitutedList = `${options.startSortedListPattern}\n\n${listStrings}\n\n${options.endSortedListPattern}`;

    return reconstitutedList;
  }

  generateSortKey(listItem: string, options: SortTaggedUnorderedListsOptions): string {
    // We strip line breaks (and any surrounding whitespace, such as the
    // indentation on wrapped continuation lines) before applying any of the
    // custom replacement rules. This keeps the sort order stable regardless of
    // how the item happens to be wrapped across lines. The item's actual text,
    // including its line breaks, is left untouched.
    let newText = listItem.replace(/\s*\n\s*/g, ' ');
    let initialText = newText;

    for (const replacer of options.replacers) {
      // If the replacer configuration is invalid, or the rule is disabled, we skip it.
      const findIsEmpty = replacer.find === undefined || replacer.find === '' || replacer.find === null;
      const replaceIsEmpty = replacer.find === undefined || replacer.find === null;

      if (findIsEmpty || replaceIsEmpty || !replacer.enabled) {
        continue;
      }

      // We then provide a nice descriptive debug message to users if they have that level of
      // logging on.
      let debugMsg = replacer.label;
      if (debugMsg && debugMsg.trim() != '') {
        debugMsg += ':\n';
      }
      debugMsg +=`/${replacer.find}/${replacer.flags}/${replacer.replace}/`;
      logDebug(debugMsg);

      // Now we can create the regex and perform the replacement.
      const pattern = new RegExp(`${replacer.find}`, replacer.flags);
      const replacement = convertStringVersionOfEscapeCharactersToEscapeCharacters(replacer.replace);
      newText = newText.replaceAll(pattern, replacement);

      // And we can log again to let users know that it worked.
      if (initialText != newText) {
        logDebug(newText);
      }

      initialText = newText;
    }

    return newText;
  }

  get exampleBuilders(): ExampleBuilder<SortTaggedUnorderedListsOptions>[] {
    return [
      new ExampleBuilder({
        description: 'Sorts list items into order after applying custom rewrite rules to generate the sort key.',
        before: dedent`
          <!-- SortedList -->

          - B
          - [[Charlie]]
          - [[Charlie|My own name]]
          - A
          - F
          - D

          <!-- /SortedList -->
        `,
        after: dedent`
          <!-- SortedList -->

          - A
          - B
          - [[Charlie]]
          - D
          - F
          - [[Charlie|My own name]]

          <!-- /SortedList -->
        `,
        options: {
          replacers: [
            {label: 'Bare Wikilink to Name', find: '\\[\\[([^\\|]+?)\\]\\]', replace: '$1', flags: 'gm', enabled: true},
            {label: 'Aliased Wikilink to Name', find: '\\[\\[[^\\|]+?\\|(.+?)\\]\\]', replace: '$1', flags: 'gm', enabled: true},
          ],
        },
      }),
    ];
  }
  get optionBuilders(): OptionBuilderBase<SortTaggedUnorderedListsOptions>[] {
    return [
      new TextOptionBuilder({
        OptionsClass: SortTaggedUnorderedListsOptions,
        nameKey: 'rules.sort-tagged-unordered-lists.start-sorted-list-pattern.name',
        descriptionKey: 'rules.sort-tagged-unordered-lists.start-sorted-list-pattern.description',
        optionsKey: 'startSortedListPattern',
      }),
      new TextOptionBuilder({
        OptionsClass: SortTaggedUnorderedListsOptions,
        nameKey: 'rules.sort-tagged-unordered-lists.end-sorted-list-pattern.name',
        descriptionKey: 'rules.sort-tagged-unordered-lists.end-sorted-list-pattern.description',
        optionsKey: 'endSortedListPattern',
      }),
      new RegexReplaceOptionBuilder({
        OptionsClass: SortTaggedUnorderedListsOptions,
        nameKey: 'rules.sort-tagged-unordered-lists.pre-sort-replacements.name',
        descriptionKey: 'rules.sort-tagged-unordered-lists.end-sorted-list-pattern.description',
        optionsKey: 'replacers',
      }),
    ];
  }
}
