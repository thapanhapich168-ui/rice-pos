import { Metadata } from 'next';
import PosClient from './PosClient';

export const metadata: Metadata = {
  title: 'POS System',
};

export default function Page() {
  return <PosClient />;
}
