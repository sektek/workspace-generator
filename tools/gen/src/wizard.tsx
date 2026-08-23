import { Box, Static, Text } from 'ink';
import { useEffect, useState } from 'react';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';

import { choicesFor, defaultIndexFor, pendingSpecs } from './wizard-steps.js';
import type { OptionSpec } from './schema.js';

type CompletedStep = {
  key: string;
  text: string;
};

export type WizardProps = {
  schema: OptionSpec[];
  seed: Record<string, unknown>;
  onComplete: (answers: Record<string, unknown>) => void;
};

// Not unit-tested: ink TTY rendering is impractical to exercise outside a
// real terminal. The pure step-sequencing logic is unit-tested in
// wizard-steps.ts instead.

/**
 * Steps through a namespace's option schema one prompt at a time,
 * skipping any key already supplied through `seed`.
 *
 * @param props - Schema to walk, pre-filled answers, and the completion callback.
 * @param props.schema - The full option schema for the namespace being run.
 * @param props.seed - Option values already supplied (e.g. via CLI flags).
 * @param props.onComplete - Called once with the fully-resolved answers.
 * @returns The scrolled-back answers plus the current prompt, or just the
 * scrollback once every step is answered.
 */
export function Wizard({ schema, seed, onComplete }: WizardProps) {
  const steps = pendingSpecs(schema, seed);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(seed);
  const [textValue, setTextValue] = useState('');
  const [completed, setCompleted] = useState<CompletedStep[]>([]);

  const done = stepIndex >= steps.length;
  const spec = done ? undefined : steps[stepIndex];

  // answers/onComplete are in the deps to avoid a stale closure; the
  // `if (done)` guard makes every earlier re-invocation a no-op.
  useEffect(() => {
    if (done) {
      onComplete(answers);
    }
  }, [done, answers, onComplete]);

  const advance = (value: unknown) => {
    if (!spec) {
      return;
    }
    setAnswers(prev => ({ ...prev, [spec.key]: value }));
    setCompleted(prev => [
      ...prev,
      { key: spec.key, text: `${spec.prompt}: ${displayValue(spec, value)}` },
    ]);
    setTextValue('');
    setStepIndex(prev => prev + 1);
  };

  // Same root shape (a <Box> wrapping <Static>) whether or not a step is
  // still pending — swapping <Static> itself in and out as the root element
  // would remount it, losing the items it's already printed and reprinting
  // the whole scrollback once the wizard finishes.
  return (
    <Box flexDirection="column">
      <Static items={completed}>
        {item => <Text key={item.key}>{item.text}</Text>}
      </Static>
      {spec && renderInput(spec, textValue, setTextValue, advance)}
    </Box>
  );
}

/**
 * The human-readable form of an answered step's value, for scrollback:
 * `select`/`boolean` resolve back to their choice `label` (e.g. `true` ->
 * `"Yes"`) rather than showing the raw stored value.
 *
 * @param spec - The option spec that was just answered.
 * @param value - The value `advance()` recorded for it.
 * @returns The text to display for this answer in the `<Static>` scrollback.
 */
function displayValue(spec: OptionSpec, value: unknown): string {
  if (spec.kind === 'select' || spec.kind === 'boolean') {
    const choice = choicesFor(spec).find(c => c.value === value);
    if (choice) {
      return choice.label;
    }
  }
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Renders the prompt label plus `<TextInput>` on one row for a `text`
 * spec (the label doubling as the row's leading text, with the schema
 * default shown as ghost placeholder text), or the prompt label above
 * `<SelectInput>` (pre-selected at the schema's default) for
 * `select`/`boolean`.
 *
 * @param spec - The option spec currently being prompted for.
 * @param textValue - The text input's current (uncommitted) value.
 * @param setTextValue - Updates the text input's current value.
 * @param advance - Records the answered value and moves to the next step.
 * @returns The prompt + input for this step.
 */
function renderInput(
  spec: OptionSpec,
  textValue: string,
  setTextValue: (value: string) => void,
  advance: (value: unknown) => void,
) {
  if (spec.kind === 'text') {
    return (
      <Box>
        <Text>{spec.prompt}: </Text>
        <TextInput
          value={textValue}
          onChange={setTextValue}
          placeholder={
            spec.default !== undefined ? String(spec.default) : undefined
          }
          onSubmit={value => advance(value === '' ? spec.default : value)}
        />
      </Box>
    );
  }

  const choices = choicesFor(spec);
  return (
    <Box flexDirection="column">
      <Text>{spec.prompt}</Text>
      <SelectInput
        items={choices}
        initialIndex={defaultIndexFor(spec, choices)}
        onSelect={item => advance(item.value)}
      />
    </Box>
  );
}
