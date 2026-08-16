import { Metadata } from 'next';
import InvoicesClient from './InvoicesClient';

export const metadata: Metadata = {
  title: 'Invoice Gallery',
};

export default function Page() {
  return <InvoicesClient />;
}
