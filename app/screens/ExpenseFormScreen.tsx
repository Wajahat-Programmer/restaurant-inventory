import { useState } from 'react';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { EXPENSE_CATEGORIES, PAY_METHODS } from '../../src/domain/schemas';
import { useWrite } from '../../src/features/data';
import { buildExpense, ExpenseForm } from '../../src/features/finance/expenseForm';
import { Body, Btn, ErrorText, todayISO } from '../../src/features/ui';
import { addExpense } from '../../src/services/expenseService';
import { RootProps } from '../navigation/types';

type Category = NonNullable<ExpenseForm['category']>;

export default function ExpenseFormScreen({ navigation }: RootProps<'ExpenseForm'>) {
  const write = useWrite();
  const [form, setForm] = useState<ExpenseForm>({ date: todayISO(), category: null, amount: '', method: 'cash', note: '' });
  const [error, setError] = useState<string | null>(null);
  const pick = (category: string) => setForm(f => ({ ...f, category: category as Category }));

  const submit = async () => {
    setError(null);
    const built = buildExpense(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const res = await write(db => addExpense(db, built.input));
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <TextInput mode="outlined" testID="field-expense-date" label="Date (YYYY-MM-DD)" value={form.date} onChangeText={date => setForm(f => ({ ...f, date }))} />
      <Text variant="titleSmall">What is it for?</Text>
      <SegmentedButtons
        value={form.category ?? ''}
        onValueChange={pick}
        buttons={EXPENSE_CATEGORIES.slice(0, 3).map(c => ({ value: c, label: c, testID: `category-${c}` }))}
      />
      <SegmentedButtons
        value={form.category ?? ''}
        onValueChange={pick}
        buttons={EXPENSE_CATEGORIES.slice(3).map(c => ({ value: c, label: c, testID: `category-${c}` }))}
      />
      <TextInput
        mode="outlined"
        testID="field-expense-amount"
        label="Amount (Rs)"
        keyboardType="decimal-pad"
        value={form.amount}
        onChangeText={amount => setForm(f => ({ ...f, amount }))}
      />
      <Text variant="titleSmall">Paid by</Text>
      <SegmentedButtons
        value={form.method}
        onValueChange={method => setForm(f => ({ ...f, method: method as ExpenseForm['method'] }))}
        buttons={PAY_METHODS.map(m => ({ value: m, label: m, testID: `method-${m}` }))}
      />
      <TextInput mode="outlined" testID="field-expense-note" label="Note (optional)" value={form.note} onChangeText={note => setForm(f => ({ ...f, note }))} />
      <ErrorText message={error} />
      <Btn testID="save-expense" mode="contained" onPress={submit}>
        Save expense
      </Btn>
    </Body>
  );
}
