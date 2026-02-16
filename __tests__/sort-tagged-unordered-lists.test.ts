import SortTaggedUnorderedLists from '../src/rules/sort-tagged-unordered-lists';
import dedent from 'ts-dedent';
import {ruleTest} from './common';

ruleTest({
  RuleBuilderClass: SortTaggedUnorderedLists,
  testCases: [
    {
      testName: 'Sorts a simple flat list of items',
      before: dedent`
        <!-- SortedList -->

        - B
        - A
        - C

        <!-- /SortedList -->
      `,
      after: dedent`
        <!-- SortedList -->

        - A
        - B
        - C

        <!-- /SortedList -->
      `,
      options: {
        replacers: [],
      },
    },
    {
      // Line breaks within a wrapped item must not affect the sort order. The
      // sort key has its line breaks stripped, but the item text keeps them.
      testName: 'Strips line breaks from the sort key so wrapped items sort stably while keeping their line breaks in the output',
      before: dedent`
        <!-- SortedList -->

        - a b c
        - a
          bc

        <!-- /SortedList -->
      `,
      after: dedent`
        <!-- SortedList -->

        - a b c
        - a
          bc

        <!-- /SortedList -->
      `,
      options: {
        replacers: [],
      },
    },
  ],
});
