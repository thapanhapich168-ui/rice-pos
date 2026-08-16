import { Metadata } from 'next';
import CustomerDatabaseClient from './CustomerDatabaseClient';

export const metadata: Metadata = {
  title: 'Customer Database',
};

export default function Page() {
  return <CustomerDatabaseClient />;
}
