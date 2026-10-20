import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { normalizeNickname } from '../profile';
import { colors as c, font } from '../theme';
import { Button, Card, Icon, Label } from './ui';

export function NicknameCard({ nickname, onSave, demo = false }: { nickname?: string; onSave: (name: string) => void; demo?: boolean }) {
  const [draft, setDraft] = useState(nickname ?? '');
  const [error, setError] = useState('');
  function save() {
    const name = normalizeNickname(draft);
    if (name === null) { setError('昵称最多 20 个字，请使用可显示的文字。'); return; }
    setDraft(name); setError(''); onSave(name);
  }
  return <Card style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center' }}><Icon name="user" size={18} color={c.purple} /><Label style={{ fontSize: 14, fontWeight: '600' }}>{demo ? '体验昵称' : '昵称'}</Label></View>
    <TextInput accessibilityLabel={demo ? '演示昵称' : '用户昵称'} placeholder="你的昵称" value={draft}
      onChangeText={value => { setDraft(value); setError(''); }} maxLength={40} returnKeyType="done" onSubmitEditing={save}
      style={{ fontFamily: font, fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 13, marginTop: 16 }} />
    {error ? <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 9 }}>{error}</Label>
      : <Label muted style={{ fontSize: 11, marginTop: 9 }}>最多 20 个字，留空可清除。</Label>}
    <Button title={demo ? '演示：保存昵称' : '保存昵称'} icon="check" small onPress={save} style={{ alignSelf: 'flex-start', marginTop: 14 }} />
  </Card>;
}
