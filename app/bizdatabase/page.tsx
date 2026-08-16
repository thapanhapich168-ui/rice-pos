import { Metadata } from 'next';
import BizDatabaseClient from './BizDatabaseClient';

export const metadata: Metadata = {
  title: 'Master Biz Database',
};

export default function Page() {
  return <BizDatabaseClient />;
}
