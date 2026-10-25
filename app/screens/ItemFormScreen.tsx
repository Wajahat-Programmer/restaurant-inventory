import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { SegmentedButtons, Text } from 'react-native-paper';
import { BASE_UNITS } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import {
  EMPTY_ITEM_FORM,
  ItemFormValues,
  itemFormSchema,
  toItemInput,
} from '../../src/features/items/itemForm';
import { Btn, Body, ErrorText, Field, Row } from '../../src/features/ui';
import { createItem, getItem, updateItem } from '../../src/services/itemService';
import { RootProps } from '../navigation/types';

export default function ItemFormScreen({ navigation, route }: RootProps<'ItemForm'>) {
  const itemId = route.params?.itemId;
  const editing = itemId !== undefined;
  const write = useWrite();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset } = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: EMPTY_ITEM_FORM,
  });
  const packs = useFieldArray({ control, name: 'packs' });

  const existing = useQuery(db => (editing ? getItem(db, itemId) : Promise.resolve(null)), [itemId]);
  useEffect(() => {
    const it = existing.data;
    if (it) {
      reset({
        ...EMPTY_ITEM_FORM,
        name: it.name,
        baseUnit: it.baseUnit,
        categoryName: it.categoryName ?? '',
        parLevel: it.parLevel ? String(it.parLevel) : '',
        reorderPoint: it.reorderPoint ? String(it.reorderPoint) : '',
        shelfLifeDays: it.shelfLifeDays ? String(it.shelfLifeDays) : '',
        barcode: it.barcode ?? '',
        packs: it.packs.map(p => ({ packName: p.packName, size: String(p.factorToBase) })),
      });
    }
  }, [existing.data, reset]);

  const onSubmit = handleSubmit(async values => {
    setSaving(true);
    setError(null);
    const { input, opening } = toItemInput(values);
    const res = await write(db =>
      editing ? updateItem(db, itemId, input).then(() => itemId) : createItem(db, input, opening),
    );
    setSaving(false);
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  });

  return (
    <Body>
      <Field control={control} name="name" label="Name" />
      <Controller
        control={control}
        name="baseUnit"
        render={({ field }) => (
          <>
            <Text>Base unit (stock is counted in this)</Text>
            <SegmentedButtons
              value={field.value}
              onValueChange={field.onChange}
              buttons={BASE_UNITS.map(u => ({
                value: u,
                label: u,
                testID: `unit-${u}`,
                // Changing unit after stock exists would corrupt quantities.
                disabled: editing,
              }))}
            />
          </>
        )}
      />
      <Field control={control} name="categoryName" label="Category (optional)" />
      <Row>
        <Field control={control} name="parLevel" label="Par level" keyboard="decimal-pad" />
        <Field control={control} name="reorderPoint" label="Reorder point" keyboard="decimal-pad" />
      </Row>
      <Field control={control} name="shelfLifeDays" label="Shelf life (days)" keyboard="number-pad" />
      <Field control={control} name="barcode" label="Barcode (optional)" />

      <Text variant="titleSmall">Pack sizes (e.g. 1 bag = 25000)</Text>
      {packs.fields.map((f, i) => (
        <Row key={f.id}>
          <Field control={control} name={`packs.${i}.packName`} label="Pack" testID={`pack-name-${i}`} />
          <Field control={control} name={`packs.${i}.size`} label="Base units" keyboard="decimal-pad" testID={`pack-size-${i}`} />
          <Btn testID={`pack-remove-${i}`} onPress={() => packs.remove(i)}>
            Remove
          </Btn>
        </Row>
      ))}
      <Btn testID="pack-add" icon="plus" onPress={() => packs.append({ packName: '', size: '' })}>
        Add pack size
      </Btn>

      {!editing && (
        <>
          <Text variant="titleSmall">Opening stock (optional)</Text>
          <Row>
            <Field control={control} name="openingQty" label="Quantity" keyboard="decimal-pad" />
            <Field control={control} name="openingValue" label="Total cost (Rs)" keyboard="decimal-pad" />
          </Row>
        </>
      )}

      <ErrorText message={error} />
      <Btn testID="save-item" mode="contained" loading={saving} disabled={saving} onPress={() => onSubmit()}>
        {editing ? 'Save changes' : 'Add item'}
      </Btn>
    </Body>
  );
}
