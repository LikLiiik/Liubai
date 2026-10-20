import React from 'react';
import type { SchoolLoginProps } from '../hitsz';
import { Button, Dialog, Label } from './ui';

export function SchoolLogin({ visible, onClose }: SchoolLoginProps) {
  return <Dialog visible={visible} title="教务登录" onClose={onClose} footer={<Button title="返回" onPress={onClose} />}>
    <Label>教务登录需要在手机端完成。</Label>
  </Dialog>;
}
