import { Metadata } from 'next';
import RiceClient from './RiceClient';

export const metadata: Metadata = {
  title: 'Rice Control',
};

export default function Page() {
  return <RiceClient />;
}
