import { Metadata } from 'next';
import DevTestClient from './DevTestClient';

export const metadata: Metadata = {
  title: 'Dev Test',
};

export default function Page() {
  return <DevTestClient />;
}
