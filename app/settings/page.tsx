import { Metadata } from 'next';
import SettingsClient from './SettingsClient';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function Page() {
  return <SettingsClient />;
}
