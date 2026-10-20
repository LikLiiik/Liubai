import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { Category, CategoryDefinition } from '../types';
import { CATEGORY_NAME_LIMIT, type CategoryAddResult } from '../categories';
import { colors as c, font } from '../theme';
import { Button, Chip, Label } from './ui';

export function CategoryPicker({ categories, value, onChange, onAdd, prefix }: {
  categories: readonly CategoryDefinition[]; value: Category | null; onChange: (id: Category) => void;
  onAdd: (name: string) => CategoryAddResult; prefix?: React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  function close() { setAdding(false); setName(''); setError(''); }
  function add() {
    const result = onAdd(name);
    if (result.error !== undefined) { setError(result.error); return; }
    onChange(result.category.id);
    close();
  }
  return <View>
    <View style={styles.chips}>
      {prefix}
      {categories.map(category => <Chip key={category.id} title={category.name} selected={value === category.id} onPress={() => onChange(category.id)} />)}
      <Chip title="添加分类" icon="plus" selected={adding} onPress={() => { if (adding) close(); else setAdding(true); }} />
    </View>
    {adding && <View style={styles.creator}>
      <Label style={{ fontSize: 12, fontWeight: '600', marginBottom: 8 }}>新分类</Label>
      <TextInput accessibilityLabel="分类名称" value={name} onChangeText={text => { setName(text); setError(''); }}
        placeholder="分类名称" placeholderTextColor={c.faint} maxLength={CATEGORY_NAME_LIMIT} autoFocus
        returnKeyType="done" onSubmitEditing={add} style={styles.input} />
      {!!error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 8 }}>{error}</Label>}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <Button title="取消添加分类" variant="ghost" small onPress={close} />
        <Button title="添加" small onPress={add} />
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  creator: { marginTop: 10, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border, borderRadius: 9, color: c.text, backgroundColor: '#fff', fontFamily: font, fontSize: 14 },
});
