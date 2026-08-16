import { Metadata } from 'next';
import CogsReportClient from './CogsReportClient';

export const metadata: Metadata = {
  title: 'COGS Accounting',
};

export default function Page() {
  return <CogsReportClient />;
}
