import { useEffect, useState } from 'react';
import { TextInput } from 'react-native-paper';
import { formatPKR, parseRupees } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText } from '../../src/features/ui';
import { createSupplier, listSuppliers, updateSupplier } from '../../src/services/purchaseService';
import { RootProps } from '../navigation/types';

export default function SupplierFormScreen({ navigation, route }: RootProps<'SupplierForm'>) {
  const supplierId = route.params?.supplierId;
  const editing = supplierId !== undefined;
  const write = useWrite();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery(db => listSuppliers(db));
  useEffect(() => {
    const s = data?.find(x => x.id === supplierId);
    if (s) {
      setName(s.name);
      setPhone(s.phone ?? '');
    }
  }, [data, supplierId]);

  const submit = async () => {
    setError(null);
    const openingBalancePaisa = opening.trim() === '' ? 0 : parseRupees(opening);
    if (openingBalancePaisa === null) {
      setError('Opening balance must be an amount like 5000 or 99.50');
      return;
    }
    const res = await write(db =>
      editing
        ? updateSupplier(db, supplierId, { name, phone })
        : createSupplier(db, { name, phone, openingBalancePaisa }).then(() => undefined),
    );
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <TextInput mode="outlined" testID="field-supplier-name" label="Name" value={name} onChangeText={setName} />
      <TextInput
        mode="outlined"
        testID="field-supplier-phone"
        label="Phone (optional)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {!editing && (
        <TextInput
          mode="outlined"
          testID="field-supplier-opening"
          label={`Already owed to them (Rs)${opening ? ` = ${formatPKR(parseRupees(opening) ?? 0)}` : ''}`}
          keyboardType="decimal-pad"
          value={opening}
          onChangeText={setOpening}
        />
      )}
      <ErrorText message={error} />
      <Btn testID="save-supplier" mode="contained" onPress={submit}>
        {editing ? 'Save changes' : 'Add supplier'}
      </Btn>
    </Body>
  );
}
